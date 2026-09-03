import { Clock, QrCode, Ticket } from 'lucide-react'
import { QrCodeVisual } from '@/components/ui/qr-code'

export type ValeRetiradaBar = {
  id: string
  total: number
  criadoEm: Date
  pago: boolean
  itens: string
  /** Payload do QR — só emitido para compra paga e ainda não retirada. */
  qr: string | null
}

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/**
 * Compras antecipadas esperando o balcão.
 *
 * O QR só existe para o que **já foi pago**: mostrar código de compra pendente
 * faria o sócio esticar o celular na frente do operador para ouvir "não caiu".
 * Enquanto o PIX não confirma, a linha aparece com o relógio.
 */
export function BarValesRetirada({ vales }: { vales: ValeRetiradaBar[] }) {
  if (vales.length === 0) return null

  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="inline-flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
        <Ticket className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
        Para retirar no balcão
      </h2>

      <ul className="space-y-4">
        {vales.map((v) => (
          <li
            key={v.id}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-[rgb(var(--foreground))]">{v.itens}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {formatarPreco(v.total)}
                </p>
              </div>
              {!v.pago && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <Clock className="h-3 w-3" aria-hidden />
                  Aguardando PIX
                </span>
              )}
            </div>

            {v.qr && (
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <QrCodeVisual value={v.qr} size={170} label="QR de retirada no bar" />
                <p className="inline-flex items-center gap-1 text-[11px] text-[rgb(var(--foreground-muted))]">
                  <QrCode className="h-3 w-3" aria-hidden />
                  Mostre no balcão para retirar
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
