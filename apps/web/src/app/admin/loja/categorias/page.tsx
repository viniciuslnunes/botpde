import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarCategoriaForm, excluirCategoriaForm } from '../actions'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Categorias — Loja Admin' }

export default async function AdminCategoriasPage() {
  try {
    await assertPermission(PERMISSIONS.STORE_MANAGE)
  } catch {
    redirect('/admin')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const categorias = await db.saasCategoria.findMany({
    where: { tenantId: tenant.id },
    orderBy: { ordem: 'asc' },
    include: { _count: { select: { produtos: true } } },
  })

  return (
    <div className="app-container space-y-6 py-8">
      <Link href="/admin/loja" className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
        <ArrowLeft className="h-4 w-4" /> Loja
      </Link>
      <h1 className="text-xl font-bold">Categorias</h1>

      <form action={criarCategoriaForm} className="rounded-2xl border border-[rgb(var(--border))] p-4 space-y-3">
        <h2 className="font-semibold text-sm">Nova categoria</h2>
        <input name="nome" required placeholder="Nome" className="w-full rounded-lg border px-3 py-2 text-sm" />
        <input name="ordem" type="number" defaultValue={categorias.length + 1} className="w-24 rounded-lg border px-3 py-2 text-sm" />
        <button type="submit" className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm text-white">Criar</button>
      </form>

      <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))]">
        {categorias.map((c: (typeof categorias)[number]) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">{c._count.produtos} produtos · ordem {c.ordem}</p>
            </div>
            <form action={excluirCategoriaForm}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="text-xs text-red-600 hover:underline">Excluir</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
