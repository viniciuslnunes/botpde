'use server'

import { db } from '@torcida/db'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'

const TAMANHOS_VALIDOS = ['PP', 'P', 'M', 'G', 'GG', 'EXG', 'UN'] as const

// ── Schema ──────────────────────────────────────────────────────────────────

const ProdutoSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  descricao: z.string().optional(),
  preco: z.coerce.number().positive('Preço inválido'),
  imagemUrl: z.string().url('URL inválida').or(z.literal('')).optional(),
  tamanhos: z.string().optional(), // CSV: "P,M,G,GG"
  estoqueJson: z.string().optional(), // JSON: {"P":10,"M":8}
})

// ── Estado ──────────────────────────────────────────────────────────────────

export type ProdutoState = {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<string, string[]>>
}

export type PedidoStatusState = {
  success?: boolean
  error?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseTamanhos(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map((t) => t.trim()).filter((t) => TAMANHOS_VALIDOS.includes(t as (typeof TAMANHOS_VALIDOS)[number]))
}

function parseEstoque(estoqueJson: string | undefined, tamanhos: string[]): Record<string, number> {
  if (!estoqueJson) return {}
  try {
    const parsed = JSON.parse(estoqueJson) as Record<string, number>
    if (tamanhos.length === 0) {
      return { UN: Number(parsed['UN'] ?? 0) }
    }
    const result: Record<string, number> = {}
    for (const t of tamanhos) {
      result[t] = Number(parsed[t] ?? 0)
    }
    return result
  } catch {
    return {}
  }
}

// ── CRUD Produtos ────────────────────────────────────────────────────────────

export async function criarProduto(_prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const raw = Object.fromEntries(formData)
    const parsed = ProdutoSchema.safeParse(raw)
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const { nome, descricao, preco, imagemUrl, tamanhos: tamanhosRaw, estoqueJson } = parsed.data
    const tamanhos = parseTamanhos(tamanhosRaw)
    const estoque = parseEstoque(estoqueJson, tamanhos)
    const imagensUrl = imagemUrl ? [imagemUrl] : []

    await db.saasProduto.create({
      data: { tenantId: tenant.id, nome, descricao, preco, tamanhos, estoque, imagensUrl },
    })

    await db.auditLog.create({
      data: { tenantId: tenant.id, atorId: session.user.id, acao: 'PRODUTO_CRIADO', entidade: 'SaasProduto' },
    })

    revalidatePath('/admin/loja')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar produto' }
  }
}

export async function editarProduto(id: string, _prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const raw = Object.fromEntries(formData)
    const parsed = ProdutoSchema.safeParse(raw)
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const { nome, descricao, preco, imagemUrl, tamanhos: tamanhosRaw, estoqueJson } = parsed.data
    const tamanhos = parseTamanhos(tamanhosRaw)
    const estoque = parseEstoque(estoqueJson, tamanhos)
    const imagensUrl = imagemUrl ? [imagemUrl] : []

    await db.saasProduto.update({
      where: { id, tenantId: tenant.id },
      data: { nome, descricao, preco, tamanhos, estoque, imagensUrl },
    })

    await db.auditLog.create({
      data: { tenantId: tenant.id, atorId: session.user.id, acao: 'PRODUTO_EDITADO', entidade: 'SaasProduto', entidadeId: id },
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
    data: { tenantId: tenant.id, atorId: session.user.id, acao: ativo ? 'PRODUTO_ATIVADO' : 'PRODUTO_DESATIVADO', entidade: 'SaasProduto', entidadeId: id },
  })
  revalidatePath('/admin/loja')
}

// ── Status Pedidos ───────────────────────────────────────────────────────────

export async function atualizarStatusPedido(id: string, _prev: PedidoStatusState, formData: FormData): Promise<PedidoStatusState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
    const status = formData.get('status') as string
    const validos = ['PENDENTE', 'CONFIRMADO', 'CANCELADO', 'ENTREGUE']
    if (!validos.includes(status)) return { error: 'Status inválido' }

    await db.saasPedido.update({
      where: { id, tenantId: tenant.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: status as any },
    })

    await db.auditLog.create({
      data: { tenantId: tenant.id, atorId: session.user.id, acao: 'PEDIDO_STATUS_ATUALIZADO', entidade: 'SaasPedido', entidadeId: id, detalhes: { status } },
    })

    revalidatePath('/admin/loja/pedidos')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar pedido' }
  }
}
