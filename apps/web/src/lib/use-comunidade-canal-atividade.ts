'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFeedStream } from '@/lib/use-feed-stream'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { FEED_SSE_DEBOUNCE_MS, feedStreamEndpoint } from '@/lib/feed-live-refresh'
import { useLatestRef } from '@/lib/use-latest-ref'
import {
  calcularUnreadKeys,
  chaveAtividadeCanal,
  chaveAtividadeNacional,
  gravarLastSeenMap,
  lerLastSeenMap,
  marcarLastSeen,
  temAtividadeNova,
  type LastSeenMap,
} from '@/lib/comunidade-canal-atividade'

/** Poll de segurança quando o long-poll SSE perde o ping entre ciclos. */
const ATIVIDADE_POLL_MS = 20_000

export type AlvoAtividadeBarra =
  | { chave: string; kind: 'nacional'; afiliacaoId: string }
  | { chave: string; kind: 'canal'; conversaId: string }

type AtividadeApiResponse = {
  heads?: Record<string, string>
}

function storageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Badge reativo da barra de escudos: ping SSE → HEAD leve → compara last-seen.
 * Poll 20s como rede de segurança (mesmo espírito do badge da navbar).
 */
export function useComunidadeCanalAtividade(opts: {
  alvos: AlvoAtividadeBarra[]
  activeKey: string | null
  afiliacaoId?: string | null
  enabled?: boolean
}): { unreadKeys: Set<string> } {
  const enabled = opts.enabled !== false
  const [lastSeen, setLastSeen] = useState<LastSeenMap>(() => lerLastSeenMap(storageOrNull()))
  const [heads, setHeads] = useState<Record<string, string>>({})
  /** Ping SSE da CN marca na hora; some após sync confirmar ou aba ativa. */
  const [optimistic, setOptimistic] = useState<Set<string>>(() => new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootstrappedRef = useRef(false)
  const lastSeenRef = useLatestRef(lastSeen)
  const activeKeyRef = useLatestRef(opts.activeKey)

  const alvosKey = useMemo(
    () =>
      opts.alvos
        .map((a) => a.chave)
        .sort()
        .join('|'),
    [opts.alvos],
  )
  const conversaIds = useMemo(
    () =>
      opts.alvos
        .filter((a): a is Extract<AlvoAtividadeBarra, { kind: 'canal' }> => a.kind === 'canal')
        .map((a) => a.conversaId),
    [opts.alvos],
  )
  const afiliacaoParaApi = useMemo(() => {
    const nacional = opts.alvos.find((a) => a.kind === 'nacional')
    return nacional?.kind === 'nacional' ? nacional.afiliacaoId : (opts.afiliacaoId ?? null)
  }, [opts.alvos, opts.afiliacaoId])

  const nacionalKey = afiliacaoParaApi ? chaveAtividadeNacional(afiliacaoParaApi) : null
  const canalKeysRef = useRef<string[]>([])
  canalKeysRef.current = opts.alvos
    .filter((a): a is Extract<AlvoAtividadeBarra, { kind: 'canal' }> => a.kind === 'canal')
    .map((a) => a.chave)

  const syncHeads = useCallback(async () => {
    if (!enabled) return
    if (conversaIds.length === 0 && !afiliacaoParaApi) return

    const params = new URLSearchParams()
    if (conversaIds.length > 0) params.set('ids', conversaIds.join(','))
    if (afiliacaoParaApi) params.set('afiliacaoId', afiliacaoParaApi)

    try {
      const res = await fetch(`/api/comunidade/canais/atividade?${params.toString()}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) return
      const data = (await res.json()) as AtividadeApiResponse
      if (!data.heads || typeof data.heads !== 'object') return

      const nextHeads = data.heads
      setHeads(nextHeads)

      // Só no 1º sync: ancora last-seen no head atual (sem badge em massa).
      if (!bootstrappedRef.current) {
        bootstrappedRef.current = true
        setLastSeen((prev) => {
          let changed = false
          const next = { ...prev }
          for (const [chave, iso] of Object.entries(nextHeads)) {
            if (typeof iso !== 'string' || !iso) continue
            if (!next[chave]) {
              next[chave] = iso
              changed = true
            }
          }
          if (!changed) return prev
          gravarLastSeenMap(storageOrNull(), next)
          return next
        })
      }

      // Podar optimistic: mantém só se o head confirma novidade.
      setOptimistic((prev) => {
        if (prev.size === 0) return prev
        const seen = lastSeenRef.current
        const active = activeKeyRef.current
        const next = new Set<string>()
        for (const chave of prev) {
          if (active && chave === active) continue
          if (temAtividadeNova(nextHeads[chave], seen[chave] ?? null)) {
            next.add(chave)
          }
        }
        if (next.size === prev.size && [...next].every((k) => prev.has(k))) return prev
        return next
      })
    } catch {
      /* best-effort */
    }
  }, [enabled, conversaIds, afiliacaoParaApi, activeKeyRef, lastSeenRef])

  const scheduleSync = useCallback(() => {
    if (!enabled) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void syncHeads()
    }, FEED_SSE_DEBOUNCE_MS)
  }, [enabled, syncHeads])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    bootstrappedRef.current = false
  }, [alvosKey])

  useEffect(() => {
    if (!enabled) return
    void syncHeads()
  }, [enabled, alvosKey, syncHeads])

  useVisibleInterval(
    () => {
      void syncHeads()
    },
    ATIVIDADE_POLL_MS,
    enabled,
  )

  const onPingTorcida = useCallback(() => {
    // Marca canais inativos na hora; o sync confirma / poda falsos positivos.
    const active = activeKeyRef.current
    setOptimistic((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const chave of canalKeysRef.current) {
        if (active && chave === active) continue
        if (!next.has(chave)) {
          next.add(chave)
          changed = true
        }
      }
      return changed ? next : prev
    })
    scheduleSync()
  }, [scheduleSync, activeKeyRef])

  const onPingNacional = useCallback(() => {
    if (nacionalKey && activeKeyRef.current !== nacionalKey) {
      setOptimistic((prev) => {
        if (prev.has(nacionalKey)) return prev
        const next = new Set(prev)
        next.add(nacionalKey)
        return next
      })
    }
    scheduleSync()
  }, [nacionalKey, scheduleSync, activeKeyRef])

  const streamTorcida = feedStreamEndpoint()
  const streamNacional = afiliacaoParaApi
    ? feedStreamEndpoint({ escopo: 'nacional', afiliacaoId: afiliacaoParaApi })
    : ''

  useFeedStream(onPingTorcida, streamTorcida)
  useFeedStream(onPingNacional, streamNacional)

  // Só marca visto com head real — nunca Date.now() (queimava o watermark).
  useEffect(() => {
    if (!enabled || !opts.activeKey) return
    const headIso = heads[opts.activeKey]
    if (!headIso) return
    setLastSeen((prev) => {
      const next = marcarLastSeen(prev, opts.activeKey!, headIso)
      if (next[opts.activeKey!] === prev[opts.activeKey!]) return prev
      gravarLastSeenMap(storageOrNull(), next)
      return next
    })
    setOptimistic((prev) => {
      if (!prev.has(opts.activeKey!)) return prev
      const next = new Set(prev)
      next.delete(opts.activeKey!)
      return next
    })
  }, [enabled, opts.activeKey, heads])

  const unreadKeys = useMemo(() => {
    const fromHeads = calcularUnreadKeys({
      heads,
      lastSeen,
      activeKey: opts.activeKey,
    })
    for (const chave of optimistic) {
      if (opts.activeKey && chave === opts.activeKey) continue
      fromHeads.add(chave)
    }
    return fromHeads
  }, [heads, lastSeen, opts.activeKey, optimistic])

  return { unreadKeys }
}

/** Monta alvos a partir dos ids de canal + afiliação da barra. */
export function montarAlvosAtividadeBarra(opts: {
  afiliacaoId: string | null | undefined
  canalIds: Array<string | null | undefined>
}): AlvoAtividadeBarra[] {
  const alvos: AlvoAtividadeBarra[] = []
  if (opts.afiliacaoId) {
    alvos.push({
      chave: chaveAtividadeNacional(opts.afiliacaoId),
      kind: 'nacional',
      afiliacaoId: opts.afiliacaoId,
    })
  }
  const visto = new Set<string>()
  for (const id of opts.canalIds) {
    if (!id || visto.has(id)) continue
    visto.add(id)
    alvos.push({ chave: chaveAtividadeCanal(id), kind: 'canal', conversaId: id })
  }
  return alvos
}
