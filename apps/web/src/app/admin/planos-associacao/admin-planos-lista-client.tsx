'use client'

import Link from 'next/link'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { CreditCard } from 'lucide-react'

export type PlanoListaItem = {
  id: string
  nome: string
  descricao: string | null
  valorLabel: string
  periodicidadeLabel: string
  ativo: boolean
  membrosCount: number
}

export function AdminPlanosListaClient({ planos }: { planos: PlanoListaItem[] }) {
  if (planos.length === 0) {
    return (
      <MotionEmptyState
        icon={<CreditCard className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum plano cadastrado"
        description="Crie o primeiro plano de associação para vincular aos membros."
        className="rounded-2xl border border-dashed border-[rgb(var(--border))] py-12 text-center"
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Plano
            </th>
            <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] sm:table-cell">
              Valor
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--border))]">
          {planos.map((plano) => (
            <tr key={plano.id} className="hover:bg-[rgb(var(--background-subtle)_/_0.5)]">
              <td className="px-4 py-3">
                <p className="font-medium text-[rgb(var(--foreground))]">{plano.nome}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {plano.periodicidadeLabel}
                  {plano.membrosCount > 0 ? ` · ${plano.membrosCount} membro(s)` : ''}
                </p>
                {plano.descricao && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--foreground-muted))]">
                    {plano.descricao}
                  </p>
                )}
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <span className="font-mono text-[rgb(var(--foreground))]">{plano.valorLabel}</span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={[
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                    plano.ativo
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
                  ].join(' ')}
                >
                  {plano.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/planos-associacao?edit=${plano.id}`}
                  className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
                >
                  Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
