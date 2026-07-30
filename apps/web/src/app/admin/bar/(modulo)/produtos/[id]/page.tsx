import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarCategoriasBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarCategoriaLite, BarProdutoLite } from '@/lib/bar'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import {
  EditarProdutoBarForm,
  ExcluirProdutoBarButton,
} from '@/components/admin/bar/bar-produto-forms'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Produto — Bar Admin' }

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

export default async function EditarProdutoBarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const [produto, categorias]: [BarProdutoLite | null, BarCategoriaLite[]] = await Promise.all([
    db.barProduto.findFirst({
      where: { id, tenantId: tenant.id, sedeId: unidade.id },
      select: {
        id: true,
        nome: true,
        descricao: true,
        preco: true,
        custoMedio: true,
        estoque: true,
        estoqueMinimo: true,
        imagemUrl: true,
        ativo: true,
        destaque: true,
        ordem: true,
        categoria: { select: { id: true, nome: true } },
      },
    }),
    listarCategoriasBar(tenant.id, unidade.id),
  ])

  if (!produto) notFound()

  const serializado = serializeProdutoBar(produto)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/bar/produtos"
            className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <ArrowLeft className="h-4 w-4" /> Produtos
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{serializado.nome}</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {serializado.ativo ? '● Ativo' : '● Inativo'}
            </p>
          </div>
        </div>
        <ExcluirProdutoBarButton
          id={serializado.id}
          nome={serializado.nome}
          redirectAfter="/admin/bar/produtos"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Estoque atual</p>
          <p className="mt-1 text-2xl font-bold text-[rgb(var(--foreground))]">
            {serializado.estoque} un.
          </p>
        </div>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Custo médio</p>
          <p className="mt-1 text-2xl font-bold text-[rgb(var(--foreground))]">
            {formatarPreco(serializado.custoMedio)}
          </p>
        </div>
      </div>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Estoque e custo médio são movimentados por compras, vendas e ajustes —{' '}
        <Link href="/admin/bar/estoque" className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline">
          ajustar via Estoque
        </Link>
        .
      </p>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <h2 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Dados do produto</h2>
        <EditarProdutoBarForm
          produto={serializado}
          categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
        />
      </div>
    </>
  )
}
