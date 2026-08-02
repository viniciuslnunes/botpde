'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { m } from 'motion/react'
import { toast } from '@torcida/ui'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { LogoImage } from '@/components/media/logo-image'
import { useReportNavPending } from '@/components/portal/nav-pending-context'
import {
  trocarTorcidaAction,
  type TrocarTorcidaState,
} from '@/app/portal/tenant-context-actions'
import type { EscopoComunidade, EscoposDisponiveis } from '@/lib/comunidade-escopo'

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
}

type TabDef = {
  id: EscopoComunidade
  /** Nome completo para aria-label / title (não aparece no layout). */
  nome: string
  logoUrl: string | null
  /** Inicial de fallback quando não há escudo. */
  inicial: string
  href: string
  /** Quando definido e diferente de `atualSlug`, o clique troca o cookie. */
  slugAlvo: string | null
}

/**
 * Alterna entre Nacional (praça do clube), Minha torcida (organizada — só
 * sócio) e Minha unidade (canal da subsede/PDE). As abas são **escudos**,
 * não títulos: nomes longos de PDE/torcida estouravam a barra.
 *
 * Torcida/unidade com tenant distinto (Caso B) disparam `trocarTorcidaAction`
 * para alinhar o cookie da sessão — o cadeado admin do header segue o tenant
 * ativo. Nacional só navega (`?escopo=nacional`), sem gravar o sintético.
 *
 * Torcedor vê Nacional + Minha unidade; torcedor global, só Nacional.
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
}: Props) {
  const params = useSearchParams()
  const [state, action, pending] = useActionState<TrocarTorcidaState, FormData>(
    trocarTorcidaAction,
    {},
  )
  const wasPending = useRef(false)
  const [slugPendente, setSlugPendente] = useState<string | null>(null)

  useReportNavPending(pending)

  useEffect(() => {
    if (wasPending.current && !pending && state.message) {
      toast.error(state.message)
      setSlugPendente(null)
    }
    wasPending.current = pending
  }, [pending, state.message])

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
      nome: `Nacional — ${nomeClube}`,
      logoUrl: afiliacao.escudoUrl,
      inicial: nomeClube.charAt(0).toUpperCase(),
      href: hrefPara('nacional'),
      slugAlvo: null,
    },
    ...(escopos.torcida
      ? [
          {
            id: 'torcida' as const,
            nome: nomeTorcida ? `Minha torcida — ${nomeTorcida}` : 'Minha torcida',
            logoUrl: logoTorcida ?? null,
            inicial: (nomeTorcida || 'T').charAt(0).toUpperCase(),
            href: hrefPara('torcida'),
            slugAlvo: slugTorcida,
          },
        ]
      : []),
    ...(escopos.unidade
      ? [
          {
            id: 'unidade' as const,
            nome: nomeUnidade ? `Minha unidade — ${nomeUnidade}` : 'Minha unidade',
            logoUrl: logoUnidade ?? null,
            inicial: (nomeUnidade || 'U').charAt(0).toUpperCase(),
            href: hrefPara('unidade'),
            slugAlvo: slugUnidade,
          },
        ]
      : []),
  ]

  if (tabs.length < 2) return null

  return (
    <nav className="relative flex items-center gap-5 border-b border-[rgb(var(--border))]">
      {tabs.map((tab) => {
        const ativo = tab.id === escopoAtivo
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
          'relative -mb-px flex items-center justify-center pb-2.5 pt-1 transition-opacity',
          ativo ? 'opacity-100' : 'opacity-55 hover:opacity-90',
          pending && !carregandoEsta ? 'pointer-events-none opacity-40' : '',
        ].join(' ')

        if (precisaTrocarSessao && tab.slugAlvo) {
          return (
            <form
              key={tab.id}
              action={action}
              onSubmit={() => setSlugPendente(tab.slugAlvo)}
              className="contents"
            >
              <input type="hidden" name="slug" value={tab.slugAlvo} />
              <input type="hidden" name="destino" value="portal" />
              <input type="hidden" name="escopo" value={tab.id} />
              <button
                type="submit"
                disabled={pending}
                aria-current={ativo ? 'page' : undefined}
                aria-label={tab.nome}
                title={tab.nome}
                className={className}
              >
                {visual}
              </button>
            </form>
          )
        }

        return (
          <ComunidadePrefetchLink
            key={tab.id}
            href={tab.href}
            scroll={false}
            aria-current={ativo ? 'page' : undefined}
            aria-label={tab.nome}
            title={tab.nome}
            className={className}
          >
            {visual}
          </ComunidadePrefetchLink>
        )
      })}
    </nav>
  )
}
