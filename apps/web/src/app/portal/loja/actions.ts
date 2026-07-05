'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { resolveVisibility } from '@/lib/hierarquia'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const PedidoSchema = z.object({
  produtoId: z.string().uuid(),
  tamanho: z.string().optional(),
  quantidade: z.coerce.number().int().min(1, 'Mínimo 1 unidade').max(10, 'Máximo 10 unidades'),
})

export type FazerPedidoState = {
  success?: boolean
  error?: string
  pedidoId?: string
}

export async function fazerPedido(_prev: FazerPedidoState, formData: FormData): Promise<FazerPedidoState> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) return { error: 'Você precisa estar logado para fazer um pedido.' }
  if (!tenant) return { error: 'Tenant não encontrado.' }

  const raw = Object.fromEntries(formData)
  const parsed = PedidoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

  const { produtoId, tamanho, quantidade } = parsed.data

  // Produto pode pertencer a um tenant ancestral (loja da sede-mãe cascadeia
  // pra subsedes/PDEs) — valida visibilidade antes de tentar comprar.
  const produtoBase = await db.saasProduto.findFirst({
    where: { id: produtoId, ativo: true },
    select: { tenantId: true },
  })
  if (!produtoBase) return { error: 'Produto não encontrado ou inativo.' }
  if (produtoBase.tenantId !== tenant.id) {
    const visivel = await resolveVisibility(tenant.id, produtoBase.tenantId, 'loja')
    if (!visivel) return { error: 'Produto não encontrado ou inativo.' }
  }
  const produtoTenantId = produtoBase.tenantId

  try {
    let pedidoId: string | undefined

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // O pedido é gravado no tenant DONO do produto (não no tenant do
      // comprador) — é quem tem o estoque e vai gerenciar/entregar o pedido.
      const produto = await tx.saasProduto.findFirst({
        where: { id: produtoId, tenantId: produtoTenantId, ativo: true },
      })
      if (!produto) throw new Error('Produto não encontrado ou inativo.')

      const estoque = (produto.estoque ?? {}) as Record<string, number>
      const chave = tamanho || 'UN'

      if (produto.tamanhos.length > 0 && !tamanho) {
        throw new Error('Selecione um tamanho.')
      }
      if (produto.tamanhos.length > 0 && tamanho && !produto.tamanhos.includes(tamanho)) {
        throw new Error('Tamanho inválido.')
      }

      const estoqueDisponivel = estoque[chave] ?? 0
      if (estoqueDisponivel < quantidade) {
        throw new Error(`Estoque insuficiente. Disponível: ${estoqueDisponivel} unidade(s).`)
      }

      // Decrementa estoque
      const novoEstoque = { ...estoque, [chave]: estoqueDisponivel - quantidade }
      await tx.saasProduto.update({
        where: { id: produtoId },
        data: { estoque: novoEstoque },
      })

      const precoUnit = produto.preco
      const total = Number(precoUnit) * quantidade

      const pedido = await tx.saasPedido.create({
        data: {
          tenantId: produtoTenantId,
          userId: session.user!.id,
          produtoId,
          produtoNome: produto.nome,
          tamanho: tamanho || null,
          quantidade,
          precoUnit,
          total,
        },
      })

      pedidoId = pedido.id
    })

    await db.auditLog.create({
      data: { tenantId: produtoTenantId, atorId: session.user.id, acao: 'PEDIDO_CRIADO', entidade: 'SaasPedido', entidadeId: pedidoId },
    })

    revalidatePath('/portal/loja')
    revalidatePath('/portal/loja/pedidos')
    return { success: true, pedidoId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao processar pedido.' }
  }
}
