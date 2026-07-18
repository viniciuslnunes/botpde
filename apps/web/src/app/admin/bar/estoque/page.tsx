import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarProdutosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarProdutoLite } from '@/lib/bar'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import { BarEstoqueTabela, RegistrarCompraBarForm } from '@/components/admin/bar/bar-estoque'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estoque — Bar Admin' }

export default async function AdminBarEstoquePage() {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
  const produtos: BarProdutoLite[] = await listarProdutosBar(tenant.id, unidade.id)
  const serializados = produtos.map(serializeProdutoBar)
  const baixos = serializados.filter(
    (p) => p.ativo && p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo,
  ).length

  return (
    <div className="app-container space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/bar"
          className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
        >
          <ArrowLeft className="h-4 w-4" /> Bar
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Estoque do bar</h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {unidade.nome}
            {baixos > 0
              ? ` · ${baixos} produto${baixos !== 1 ? 's' : ''} abaixo do mínimo`
              : ' · nenhum produto abaixo do mínimo'}
          </p>
        </div>
      </div>

      <RegistrarCompraBarForm produtos={serializados} />

      <BarEstoqueTabela produtos={serializados} />
    </div>
  )
}
