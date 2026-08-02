'use client'

import { useSearchParams } from 'next/navigation'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { LogoImage } from '@/components/media/logo-image'
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
}

/**
 * Alterna entre Nacional (praça do clube), Minha torcida (organizada — só
 * sócio) e Minha unidade (canal da subsede/PDE). As abas são **escudos**,
 * não títulos: nomes longos de PDE/torcida estouravam a barra.
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
  modoContexto = 'torcida',
}: Props) {
  const params = useSearchParams()

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
    },
    ...(escopos.torcida
      ? [
          {
            id: 'torcida' as const,
            nome: nomeTorcida ? `Minha torcida — ${nomeTorcida}` : 'Minha torcida',
            logoUrl: logoTorcida ?? null,
            inicial: (nomeTorcida || 'T').charAt(0).toUpperCase(),
            href: hrefPara('torcida'),
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
          },
        ]
      : []),
  ]

  if (tabs.length < 2) return null

  return (
    <nav className="relative flex items-center gap-5 border-b border-[rgb(var(--border))]">
      {tabs.map((tab) => {
        const ativo = tab.id === escopoAtivo
        return (
          <ComunidadePrefetchLink
            key={tab.id}
            href={tab.href}
            scroll={false}
            aria-current={ativo ? 'page' : undefined}
            aria-label={tab.nome}
            title={tab.nome}
            className={[
              'relative -mb-px flex items-center justify-center pb-2.5 pt-1 transition-opacity',
              ativo ? 'opacity-100' : 'opacity-55 hover:opacity-90',
            ].join(' ')}
          >
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
            {ativo && (
              <m.span
                layoutId="comunidade-escopo-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--primary))]"
                transition={springSnappy}
              />
            )}
          </ComunidadePrefetchLink>
        )
      })}
    </nav>
  )
}
