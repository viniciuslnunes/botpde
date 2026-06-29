'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
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

  try {
    let pedidoId: string | undefined

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const produto = await tx.saasProduto.findFirst({
        where: { id: produtoId, tenantId: tenant.id, ativo: true },
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
          tenantId: tenant.id,
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
      data: { tenantId: tenant.id, atorId: session.user.id, acao: 'PEDIDO_CRIADO', entidade: 'SaasPedido', entidadeId: pedidoId },
    })

    revalidatePath('/portal/loja')
    revalidatePath('/portal/loja/pedidos')
    return { success: true, pedidoId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao processar pedido.' }
  }
}
