'use client'

import { Clock, UserPlus } from 'lucide-react'
import { efetivarAreaPretendida } from '@/app/admin/membros/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { AppButton } from '@/components/ui/button'

export type PedidoAreaLite = {
  membroId: string
  nome: string
  cidade: string | null
  /** Nome da unidade de origem quando o vínculo nasceu numa afiliada (Caso B). */
  viaUnidade: string | null
  user: { nome: string | null; email: string }
}

/**
 * Sócios **já aprovados** que pediram esta área no onboarding e ainda não
 * entraram nela. Existe porque o vínculo de sócio é first-wins na torcida (quem
 * decidir primeiro aprova na Sede e na unidade) mas a área não acompanha: cada
 * nível decide a sua, no seu portal. Ver `efetivarAreaPretendida`.
 */
export function DepartamentoFilaArea({
  nomeArea,
  pedidos,
}: {
  nomeArea: string
  pedidos: PedidoAreaLite[]
}) {
  const confirmAction = useConfirmAction()

  async function incluir(pedido: PedidoAreaLite) {
    await confirmAction({
      titulo: `Incluir ${pedido.nome} em ${nomeArea}?`,
      descricao:
        'O vínculo de sócio já está aprovado. Esta decisão é só sobre a área, e vale apenas neste nível da hierarquia.',
      labelConfirmar: 'Incluir na área',
      variante: 'success',
      cancelled: 'Inclusão cancelada.',
      run: () => efetivarAreaPretendida(pedido.membroId),
      success: `${pedido.nome} entrou em ${nomeArea}.`,
    })
  }

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <UserPlus className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
            Pedidos para esta área
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {pedidos.length === 0
              ? 'Nenhum sócio aguardando entrada na área.'
              : `${pedidos.length} ${
                  pedidos.length === 1 ? 'sócio aprovado pediu' : 'sócios aprovados pediram'
                } ${nomeArea} no cadastro.`}
          </p>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <p className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]">
          <Clock className="h-4 w-4" />
          Nada pendente por aqui.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[rgb(var(--border))]">
          {pedidos.map((p) => (
            <li
              key={p.membroId}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {p.nome || p.user.nome || p.user.email}
                </p>
                <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
                  Sócio aprovado
                  {p.cidade ? ` · ${p.cidade}` : ''}
                  {p.viaUnidade ? ` · via ${p.viaUnidade}` : ''}
                </p>
              </div>
              <AppButton
                variant="success"
                icon={UserPlus}
                type="button"
                onClick={() => void incluir(p)}
                className="flex shrink-0 gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-[filter]"
              >
                Incluir na área
              </AppButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
