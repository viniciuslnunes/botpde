'use client'

import { CheckCircle2, Circle } from 'lucide-react'
import type { CompletudeItem } from '@/lib/completude-cadastro-socio'

type Props = {
  itens: CompletudeItem[]
  titulo?: string
  /** Clique no item incompleto foca o campo correspondente. */
  onFocarCampo?: (id: CompletudeItem['id']) => void
}

/** Mesmo visual do card admin «Completude do cadastro», reutilizável no portal. */
export function CompletudeChecklist({
  itens,
  titulo = 'Completude do cadastro',
  onFocarCampo,
}: Props) {
  if (itens.length === 0) return null
  const okCount = itens.filter((i) => i.ok).length
  const faltando = itens.filter((i) => i.obrigatorio && !i.ok)
  return (
    <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background)_/_0.4)] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgb(var(--foreground-muted))]">
          {titulo}
        </p>
        <p className="text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
          {okCount}/{itens.length}
          {faltando.length > 0
            ? ` · ${faltando.length} obrigatório(s) faltando`
            : ' · completo'}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {itens.map((item) => {
          const clicavel = !item.ok && !!onFocarCampo
          const Conteudo = (
            <>
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-success-fg))]" />
              ) : (
                <Circle
                  className={[
                    'mt-0.5 h-4 w-4 shrink-0',
                    item.obrigatorio
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                />
              )}
              <span className={item.ok ? 'text-[rgb(var(--foreground))]' : 'text-[rgb(var(--foreground-muted))]'}>
                {item.label}
              </span>
            </>
          )
          return (
            <li key={item.id}>
              {clicavel ? (
                <button
                  type="button"
                  onClick={() => onFocarCampo(item.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  {Conteudo}
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm">
                  {Conteudo}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
