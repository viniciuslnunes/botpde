'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { toast } from '@torcida/ui'
import { canalTabBarItem, canalTabIconTap, springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { LogoMiniatura, LOGO_MINIATURA_PX } from '@/components/media/logo-miniatura'
import { HoverTip, hoverTipFromElement, type HoverTipAnchor } from '@/components/ui/hover-tip'
import { useReportNavPending } from '@/components/portal/nav-pending-context'
import {
  fecharCanalOperadorAction,
  registrarCanalAbertoAction,
  trocarTorcidaAction,
  type FecharCanalOperadorState,
  type TrocarTorcidaState,
} from '@/app/portal/tenant-context-actions'
import {
  fecharCanalTematicoAbertoAction,
  registrarCanalVisitadoAction,
  reordenarBarraMovelAction,
  type FecharCanalTematicoState,
} from '@/app/portal/comunidade/socio-canais-actions'
import {
  ordemArrastavelSemFixos,
  slugsHierarquiaFixos,
  temUnidadeFixaOperador,
} from '@/lib/operador-canais-ordem'
import {
  chaveBarraOperador,
  chaveBarraTematico,
  moverChaveBarraMovel,
  parseChaveBarraMovel,
  sincronizarOrdemBarraMovel,
} from '@/lib/comunidade-barra-movel'
import type { EscopoComunidade, EscoposDisponiveis } from '@/lib/comunidade-escopo'
import {
  chaveAtividadeCanal,
  chaveAtividadeNacional,
} from '@/lib/comunidade-canal-atividade'
import {
  montarAlvosAtividadeBarra,
  useComunidadeCanalAtividade,
} from '@/lib/use-comunidade-canal-atividade'
import { useCanalSoftSwitch } from './canal-soft-switch'

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
  afiliacao: {
    id: string
    nome: string
    apelido: string | null
    escudoUrl: string | null
  } | null
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
  /** Conversa id do mural oficial da Sede — destaca a aba torcida em `/canais/[id]`. */
  canalIdTorcida?: string | null
  /** Conversa id do mural da unidade fixa — destaca a aba unidade. */
  canalIdUnidade?: string | null
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
  /** Página `/canais/[id]` — destaca a aba por conversa id (4+ ou hierarquia). */
  canalAtivoId?: string | null
  /** Ordem unificada da zona móvel (`o:slug` / `t:id`) vinda do cookie. */
  ordemBarraMovelInicial?: string[]
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
 * Super-admin: Nacional + torcida ficam **fixos**; a unidade só entra no
 * prefixo fixo quando o tenant ativo **é** ela. Canais abertos pela lista
 * Canais entram na 4ª+ (conversa id, com escudo) — fecháveis e reordenáveis.
 * Slugs extras do cookie de tenant (troca de comunidade) também aparecem
 * depois dos fixos. Selecionar **não** muda a ordem.
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
  canalIdTorcida = null,
  canalIdUnidade = null,
  modoContexto = 'torcida',
  superAdmin = false,
  canaisAbertos = [],
  canaisTematicosAbertos = [],
  canalAtivoId = null,
  ordemBarraMovelInicial = [],
}: Props) {
  const softSwitch = useCanalSoftSwitch()
  const router = useRouter()
  /** Canal cujo mural está aberto (`/canais/[id]`), incl. sede/unidade. */
  const idCanalVisto = softSwitch?.canalAtivoId ?? canalAtivoId
  /** 4+ visitado (fechável) — não confundir com aba fixa que também tem canalId. */
  const idsVisitados4 = useMemo(
    () => new Set(canaisTematicosAbertos.map((c) => c.id)),
    [canaisTematicosAbertos],
  )
  const canalAtivoEfetivo =
    idCanalVisto && idsVisitados4.has(idCanalVisto) ? idCanalVisto : null
  const vendoCanalNaBarra = Boolean(idCanalVisto)
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
  const [tip, setTip] = useState<HoverTipAnchor | null>(null)

  function limparTip() {
    setTip(null)
  }

  function mostrarTipCanal(
    content: string | { title: string; hint?: string },
    el: HTMLElement,
  ) {
    setTip(hoverTipFromElement(content, el))
  }

  /** Ordem local unificada da zona móvel (4+): `o:slug` e `t:id`. */
  const [ordemMovel, setOrdemMovel] = useState<string[]>(() => ordemBarraMovelInicial)
  const ordemMovelRef = useRef(ordemMovel)
  ordemMovelRef.current = ordemMovel

  const dragRef = useRef<{
    key: string
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

  // Visita 4+ (conversa): sócio, torcedor e super-admin. Soft-switch também registra.
  // Hierarquia fixa é filtrada na action — sede/unidade não entram no cookie.
  // Oficial de outra unidade: ativa o tenant e remonta o chrome (cookie novo).
  useEffect(() => {
    if (!idCanalVisto) return
    let cancelled = false
    void (async () => {
      const { trocouTenant } = await registrarCanalVisitadoAction(idCanalVisto)
      // Só remonta se o tenant mudou — senão o refresh em loop gravaria
      // a marca Caso A a cada paint.
      if (!cancelled && trocouTenant) router.refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [idCanalVisto, router])

  /** Prefixo hierárquico do operador (após Nacional) — não fecha nem arrasta. */
  const slugsFixosOperador = useMemo(
    () =>
      slugsHierarquiaFixos({
        slugTorcida,
        slugUnidade,
        temTorcida: Boolean(escopos.torcida && slugTorcida),
        temUnidade: temUnidadeFixaOperador({
          superAdmin,
          temEscopoUnidade: Boolean(escopos.unidade),
          slugUnidade,
          atualSlug,
        }),
      }),
    [escopos.torcida, escopos.unidade, slugTorcida, slugUnidade, superAdmin, atualSlug],
  )
  const fixosOperadorSet = useMemo(
    () => new Set(slugsFixosOperador),
    [slugsFixosOperador],
  )

  const slugsExtrasOperador = useMemo(
    () =>
      superAdmin
        ? ordemArrastavelSemFixos(
            canaisAbertos.map((c) => c.slug),
            slugsFixosOperador,
          )
        : [],
    [superAdmin, canaisAbertos, slugsFixosOperador],
  )
  const idsTematicosAbertos = useMemo(
    () => canaisTematicosAbertos.map((c) => c.id),
    [canaisTematicosAbertos],
  )

  // Membership mudou (abriu/fechou) — re-sincroniza; durante o drag a chave
  // de membership não muda, então a ordem otimista permanece.
  const membershipKey = [
    slugsExtrasOperador.join(','),
    idsTematicosAbertos.join(','),
    ordemBarraMovelInicial.join(','),
  ].join('|')
  useEffect(() => {
    setOrdemMovel((prev) =>
      sincronizarOrdemBarraMovel({
        salva: prev.length > 0 ? prev : ordemBarraMovelInicial,
        slugsOperador: slugsExtrasOperador,
        idsTematicos: idsTematicosAbertos,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- membershipKey agrega
  }, [membershipKey])

  const canaisPorSlug = useMemo(() => {
    const map = new Map(canaisAbertos.map((c) => [c.slug, c]))
    return map
  }, [canaisAbertos])

  const tematicosPorId = useMemo(() => {
    const map = new Map(canaisTematicosAbertos.map((c) => [c.id, c]))
    return map
  }, [canaisTematicosAbertos])

  const afiliacaoId = afiliacao?.id ?? null
  const alvosAtividade = useMemo(
    () =>
      montarAlvosAtividadeBarra({
        afiliacaoId,
        canalIds: [
          canalIdTorcida,
          canalIdUnidade,
          ...canaisTematicosAbertos.map((c) => c.id),
        ],
      }),
    [afiliacaoId, canalIdTorcida, canalIdUnidade, canaisTematicosAbertos],
  )

  const activeAtividadeKey = useMemo(() => {
    if (!afiliacaoId) return null
    if (idCanalVisto) return chaveAtividadeCanal(idCanalVisto)
    if (escopoAtivo === 'nacional') return chaveAtividadeNacional(afiliacaoId)
    if (escopoAtivo === 'unidade' && canalIdUnidade) {
      return chaveAtividadeCanal(canalIdUnidade)
    }
    if (escopoAtivo === 'torcida' && canalIdTorcida) {
      return chaveAtividadeCanal(canalIdTorcida)
    }
    return null
  }, [afiliacaoId, idCanalVisto, escopoAtivo, canalIdTorcida, canalIdUnidade])

  const { unreadKeys } = useComunidadeCanalAtividade({
    alvos: alvosAtividade,
    activeKey: activeAtividadeKey,
    afiliacaoId,
    enabled: Boolean(afiliacaoId),
  })

  if (!afiliacao) return null

  function hrefPara(escopo: EscopoComunidade, opts?: { forcarRaiz?: boolean }): string {
    const next = new URLSearchParams(params.toString())
    next.delete('cursor')
    next.delete('raiz')
    if (escopo === modoContexto) next.delete('escopo')
    else next.set('escopo', escopo)
    // Minha torcida/unidade fixas: desfaz o foco Caso A (PDE sem portal).
    if (opts?.forcarRaiz) next.set('raiz', '1')
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
    // Hierarquia fixa: torcida → unidade (se distinta). Zona móvel vem depois.
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
        href: hrefPara(ehUnidade ? 'unidade' : 'torcida', {
          forcarRaiz: !ehUnidade,
        }),
        slugAlvo: slug,
        fechavel: false,
        canalId: ehUnidade ? canalIdUnidade : canalIdTorcida,
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
        href: hrefPara('torcida', { forcarRaiz: true }),
        slugAlvo: slugTorcida,
        fechavel: false,
        canalId: canalIdTorcida,
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
        canalId: canalIdUnidade,
      })
    }
  }

  // Zona móvel (4+): ordem unificada — operador e temáticos intercaláveis.
  const vistoMovel = new Set<string>()
  for (const chave of ordemMovel) {
    const parsed = parseChaveBarraMovel(chave)
    if (!parsed || vistoMovel.has(chave)) continue
    vistoMovel.add(chave)

    if (parsed.kind === 'operador') {
      if (!superAdmin || fixosOperadorSet.has(parsed.id)) continue
      const canal = canaisPorSlug.get(parsed.id)
      if (!canal) continue
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
    } else {
      const canal = tematicosPorId.get(parsed.id)
      if (!canal) continue
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

  const chavesArrastaveis = ordemMovel

  function persistirOrdemMovel(next: string[]) {
    startReorder(async () => {
      const r = await reordenarBarraMovelAction(next, {
        slugsOperador: slugsExtrasOperador,
        idsTematicos: idsTematicosAbertos,
      })
      if (!r.ok) {
        toast.error(r.message)
        setOrdemMovel(
          sincronizarOrdemBarraMovel({
            salva: ordemBarraMovelInicial,
            slugsOperador: slugsExtrasOperador,
            idsTematicos: idsTematicosAbertos,
          }),
        )
      }
    })
  }

  function onPointerDownTab(e: React.PointerEvent, key: string) {
    if (busy) return
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button[type="submit"][aria-label^="Fechar"]')) {
      return
    }
    const from = chavesArrastaveis.indexOf(key)
    if (from < 0) return
    dragRef.current = {
      key,
      from,
      startX: e.clientX,
      pointerId: e.pointerId,
      active: false,
      suppressClick: false,
    }
  }

  function onPointerMoveTab(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return
      drag.active = true
      drag.suppressClick = true
      setDraggingKey(drag.key)
      limparTip()
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    e.preventDefault()

    const el = document.elementFromPoint(e.clientX, e.clientY)
    const over = el?.closest<HTMLElement>('[data-barra-chave]')
    const overKey = over?.dataset.barraChave
    if (!overKey || overKey === drag.key) return
    if (!chavesArrastaveis.includes(overKey)) return

    setOrdemMovel((prev) => moverChaveBarraMovel(prev, drag.key, overKey))
  }

  function onPointerUpTab(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const moved = drag.active
    const suppress = drag.suppressClick
    dragRef.current = null
    setDraggingKey(null)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    if (moved) {
      persistirOrdemMovel(ordemMovelRef.current)
    }
    if (suppress) {
      e.preventDefault()
    }
  }

  return (
    <nav
      className="relative flex items-center gap-5 border-b border-[rgb(var(--border))] pb-[15px]"
      aria-label="Escopos e canais da Comunidade"
    >
      <AnimatePresence initial={false} mode="popLayout">
      {tabs.map((tab) => {
        /** Visitado 4+ (fechável) — drag/soft-switch na zona móvel. */
        const ehMovel = tab.fechavel
        const chaveMovel = tab.canalId
          ? chaveBarraTematico(tab.canalId)
          : tab.slugAlvo
            ? chaveBarraOperador(tab.slugAlvo)
            : null
        const ativoPorEscopo =
          !vendoCanalNaBarra &&
          tab.escopo === escopoAtivo &&
          (tab.slugAlvo == null ||
            atualSlug == null ||
            tab.slugAlvo === atualSlug ||
            (tab.escopo === 'torcida' &&
              tab.slugAlvo === slugTorcida &&
              atualSlug === slugTorcida) ||
            (tab.escopo === 'unidade' && tab.slugAlvo === slugUnidade))
        // Em `/canais/[id]`: destaca qualquer aba com o mesmo conversa id
        // (torcida/unidade fixas OU visitado 4+). Sem id: escopo/slug.
        const ativo = idCanalVisto
          ? tab.canalId != null && tab.canalId === idCanalVisto
          : tab.escopo === 'nacional'
            ? escopoAtivo === 'nacional'
            : superAdmin
              ? atualSlug != null &&
                tab.slugAlvo === atualSlug &&
                escopoAtivo !== 'nacional'
              : ativoPorEscopo

        // Inclui canais 4+ do operador (fecháveis): sem isso o clique só
        // muda `?escopo=` e o mural continua no tenant ativo (ex.: PDE).
        // Temáticos têm slugAlvo null — soft-switch / Link, sem trocar sessão.
        const precisaTrocarSessao =
          tab.slugAlvo != null &&
          tab.slugAlvo !== '' &&
          atualSlug != null &&
          tab.slugAlvo !== atualSlug
        const carregandoEsta = pending && slugPendente === tab.slugAlvo
        const arrastavel = Boolean(ehMovel && chaveMovel && chavesArrastaveis.includes(chaveMovel))
        const dragKey = chaveMovel
        const arrastando = dragKey != null && draggingKey === dragKey

        const chaveAtividade =
          tab.escopo === 'nacional'
            ? chaveAtividadeNacional(afiliacao.id)
            : tab.canalId
              ? chaveAtividadeCanal(tab.canalId)
              : null
        const temNovidade =
          Boolean(chaveAtividade) && !ativo && unreadKeys.has(chaveAtividade!)

        /** 32×32 sem scale no ícone (hover distorce a medida entre abas). */
        const visual = (
          <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center">
            {tab.logoUrl ? (
              <LogoMiniatura src={tab.logoUrl} alt="" />
            ) : (
              <span
                aria-hidden
                className={[
                  'flex items-center justify-center rounded-full text-xs font-bold',
                  ativo
                    ? 'bg-[rgb(var(--primary))] text-white'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
                style={{
                  width: LOGO_MINIATURA_PX,
                  height: LOGO_MINIATURA_PX,
                  minWidth: LOGO_MINIATURA_PX,
                  minHeight: LOGO_MINIATURA_PX,
                  maxWidth: LOGO_MINIATURA_PX,
                  maxHeight: LOGO_MINIATURA_PX,
                  borderRadius: '50%',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              >
                {tab.inicial}
              </span>
            )}
            {carregandoEsta ? (
              <Loader2
                className="absolute -right-1 -top-1 z-10 h-3.5 w-3.5 animate-spin text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ) : null}
          </span>
        )

        /**
         * Fora do botão com opacity — usa primary-fg (legível com marca preta)
         * + halo suave. Sem vermelho do sino.
         */
        const novidadeBadge =
          !carregandoEsta && temNovidade ? (
            <span
              aria-hidden
              className={[
                'pointer-events-none absolute z-[6] flex h-2.5 w-2.5 items-center justify-center',
                tab.fechavel ? '-bottom-0.5 -right-0.5' : '-right-0.5 -top-0.5',
              ].join(' ')}
            >
              <span className="escopo-novidade-halo absolute inset-0 rounded-full bg-[rgb(var(--color-primary-fg))]" />
              <span
                className={[
                  'escopo-novidade-dot relative h-2.5 w-2.5 rounded-full',
                  'bg-[rgb(var(--color-primary-fg))]',
                  'ring-2 ring-[rgb(var(--surface))]',
                  'shadow-[0_0_8px_rgb(var(--color-primary-fg)/0.55)]',
                ].join(' ')}
              />
            </span>
          ) : null

        const className = [
          'relative -mb-px flex h-11 touch-none items-center justify-center pb-2 pt-0.5',
          // Com novidade: menos fade — o escudo “acende” junto com o ponto.
          ativo ? 'opacity-100' : temNovidade ? 'opacity-95 hover:opacity-100' : 'opacity-55 hover:opacity-90',
          busy && !carregandoEsta ? 'pointer-events-none opacity-40' : '',
        ].join(' ')
        // Largura do hit-area = logo + folga mínima
        const tabBtnStyle = {
          width: LOGO_MINIATURA_PX,
        } as const

        const wrapperAttr = arrastavel && chaveMovel
          ? { 'data-barra-chave': chaveMovel }
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
          tab.canalId ? (
            <form action={fecharTematicoAction} className="contents">
              <input type="hidden" name="canalId" value={tab.canalId} />
              <input type="hidden" name="canalAtivoId" value={canalAtivoEfetivo ?? ''} />
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

        const tipContent = arrastavel
          ? {
              title: tab.nome,
              hint: temNovidade ? 'Novidades · arraste para reposicionar' : 'Arraste para reposicionar',
            }
          : temNovidade
            ? { title: tab.nome, hint: 'Há publicações novas' }
            : tab.nome

        const ariaLabel = temNovidade ? `${tab.nome} (novidades)` : tab.nome

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
              'relative group h-8 w-8 shrink-0 rounded-full',
              arrastavel ? 'cursor-grab select-none active:cursor-grabbing' : '',
            ].join(' ')}
            style={{
              width: LOGO_MINIATURA_PX,
              height: LOGO_MINIATURA_PX,
              // Arraste custom (pointer) — sem scroll/pan nativo no hit-area.
              ...(arrastavel ? { touchAction: 'none' as const } : {}),
            }}
            onPointerEnter={(e) => {
              if (draggingKey) return
              mostrarTipCanal(tipContent, e.currentTarget)
            }}
            onPointerLeave={limparTip}
            onDragStart={(e) => {
              // Impede drag HTML5 do <a> (fantasma com URL que quebra o reorder).
              e.preventDefault()
            }}
            {...wrapperAttr}
            {...(arrastavel && dragKey
              ? {
                  onPointerDown: (e: React.PointerEvent) => {
                    limparTip()
                    onPointerDownTab(e, dragKey)
                  },
                  onPointerMove: onPointerMoveTab,
                  onPointerUp: onPointerUpTab,
                  onPointerCancel: onPointerUpTab,
                }
              : {
                  onPointerDown: () => limparTip(),
                })}
          >
            {fecharBadge}
            {novidadeBadge}
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
                  aria-label={ariaLabel}
                  className={className}
                  style={tabBtnStyle}
                  draggable={false}
                >
                  {visual}
                  {indicator}
                </button>
              </form>
            ) : (
              <ComunidadePrefetchLink
                href={tab.href}
                scroll={false}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                aria-current={ativo ? 'page' : undefined}
                aria-label={ariaLabel}
                className={className}
                style={tabBtnStyle}
                onMouseEnter={() => {
                  if (tab.canalId && softSwitch?.enabled) {
                    softSwitch.prefetchCanal(tab.canalId)
                  }
                }}
                onFocus={() => {
                  if (tab.canalId && softSwitch?.enabled) {
                    softSwitch.prefetchCanal(tab.canalId)
                  }
                }}
                onClick={(e) => {
                  if (dragRef.current?.suppressClick || draggingKey) {
                    e.preventDefault()
                    return
                  }
                  // Soft-switch também para Minha torcida/unidade (canalId
                  // fixo): limpa o foco Caso A ao escolher a Sede de novo.
                  if (tab.canalId && softSwitch?.enabled) {
                    e.preventDefault()
                    softSwitch.softSwitchPara(tab.canalId)
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
      <HoverTip tip={tip} />
    </nav>
  )
}
