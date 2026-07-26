'use server'

import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/authz'
import { garantirLancamentoFinanceiroPedido } from '@/lib/loja-financeiro'
import { notificarSafe } from '@/lib/notificacoes'
import {
  PERMISSIONS,
  CategoriaSchema,
  CupomSchema,
  parseTamanhosCsv,
  slugify,
  chaveTamanho,
} from '@torcida/types'

// ── Schema produto admin ──────────────────────────────────────────────────────

const ProdutoSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  descricao: z.string().optional(),
  preco: z.coerce.number().positive('Preço inválido'),
  precoOriginal: z.coerce.number().positive().optional().or(z.literal('')),
  marca: z.string().optional(),
  categoriaId: z.string().uuid().optional().or(z.literal('')),
  destaque: z.coerce.boolean().optional(),
  imagensUrlJson: z.string().optional(),
  tamanhos: z.string().optional(),
  tamanhosExtras: z.string().optional(),
  estoqueJson: z.string().optional(),
})

export type ProdutoState = {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<string, string[]>>
}

export type PedidoStatusState = {
  success?: boolean
  error?: string
}

export type ActionState = {
  success?: boolean
  error?: string
}

function parseEstoque(estoqueJson: string | undefined, tamanhos: string[]): Record<string, number> {
  if (!estoqueJson) return {}
  try {
    const parsed = JSON.parse(estoqueJson) as Record<string, number>
    if (tamanhos.length === 0) return { UN: Number(parsed['UN'] ?? 0) }
    const result: Record<string, number> = {}
    for (const t of tamanhos) result[t] = Number(parsed[t] ?? 0)
    return result
  } catch {
    return {}
  }
}

function parseImagens(raw: string | undefined, fallback: string[] = []): string[] {
  if (!raw) return fallback
  try {
    const arr = JSON.parse(raw) as string[]
    return arr.filter(Boolean).slice(0, 4)
  } catch {
    return fallback
  }
}

function parseTamanhosForm(tamanhosRaw?: string, extrasRaw?: string): string[] {
  const base = parseTamanhosCsv(tamanhosRaw)
  const extras = parseTamanhosCsv(extrasRaw)
  return [...new Set([...base, ...extras])]
}

async function restaurarEstoquePedido(pedidoId: string, tx: Prisma.TransactionClient) {
  const itens = await tx.saasPedidoItem.findMany({
    where: { pedidoId },
    include: { produto: { select: { estoque: true } } },
  })
  for (const item of itens) {
    const estoque = (item.produto.estoque ?? {}) as Record<string, number>
    const chave = chaveTamanho(item.tamanho)
    const novo = { ...estoque, [chave]: (estoque[chave] ?? 0) + item.quantidade }
    await tx.saasProduto.update({ where: { id: item.produtoId }, data: { estoque: novo } })
  }
}

// ── CRUD Produtos ────────────────────────────────────────────────────────────

export async function criarProduto(_prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const raw = Object.fromEntries(formData)
    const parsed = ProdutoSchema.safeParse(raw)
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const d = parsed.data
    const tamanhos = parseTamanhosForm(d.tamanhos, d.tamanhosExtras)
    const imagensUrl = parseImagens(d.imagensUrlJson)
    const slug = slugify(d.nome)

    await db.saasProduto.create({
      data: {
        tenantId: tenant.id,
        slug,
        nome: d.nome,
        descricao: d.descricao,
        preco: d.preco,
        precoOriginal: d.precoOriginal ? Number(d.precoOriginal) : null,
        marca: d.marca || null,
        categoriaId: d.categoriaId || null,
        destaque: formData.get('destaque') === 'true',
        tamanhos,
        estoque: parseEstoque(d.estoqueJson, tamanhos),
        imagensUrl,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PRODUTO_CRIADO',
        entidade: 'SaasProduto',
      },
    })

    revalidatePath('/admin/loja')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar produto' }
  }
}

export async function editarProduto(
  id: string,
  _prev: ProdutoState,
  formData: FormData,
): Promise<ProdutoState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const raw = Object.fromEntries(formData)
    const parsed = ProdutoSchema.safeParse(raw)
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const d = parsed.data
    const tamanhos = parseTamanhosForm(d.tamanhos, d.tamanhosExtras)
    const existente = await db.saasProduto.findFirst({
      where: { id, tenantId: tenant.id },
      select: { imagensUrl: true, slug: true },
    })
    if (!existente) return { error: 'Produto não encontrado' }

    const imagensUrl = parseImagens(d.imagensUrlJson, existente.imagensUrl)

    await db.saasProduto.update({
      where: { id, tenantId: tenant.id },
      data: {
        nome: d.nome,
        descricao: d.descricao,
        preco: d.preco,
        precoOriginal: d.precoOriginal ? Number(d.precoOriginal) : null,
        marca: d.marca || null,
        categoriaId: d.categoriaId || null,
        destaque: formData.get('destaque') === 'true',
        tamanhos,
        estoque: parseEstoque(d.estoqueJson, tamanhos),
        imagensUrl,
        slug: existente.slug ?? slugify(d.nome),
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PRODUTO_EDITADO',
        entidade: 'SaasProduto',
        entidadeId: id,
      },
    })

    revalidatePath('/admin/loja')
    revalidatePath(`/admin/loja/${id}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao editar produto' }
  }
}

export async function alterarStatusProduto(id: string, ativo: boolean) {
  const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
  await db.saasProduto.update({ where: { id, tenantId: tenant.id }, data: { ativo } })
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: ativo ? 'PRODUTO_ATIVADO' : 'PRODUTO_DESATIVADO',
      entidade: 'SaasProduto',
      entidadeId: id,
    },
  })
  revalidatePath('/admin/loja')
}

// ── Categorias ───────────────────────────────────────────────────────────────

export async function criarCategoria(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const parsed = CategoriaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

    const slug = parsed.data.slug ?? slugify(parsed.data.nome)
    await db.saasCategoria.create({
      data: {
        tenantId: tenant.id,
        nome: parsed.data.nome,
        slug,
        ordem: parsed.data.ordem,
        parentId: parsed.data.parentId ?? null,
      },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'CATEGORIA_CRIADA',
        entidade: 'SaasCategoria',
      },
    })
    revalidatePath('/admin/loja/categorias')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar categoria' }
  }
}

export async function excluirCategoria(id: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
  await db.saasCategoria.delete({ where: { id, tenantId: tenant.id } })
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'CATEGORIA_EXCLUIDA',
      entidade: 'SaasCategoria',
      entidadeId: id,
    },
  })
  revalidatePath('/admin/loja/categorias')
}

export async function criarCategoriaForm(formData: FormData): Promise<ActionState> {
  return criarCategoria({}, formData)
}

export async function excluirCategoriaForm(formData: FormData) {
  const id = formData.get('id') as string
  if (id) await excluirCategoria(id)
}

export async function criarCupomForm(formData: FormData): Promise<ActionState> {
  return criarCupom({}, formData)
}

// ── Cupons ───────────────────────────────────────────────────────────────────

export async function criarCupom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const raw = Object.fromEntries(formData)
    raw.primeiraCompra = raw.primeiraCompra === 'on' ? 'true' : 'false'
    raw.ativo = raw.ativo === 'on' ? 'true' : 'false'
    const parsed = CupomSchema.safeParse(raw)
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

    await db.saasCupom.create({
      data: {
        tenantId: tenant.id,
        codigo: parsed.data.codigo,
        tipo: parsed.data.tipo,
        valor: parsed.data.valor,
        primeiraCompra: parsed.data.primeiraCompra,
        ativo: parsed.data.ativo,
        validoAte: parsed.data.validoAte ?? null,
      },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'CUPOM_CRIADO',
        entidade: 'SaasCupom',
      },
    })
    revalidatePath('/admin/loja/cupons')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar cupom' }
  }
}

export async function toggleCupom(id: string, ativo: boolean) {
  const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
  await db.saasCupom.update({ where: { id, tenantId: tenant.id }, data: { ativo } })
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: ativo ? 'CUPOM_ATIVADO' : 'CUPOM_DESATIVADO',
      entidade: 'SaasCupom',
      entidadeId: id,
    },
  })
  revalidatePath('/admin/loja/cupons')
}

export async function toggleCupomForm(formData: FormData) {
  const id = formData.get('id') as string
  const ativo = formData.get('ativo') === 'true'
  if (id) await toggleCupom(id, ativo)
}

// ── Status Pedidos ───────────────────────────────────────────────────────────

export async function atualizarStatusPedido(
  id: string,
  _prev: PedidoStatusState,
  formData: FormData,
): Promise<PedidoStatusState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const status = formData.get('status') as string
    const validos = ['PENDENTE', 'CONFIRMADO', 'CANCELADO', 'ENTREGUE']
    if (!validos.includes(status)) return { error: 'Status inválido' }

    const pedido: {
      status: string
      total: Prisma.Decimal
      financeiroLancamentoId: string | null
      userId: string
      itens: Array<{ produtoNome: string; quantidade: number }>
    } | null = await db.saasPedido.findFirst({
      where: { id, tenantId: tenant.id },
      select: {
        status: true,
        total: true,
        financeiroLancamentoId: true,
        userId: true,
        itens: { select: { produtoNome: true, quantidade: true } },
      },
    })
    if (!pedido) return { error: 'Pedido não encontrado' }

    const statusNovo = status as 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'ENTREGUE'

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      if (statusNovo === 'CANCELADO' && pedido.status !== 'CANCELADO') {
        await restaurarEstoquePedido(id, tx)
      }

      await tx.saasPedido.update({
        where: { id, tenantId: tenant.id },
        data: { status: statusNovo },
      })

      // CONFIRMADO / ENTREGUE = pedido “pago” operacional (sem gateway ainda).
      if (
        (statusNovo === 'CONFIRMADO' || statusNovo === 'ENTREGUE') &&
        !pedido.financeiroLancamentoId &&
        session.user.id
      ) {
        const resumoItens = pedido.itens.map((i) => `${i.produtoNome} ×${i.quantidade}`).join(', ')
        await garantirLancamentoFinanceiroPedido(tx, {
          tenantId: tenant.id,
          pedidoId: id,
          total: pedido.total,
          atorId: session.user.id,
          itensResumo: resumoItens,
        })
      }
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PEDIDO_STATUS_ATUALIZADO',
        entidade: 'SaasPedido',
        entidadeId: id,
        detalhes: { status: statusNovo },
      },
    })

    if (statusNovo !== pedido.status) {
      const notificacaoPorStatus: Partial<
        Record<
          typeof statusNovo,
          { tipo: 'PEDIDO_CONFIRMADO' | 'PEDIDO_CANCELADO' | 'PEDIDO_ENTREGUE'; titulo: string }
        >
      > = {
        CONFIRMADO: { tipo: 'PEDIDO_CONFIRMADO', titulo: 'Pedido confirmado' },
        CANCELADO: { tipo: 'PEDIDO_CANCELADO', titulo: 'Pedido cancelado' },
        ENTREGUE: { tipo: 'PEDIDO_ENTREGUE', titulo: 'Pedido entregue' },
      }
      const notificacao = notificacaoPorStatus[statusNovo]
      if (notificacao) {
        await notificarSafe({
          userId: pedido.userId,
          tenantId: tenant.id,
          tipo: notificacao.tipo,
          titulo: notificacao.titulo,
          link: '/portal/loja/pedidos',
          atorId: session.user.id,
        })
      }
    }

    revalidatePath('/admin/loja/pedidos')
    revalidatePath('/portal/loja/pedidos')
    revalidatePath('/admin/financeiro')
    revalidatePath('/portal/financeiro')
    revalidatePath('/portal/balanco')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar pedido' }
  }
}
