'use client'

import { useSearchParams } from 'next/navigation'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import type { EscopoComunidade, EscoposDisponiveis } from '@/lib/comunidade-escopo'

type Props = {
  afiliacao: { nome: string; apelido: string | null } | null
  escopos: EscoposDisponiveis
  escopoAtivo: EscopoComunidade
  /** Nome da unidade de vínculo — rotula a aba dela. */
  nomeUnidade?: string | null
  /** Nome da torcida (organizada) — rotula a aba de sócio. */
  nomeTorcida?: string | null
  /**
   * Default do usuário: sócio = torcida; TORCEDOR = nacional.
   * A aba do default omite `?escopo=`; as outras forçam o param.
   */
  modoContexto?: 'nacional' | 'torcida'
}

/**
 * Alterna entre "Nacional" (a praça do clube), "Minha torcida" (a organizada
 * inteira — só sócio) e "Minha unidade" (o canal da subsede/PDE que convidou).
 *
 * Torcedor vê Nacional + Minha unidade: ele pertence à unidade, não à
 * organizada. Torcedor global, sem unidade, fica só no Nacional.
 */
export function ComunidadeEscopoTabs({
  afiliacao,
  escopos,
  escopoAtivo,
  nomeUnidade,
  nomeTorcida,
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

  const tabs: Array<{ id: EscopoComunidade; label: string; href: string }> = [
    { id: 'nacional', label: `Nacional (${nomeClube})`, href: hrefPara('nacional') },
    ...(escopos.torcida
      ? [
          {
            id: 'torcida' as const,
            label: nomeTorcida ? `Minha torcida (${nomeTorcida})` : 'Minha torcida',
            href: hrefPara('torcida'),
          },
        ]
      : []),
    ...(escopos.unidade
      ? [
          {
            id: 'unidade' as const,
            label: nomeUnidade ? `Minha unidade (${nomeUnidade})` : 'Minha unidade',
            href: hrefPara('unidade'),
          },
        ]
      : []),
  ]

  if (tabs.length < 2) return null

  return (
    <nav className="relative flex items-center gap-6 border-b border-[rgb(var(--border))]">
      {tabs.map((tab) => {
        const ativo = tab.id === escopoAtivo
        return (
          <ComunidadePrefetchLink
            key={tab.id}
            href={tab.href}
            scroll={false}
            aria-current={ativo ? 'page' : undefined}
            className={[
              'relative -mb-px pb-3 pt-1 text-[15px] font-semibold transition-colors',
              ativo
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {tab.label}
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
