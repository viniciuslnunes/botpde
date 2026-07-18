import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { listarCategoriasBar, listarProdutosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarCategoriaLite, BarProdutoLite } from '@/lib/bar'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import { BarPdv } from '@/components/admin/bar/bar-pdv'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'PDV — Bar Admin' }

export default async function AdminBarPdvPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE]))
  } catch {
    redirect('/admin')
  }

  let podeCancelar = false
  try {
    await assertPermission(PERMISSIONS.BAR_MANAGE)
    podeCancelar = true
  } catch {
    // Operador do PDV sem gestão — não cancela vendas pendentes.
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const [produtos, categorias]: [BarProdutoLite[], BarCategoriaLite[]] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id, { apenasAtivos: true }),
    listarCategoriasBar(tenant.id, unidade.id),
  ])

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }))

  return (
    <div className="app-container space-y-4 py-6 lg:py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/bar"
          className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
        >
          <ArrowLeft className="h-4 w-4" /> Bar
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">PDV</h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {unidade.nome} — venda rápida no balcão
          </p>
        </div>
      </div>

      <BarPdv
        produtos={produtos.map(serializeProdutoBar)}
        categorias={categoriasAtivas}
        podeCancelar={podeCancelar}
      />
    </div>
  )
}
