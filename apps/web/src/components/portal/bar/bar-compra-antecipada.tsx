'use client'

import { useState, useTransition } from 'react'
import { Beer, Check, Copy, Minus, Plus, ShoppingBag } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { QrCodeVisual } from '@/components/ui/qr-code'
import { comprarNoBarPortal, type CompraBarPortalResult } from '@/app/portal/bar/actions'
import type { BarCardapioItem } from '@/components/portal/bar/bar-cardapio'

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/**
 * Compra antecipada: escolher, pagar no PIX e retirar com o QR.
 *
 * Existe para matar a fila do intervalo — quinze minutos, fila única, e quem
 * está nela perde o segundo tempo.
 *
 * **Só aparece com o caixa aberto.** Não é detalhe de UI: foi a resposta para
 * "em qual turno de caixa entra uma venda feita fora do turno?". Restringindo a
 * compra ao turno aberto, o caso deixa de existir — toda venda antecipada nasce
 * dentro de um turno e a conferência de caixa continua fechando.
 *
 * A sacola vive aqui, na própria página: um fluxo de checkout separado seria
 * mais uma tela para atravessar com o jogo rolando.
 */
export function BarCompraAntecipada({ produtos }: { produtos: BarCardapioItem[] }) {
  const [qtd, setQtd] = useState<Record<string, number>>({})
  const [resultado, setResultado] = useState<CompraBarPortalResult | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pendente, iniciar] = useTransition()

  const disponiveis = produtos.filter((p) => p.estoque > 0)
  const itens = Object.entries(qtd).filter(([, q]) => q > 0)
  const total = itens.reduce((acc, [id, q]) => {
    const p = produtos.find((x) => x.id === id)
    return acc + (p ? p.preco * q : 0)
  }, 0)

  function ajustar(id: string, delta: number, estoque: number) {
    setQtd((atual) => {
      const proximo = Math.min(Math.max((atual[id] ?? 0) + delta, 0), Math.min(estoque, 20))
      return { ...atual, [id]: proximo }
    })
    setResultado(null)
  }

  function comprar() {
    iniciar(async () => {
      const r = await comprarNoBarPortal({
        itens: itens.map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
      })
      setResultado(r)
      if (r.ok) setQtd({})
    })
  }

  async function copiarPix() {
    if (!resultado?.ok || !resultado.pixCopiaCola) return
    await navigator.clipboard.writeText(resultado.pixCopiaCola)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2000)
  }

  if (resultado?.ok) {
    return (
      <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <Check className="h-4 w-4 text-success" />
          Compra registrada — {formatarPreco(resultado.total)}
        </h2>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Pague o PIX abaixo. Assim que o pagamento cair, mostre o QR no balcão para retirar.
        </p>

        {resultado.pixCopiaCola && (
          <AppButton
            variant="secondary-soft"
            size="sm"
            icon={copiado ? Check : Copy}
            type="button"
            onClick={() => void copiarPix()}
            block
          >
            {copiado ? 'Código copiado' : 'Copiar PIX copia e cola'}
          </AppButton>
        )}

        <p className="text-center text-[11px] text-[rgb(var(--foreground-muted))]">
          O QR de retirada aparece nesta página assim que o pagamento for confirmado.
        </p>
      </section>
    )
  }

  if (disponiveis.length === 0) return null

  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
        <div>
          <h2 className="font-semibold text-[rgb(var(--foreground))]">Comprar agora, retirar depois</h2>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Pague pelo celular e pule a fila do intervalo
          </p>
        </div>
      </div>

      <ul className="divide-y divide-[rgb(var(--border))]">
        {disponiveis.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[rgb(var(--foreground))]">{p.nome}</span>
              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                {formatarPreco(p.preco)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <AppButton
                variant="none"
                iconOnly
                icon={Minus}
                aria-label={`Remover um ${p.nome}`}
                type="button"
                disabled={pendente || (qtd[p.id] ?? 0) === 0}
                onClick={() => ajustar(p.id, -1, p.estoque)}
                className="app-touch-target rounded-lg border border-[rgb(var(--border))] disabled:opacity-40"
              />
              <span className="w-5 text-center text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {qtd[p.id] ?? 0}
              </span>
              <AppButton
                variant="none"
                iconOnly
                icon={Plus}
                aria-label={`Adicionar um ${p.nome}`}
                type="button"
                disabled={pendente || (qtd[p.id] ?? 0) >= Math.min(p.estoque, 20)}
                onClick={() => ajustar(p.id, 1, p.estoque)}
                className="app-touch-target rounded-lg border border-[rgb(var(--border))] disabled:opacity-40"
              />
            </span>
          </li>
        ))}
      </ul>

      {resultado && !resultado.ok && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {resultado.error}
        </p>
      )}

      <AppButton
        variant="primary"
        icon={Beer}
        type="button"
        disabled={pendente || itens.length === 0}
        loading={pendente}
        onClick={comprar}
        block
      >
        {itens.length === 0 ? 'Escolha os itens' : `Pagar ${formatarPreco(total)} no PIX`}
      </AppButton>
    </section>
  )
}
