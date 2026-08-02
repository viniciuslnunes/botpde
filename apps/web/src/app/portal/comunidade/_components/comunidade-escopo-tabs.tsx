'use client'

import { useSearchParams } from 'next/navigation'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'

type Props = {
  afiliacao: { nome: string; apelido: string | null } | null
  podeEscopoTorcida: boolean
  escopoAtivo: 'nacional' | 'torcida'
  /**
   * Default do usuário: sócio = torcida; TORCEDOR = nacional.
   * A aba do default omite `?escopo=`; a outra força o param.
   */
  modoContexto?: 'nacional' | 'torcida'
}

/**
 * Alterna entre o feed "Nacional" (torcedores do clube na plataforma) e
 * "Minha torcida" (unidade do vínculo). Sócio e TORCEDOR com unidade vêem
 * as duas abas; torcedor global fica só no Nacional.
 */
export function ComunidadeEscopoTabs({
  afiliacao,
  podeEscopoTorcida,
  escopoAtivo,
  modoContexto = 'torcida',
}: Props) {
  const params = useSearchParams()

  if (!afiliacao) return null

  function hrefPara(escopo: 'nacional' | 'torcida'): string {
    const next = new URLSearchParams(params.toString())
    next.delete('cursor')
    if (escopo === modoContexto) next.delete('escopo')
    else next.set('escopo', escopo)
    const qs = next.toString()
    return qs ? `/portal/comunidade?${qs}` : '/portal/comunidade'
  }

  const nomeClube = afiliacao.apelido || afiliacao.nome

  const tabs = [
    { id: 'nacional' as const, label: `Nacional (${nomeClube})`, href: hrefPara('nacional') },
    ...(podeEscopoTorcida
      ? [{ id: 'torcida' as const, label: 'Minha torcida', href: hrefPara('torcida') }]
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
