'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { toast } from '@torcida/ui'
import { canalTabBarItem, canalTabIconTap, springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { LogoImage } from '@/components/media/logo-image'
import { useReportNavPending } from '@/components/portal/nav-pending-context'
import {
  fecharCanalOperadorAction,
  registrarCanalAbertoAction,
  reordenarCanaisOperadorAction,
  trocarTorcidaAction,
  type FecharCanalOperadorState,
  type TrocarTorcidaState,
} from '@/app/portal/tenant-context-actions'
import {
  fecharCanalTematicoAbertoAction,
  registrarCanalTematicoAbertoAction,
  reordenarCanaisTematicosAction,
  type FecharCanalTematicoState,
} from '@/app/portal/comunidade/socio-canais-actions'
import {
  moverItem,
  moverSlugArrastavel,
  ordemArrastavelSemFixos,
  slugsHierarquiaFixos,
} from '@/lib/operador-canais-ordem'
import type { EscopoComunidade, EscoposDisponiveis } from '@/lib/comunidade-escopo'

export type CanalAbertoOperadorTab = {
  slug: string
  nome: string
  logoUrl: string | null
  ehUnidade: boolean
}

export type CanalTematicoAbertoTab = {
  id: string
  nome: string
  avatarUrl: string | null
}

type Props = {
  afiliacao: { nome: string; apelido: string | null; escudoUrl: string | null } | null
  escopos: EscoposDisponiveis
  escopoAtivo: EscopoComunidade
  /** Nome da unidade de vínculo — acessibilidade da aba. */
  nomeUnidade?: string | null
  logoUnidade?: string | null
  /** Nome da torcida (organizada) — acessibilidade da aba. */
  nomeTorcida?: string | null
  logoTorcida?: string | null
  /** Slug da Sede raiz — troca de sessão ao sair da unidade Caso B. */
  slugTorcida?: string | null
  /** Slug do tenant da unidade — Caso A = mesmo da Sede; Caso B = PDE. */
  slugUnidade?: string | null
  /** Cookie / tenant ativo da sessão. */
  atualSlug?: string | null
  /**
   * Default do usuário: sócio = torcida; TORCEDOR = nacional.
   * A aba do default omite `?escopo=`; as outras forçam o param.
   */
  modoContexto?: 'nacional' | 'torcida'
  /** Super-admin: barra multi-canal com X para fechar. */
  superAdmin?: boolean
  canaisAbertos?: CanalAbertoOperadorTab[]
  /** Sócio: temáticos visitados (cookie `socio_canais_abertos`). */
  canaisTematicosAbertos?: CanalTematicoAbertoTab[]
  /** Página `/canais/[id]` — destaca a aba temática. */
  canalAtivoId?: string | null
}

type TabDef = {
  id: string
  escopo: EscopoComunidade
  /** Nome completo para aria-label / title (não aparece no layout). */
  nome: string
  logoUrl: string | null
  /** Inicial de fallback quando não há escudo. */
  inicial: string
  href: string
  /** Quando definido e diferente de `atualSlug`, o clique troca o cookie. */
  slugAlvo: string | null
  /** Super-admin pode fechar este escudo da barra. */
  fechavel: boolean
  /** Canal temático do sócio (`/canais/[id]`). */
  canalId?: string | null
}

const DRAG_THRESHOLD_PX = 6

/**
 * Alterna entre Nacional (praça do clube), Minha torcida (organizada — só
 * sócio) e Minha unidade (canal da subsede/PDE). As abas são **escudos**,
 * não títulos: nomes longos de PDE/torcida estouravam a barra.
 *
 * Super-admin: Nacional + torcida (+ unidade, se houver) ficam **fixos** na
 * hierarquia; demais canais do cookie vêm depois, com X e drag. Selecionar
 * **não** muda a ordem.
 *
 * Sócio: após os escopos fixos, **temáticos** visitados (cookie separado)
 * com o mesmo fechamento/drag; clique navega sem trocar tenant.
 */
export function ComunidadeEscopoTabs({
  afiliacao,
  escopos,
  escopoAtivo,
  nomeUnidade,
  logoUnidade,
  nomeTorcida,
  logoTorcida,
  slugTorcida = null,
  slugUnidade = null,
  atualSlug = null,
  modoContexto = 'torcida',
  superAdmin = false,
  canaisAbertos = [],
  canaisTematicosAbertos = [],
  canalAtivoId = null,
}: Props) {
  const params = useSearchParams()
  const [state, action, pending] = useActionState<TrocarTorcidaState, FormData>(
    trocarTorcidaAction,
    {},
  )
  const [fecharState, fecharAction, fecharPending] = useActionState<
    FecharCanalOperadorState,
    FormData
  >(fecharCanalOperadorAction, {})
  const [fecharTematicoState, fecharTematicoAction, fecharTematicoPending] = useActionState<
    FecharCanalTematicoState,
    FormData
  >(fecharCanalTematicoAbertoAction, {})
  const [, startReorder] = useTransition()
  const wasPending = useRef(false)
  const [slugPendente, setSlugPendente] = useState<string | null>(null)

  /** Ordem local dos canais abertos do operador (optimistic no drag). */
  const [ordemSlugs, setOrdemSlugs] = useState<string[]>(() =>
    canaisAbertos.map((c) => c.slug),
  )
  const ordemSlugsRef = useRef(ordemSlugs)
  ordemSlugsRef.current = ordemSlugs

  /** Ordem local dos temáticos do sócio. */
  const [ordemIds, setOrdemIds] = useState<string[]>(() =>
    canaisTematicosAbertos.map((c) => c.id),
  )
  const ordemIdsRef = useRef(ordemIds)
  ordemIdsRef.current = ordemIds

  const dragRef = useRef<{
    key: string
    kind: 'operador' | 'tematico'
    from: number
    startX: number
    pointerId: number
    active: boolean
    suppressClick: boolean
  } | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  const busy = pending || fecharPending || fecharTematicoPending
  useReportNavPending(busy)

  useEffect(() => {
    if (wasPending.current && !pending && state.message) {
      toast.error(state.message)
      setSlugPendente(null)
    }
    wasPending.current = pending
  }, [pending, state.message])

  useEffect(() => {
    if (fecharState.message) toast.error(fecharState.message)
  }, [fecharState.message])

  useEffect(() => {
    if (fecharTematicoState.message) toast.error(fecharTematicoState.message)
  }, [fecharTematicoState.message])

  // Garante o tenant atual na barra mesmo após "Voltar ao portal".
  useEffect(() => {
    if (!superAdmin || !atualSlug) return
    void registrarCanalAbertoAction(atualSlug)
  }, [superAdmin, atualSlug])

  // Visita a temático: registra no cookie (só sócio).
  useEffect(() => {
    if (superAdmin || !canalAtivoId) return
    void registrarCanalTematicoAbertoAction(canalAtivoId)
  }, [superAdmin, canalAtivoId])

  /** Prefixo hierárquico do operador (após Nacional) — não fecha nem arrasta. */
  const slugsFixosOperador = useMemo(
    () =>
      slugsHierarquiaFixos({
        slugTorcida,
        slugUnidade,
        temTorcida: Boolean(escopos.torcida && slugTorcida),
        temUnidade: Boolean(escopos.unidade && slugUnidade),
      }),
    [escopos.torcida, escopos.unidade, slugTorcida, slugUnidade],
  )
  const fixosOperadorSet = useMemo(
    () => new Set(slugsFixosOperador),
    [slugsFixosOperador],
  )

  // Sincroniza ordem local quando o cookie/RSC traz conjunto diferente.
  // Normaliza: fixos da hierarquia no início (ordem canônica), extras depois.
  const canaisKey = canaisAbertos.map((c) => c.slug).join(',')
  const fixosKey = slugsFixosOperador.join(',')
  useEffect(() => {
    const slugs = canaisAbertos.map((c) => c.slug)
    if (!superAdmin || slugsFixosOperador.length === 0) {
      setOrdemSlugs(slugs)
      return
    }
    const arrastaveis = ordemArrastavelSemFixos(slugs, slugsFixosOperador)
    const fixosNoCookie = slugsFixosOperador.filter((s) => slugs.includes(s))
    setOrdemSlugs([...fixosNoCookie, ...arrastaveis])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chave agregada evita reset no drag
  }, [canaisKey, fixosKey, superAdmin])

  const tematicosKey = canaisTematicosAbertos.map((c) => c.id).join(',')
  useEffect(() => {
    setOrdemIds(canaisTematicosAbertos.map((c) => c.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chave agregada evita reset no drag
  }, [tematicosKey])

  const canaisPorSlug = useMemo(() => {
    const map = new Map(canaisAbertos.map((c) => [c.slug, c]))
    return map
  }, [canaisAbertos])

  const tematicosPorId = useMemo(() => {
    const map = new Map(canaisTematicosAbertos.map((c) => [c.id, c]))
    return map
  }, [canaisTematicosAbertos])

  if (!afiliacao) return null

  function hrefPara(escopo: EscopoComunidade): string {
    const next = new URLSearchParams(params.toString())
    next.delete('cursor')
    if (escopo === modoContexto) next.delete('escopo')
    else next.set('escopo', escopo)
    const qs = next.toString()
    return qs ? `/portal/comunidade?${qs}` : '/portal/comunidade'
  }

  const nomeClube = afiliacao.apelido || afiliacao.nome

  const tabs: TabDef[] = [
    {
      id: 'nacional',
      escopo: 'nacional',
      nome: `Nacional — ${nomeClube}`,
      logoUrl: afiliacao.escudoUrl,
      inicial: nomeClube.charAt(0).toUpperCase(),
      href: hrefPara('nacional'),
      slugAlvo: null,
      fechavel: false,
    },
  ]

  if (superAdmin) {
    // Hierarquia fixa: torcida → unidade (se distinta), depois extras do cookie.
    const visto = new Set<string>()

    for (const slug of slugsFixosOperador) {
      if (visto.has(slug)) continue
      visto.add(slug)
      const noCookie = canaisPorSlug.get(slug)
      const ehUnidade = Boolean(slugUnidade && slug === slugUnidade && slug !== slugTorcida)
      tabs.push({
        id: ehUnidade ? 'unidade' : 'torcida',
        escopo: ehUnidade ? 'unidade' : 'torcida',
        nome: ehUnidade
          ? (noCookie?.nome ?? nomeUnidade ?? 'Minha unidade')
          : (noCookie?.nome ?? nomeTorcida ?? 'Minha torcida'),
        logoUrl: ehUnidade
          ? (noCookie?.logoUrl ?? logoUnidade ?? null)
          : (noCookie?.logoUrl ?? logoTorcida ?? null),
        inicial: (
          ehUnidade
            ? (noCookie?.nome ?? nomeUnidade ?? 'U')
            : (noCookie?.nome ?? nomeTorcida ?? 'T')
        )
          .charAt(0)
          .toUpperCase(),
        href: hrefPara(ehUnidade ? 'unidade' : 'torcida'),
        slugAlvo: slug,
        fechavel: false,
      })
    }

    const extras: CanalAbertoOperadorTab[] = []
    for (const slug of ordemSlugs) {
      if (fixosOperadorSet.has(slug) || visto.has(slug)) continue
      const canal = canaisPorSlug.get(slug)
      if (!canal) continue
      visto.add(slug)
      extras.push(canal)
    }
    for (const canal of canaisAbertos) {
      if (fixosOperadorSet.has(canal.slug) || visto.has(canal.slug)) continue
      visto.add(canal.slug)
      extras.push(canal)
    }

    for (const canal of extras) {
      const escopoCanal: EscopoComunidade = canal.ehUnidade ? 'unidade' : 'torcida'
      tabs.push({
        id: `aberto:${canal.slug}`,
        escopo: escopoCanal,
        nome: canal.nome,
        logoUrl: canal.logoUrl,
        inicial: canal.nome.charAt(0).toUpperCase(),
        href: hrefPara(escopoCanal),
        slugAlvo: canal.slug,
        fechavel: true,
      })
    }
  } else {
    if (escopos.torcida) {
      tabs.push({
        id: 'torcida',
        escopo: 'torcida',
        nome: nomeTorcida ? `Minha torcida — ${nomeTorcida}` : 'Minha torcida',
        logoUrl: logoTorcida ?? null,
        inicial: (nomeTorcida || 'T').charAt(0).toUpperCase(),
        href: hrefPara('torcida'),
        slugAlvo: slugTorcida,
        fechavel: false,
      })
    }
    if (escopos.unidade) {
      tabs.push({
        id: 'unidade',
        escopo: 'unidade',
        nome: nomeUnidade ? `Minha unidade — ${nomeUnidade}` : 'Minha unidade',
        logoUrl: logoUnidade ?? null,
        inicial: (nomeUnidade || 'U').charAt(0).toUpperCase(),
        href: hrefPara('unidade'),
        slugAlvo: slugUnidade,
        fechavel: false,
      })
    }

    // Temáticos após os fixos — ordem do cookie (ordemIds).
    const vistoTematico = new Set<string>()
    const tematicos: CanalTematicoAbertoTab[] = []
    for (const id of ordemIds) {
      const canal = tematicosPorId.get(id)
      if (!canal || vistoTematico.has(id)) continue
      vistoTematico.add(id)
      tematicos.push(canal)
    }
    for (const canal of canaisTematicosAbertos) {
      if (vistoTematico.has(canal.id)) continue
      vistoTematico.add(canal.id)
      tematicos.push(canal)
    }

    for (const canal of tematicos) {
      tabs.push({
        id: `tematico:${canal.id}`,
        escopo: 'torcida',
        nome: canal.nome,
        logoUrl: canal.avatarUrl,
        inicial: canal.nome.charAt(0).toUpperCase(),
        href: `/portal/comunidade/canais/${canal.id}`,
        slugAlvo: null,
        fechavel: true,
        canalId: canal.id,
      })
    }
  }

  if (tabs.length < 2) return null

  /** Operador: só extras do cookie (fora da hierarquia). Sócio: ids temáticos. */
  const slugsArrastaveis = ordemArrastavelSemFixos(ordemSlugs, slugsFixosOperador)
  const idsArrastaveis = ordemIds

  function persistirOrdemOperador(next: string[]) {
    startReorder(async () => {
      const r = await reordenarCanaisOperadorAction(next)
      if (!r.ok) {
        toast.error(r.message)
        setOrdemSlugs(canaisAbertos.map((c) => c.slug))
      }
    })
  }

  function persistirOrdemTematico(next: string[]) {
    startReorder(async () => {
      const r = await reordenarCanaisTematicosAction(next)
      if (!r.ok) {
        toast.error(r.message)
        setOrdemIds(canaisTematicosAbertos.map((c) => c.id))
      }
    })
  }

  function onPointerDownTab(
    e: React.PointerEvent,
    key: string,
    kind: 'operador' | 'tematico',
  ) {
    if (busy) return
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button[type="submit"][aria-label^="Fechar"]')) {
      return
    }
    const lista = kind === 'operador' ? slugsArrastaveis : idsArrastaveis
    const from = lista.indexOf(key)
    if (from < 0) return
    dragRef.current = {
      key,
      kind,
      from,
      startX: e.clientX,
      pointerId: e.pointerId,
      active: false,
      suppressClick: false,
    }
    // NÃO capturar o pointer aqui: setPointerCapture no down engole o click
    // do form/link aninhado (abas 4+ do operador). Captura só após o limiar.
  }

  function onPointerMoveTab(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return
      drag.active = true
      drag.suppressClick = true
      setDraggingKey(drag.key)
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const el = document.elementFromPoint(e.clientX, e.clientY)
    const attr = drag.kind === 'operador' ? 'data-canal-slug' : 'data-canal-id'
    const over = el?.closest<HTMLElement>(`[${attr}]`)
    const overKey =
      drag.kind === 'operador' ? over?.dataset.canalSlug : over?.dataset.canalId
    if (!overKey || overKey === drag.key) return
    const lista = drag.kind === 'operador' ? slugsArrastaveis : idsArrastaveis
    if (!lista.includes(overKey)) return

    if (drag.kind === 'operador') {
      setOrdemSlugs((prev) => moverSlugArrastavel(prev, drag.key, overKey, slugsFixosOperador))
    } else {
      setOrdemIds((prev) => {
        const from = prev.indexOf(drag.key)
        const to = prev.indexOf(overKey)
        if (from < 0 || to < 0 || from === to) return prev
        return moverItem(prev, from, to)
      })
    }
  }

  function onPointerUpTab(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const moved = drag.active
    const suppress = drag.suppressClick
    const kind = drag.kind
    dragRef.current = null
    setDraggingKey(null)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    if (moved) {
      if (kind === 'operador') persistirOrdemOperador(ordemSlugsRef.current)
      else persistirOrdemTematico(ordemIdsRef.current)
    }
    if (suppress) {
      e.preventDefault()
    }
  }

  return (
    <nav
      className="relative flex items-center gap-5 border-b border-[rgb(var(--border))]"
      aria-label="Escopos e canais da Comunidade"
    >
      <AnimatePresence initial={false} mode="popLayout">
      {tabs.map((tab) => {
        const ehTematico = Boolean(tab.canalId)
        const ativoPorEscopo =
          !canalAtivoId &&
          tab.escopo === escopoAtivo &&
          (tab.slugAlvo == null ||
            atualSlug == null ||
            tab.slugAlvo === atualSlug ||
            (tab.escopo === 'torcida' &&
              tab.slugAlvo === slugTorcida &&
              atualSlug === slugTorcida) ||
            (tab.escopo === 'unidade' && tab.slugAlvo === slugUnidade))
        const ativo = ehTematico
          ? canalAtivoId != null && tab.canalId === canalAtivoId
          : tab.escopo === 'nacional'
            ? !canalAtivoId && escopoAtivo === 'nacional'
            : superAdmin
              ? atualSlug != null && tab.slugAlvo === atualSlug && escopoAtivo !== 'nacional'
              : ativoPorEscopo

        const precisaTrocarSessao =
          !ehTematico &&
          tab.slugAlvo != null &&
          tab.slugAlvo !== '' &&
          atualSlug != null &&
          tab.slugAlvo !== atualSlug
        const carregandoEsta = pending && slugPendente === tab.slugAlvo
        const arrastavel = ehTematico
          ? Boolean(tab.canalId && idsArrastaveis.includes(tab.canalId))
          : Boolean(
              superAdmin &&
                tab.fechavel &&
                tab.slugAlvo &&
                slugsArrastaveis.includes(tab.slugAlvo),
            )
        const dragKey = ehTematico ? tab.canalId! : tab.slugAlvo!
        const arrastando = draggingKey === dragKey

        /** Slot fixo 28×28; arte em caixa 20×20 (`fill`) — o escudo do clube
         *  (badge full-bleed) não estoura o peso óptico dos canais com alpha.
         *  Nacional leva inset extra: crests oficiais quase sempre enchem o canvas. */
        const ehEscudoClube = tab.escopo === 'nacional' && !ehTematico
        const visual = (
          <m.span
            className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden"
            whileHover={
              arrastando || draggingKey
                ? undefined
                : { scale: 1.08, transition: canalTabIconTap }
            }
            whileTap={
              arrastando ? undefined : { scale: 0.94, transition: canalTabIconTap }
            }
          >
            {tab.logoUrl ? (
              <span
                className={[
                  'pointer-events-none relative block h-5 w-5 shrink-0 overflow-hidden',
                  ehEscudoClube ? 'scale-[0.88]' : '',
                ].join(' ')}
              >
                <LogoImage
                  src={tab.logoUrl}
                  alt=""
                  fill
                  sizes="20px"
                  balanceCircular={!ehEscudoClube}
                  className="object-contain"
                />
              </span>
            ) : (
              <span
                aria-hidden
                className={[
                  'pointer-events-none flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold',
                  ativo
                    ? 'bg-[rgb(var(--primary))] text-white'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {tab.inicial}
              </span>
            )}
            {carregandoEsta ? (
              <Loader2
                className="absolute -right-1 -top-1 h-3.5 w-3.5 animate-spin text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ) : null}
          </m.span>
        )

        const className = [
          'relative -mb-px flex h-10 w-7 touch-none items-center justify-center pt-1',
          ativo ? 'opacity-100' : 'opacity-55 hover:opacity-90',
          busy && !carregandoEsta ? 'pointer-events-none opacity-40' : '',
        ].join(' ')

        const dragKind: 'operador' | 'tematico' = ehTematico ? 'tematico' : 'operador'
        const dragHandlers = arrastavel
          ? {
              onPointerDown: (e: React.PointerEvent) =>
                onPointerDownTab(e, dragKey, dragKind),
              onPointerMove: onPointerMoveTab,
              onPointerUp: onPointerUpTab,
              onPointerCancel: onPointerUpTab,
            }
          : {}

        const wrapperAttr = arrastavel
          ? ehTematico
            ? { 'data-canal-id': tab.canalId! }
            : { 'data-canal-slug': tab.slugAlvo! }
          : {}

        const fecharClass = [
          'absolute -right-1.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center',
          'rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
          'text-[rgb(var(--foreground-muted))] shadow-sm',
          'pointer-events-none opacity-0 transition-opacity',
          'group-hover:pointer-events-auto group-hover:opacity-100',
          'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
          'hover:bg-[rgb(var(--danger)_/_0.12)] hover:text-[rgb(var(--danger))]',
          ativo ? 'pointer-events-auto opacity-100' : '',
        ].join(' ')

        const fecharBadge = tab.fechavel ? (
          ehTematico && tab.canalId ? (
            <form action={fecharTematicoAction} className="contents">
              <input type="hidden" name="canalId" value={tab.canalId} />
              <input type="hidden" name="canalAtivoId" value={canalAtivoId ?? ''} />
              <m.button
                type="submit"
                disabled={busy || Boolean(draggingKey)}
                aria-label={`Fechar canal ${tab.nome}`}
                title="Fechar canal"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                transition={canalTabIconTap}
                className={fecharClass}
              >
                <X className="h-2.5 w-2.5" strokeWidth={2.5} />
              </m.button>
            </form>
          ) : tab.slugAlvo ? (
            <form action={fecharAction} className="contents">
              <input type="hidden" name="slug" value={tab.slugAlvo} />
              <input type="hidden" name="atualSlug" value={atualSlug ?? ''} />
              <input type="hidden" name="fallbackSlug" value={slugTorcida ?? ''} />
              <m.button
                type="submit"
                disabled={busy || Boolean(draggingKey)}
                aria-label={`Fechar canal ${tab.nome}`}
                title="Fechar canal"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                transition={canalTabIconTap}
                className={fecharClass}
              >
                <X className="h-2.5 w-2.5" strokeWidth={2.5} />
              </m.button>
            </form>
          ) : null
        ) : null

        const indicator = ativo ? (
          <m.span
            layoutId="comunidade-escopo-tab-indicator"
            className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[rgb(var(--primary))] shadow-[0_0_10px_rgb(var(--primary)/0.55)]"
            transition={springSnappy}
          />
        ) : null

        const shell = (
          <m.div
            key={tab.id}
            layout="position"
            variants={canalTabBarItem}
            initial="hidden"
            animate={arrastando ? 'dragging' : draggingKey ? 'dimmed' : 'show'}
            exit="exit"
            transition={{ layout: springSnappy }}
            className={[
              'relative group rounded-full',
              arrastavel ? 'cursor-grab active:cursor-grabbing' : '',
            ].join(' ')}
            style={arrastando ? { touchAction: 'none' } : undefined}
            title={arrastavel ? `${tab.nome} — arraste para reposicionar` : undefined}
            {...wrapperAttr}
            {...dragHandlers}
          >
            {fecharBadge}
            {precisaTrocarSessao && tab.slugAlvo ? (
              <form
                action={action}
                onSubmit={(e) => {
                  if (dragRef.current?.suppressClick || draggingKey) {
                    e.preventDefault()
                    return
                  }
                  setSlugPendente(tab.slugAlvo)
                }}
                className="contents"
              >
                <input type="hidden" name="slug" value={tab.slugAlvo} />
                <input type="hidden" name="destino" value="portal" />
                <input type="hidden" name="escopo" value={tab.escopo} />
                <button
                  type="submit"
                  disabled={busy}
                  aria-current={ativo ? 'page' : undefined}
                  aria-label={tab.nome}
                  className={className}
                >
                  {visual}
                  {indicator}
                </button>
              </form>
            ) : (
              <ComunidadePrefetchLink
                href={tab.href}
                scroll={false}
                aria-current={ativo ? 'page' : undefined}
                aria-label={tab.nome}
                className={className}
                onClick={(e) => {
                  if (dragRef.current?.suppressClick || draggingKey) {
                    e.preventDefault()
                  }
                }}
              >
                {visual}
                {indicator}
              </ComunidadePrefetchLink>
            )}
          </m.div>
        )

        return shell
      })}
      </AnimatePresence>
    </nav>
  )
}
