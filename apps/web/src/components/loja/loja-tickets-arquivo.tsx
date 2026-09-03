import Link from 'next/link'
import { Archive } from 'lucide-react'
import { Badge } from '@torcida/ui'
import {
  idCurtoPedido,
  MOTIVO_FECHO_PEDIDO_TICKET,
  STATUS_PEDIDO_TICKET,
  formatarMoedaBRL,
} from '@torcida/types'
import {
  listarArquivoTickets,
  type ArquivoTicketsFiltro,
} from '@/lib/loja-ticket'
import { TicketsBuscaForm } from '@/app/admin/loja/tickets/tickets-busca-form'

const POR_PAGINA = 25

function formatarData(data: Date | null) {
  if (!data) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

export async function LojaTicketsArquivo({
  tenantId,
  filtro,
  busca,
  pagina,
}: {
  tenantId: string
  filtro: ArquivoTicketsFiltro
  busca: string
  pagina: number
}) {
  const skip = (pagina - 1) * POR_PAGINA

  const { tickets, total } = await listarArquivoTickets(tenantId, {
    filtro,
    busca: busca || undefined,
    skip,
    take: POR_PAGINA,
  })

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  function hrefFiltro(f: ArquivoTicketsFiltro) {
    const sp = new URLSearchParams()
    sp.set('v', 'arquivo')
    sp.set('filtro', f)
    if (busca) sp.set('q', busca)
    return `/admin/loja/atendimento?${sp.toString()}`
  }

  function hrefPagina(p: number) {
    const sp = new URLSearchParams()
    sp.set('v', 'arquivo')
    sp.set('filtro', filtro)
    if (busca) sp.set('q', busca)
    if (p > 1) sp.set('pagina', String(p))
    return `/admin/loja/atendimento?${sp.toString()}`
  }

  const tabClass = (ativa: boolean) =>
    [
      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      ativa
        ? 'bg-[rgb(var(--primary))] text-primary-on'
        : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
    ].join(' ')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
          Arquivo de conversas
        </h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Histórico dos tickets da loja. A listagem carrega só metadados — a conversa completa
          abre sob demanda ao selecionar um registro.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={hrefFiltro('fechados')} className={tabClass(filtro === 'fechados')}>
          Fechados
        </Link>
        <Link href={hrefFiltro('abertos')} className={tabClass(filtro === 'abertos')}>
          Na fila / atendendo
        </Link>
        <Link href={hrefFiltro('todos')} className={tabClass(filtro === 'todos')}>
          Todos
        </Link>
      </div>

      <TicketsBuscaForm filtro={filtro} buscaInicial={busca} action="/admin/loja/atendimento" />

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-16 text-center">
          <Archive className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" aria-hidden />
          <p className="font-medium text-[rgb(var(--foreground))]">Nenhum ticket neste filtro</p>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Conversas fechadas e em atendimento aparecem aqui para consulta e gestão.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                <th className="px-4 py-2.5">Pedido</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Cliente</th>
                <th className="px-4 py-2.5">Ticket</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Datas</th>
                <th className="px-4 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {tickets.map((t) => {
                const statusInfo = STATUS_PEDIDO_TICKET[t.status]
                const modalidade =
                  t.pedido.modalidadeEntrega === 'ENVIO' ? 'Envio' : 'Retirada'
                const motivo =
                  t.motivoFecho != null
                    ? MOTIVO_FECHO_PEDIDO_TICKET[t.motivoFecho]
                    : null
                return (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[rgb(var(--foreground))]">
                        {idCurtoPedido(t.pedidoId)}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {modalidade} · {formatarMoedaBRL(Number(t.pedido.total))}
                      </p>
                      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))] sm:hidden">
                        {t.pedido.user.nome ?? t.pedido.user.email ?? '—'}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <p className="text-[rgb(var(--foreground))]">
                        {t.pedido.user.nome ?? '—'}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {t.pedido.user.email ?? ''}
                      </p>
                      {t.atendente && (
                        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                          Atendente: {t.atendente.nome ?? '—'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          statusInfo.tom === 'warning'
                            ? 'warning'
                            : statusInfo.tom === 'info'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {statusInfo.label}
                      </Badge>
                      {motivo && (
                        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                          {motivo}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-[rgb(var(--foreground-muted))] md:table-cell">
                      <p>Aberto: {formatarData(t.abertoEm)}</p>
                      {t.atendidoEm && <p>Atendido: {formatarData(t.atendidoEm)}</p>}
                      {t.fechadoEm && <p>Fechado: {formatarData(t.fechadoEm)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/loja/tickets/${t.id}`}
                        className="inline-flex rounded-md bg-[rgb(var(--primary))] px-2.5 py-1.5 text-xs font-semibold text-primary-on hover:opacity-90"
                      >
                        Abrir conversa
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-[rgb(var(--foreground-muted))]">
          <p>
            {total} ticket{total === 1 ? '' : 's'} · página {pagina}/{totalPaginas}
          </p>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={hrefPagina(pagina - 1)} className="hover:underline">
                Anterior
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={hrefPagina(pagina + 1)} className="hover:underline">
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
