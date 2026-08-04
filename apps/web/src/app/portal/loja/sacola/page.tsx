import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ArrowLeft } from 'lucide-react'
import { SacolaItens } from './sacola-itens'
import { toSacolaItem, type SacolaItemSerializado } from '@/lib/loja-serialize'
import { formatNomeTorcida } from '@torcida/types'
import { ContinuarComprandoLink } from '../_components/loja-fluxo'
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

  const tenantIds = [...new Set(itens.map((i) => i.produto.tenantId))]
  const tenants: { id: string; nome: string }[] =
    tenantIds.length > 0
      ? await db.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, nome: true },
        })
      : []

  const lojas = tenants.map((t) => ({
    tenantId: t.id,
    nome: formatNomeTorcida(t.nome),
  }))

  return (
    <div className="space-y-6">
      <ContinuarComprandoLink className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]">
        <ArrowLeft className="h-3.5 w-3.5" />
        Continuar comprando
      </ContinuarComprandoLink>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
          [ Fluxo de compra ]
        </p>
        <h1 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">Minha sacola</h1>
      </div>
      <SacolaItens itens={itens} lojas={lojas} />
    </div>
  )
}
