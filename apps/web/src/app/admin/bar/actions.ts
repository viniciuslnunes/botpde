'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, Prisma } from '@torcida/db'
import type { MetodoPagamentoBar, StatusVendaBar } from '@torcida/db'
import {
  CategoriaBarSchema,
  CompraBarSchema,
  EstornarVendaBarSchema,
  FecharTurnoBarSchema,
  PERMISSIONS,
  ProdutoBarSchema,
  VendaBarSchema,
  recalcularCustoMedio,
  resumirVenda,
  round2,
  slugify,
} from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import {
  confirmarVendaBarPaga,
  getTurnoAbertoBar,
  resolveUnidadeBar,
  resumirTurnoBar,
} from '@/lib/bar'
import {
  assinarWebhookMockBar,
  criarCobrancaPixBar,
  getPixProvider,
  verificarWebhookMockBar,
} from '@/lib/pix-gateway'

export type BarActionState = {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<string, string[]>>
}

export type RegistrarVendaBarResult =
  | { success: true; vendaId: string; pago: true }
  | {
      success: true
      vendaId: string
      pago: false
      pix: { copiaCola: string; externalId: string; provider: string }
    }
  | { success: false; error: string }

function revalidateBar() {
  revalidatePath('/admin/bar')
  revalidatePath('/admin/bar/pdv')
  revalidatePath('/admin/bar/produtos')
  revalidatePath('/admin/bar/estoque')
  revalidatePath('/admin/bar/vendas')
  revalidatePath('/portal/bar')
}

const AjusteEstoqueBarSchema = z.object({
  produtoId: z.string().uuid('Produto inválido'),
  novaQtd: z.coerce.number().int('Quantidade deve ser inteira').min(0, 'Quantidade não pode ser negativa'),
  motivo: z.string().trim().min(3, 'Informe o motivo').max(200, 'Motivo muito longo'),
})

// Espelha `revalidateFinanceiro` de admin/financeiro/actions.ts (não exportado lá).
function revalidateFinanceiro() {
  revalidatePath('/admin/financeiro')
  revalidatePath('/portal/financeiro')
  revalidatePath('/portal/balanco')
  revalidatePath('/portal/departamentos/financeiro')
  revalidatePath('/portal/departamentos', 'layout')
}

// ── Catálogo: produtos (BAR_MANAGE) ──────────────────────────────────────────

export async function criarProdutoBar(_prev: BarActionState, formData: FormData): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const parsed = ProdutoBarSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const d = parsed.data
    if (d.categoriaId) {
      const cat: { id: string } | null = await db.barCategoria.findFirst({
        where: { id: d.categoriaId, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true },
      })
      if (!cat) return { error: 'Categoria inválida para esta unidade' }
    }

    // No create, `estoque` é o estoque de abertura (sem gerar despesa) e
    // `custoMedio` começa em 0 — passa a ser movimentado só por compras.
    const created: { id: string } = await db.barProduto.create({
      data: {
        tenantId: tenant.id,
        sedeId: unidade.id,
        nome: d.nome,
        descricao: d.descricao ?? null,
        categoriaId: d.categoriaId,
        preco: d.preco,
        custoMedio: 0,
        estoque: d.estoque,
        estoqueMinimo: d.estoqueMinimo ?? null,
        imagemUrl: d.imagemUrl ?? null,
        ativo: formData.get('ativo') == null ? true : formData.get('ativo') === 'true',
        destaque: formData.get('destaque') === 'true',
        ordem: d.ordem ?? 0,
        criadoPorId: session.user.id,
      },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_PRODUTO_CRIADO',
        entidade: 'BarProduto',
        entidadeId: created.id,
        detalhes: { nome: d.nome, preco: d.preco, estoque: d.estoque },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar produto' }
  }
}

export async function editarProdutoBar(
  id: string,
  _prev: BarActionState,
  formData: FormData,
): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const parsed = ProdutoBarSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const existente: { id: string } | null = await db.barProduto.findFirst({
      where: { id, tenantId: tenant.id, sedeId: unidade.id },
      select: { id: true },
    })
    if (!existente) return { error: 'Produto não encontrado' }

    const d = parsed.data
    if (d.categoriaId) {
      const cat: { id: string } | null = await db.barCategoria.findFirst({
        where: { id: d.categoriaId, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true },
      })
      if (!cat) return { error: 'Categoria inválida para esta unidade' }
    }
    await db.barProduto.update({
      where: { id: existente.id },
      data: {
        nome: d.nome,
        descricao: d.descricao ?? null,
        categoriaId: d.categoriaId,
        preco: d.preco,
        estoqueMinimo: d.estoqueMinimo ?? null,
        imagemUrl: d.imagemUrl ?? null,
        ativo: formData.get('ativo') == null ? true : formData.get('ativo') === 'true',
        destaque: formData.get('destaque') === 'true',
        ordem: d.ordem ?? 0,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_PRODUTO_EDITADO',
        entidade: 'BarProduto',
        entidadeId: existente.id,
        detalhes: { nome: d.nome, preco: d.preco },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao editar produto' }
  }
}

export async function alterarStatusProdutoBar(id: string, ativo: boolean): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const existente: { id: string } | null = await db.barProduto.findFirst({
      where: { id, tenantId: tenant.id, sedeId: unidade.id },
      select: { id: true },
    })
    if (!existente) return { error: 'Produto não encontrado' }

    await db.barProduto.update({ where: { id: existente.id }, data: { ativo } })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: ativo ? 'BAR_PRODUTO_ATIVADO' : 'BAR_PRODUTO_DESATIVADO',
        entidade: 'BarProduto',
        entidadeId: existente.id,
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao alterar status' }
  }
}

export async function excluirProdutoBar(id: string): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const existente: {
      id: string
      nome: string
      preco: Prisma.Decimal
      custoMedio: Prisma.Decimal
      estoque: number
    } | null = await db.barProduto.findFirst({
      where: { id, tenantId: tenant.id, sedeId: unidade.id },
      select: { id: true, nome: true, preco: true, custoMedio: true, estoque: true },
    })
    if (!existente) return { error: 'Produto não encontrado' }

    // Hard delete é seguro: BarVendaItem.produtoId usa SetNull e mantém o
    // snapshot `produtoNome`; movimentações caem em cascata.
    await db.barProduto.delete({ where: { id: existente.id } })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_PRODUTO_EXCLUIDO',
        entidade: 'BarProduto',
        entidadeId: existente.id,
        detalhes: {
          nome: existente.nome,
          preco: Number(existente.preco),
          custoMedio: Number(existente.custoMedio),
          estoque: existente.estoque,
        },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir produto' }
  }
}

// ── Catálogo: categorias (BAR_MANAGE) ────────────────────────────────────────

export async function criarCategoriaBar(_prev: BarActionState, formData: FormData): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const parsed = CategoriaBarSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const d = parsed.data
    const base = slugify(d.nome)
    // Unicidade por tenant+unidade (@@unique([tenantId, sedeId, slug])).
    let slug = base
    for (let sufixo = 2; sufixo < 100; sufixo += 1) {
      const colisao: { id: string } | null = await db.barCategoria.findFirst({
        where: { tenantId: tenant.id, sedeId: unidade.id, slug },
        select: { id: true },
      })
      if (!colisao) break
      slug = `${base}-${sufixo}`
    }

    const created: { id: string } = await db.barCategoria.create({
      data: {
        tenantId: tenant.id,
        sedeId: unidade.id,
        nome: d.nome,
        slug,
        ordem: d.ordem ?? 0,
        ativo: d.ativo ?? true,
      },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_CATEGORIA_CRIADA',
        entidade: 'BarCategoria',
        entidadeId: created.id,
        detalhes: { nome: d.nome, slug },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar categoria' }
  }
}

export async function excluirCategoriaBar(id: string): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const existente: { id: string; nome: string; slug: string } | null = await db.barCategoria.findFirst({
      where: { id, tenantId: tenant.id, sedeId: unidade.id },
      select: { id: true, nome: true, slug: true },
    })
    if (!existente) return { error: 'Categoria não encontrada' }

    // Produtos vinculados ficam sem categoria (SetNull).
    await db.barCategoria.delete({ where: { id: existente.id } })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_CATEGORIA_EXCLUIDA',
        entidade: 'BarCategoria',
        entidadeId: existente.id,
        detalhes: { nome: existente.nome, slug: existente.slug },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir categoria' }
  }
}

// ── Compra / reposição de insumo (BAR_MANAGE) ────────────────────────────────

export async function registrarCompraBar(_prev: BarActionState, formData: FormData): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const parsed = CompraBarSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const { produtoId, quantidade, custoTotal, motivo } = parsed.data

    const compraId: string = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const produto: {
        id: string
        nome: string
        estoque: number
        custoMedio: Prisma.Decimal
      } | null = await tx.barProduto.findFirst({
        where: { id: produtoId, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true, nome: true, estoque: true, custoMedio: true },
      })
      if (!produto) throw new Error('Produto não encontrado')

      const novoCusto = recalcularCustoMedio({
        estoqueAtual: produto.estoque,
        custoMedioAtual: Number(produto.custoMedio),
        quantidadeEntrada: quantidade,
        custoTotalEntrada: custoTotal,
      })

      await tx.barProduto.update({
        where: { id: produto.id },
        data: { estoque: { increment: quantidade }, custoMedio: novoCusto },
      })

      const lancamento: { id: string } = await tx.financeiroLancamento.create({
        data: {
          tenantId: tenant.id,
          tipo: 'DESPESA',
          categoria: 'BAR',
          valor: custoTotal,
          descricao: `Compra de insumo — ${produto.nome}`,
          data: new Date(),
          observacao: motivo ?? null,
          criadoPorId: session.user.id!,
        },
        select: { id: true },
      })

      const mov: { id: string } = await tx.barMovimentacaoEstoque.create({
        data: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          produtoId: produto.id,
          tipo: 'ENTRADA',
          quantidade,
          custoTotal,
          motivo: motivo ?? null,
          financeiroLancamentoId: lancamento.id,
          operadorId: session.user.id,
        },
        select: { id: true },
      })
      return mov.id
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMPRA_REGISTRADA',
        entidade: 'BarMovimentacaoEstoque',
        entidadeId: compraId,
        detalhes: { produtoId, quantidade, custoTotal, motivo: motivo ?? null },
      },
    })

    revalidateBar()
    revalidateFinanceiro()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao registrar compra' }
  }
}

// ── Venda (BAR_OPERATE ou BAR_MANAGE) ────────────────────────────────────────

/**
 * Registra uma venda de balcão.
 *
 * Estoque é decrementado já na criação (mesmo PIX pendente) e restaurado no
 * cancelamento. Métodos presenciais (dinheiro/cartão) nascem PAGA com receita
 * no livro-caixa; PIX nasce PENDENTE e a receita é criada pelo webhook via
 * `confirmarVendaBarPaga`.
 *
 * Decisão sobre falha do gateway PIX: se `criarCobrancaPixBar` falhar após a
 * transação, a venda é CANCELADA e o estoque restaurado (movimentação AJUSTE),
 * retornando erro — evita venda órfã sem cobrança associada.
 */
export async function registrarVendaBar(input: unknown): Promise<RegistrarVendaBarResult> {
  try {
    const { session, tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE])
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = VendaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { itens, metodoPagamento, desconto, observacao } = parsed.data

    const turno = await getTurnoAbertoBar(tenant.id, unidade.id)
    if (!turno) {
      return {
        success: false,
        error: 'Abra um turno de caixa antes de registrar vendas no PDV',
      }
    }

    // Consolida quantidades por produto (evita burlar validação de estoque
    // repetindo o mesmo produtoId em linhas separadas).
    const porProduto = new Map<string, number>()
    for (const item of itens) {
      porProduto.set(item.produtoId, (porProduto.get(item.produtoId) ?? 0) + item.quantidade)
    }

    type VendaCriada = {
      vendaId: string
      total: number
      status: StatusVendaBar
      qtdItens: number
    }

    const criada: VendaCriada = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      type ProdutoRow = {
        id: string
        nome: string
        preco: Prisma.Decimal
        custoMedio: Prisma.Decimal
        estoque: number
        ativo: boolean
      }
      const produtos: ProdutoRow[] = await tx.barProduto.findMany({
        where: { id: { in: [...porProduto.keys()] }, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true, nome: true, preco: true, custoMedio: true, estoque: true, ativo: true },
      })
      const porId = new Map<string, ProdutoRow>(produtos.map((p) => [p.id, p]))

      const linhas: {
        produtoId: string
        produtoNome: string
        quantidade: number
        precoUnit: number
        custoUnit: number
        total: number
      }[] = []

      for (const [produtoId, quantidade] of porProduto) {
        const produto = porId.get(produtoId)
        if (!produto) throw new Error('Produto não encontrado')
        if (!produto.ativo) throw new Error(`Produto inativo: ${produto.nome}`)
        if (produto.estoque < quantidade) {
          throw new Error(`Estoque insuficiente para ${produto.nome}`)
        }
        const precoUnit = Number(produto.preco)
        linhas.push({
          produtoId,
          produtoNome: produto.nome,
          quantidade,
          precoUnit,
          custoUnit: Number(produto.custoMedio),
          total: round2(precoUnit * quantidade),
        })
      }

      const resumo = resumirVenda(linhas, desconto)

      const pago = metodoPagamento !== 'PIX'
      if (!pago && resumo.total <= 0) {
        throw new Error('Total deve ser maior que zero para pagamento via PIX')
      }

      const resumoItens = linhas
        .map((l) => `${l.produtoNome} ×${l.quantidade}`)
        .join(', ')
      const descricaoVenda =
        resumoItens.length > 0
          ? `Venda do bar — ${resumoItens}`.slice(0, 240)
          : 'Venda do bar'

      let financeiroLancamentoId: string | null = null
      if (pago) {
        const lanc: { id: string } = await tx.financeiroLancamento.create({
          data: {
            tenantId: tenant.id,
            tipo: 'RECEITA',
            categoria: 'BAR',
            valor: resumo.total,
            descricao: descricaoVenda,
            data: new Date(),
            observacao: observacao ?? null,
            criadoPorId: session.user.id!,
          },
          select: { id: true },
        })
        financeiroLancamentoId = lanc.id
      }

      const venda: { id: string } = await tx.barVenda.create({
        data: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          turnoId: turno.id,
          operadorId: session.user.id!,
          subtotal: resumo.subtotal,
          desconto: resumo.desconto,
          total: resumo.total,
          metodoPagamento: metodoPagamento as MetodoPagamentoBar,
          status: pago ? 'PAGA' : 'PENDENTE',
          pagoEm: pago ? new Date() : null,
          financeiroLancamentoId,
          observacao: observacao ?? null,
          itens: { create: linhas },
        },
        select: { id: true },
      })

      // Baixa de estoque + movimentação SAIDA por linha.
      for (const linha of linhas) {
        await tx.barProduto.update({
          where: { id: linha.produtoId },
          data: { estoque: { decrement: linha.quantidade } },
        })
        await tx.barMovimentacaoEstoque.create({
          data: {
            tenantId: tenant.id,
            sedeId: unidade.id,
            produtoId: linha.produtoId,
            tipo: 'SAIDA',
            quantidade: linha.quantidade,
            vendaId: venda.id,
            operadorId: session.user.id,
          },
        })
      }

      return {
        vendaId: venda.id,
        total: resumo.total,
        status: (pago ? 'PAGA' : 'PENDENTE') as StatusVendaBar,
        qtdItens: linhas.length,
      }
    })

    let pix: { copiaCola: string; externalId: string; provider: string } | null = null
    if (metodoPagamento === 'PIX') {
      try {
        const cobranca = await criarCobrancaPixBar({
          vendaId: criada.vendaId,
          tenantSlug: tenant.slug,
          valor: criada.total,
          descricao: 'Venda do bar',
          payerEmail: session.user.email,
        })
        await db.barVenda.update({
          where: { id: criada.vendaId },
          data: {
            gatewayProvider: cobranca.provider,
            gatewayExternalId: cobranca.externalId,
            pixCopiaCola: cobranca.copiaCola,
          },
        })
        pix = { copiaCola: cobranca.copiaCola, externalId: cobranca.externalId, provider: cobranca.provider }
      } catch {
        // Gateway falhou: cancela a venda e restaura o estoque para não deixar
        // venda pendente órfã (sem cobrança que possa ser paga).
        await cancelarVendaPendenteTx(tenant.id, criada.vendaId, session.user.id ?? null, 'Falha ao gerar cobrança PIX')
        revalidateBar()
        return { success: false, error: 'Não foi possível gerar a cobrança PIX. A venda foi cancelada.' }
      }
    }

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_VENDA_REGISTRADA',
        entidade: 'BarVenda',
        entidadeId: criada.vendaId,
        detalhes: {
          total: criada.total,
          metodo: metodoPagamento,
          status: criada.status,
          qtdItens: criada.qtdItens,
        },
      },
    })

    revalidateBar()
    if (criada.status === 'PAGA') revalidateFinanceiro()

    if (pix) return { success: true, vendaId: criada.vendaId, pago: false, pix }
    return { success: true, vendaId: criada.vendaId, pago: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao registrar venda' }
  }
}

/** Restaura estoque dos itens e marca a venda PENDENTE como CANCELADA (em tx). */
async function cancelarVendaPendenteTx(
  tenantId: string,
  vendaId: string,
  operadorId: string | null,
  motivo: string,
): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const venda: { id: string; sedeId: string } | null = await tx.barVenda.findFirst({
      where: { id: vendaId, tenantId },
      select: { id: true, sedeId: true },
    })
    if (!venda) throw new Error('Venda não encontrada')

    const itens: { produtoId: string | null; quantidade: number }[] = await tx.barVendaItem.findMany({
      where: { vendaId },
      select: { produtoId: true, quantidade: true },
    })
    for (const item of itens) {
      if (!item.produtoId) continue
      await tx.barProduto.update({
        where: { id: item.produtoId },
        data: { estoque: { increment: item.quantidade } },
      })
      await tx.barMovimentacaoEstoque.create({
        data: {
          tenantId,
          sedeId: venda.sedeId,
          produtoId: item.produtoId,
          tipo: 'AJUSTE',
          quantidade: item.quantidade,
          motivo,
          vendaId,
          operadorId,
        },
      })
    }
    await tx.barVenda.update({ where: { id: vendaId }, data: { status: 'CANCELADA' } })
  })
}

/** Status da venda para polling no PDV (após PIX). */
export async function consultarStatusVendaBar(
  vendaId: string,
): Promise<{ success: true; status: StatusVendaBar } | { success: false; error: string }> {
  try {
    const { tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE])
    if (!vendaId || typeof vendaId !== 'string') return { success: false, error: 'Venda inválida' }

    const venda: { status: StatusVendaBar } | null = await db.barVenda.findFirst({
      where: { id: vendaId, tenantId: tenant.id },
      select: { status: true },
    })
    if (!venda) return { success: false, error: 'Venda não encontrada' }
    return { success: true, status: venda.status }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao consultar venda' }
  }
}

/**
 * Confirma PIX mock no PDV (dev/demo). Espelha `confirmarPixMock` das cobranças
 * de associação, usando o namespace de assinatura do Bar.
 */
export async function confirmarPixMockBar(vendaId: string): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ])

    if (getPixProvider() !== 'mock') {
      return { error: 'Confirmação manual só disponível no modo mock' }
    }
    if (!vendaId || typeof vendaId !== 'string') return { error: 'Venda inválida' }

    const venda: {
      id: string
      status: StatusVendaBar
      gatewayProvider: string | null
    } | null = await db.barVenda.findFirst({
      where: { id: vendaId, tenantId: tenant.id },
      select: { id: true, status: true, gatewayProvider: true },
    })
    if (!venda) return { error: 'Venda não encontrada' }
    if (venda.status === 'PAGA') return { success: true }
    if (venda.status === 'CANCELADA') return { error: 'Venda cancelada' }
    if (venda.status === 'ESTORNADA') return { error: 'Venda estornada' }
    if (venda.gatewayProvider && venda.gatewayProvider !== 'mock') {
      return { error: 'Cobrança não é mock' }
    }

    const signature = assinarWebhookMockBar(venda.id)
    if (!verificarWebhookMockBar(venda.id, signature)) return { error: 'Assinatura inválida' }

    const result = await confirmarVendaBarPaga({
      tenantId: tenant.id,
      vendaId: venda.id,
      atorId: session.user.id,
    })
    if (!result.ok) return { error: result.error }

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_VENDA_PIX_CONFIRMADA_MOCK',
        entidade: 'BarVenda',
        entidadeId: venda.id,
      },
    })

    revalidateBar()
    revalidateFinanceiro()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao confirmar PIX' }
  }
}

export async function cancelarVendaBar(vendaId: string): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    if (!vendaId || typeof vendaId !== 'string') return { error: 'Venda inválida' }

    const venda: { id: string; status: StatusVendaBar; total: Prisma.Decimal } | null =
      await db.barVenda.findFirst({
        where: { id: vendaId, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true, status: true, total: true },
      })
    if (!venda) return { error: 'Venda não encontrada' }
    if (venda.status === 'CANCELADA') return { success: true }
    if (venda.status === 'ESTORNADA') return { error: 'Venda já estornada' }
    if (venda.status === 'PAGA') {
      return { error: 'Venda paga: use estorno em vez de cancelar' }
    }

    await cancelarVendaPendenteTx(tenant.id, venda.id, session.user.id ?? null, 'Cancelamento de venda')

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_VENDA_CANCELADA',
        entidade: 'BarVenda',
        entidadeId: venda.id,
        detalhes: { total: Number(venda.total) },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao cancelar venda' }
  }
}

// ── Ajuste manual de estoque (BAR_MANAGE) ────────────────────────────────────

export async function registrarAjusteEstoqueBar(
  produtoId: string,
  novaQtd: number,
  motivo: string,
): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = AjusteEstoqueBarSchema.safeParse({ produtoId, novaQtd, motivo })
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

    const movId: string = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const produto: { id: string; nome: string; estoque: number } | null = await tx.barProduto.findFirst({
        where: { id: parsed.data.produtoId, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true, nome: true, estoque: true },
      })
      if (!produto) throw new Error('Produto não encontrado')

      await tx.barProduto.update({
        where: { id: produto.id },
        data: { estoque: parsed.data.novaQtd },
      })
      const mov: { id: string } = await tx.barMovimentacaoEstoque.create({
        data: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          produtoId: produto.id,
          tipo: 'AJUSTE',
          quantidade: Math.abs(parsed.data.novaQtd - produto.estoque),
          motivo: parsed.data.motivo,
          operadorId: session.user.id,
        },
        select: { id: true },
      })
      return mov.id
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_ESTOQUE_AJUSTADO',
        entidade: 'BarMovimentacaoEstoque',
        entidadeId: movId,
        detalhes: { produtoId: parsed.data.produtoId, novaQtd: parsed.data.novaQtd, motivo: parsed.data.motivo },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao ajustar estoque' }
  }
}

// ── Turno de caixa (BAR_MANAGE) ───────────────────────────────────────────────

export async function abrirTurnoBar(): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const aberto = await getTurnoAbertoBar(tenant.id, unidade.id)
    if (aberto) return { error: 'Já existe um turno aberto nesta unidade' }

    const turno: { id: string } = await db.barCaixaTurno.create({
      data: {
        tenantId: tenant.id,
        sedeId: unidade.id,
        abertoPorId: session.user.id!,
      },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_TURNO_ABERTO',
        entidade: 'BarCaixaTurno',
        entidadeId: turno.id,
        detalhes: { sedeId: unidade.id },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao abrir turno' }
  }
}

export async function fecharTurnoBar(input: unknown): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = FecharTurnoBarSchema.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }

    const turno = await getTurnoAbertoBar(tenant.id, unidade.id)
    if (!turno) return { error: 'Nenhum turno aberto para fechar' }

    const resumo = await resumirTurnoBar(tenant.id, turno.id)
    if (resumo.pendentes > 0) {
      return {
        error: `Há ${resumo.pendentes} venda(s) PIX pendente(s). Cancele ou confirme antes de fechar.`,
      }
    }

    await db.barCaixaTurno.update({
      where: { id: turno.id },
      data: {
        fechadoEm: new Date(),
        fechadoPorId: session.user.id!,
        dinheiroContado: parsed.data.dinheiroContado,
        sangria: parsed.data.sangria,
        observacao: parsed.data.observacao ?? null,
      },
    })

    const diferenca = round2(parsed.data.dinheiroContado - resumo.dinheiroEsperado + parsed.data.sangria)

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_TURNO_FECHADO',
        entidade: 'BarCaixaTurno',
        entidadeId: turno.id,
        detalhes: {
          sedeId: unidade.id,
          dinheiroContado: parsed.data.dinheiroContado,
          dinheiroEsperado: resumo.dinheiroEsperado,
          sangria: parsed.data.sangria,
          diferenca,
          totalPago: resumo.totalPago,
          quantidadePaga: resumo.quantidadePaga,
        },
      },
    })

    revalidateBar()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao fechar turno' }
  }
}

// ── Estorno de venda paga (BAR_MANAGE) ────────────────────────────────────────

export async function estornarVendaBar(input: unknown): Promise<BarActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = EstornarVendaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }

    type VendaRow = {
      id: string
      status: StatusVendaBar
      total: Prisma.Decimal
      sedeId: string
      financeiroLancamentoId: string | null
      financeiroEstornoLancamentoId: string | null
      itens: Array<{ produtoId: string | null; produtoNome: string; quantidade: number }>
    }

    const venda: VendaRow | null = await db.barVenda.findFirst({
      where: { id: parsed.data.vendaId, tenantId: tenant.id, sedeId: unidade.id },
      select: {
        id: true,
        status: true,
        total: true,
        sedeId: true,
        financeiroLancamentoId: true,
        financeiroEstornoLancamentoId: true,
        itens: { select: { produtoId: true, produtoNome: true, quantidade: true } },
      },
    })
    if (!venda) return { error: 'Venda não encontrada' }
    if (venda.status === 'ESTORNADA') return { success: true }
    if (venda.status !== 'PAGA') {
      return { error: 'Só é possível estornar vendas pagas' }
    }

    const resumoItens = venda.itens
      .map((i) => `${i.produtoNome} ×${i.quantidade}`)
      .join(', ')
    const descricaoEstorno =
      resumoItens.length > 0
        ? `Estorno bar — ${resumoItens}`.slice(0, 240)
        : 'Estorno de venda do bar'

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      let estornoId = venda.financeiroEstornoLancamentoId
      if (!estornoId) {
        const lanc: { id: string } = await tx.financeiroLancamento.create({
          data: {
            tenantId: tenant.id,
            tipo: 'DESPESA',
            categoria: 'BAR',
            valor: venda.total,
            descricao: descricaoEstorno,
            data: new Date(),
            observacao: `Estorno venda ${venda.id} — ${parsed.data.motivo}`,
            criadoPorId: session.user.id!,
          },
          select: { id: true },
        })
        estornoId = lanc.id
      }

      for (const item of venda.itens) {
        if (!item.produtoId) continue
        await tx.barProduto.update({
          where: { id: item.produtoId },
          data: { estoque: { increment: item.quantidade } },
        })
        await tx.barMovimentacaoEstoque.create({
          data: {
            tenantId: tenant.id,
            sedeId: venda.sedeId,
            produtoId: item.produtoId,
            tipo: 'AJUSTE',
            quantidade: item.quantidade,
            motivo: `Estorno — ${parsed.data.motivo}`,
            vendaId: venda.id,
            operadorId: session.user.id,
          },
        })
      }

      await tx.barVenda.update({
        where: { id: venda.id },
        data: {
          status: 'ESTORNADA',
          financeiroEstornoLancamentoId: estornoId,
        },
      })
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_VENDA_ESTORNADA',
        entidade: 'BarVenda',
        entidadeId: venda.id,
        detalhes: {
          total: Number(venda.total),
          motivo: parsed.data.motivo,
          financeiroLancamentoId: venda.financeiroLancamentoId,
        },
      },
    })

    revalidateBar()
    revalidateFinanceiro()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao estornar venda' }
  }
}
