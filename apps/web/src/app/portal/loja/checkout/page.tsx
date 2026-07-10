import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CheckoutForm } from './checkout-form'
import { toCheckoutItem, type CheckoutItemSerializado } from '@/lib/loja-serialize'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Checkout' }

export default async function CheckoutPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  const rows = await db.saasCarrinhoItem.findMany({
    where: { userId: session.user.id },
    include: { produto: { select: { nome: true, preco: true } } },
  })

  if (rows.length === 0) redirect('/portal/loja/sacola')

  const itens: CheckoutItemSerializado[] = rows.map(toCheckoutItem)
  const subtotal = itens.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <Link href="/portal/loja/sacola" className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
        <ArrowLeft className="h-4 w-4" />
        Voltar à sacola
      </Link>
      <h1 className="text-2xl font-bold">Finalizar pedido</h1>
      <CheckoutForm itens={itens} subtotal={subtotal} />
    </div>
  )
}
