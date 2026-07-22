import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarCategoriasBar, listarProdutosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarCategoriaLite, BarProdutoLite } from '@/lib/bar'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import { CriarProdutoBarForm } from '@/components/admin/bar/bar-produto-forms'
import { BarProdutosGrid } from '@/components/admin/bar/bar-produtos-grid'
import { BarCategoriasSection, type BarCategoriaItem } from '@/components/admin/bar/bar-categorias'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produtos — Bar Admin' }

export default async function AdminBarProdutosPage() {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const [produtos, categorias, contagens]: [
    BarProdutoLite[],
    BarCategoriaLite[],
    { categoriaId: string | null; _count: { id: number } }[],
  ] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id),
    listarCategoriasBar(tenant.id, unidade.id),
    db.barProduto.groupBy({
      by: ['categoriaId'],
      where: { tenantId: tenant.id, sedeId: unidade.id },
      _count: { id: true },
    }),
  ])

  const porCategoria = new Map<string | null, number>(
    contagens.map((c) => [c.categoriaId, c._count.id]),
  )
  const categoriasItens: BarCategoriaItem[] = categorias.map((c) => ({
    id: c.id,
    nome: c.nome,
    ordem: c.ordem,
    ativo: c.ativo,
    totalProdutos: porCategoria.get(c.id) ?? 0,
  }))

  const ativos = produtos.filter((p) => p.ativo).length

  return (
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/bar"
              className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
            >
              <ArrowLeft className="h-4 w-4" /> Bar
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Produtos do bar</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {unidade.nome} · {ativos} produto{ativos !== 1 ? 's' : ''} ativo
                {ativos !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <CriarProdutoBarForm categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))} />
      </MotionReveal>

      <BarProdutosGrid produtos={produtos.map(serializeProdutoBar)} />

      <MotionReveal index={2}>
        <BarCategoriasSection categorias={categoriasItens} />
      </MotionReveal>
    </div>
  )
}
