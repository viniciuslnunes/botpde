import { redirect } from 'next/navigation'
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
    <>
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        {ativos} produto{ativos !== 1 ? 's' : ''} ativo{ativos !== 1 ? 's' : ''} no cardápio da
        unidade.
      </p>

      <MotionReveal>
        <CriarProdutoBarForm categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))} />
      </MotionReveal>

      <BarProdutosGrid produtos={produtos.map(serializeProdutoBar)} />

      <MotionReveal index={1}>
        <BarCategoriasSection categorias={categoriasItens} />
      </MotionReveal>
    </>
  )
}
