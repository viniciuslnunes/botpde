import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarProdutoForm } from '@/components/admin/produto-forms'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminLojaProdutosGrid, type AdminProdutoItem } from '../admin-loja-produtos-grid'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Catálogo — Loja' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarEstoque(estoque: unknown, tamanhos: string[]): string {
  const e = (estoque ?? {}) as Record<string, number>
  if (!Object.keys(e).length) return 'Sem estoque cadastrado'
  if (tamanhos.length === 0) return `${e['UN'] ?? 0} un.`
  return tamanhos.filter((t) => e[t] !== undefined).map((t) => `${t}: ${e[t]}`).join(' | ')
}

function serializarProduto(p: {
  id: string
  nome: string
  preco: unknown
  estoque: unknown
  tamanhos: string[]
  destaque: boolean
  ativo: boolean
  imagensUrl: unknown
  _count: { pedidoItens: number }
  categoria: { nome: string } | null
}): AdminProdutoItem {
  return {
    id: p.id,
    nome: p.nome,
    categoriaNome: p.categoria?.nome ?? null,
    precoLabel: formatarPreco(p.preco),
    estoqueLabel: formatarEstoque(p.estoque, p.tamanhos),
    vendidos: p._count.pedidoItens,
    destaque: p.destaque,
    ativo: p.ativo,
    imagemUrl: firstProdutoImagemUrl(p.imagensUrl as string[] | null | undefined),
  }
}

export default async function AdminLojaProdutosPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE))
  } catch {
    redirect('/admin/loja/pedidos')
  }

  const [produtos, categorias] = await Promise.all([
    db.saasProduto.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }],
      include: { _count: { select: { pedidoItens: true } }, categoria: { select: { nome: true } } },
    }),
    db.saasCategoria.findMany({ where: { tenantId: tenant.id }, orderBy: { ordem: 'asc' } }),
  ])

  type Produto = (typeof produtos)[number]
  const ativos = produtos.filter((p: Produto) => p.ativo)
  const inativos = produtos.filter((p: Produto) => !p.ativo)

  return (
    <>
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        {ativos.length} produto{ativos.length !== 1 ? 's' : ''} ativo
        {ativos.length !== 1 ? 's' : ''} no catálogo.{' '}
        <Link
          href="/admin/loja/categorias"
          className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Categorias
        </Link>
      </p>

      <MotionReveal>
        <CriarProdutoForm
          categorias={categorias.map((c: (typeof categorias)[number]) => ({
            id: c.id,
            nome: c.nome,
          }))}
        />
      </MotionReveal>

      <AdminLojaProdutosGrid
        ativos={ativos.map(serializarProduto)}
        inativos={inativos.map(serializarProduto)}
      />
    </>
  )
}
