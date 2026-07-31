import { Receipt, AlertCircle } from 'lucide-react'
import type { BarComandaAbertaPortal, BarDebitoComandaPortal } from '@/lib/bar-comanda'

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarData(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/**
 * Leitura portal: comanda ABERTA do membro + débitos. Sem pagar / lançar.
 */
export function BarMinhaComanda({
  comanda,
  debitos,
}: {
  comanda: BarComandaAbertaPortal | null
  debitos: BarDebitoComandaPortal[]
}) {
  if (!comanda && debitos.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhuma comanda aberta.</p>
    )
  }

  return (
    <div className="space-y-4">
      {comanda ? (
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
              <div>
                <h2 className="font-semibold text-[rgb(var(--foreground))]">Minha comanda</h2>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Código {comanda.codigo} · só leitura — paga no balcão
                </p>
              </div>
            </div>
            <p className="text-lg font-bold tabular-nums text-[rgb(var(--foreground))]">
              {formatarPreco(comanda.total)}
            </p>
          </div>

          {comanda.itens.length === 0 ? (
            <p className="mt-4 text-sm text-[rgb(var(--foreground-muted))]">
              Ainda sem itens lançados.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[rgb(var(--border))]">
              {comanda.itens.map((item, i) => (
                <li
                  key={`${item.produtoNome}-${i}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-[rgb(var(--foreground))]">
                    {item.quantidade}× {item.produtoNome}
                  </span>
                  <span className="tabular-nums text-[rgb(var(--foreground-muted))]">
                    {formatarPreco(item.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {comanda.limiteEfetivo != null && (
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-[rgb(var(--foreground-muted))]">
                <span>
                  Limite {formatarPreco(comanda.limiteEfetivo)}
                  {comanda.percentualLimite != null
                    ? ` · ${Math.round(comanda.percentualLimite)}%`
                    : ''}
                </span>
                {comanda.restanteLimite != null && (
                  <span>Restam {formatarPreco(comanda.restanteLimite)}</span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border)_/_0.6)]">
                <div
                  className={[
                    'h-full rounded-full transition-[width]',
                    (comanda.percentualLimite ?? 0) >= 100
                      ? 'bg-[rgb(var(--color-danger-fg))]'
                      : (comanda.percentualLimite ?? 0) >= 80
                        ? 'bg-[rgb(var(--color-warning-fg))]'
                        : 'bg-[rgb(var(--color-primary))]',
                  ].join(' ')}
                  style={{
                    width: `${Math.min(100, Math.max(0, comanda.percentualLimite ?? 0))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>
      ) : null}

      {debitos.length > 0 ? (
        <section className="rounded-2xl border border-[rgb(var(--color-warning-fg)_/_0.35)] bg-[rgb(var(--surface))] p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-[rgb(var(--color-warning-fg))]" />
            <div>
              <h2 className="font-semibold text-[rgb(var(--foreground))]">Débito em aberto</h2>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Quite no balcão — não é possível pagar por aqui.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {debitos.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <div>
                  <p className="font-medium text-[rgb(var(--foreground))]">Comanda {d.codigo}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {d.status === 'VENCIDA' ? 'Vencida' : 'Em aberto'}
                    {d.vencimento ? ` · venc. ${formatarData(d.vencimento)}` : ''}
                  </p>
                </div>
                <p className="font-bold tabular-nums text-[rgb(var(--color-warning-fg))]">
                  {formatarPreco(d.saldo)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
