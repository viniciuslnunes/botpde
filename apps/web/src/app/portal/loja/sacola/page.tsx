import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SacolaItens } from './sacola-itens'
import { toSacolaItem, type SacolaItemSerializado } from '@/lib/loja-serialize'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sacola' }

export default async function SacolaPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const rows = await db.saasCarrinhoItem.findMany({
    where: { userId: session.user.id },
    include: {
      produto: {
        select: { id: true, nome: true, preco: true, imagensUrl: true, ativo: true, tenantId: true },
      },
    },
    orderBy: { criadoEm: 'desc' },
  })

  const itens: SacolaItemSerializado[] = rows.map(toSacolaItem)

  return (
    <div className="space-y-6">
      <Link
        href="/portal/loja"
        className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Continuar comprando
      </Link>
      <h1 className="text-2xl font-bold">Minha sacola</h1>
      <SacolaItens itens={itens} />
    </div>
  )
}
