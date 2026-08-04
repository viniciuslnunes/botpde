'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { m } from 'motion/react'
import { toast } from '@torcida/ui'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { LogoImage } from '@/components/media/logo-image'
import { useReportNavPending } from '@/components/portal/nav-pending-context'
import {
  fecharCanalOperadorAction,
  registrarCanalAbertoAction,
  trocarTorcidaAction,
  type FecharCanalOperadorState,
  type TrocarTorcidaState,
} from '@/app/portal/tenant-context-actions'
import type { EscopoComunidade, EscoposDisponiveis } from '@/lib/comunidade-escopo'

export type CanalAbertoOperadorTab = {
  slug: string
  nome: string
  logoUrl: string | null
  ehUnidade: boolean
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
}

/**
 * Alterna entre Nacional (praça do clube), Minha torcida (organizada — só
 * sócio) e Minha unidade (canal da subsede/PDE). As abas são **escudos**,
 * não títulos: nomes longos de PDE/torcida estouravam a barra.
 *
 * Super-admin: além dos escopos, mostra **canais abertos** (cookie) com
 * badge X para fechar. Troca de sessão usa `trocarTorcidaAction` (já aceita
 * super-admin sem vínculo).
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
  const wasPending = useRef(false)
  const [slugPendente, setSlugPendente] = useState<string | null>(null)

  useReportNavPending(pending || fecharPending)

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

  // Garante o tenant atual na barra mesmo após "Voltar ao portal".
  useEffect(() => {
    if (!superAdmin || !atualSlug) return
    void registrarCanalAbertoAction(atualSlug)
  }, [superAdmin, atualSlug])

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
    // Base: canais abertos. Garante torcida/unidade atuais mesmo se o cookie
    // ainda não foi atualizado neste request (registrar é fire-and-forget).
    const visto = new Set<string>()
    const extras: CanalAbertoOperadorTab[] = [...canaisAbertos]

    if (slugTorcida && escopos.torcida) {
      if (!extras.some((c) => c.slug === slugTorcida)) {
        extras.unshift({
          slug: slugTorcida,
          nome: nomeTorcida ?? 'Minha torcida',
          logoUrl: logoTorcida ?? null,
          ehUnidade: false,
        })
      }
    }
    if (slugUnidade && escopos.unidade && slugUnidade !== slugTorcida) {
      if (!extras.some((c) => c.slug === slugUnidade)) {
        extras.push({
          slug: slugUnidade,
          nome: nomeUnidade ?? 'Minha unidade',
          logoUrl: logoUnidade ?? null,
          ehUnidade: true,
        })
      }
    }

    for (const canal of extras) {
      if (visto.has(canal.slug)) continue
      visto.add(canal.slug)
      const escopo: EscopoComunidade = canal.ehUnidade ? 'unidade' : 'torcida'
      tabs.push({
        id: `aberto:${canal.slug}`,
        escopo,
        nome: canal.nome,
        logoUrl: canal.logoUrl,
        inicial: canal.nome.charAt(0).toUpperCase(),
        href: hrefPara(escopo),
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
  }

  if (tabs.length < 2) return null

  const busy = pending || fecharPending

  return (
    <nav className="relative flex items-center gap-5 border-b border-[rgb(var(--border))]">
      {tabs.map((tab) => {
        const ativoPorEscopo =
          tab.escopo === escopoAtivo &&
          (tab.slugAlvo == null ||
            atualSlug == null ||
            tab.slugAlvo === atualSlug ||
            // Nacional não tem slug; torcida na raiz: slug = sede.
            (tab.escopo === 'torcida' &&
              tab.slugAlvo === slugTorcida &&
              atualSlug === slugTorcida) ||
            (tab.escopo === 'unidade' && tab.slugAlvo === slugUnidade))
        // Super-admin com vários canais: o ativo é o que bate com o cookie
        // (exceto nacional, que só olha o escopo).
        const ativo =
          tab.escopo === 'nacional'
            ? escopoAtivo === 'nacional'
            : superAdmin
              ? atualSlug != null && tab.slugAlvo === atualSlug && escopoAtivo !== 'nacional'
              : ativoPorEscopo

        const precisaTrocarSessao =
          tab.slugAlvo != null &&
          tab.slugAlvo !== '' &&
          atualSlug != null &&
          tab.slugAlvo !== atualSlug
        const carregandoEsta = pending && slugPendente === tab.slugAlvo

        const visual = (
          <>
            {tab.logoUrl ? (
              <LogoImage
                src={tab.logoUrl}
                alt=""
                size={28}
                className="h-7 w-7 object-contain"
              />
            ) : (
              <span
                aria-hidden
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
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
            {ativo && (
              <m.span
                layoutId="comunidade-escopo-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--primary))]"
                transition={springSnappy}
              />
            )}
          </>
        )

        const className = [
          'group relative -mb-px flex items-center justify-center pb-2.5 pt-1 transition-opacity',
          ativo ? 'opacity-100' : 'opacity-55 hover:opacity-90',
          busy && !carregandoEsta ? 'pointer-events-none opacity-40' : '',
        ].join(' ')

        const fecharBadge =
          tab.fechavel && tab.slugAlvo ? (
            <form action={fecharAction} className="contents">
              <input type="hidden" name="slug" value={tab.slugAlvo} />
              <input type="hidden" name="atualSlug" value={atualSlug ?? ''} />
              <input type="hidden" name="fallbackSlug" value={slugTorcida ?? ''} />
              <button
                type="submit"
                disabled={busy}
                aria-label={`Fechar canal ${tab.nome}`}
                title="Fechar canal"
                onClick={(e) => e.stopPropagation()}
                className={[
                  'absolute -right-1.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center',
                  'rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
                  'text-[rgb(var(--foreground-muted))] shadow-sm',
                  'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                  'hover:bg-[rgb(var(--danger)_/_0.12)] hover:text-[rgb(var(--danger))]',
                  // Sempre visível no touch / canal ativo
                  ativo ? 'opacity-100' : '',
                ].join(' ')}
              >
                <X className="h-2.5 w-2.5" strokeWidth={2.5} />
              </button>
            </form>
          ) : null

        if (precisaTrocarSessao && tab.slugAlvo) {
          return (
            <div key={tab.id} className="relative">
              {fecharBadge}
              <form
                action={action}
                onSubmit={() => setSlugPendente(tab.slugAlvo)}
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
                  title={tab.nome}
                  className={className}
                >
                  {visual}
                </button>
              </form>
            </div>
          )
        }

        return (
          <div key={tab.id} className="relative">
            {fecharBadge}
            <ComunidadePrefetchLink
              href={tab.href}
              scroll={false}
              aria-current={ativo ? 'page' : undefined}
              aria-label={tab.nome}
              title={tab.nome}
              className={className}
            >
              {visual}
            </ComunidadePrefetchLink>
          </div>
        )
      })}
    </nav>
  )
}
