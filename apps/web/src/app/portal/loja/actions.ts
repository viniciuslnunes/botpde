'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { z } from 'zod'
import { podeGerirLoja, tenantsPermitidosLoja } from '@/lib/loja-lojas'
import { notificarAdminsPorPermissao } from '@/lib/notificacoes-routing'
import { invalidateTenantCache } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import {
  CarrinhoItemSchema,
  CheckoutSchema,
  chaveTamanho,
  calcularDesconto,
  validarCupom,
  rotuloTamanho,
  formatarMoedaBRL,
  PERMISSIONS,
  resolveTenantDesign,
} from '@torcida/types'
import { abrirTicketPedido } from '@/lib/loja-ticket'

export type ActionState = {
  success?: boolean
  error?: string
  pedidoIds?: string[]
  grupoCheckoutId?: string
  desconto?: number
  /** Conversas dos tickets abertos (uma por loja no checkout). */
  ticketConversaIds?: string[]
  /** Destino pós-compra — preferir navegação no cliente (ver onboarding). */
  redirectTo?: string
}

async function assertAuth() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Você precisa estar logado.')
  return { session, userId: session.user.id, email: session.user.email }
}

async function assertProdutoVisivel(produtoId: string, userId: string, email?: string | null) {
  const produto = await db.saasProduto.findFirst({
    where: { id: produtoId, ativo: true },
    select: { tenantId: true },
  })
  if (!produto) throw new Error('Produto não encontrado ou inativo.')

  const permitidos = await tenantsPermitidosLoja(userId, email)
  if (!permitidos.has(produto.tenantId)) {
    throw new Error('Produto não encontrado ou inativo.')
  }
  return produto.tenantId
}

export async function adicionarAoCarrinho(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { userId, email } = await assertAuth()
    const parsed = CarrinhoItemSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

    const { produtoId, quantidade } = parsed.data
    const tamanhoChave = chaveTamanho(parsed.data.tamanho)

    const produtoTenantId = await assertProdutoVisivel(produtoId, userId, email)

    const produto = await db.saasProduto.findFirst({
      where: { id: produtoId, ativo: true },
      select: { tamanhos: true, estoque: true },
    })
    if (!produto) return { error: 'Produto não encontrado.' }

    if (produto.tamanhos.length > 0 && tamanhoChave === 'UN') {
      return { error: 'Selecione um tamanho.' }
    }
    if (produto.tamanhos.length > 0 && !produto.tamanhos.includes(tamanhoChave)) {
      return { error: 'Tamanho inválido.' }
    }

    const estoque = (produto.estoque ?? {}) as Record<string, number>
    const disponivel = estoque[tamanhoChave] ?? 0

    const existente = await db.saasCarrinhoItem.findUnique({
      where: { userId_produtoId_tamanho: { userId, produtoId, tamanho: tamanhoChave } },
    })
    const novaQtd = (existente?.quantidade ?? 0) + quantidade
    if (novaQtd > disponivel) {
      return { error: `Estoque insuficiente. Disponível: ${disponivel} unidade(s).` }
    }
    if (novaQtd > 10) return { error: 'Máximo 10 unidades por item.' }

    await db.saasCarrinhoItem.upsert({
      where: { userId_produtoId_tamanho: { userId, produtoId, tamanho: tamanhoChave } },
      update: { quantidade: novaQtd },
      create: { userId, tenantId: produtoTenantId, produtoId, tamanho: tamanhoChave, quantidade },
    })

    revalidatePath('/portal/loja')
    revalidatePath('/portal/loja/sacola')
    revalidatePath(`/portal/loja/${produtoTenantId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao adicionar à sacola.' }
  }
}

export async function atualizarItemCarrinho(
  itemId: string,
  quantidade: number,
): Promise<ActionState> {
  try {
    const { userId } = await assertAuth()
    if (quantidade < 1 || quantidade > 10) return { error: 'Quantidade inválida.' }

    const item = await db.saasCarrinhoItem.findFirst({
      where: { id: itemId, userId },
      include: { produto: { select: { estoque: true } } },
    })
    if (!item) return { error: 'Item não encontrado.' }

    const estoque = (item.produto.estoque ?? {}) as Record<string, number>
    if ((estoque[item.tamanho] ?? 0) < quantidade) {
      return { error: 'Estoque insuficiente.' }
    }

    await db.saasCarrinhoItem.update({ where: { id: itemId }, data: { quantidade } })
    revalidatePath('/portal/loja/sacola')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar item.' }
  }
}

export async function removerDoCarrinho(itemId: string): Promise<ActionState> {
  try {
    const { userId } = await assertAuth()
    await db.saasCarrinhoItem.deleteMany({ where: { id: itemId, userId } })
    revalidatePath('/portal/loja/sacola')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao remover item.' }
  }
}

export async function validarCupomAction(
  codigo: string,
  subtotal: number,
  tenantDonoId: string,
): Promise<ActionState & { desconto?: number }> {
  try {
    const { userId } = await assertAuth()
    if (!codigo.trim()) return { error: 'Informe o cupom.' }

    const cupom = await db.saasCupom.findFirst({
      where: { tenantId: tenantDonoId, codigo: codigo.toUpperCase().trim(), ativo: true },
    })
    if (!cupom) return { error: 'Cupom inválido.' }

    const pedidosAnteriores = await db.saasPedido.count({
      where: { tenantId: tenantDonoId, userId, status: { not: 'CANCELADO' } },
    })

    const check = validarCupom(cupom, { subtotal, userJaComprou: pedidosAnteriores > 0 })
    if (!check.ok) return { error: check.erro }

    const desconto = calcularDesconto(cupom, subtotal)
    return { success: true, desconto }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao validar cupom.' }
  }
}

export async function finalizarPedido(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Destino pós-sucesso: `redirect()` fora do try/catch (NEXT_REDIRECT não pode
  // virar `{ error }`). Sem isto, o revalidate re-renderiza o checkout com
  // sacola vazia e a page RSC manda para /portal/loja/sacola antes do cliente.
  let redirectTo: string | null = null

  try {
    const { userId, email } = await assertAuth()

    const raw: Record<string, FormDataEntryValue> = Object.fromEntries(formData)
    if (typeof raw.enderecoEntrega === 'string') {
      try {
        raw.enderecoEntrega = JSON.parse(raw.enderecoEntrega) as unknown as FormDataEntryValue
      } catch {
        delete raw.enderecoEntrega
      }
    }

    const parsed = CheckoutSchema.safeParse(raw)
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

    const itensCarrinhoBruto: Array<{
      id: string
      produtoId: string
      quantidade: number
      tamanho: string
      produto: {
        id: string
        nome: string
        preco: unknown
        estoque: unknown
        tamanhos: string[]
        tenantId: string
        ativo: boolean
      }
    }> = await db.saasCarrinhoItem.findMany({
      where: { userId },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
            preco: true,
            estoque: true,
            tamanhos: true,
            tenantId: true,
            ativo: true,
          },
        },
      },
    })

    const permitidos = await tenantsPermitidosLoja(userId, email)
    const itensCarrinho = itensCarrinhoBruto.filter((item) => permitidos.has(item.produto.tenantId))

    if (itensCarrinho.length === 0) return { error: 'Sua sacola está vazia.' }

    for (const item of itensCarrinho) {
      if (!item.produto.ativo)
        return { error: `Produto "${item.produto.nome}" não está mais disponível.` }
    }

    const porTenant = new Map<string, typeof itensCarrinho>()
    for (const item of itensCarrinho) {
      const tid = item.produto.tenantId
      if (!porTenant.has(tid)) porTenant.set(tid, [])
      porTenant.get(tid)!.push(item)
    }

    const grupoCheckoutId = randomUUID()
    const pedidoIds: string[] = []

    const codigoCupom = parsed.data.cupomCodigo?.trim()
      ? parsed.data.cupomCodigo.toUpperCase().trim()
      : null
    if (codigoCupom) {
      for (const tenantDonoId of porTenant.keys()) {
        const cupom: { id: string } | null = await db.saasCupom.findFirst({
          where: { tenantId: tenantDonoId, codigo: codigoCupom, ativo: true },
          select: { id: true },
        })
        if (!cupom) return { error: 'Cupom inválido.' }
      }
    }

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // ── Trava de linha ANTES de ler o estoque ────────────────────────────
      // O decremento abaixo é read-modify-write sobre a coluna JSON `estoque`
      // (`{...estoque, [chave]: disponivel - qtd}`). Sob READ COMMITTED, dois
      // checkouts simultâneos na última unidade **leem o mesmo valor** e o
      // segundo sobrescreve o primeiro: os dois pedidos são criados e a torcida
      // vende duas vezes a mesma peça. `audit:loja` reproduziu.
      //
      // `FOR UPDATE` serializa as transações nessas linhas — a segunda espera a
      // primeira comitar e só então lê o estoque já decrementado, caindo no
      // "Estoque insuficiente" que deveria ter dado desde sempre.
      //
      // `ORDER BY id` não é decoração: duas sacolas com os mesmos produtos em
      // ordens diferentes travariam em ordem cruzada e dariam deadlock. Ordem
      // determinística resolve.
      const idsProdutos = [
        ...new Set([...porTenant.values()].flat().map((i) => i.produtoId)),
      ].sort()
      if (idsProdutos.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM saas_produtos
          WHERE id IN (${Prisma.join(idsProdutos)})
          ORDER BY id
          FOR UPDATE
        `
      }

      for (const [tenantDonoId, itens] of porTenant) {
        let subtotal = 0
        const linhas: Array<{
          produtoId: string
          produtoNome: string
          tamanho: string | null
          quantidade: number
          precoUnit: number
          total: number
        }> = []

        for (const item of itens) {
          const produto = await tx.saasProduto.findFirst({
            where: { id: item.produtoId, tenantId: tenantDonoId, ativo: true },
          })
          if (!produto) throw new Error(`Produto "${item.produto.nome}" indisponível.`)

          const estoque = (produto.estoque ?? {}) as Record<string, number>
          const chave = item.tamanho
          const disponivel = estoque[chave] ?? 0
          if (disponivel < item.quantidade) {
            throw new Error(
              `Estoque insuficiente para "${produto.nome}" (${rotuloTamanho(chave) ?? 'único'}).`,
            )
          }

          const precoUnit = Number(produto.preco)
          const totalLinha = precoUnit * item.quantidade
          subtotal += totalLinha
          linhas.push({
            produtoId: produto.id,
            produtoNome: produto.nome,
            tamanho: rotuloTamanho(chave),
            quantidade: item.quantidade,
            precoUnit,
            total: totalLinha,
          })

          await tx.saasProduto.update({
            where: { id: produto.id },
            data: { estoque: { ...estoque, [chave]: disponivel - item.quantidade } },
          })
        }

        let desconto = 0
        let cupomCodigo: string | null = null
        if (parsed.data.cupomCodigo?.trim()) {
          const cupom = await tx.saasCupom.findFirst({
            where: {
              tenantId: tenantDonoId,
              codigo: parsed.data.cupomCodigo.toUpperCase().trim(),
              ativo: true,
            },
          })
          if (!cupom) throw new Error('Cupom inválido.')
          const pedidosAnteriores = await tx.saasPedido.count({
            where: { tenantId: tenantDonoId, userId, status: { not: 'CANCELADO' } },
          })
          const check = validarCupom(
            { ...cupom, valor: Number(cupom.valor) },
            { subtotal, userJaComprou: pedidosAnteriores > 0 },
          )
          if (!check.ok) throw new Error(check.erro)
          desconto = calcularDesconto({ tipo: cupom.tipo, valor: Number(cupom.valor) }, subtotal)
          cupomCodigo = cupom.codigo
        }

        const total = Math.max(0, subtotal - desconto)

        const pedido = await tx.saasPedido.create({
          data: {
            tenantId: tenantDonoId,
            userId,
            subtotal,
            desconto,
            total,
            cupomCodigo,
            modalidadeEntrega: parsed.data.modalidadeEntrega,
            enderecoEntrega: parsed.data.enderecoEntrega ?? undefined,
            grupoCheckoutId,
            itens: {
              create: linhas.map((l) => ({
                produtoId: l.produtoId,
                produtoNome: l.produtoNome,
                tamanho: l.tamanho,
                quantidade: l.quantidade,
                precoUnit: l.precoUnit,
                total: l.total,
              })),
            },
          },
        })
        pedidoIds.push(pedido.id)
      }

      await tx.saasCarrinhoItem.deleteMany({
        where: { userId, id: { in: itensCarrinho.map((i) => i.id) } },
      })
    })

    const session = await auth()
    const ticketConversaIds: string[] = []
    for (const pedidoId of pedidoIds) {
      const p = await db.saasPedido.findUnique({
        where: { id: pedidoId },
        select: { tenantId: true, total: true },
      })
      if (p && session?.user?.id) {
        await db.auditLog.create({
          data: {
            tenantId: p.tenantId,
            atorId: session.user.id,
            acao: 'PEDIDO_CRIADO',
            entidade: 'SaasPedido',
            entidadeId: pedidoId,
          },
        })

        let ticketConversaId: string | null = null
        try {
          const ticket = await abrirTicketPedido(pedidoId)
          ticketConversaId = ticket.conversaId
          ticketConversaIds.push(ticket.conversaId)
          await db.auditLog.create({
            data: {
              tenantId: p.tenantId,
              atorId: session.user.id,
              acao: 'PEDIDO_TICKET_ABERTO',
              entidade: 'SaasPedidoTicket',
              entidadeId: ticket.id,
              detalhes: { pedidoId, conversaId: ticket.conversaId },
            },
          })
        } catch {
          // Pedido já gravado — falha no ticket não desfaz a compra.
        }

        await notificarAdminsPorPermissao(
          [PERMISSIONS.STORE_VIEW_ORDERS, PERMISSIONS.STORE_MANAGE],
          {
            tenantId: p.tenantId,
            tipo: 'PEDIDO_RECEBIDO',
            titulo: 'Novo pedido na loja',
            corpo: `Pedido de ${formatarMoedaBRL(Number(p.total))} recebido. Ticket na fila.`,
            link: ticketConversaId
              ? `/admin/loja/atendimento`
              : '/admin/loja/pedidos',
            atorId: session.user.id,
            excetoUserId: session.user.id,
          },
        )
      }
    }

    // Um ticket → conversa do pedido; vários (multi-loja) ou falha → lista.
    redirectTo =
      ticketConversaIds.length === 1
        ? `/portal/mensagens?c=${ticketConversaIds[0]}`
        : '/portal/loja/pedidos'

    revalidatePath('/portal/loja')
    revalidatePath('/portal/loja/sacola')
    revalidatePath('/portal/loja/pedidos')
    revalidatePath('/portal/mensagens')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao finalizar pedido.' }
  }

  redirect(redirectTo ?? '/portal/loja/pedidos')
}

const CapaLojaSchema = z.object({
  tenantId: z.string().uuid(),
  bannerUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(z.union([z.string().url('URL da capa inválida'), z.null()])),
})

/** Capa da vitrine no portal — `store:manage` no tenant da loja, e a loja tem
 *  que estar na vitrine do portal ativo (não edita catálogo de rival). */
export async function atualizarCapaLoja(
  tenantId: string,
  bannerUrl: string | null,
): Promise<ActionState> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { error: 'Não autorizado' }

    const parsed = CapaLojaSchema.safeParse({ tenantId, bannerUrl: bannerUrl ?? '' })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
    }

    const pode = await podeGerirLoja(session.user.id, parsed.data.tenantId, session.user.email)
    if (!pode) return { error: 'Sem permissão' }

    const tenant: {
      id: string
      slug: string
      design: unknown
      corPrimaria: string
    } | null = await db.tenant.findFirst({
      where: { id: parsed.data.tenantId, ativo: true },
      select: { id: true, slug: true, design: true, corPrimaria: true },
    })
    if (!tenant) return { error: 'Loja não encontrada' }

    const design = resolveTenantDesign(tenant.design, tenant.corPrimaria)
    const nextDesign = {
      ...design,
      loja: {
        ...design.loja,
        bannerUrl: parsed.data.bannerUrl,
      },
    }

    await db.tenant.update({
      where: { id: tenant.id },
      data: { design: nextDesign as unknown as Prisma.InputJsonValue },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'LOJA_VITRINE_ATUALIZADA',
        entidade: 'Tenant',
        entidadeId: tenant.id,
        detalhes: { bannerUrl: parsed.data.bannerUrl, origem: 'portal' },
      },
    })

    invalidateTenantCache(tenant.slug)
    revalidatePath('/admin/loja/vitrine')
    revalidatePath(`/portal/loja/${tenant.id}`)
    revalidatePath('/portal/loja')

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao salvar capa' }
  }
}

/** @deprecated Use adicionarAoCarrinho + finalizarPedido */
export type FazerPedidoState = ActionState

export async function fazerPedido(
  _prev: FazerPedidoState,
  formData: FormData,
): Promise<FazerPedidoState> {
  return adicionarAoCarrinho(_prev, formData)
}
