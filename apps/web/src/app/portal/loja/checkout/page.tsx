import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CheckoutForm, type CupomDisponivel } from './checkout-form'
import { toCheckoutItem, type CheckoutItemSerializado } from '@/lib/loja-serialize'
import { formatNomeTorcida } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Checkout' }

export default async function CheckoutPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const rows: Array<{
    id: string
    quantidade: number
    tamanho: string
    produto: { nome: string; preco: unknown; tenantId: string }
  }> = await db.saasCarrinhoItem.findMany({
    where: { userId: session.user.id },
    include: { produto: { select: { nome: true, preco: true, tenantId: true } } },
  })

  if (rows.length === 0) redirect('/portal/loja/sacola')

  const itens: CheckoutItemSerializado[] = rows.map(toCheckoutItem)
  const subtotal = itens.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0)

  const tenantIds = [...new Set(rows.map((r) => r.produto.tenantId))]
  const [cupons, tenants]: [
    Array<{ tenantId: string; codigo: string; tipo: string; valor: unknown }>,
    Array<{ id: string; nome: string }>,
  ] = await Promise.all([
    db.saasCupom.findMany({
      where: {
        tenantId: { in: tenantIds },
        ativo: true,
        primeiraCompra: true,
        OR: [{ validoAte: null }, { validoAte: { gte: new Date() } }],
      },
      select: { tenantId: true, codigo: true, tipo: true, valor: true },
    }),
    db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, nome: true } }),
  ])
  const nomesPorTenant = new Map(tenants.map((t) => [t.id, t.nome]))
  const cuponsDisponiveis: CupomDisponivel[] = cupons.map((c) => ({
    codigo: c.codigo,
    lojaNome: formatNomeTorcida(nomesPorTenant.get(c.tenantId) ?? ''),
    texto:
      c.tipo === 'PERCENTUAL'
        ? `${Number(c.valor)}% off`
        : `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(c.valor))} off`,
  }))

  const lojas = tenants.map((t) => ({
    tenantId: t.id,
    nome: formatNomeTorcida(t.nome),
  }))

  return (
    <div className="space-y-6">
      <Link
        href="/portal/loja/sacola"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar à sacola
      </Link>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
          [ Fluxo de compra ]
        </p>
        <h1 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">Finalizar pedido</h1>
      </div>
      <CheckoutForm
        itens={itens}
        subtotal={subtotal}
        cuponsDisponiveis={cuponsDisponiveis}
        lojas={lojas}
      />
    </div>
  )
}
