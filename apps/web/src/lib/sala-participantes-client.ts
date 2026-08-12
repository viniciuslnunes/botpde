'use client'

import { useCallback, useState } from 'react'
import { useVisibleBackoffInterval } from '@/lib/use-visible-interval'
import { useLatestRef } from '@/lib/use-latest-ref'

export type ParticipanteSala = {
  userId: string
  nome: string | null
  avatarUrl: string | null
  papel: 'HOST' | 'MODERADOR' | 'PARTICIPANTE'
  entrouEm: string
}

function normalizarParticipante(p: ParticipanteSala): ParticipanteSala {
  return {
    ...p,
    entrouEm:
      typeof p.entrouEm === 'string' ? p.entrouEm : new Date(p.entrouEm).toISOString(),
  }
}

function fingerprintParticipantes(lista: ParticipanteSala[]): string {
  return lista
    .map((p) => `${p.userId}:${p.papel}`)
    .sort()
    .join('|')
}

export function participantesMudaram(
  anteriores: ParticipanteSala[],
  proximos: ParticipanteSala[],
): boolean {
  return fingerprintParticipantes(anteriores) !== fingerprintParticipantes(proximos)
}

export async function fetchParticipantesSala(salaId: string): Promise<{
  participantes: ParticipanteSala[]
  total: number
} | null> {
  const res = await fetch(`/api/salas/${salaId}/participantes`, { cache: 'no-store' })
  if (!res.ok) return null
  const data = (await res.json()) as {
    participantes?: ParticipanteSala[]
    total?: number
  }
  if (!data.participantes) return null
  const participantes = data.participantes.map(normalizarParticipante)
  return {
    participantes,
    total: typeof data.total === 'number' ? data.total : participantes.length,
  }
}

export async function registrarPresencaSala(
  salaId: string,
  method: 'POST' | 'DELETE',
  options?: { keepalive?: boolean },
): Promise<number | null> {
  try {
    const res = await fetch(`/api/salas/${salaId}/participantes`, {
      method,
      cache: 'no-store',
      keepalive: options?.keepalive,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { total?: number }
    return typeof data.total === 'number' ? data.total : null
  } catch {
    return null
  }
}

const POLL_BASE_MS = 8_000
const POLL_MAX_MS = 20_000

export function useSalaParticipantes(
  salaId: string,
  initialParticipantes: ParticipanteSala[],
  onCountChange?: (count: number) => void,
  enabled = true,
) {
  const [participantes, setParticipantes] = useState(initialParticipantes)
  const onCountChangeRef = useLatestRef(onCountChange)

  const sync = useCallback(async (): Promise<boolean> => {
    const data = await fetchParticipantesSala(salaId)
    if (!data) return false

    let mudou = false
    setParticipantes((anteriores) => {
      mudou = participantesMudaram(anteriores, data.participantes)
      return mudou ? data.participantes : anteriores
    })
    onCountChangeRef.current?.(data.total)
    return mudou
  }, [salaId, onCountChangeRef])

  const { reset } = useVisibleBackoffInterval(sync, POLL_BASE_MS, POLL_MAX_MS, enabled)

  const aplicarTotal = useCallback((total: number) => {
    onCountChangeRef.current?.(total)
    reset()
  }, [reset, onCountChangeRef])

  return { participantes, sync, aplicarTotal, reset }
}
