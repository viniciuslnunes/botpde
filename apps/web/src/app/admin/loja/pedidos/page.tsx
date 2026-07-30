import { db, type Prisma } from '@torcida/db'
import { redirect } from 'next/navigation'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { assertStoreView } from '@/lib/authz'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  ListagemVazia,
} from '@/components/admin/ui'
import {
  parseListagemParams,
  type ListagemFacetas,
} from '@/lib/listagem'
import { LISTAGEM_LOJA_PEDIDOS } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { Package } from 'lucide-react'
import { AdminPedidosList } from './admin-pedidos-list'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pedidos — Loja Admin' }

const SPEC = LISTAGEM_LOJA_PEDIDOS

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(preco),
  )
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let tenant: Awaited<ReturnType<typeof assertStoreView>>['tenant']
  try {
    ;({ tenant } = await assertStoreView())
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  const where: Prisma.SaasPedidoWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { tenantId: tenant.id },
  })

  type PedidoRow = {
    id: string
    status: string
    total: unknown
    subtotal: unknown
    desconto: unknown
    modalidadeEntrega: string
    cupomCodigo: string | null
    criadoEm: Date
    user: { nome: string | null; email: string | null }
    itens: {
      id: string
      produtoNome: string
      tamanho: string | null
      quantidade: number
      total: unknown
      produto: { imagensUrl: string[] }
    }[]
  }

  const [pedidos, total]: [PedidoRow[], number] = await Promise.all([
    db.saasPedido.findMany({
      where,
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
      include: {
        user: { select: { nome: true, email: true } },
        itens: { include: { produto: { select: { imagensUrl: true } } } },
      },
    }),
    db.saasPedido.count({ where }),
  ])

  const paginacao = resumirPaginacao(total, listagem)

  const facetas: ListagemFacetas = await carregarFacetas(
    SPEC,
    listagem,
    { escopo: { tenantId: tenant.id } },
    async (campo, whereFaceta) => {
      const linhas = await db.saasPedido.groupBy({
        by: [campo as 'status'],
        where: whereFaceta as Prisma.SaasPedidoWhereInput,
        _count: { _all: true },
      })
      return linhas.map((linha: Record<string, unknown> & { _count: { _all: number } }) => ({
        valor: (linha[campo] as string | null) ?? null,
        count: linha._count._all,
      }))
    },
  )

  const pedidosSerializados = pedidos.map((pedido) => ({
    id: pedido.id,
    clienteNome: pedido.user.nome ?? pedido.user.email ?? '—',
    criadoEmLabel: formatarData(pedido.criadoEm),
    meta: `${pedido.modalidadeEntrega === 'RETIRADA' ? '📍 Retirada na sede' : '📦 Envio'}${pedido.cupomCodigo ? ` · Cupom ${pedido.cupomCodigo}` : ''}`,
    status: pedido.status,
    totalLabel: formatarPreco(pedido.total),
    subtotalRiscado: Number(pedido.desconto) > 0 ? formatarPreco(pedido.subtotal) : null,
    itens: pedido.itens.map((item) => ({
      id: item.id,
      imagemUrl: firstProdutoImagemUrl(item.produto.imagensUrl),
      label: `${item.produtoNome}${item.tamanho ? ` (${item.tamanho})` : ''} × ${item.quantidade}`,
      totalLabel: formatarPreco(item.total),
    })),
  }))

  return (
    <div className="space-y-3">
      <ListagemToolbar
        spec={SPEC}
        params={listagem}
        paginacao={paginacao}
        facetas={facetas}
        escopoChave={tenant.id}
        filtrosCompactos={[{ filtroId: 'status' }, { filtroId: 'criadoEm', classe: 'lg:hidden' }]}
      />

      {pedidosSerializados.length === 0 ? (
        <ListagemVazia
          spec={SPEC}
          params={listagem}
          vazio={{
            icon: (
              <Package
                className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ),
            title: 'Nenhum pedido ainda',
            description: 'Quando a loja receber pedidos, eles aparecem aqui.',
          }}
        />
      ) : (
        <AdminPedidosList
          pedidos={pedidosSerializados}
          cabecalho={SPEC.colunas.map((coluna) => (
            <ListagemTh
              key={coluna.id}
              spec={SPEC}
              params={listagem}
              coluna={coluna}
              facetas={facetas}
              className={
                coluna.id === 'criadoEm'
                  ? 'hidden lg:table-cell'
                  : coluna.id === 'itens'
                    ? 'hidden sm:table-cell'
                    : undefined
              }
            />
          ))}
        />
      )}

      <ListagemPaginacao spec={SPEC} params={listagem} paginacao={paginacao} />
    </div>
  )
}
