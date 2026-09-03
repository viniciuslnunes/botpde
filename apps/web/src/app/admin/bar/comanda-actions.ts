'use server'

import { revalidatePath } from 'next/cache'
import { db, Prisma } from '@torcida/db'
import type { MetodoPagamentoBar, StatusVendaBar } from '@torcida/db'
import {
  AbrirComandaBarSchema,
  CancelarComandaBarSchema,
  FecharComandaBarSchema,
  LiberarLimiteComandaBarSchema,
  LancarItensComandaBarSchema,
  PERMISSIONS,
  QuitarComandaBarSchema,
  RemoverLancamentoComandaBarSchema,
  hasPermission,
  round2,
  resumirVenda,
  saldoComanda,
} from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { notificarUsuariosComPermissao, reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import {
  getTurnoAbertoBar,
  JANELA_ESTORNOS_ANOMALO_DIAS,
  LIMIAR_ESTORNOS_ANOMALO,
  resolveUnidadeBar,
} from '@/lib/bar'
import {
  assertComandaUnidade,
  avaliarLimiteLancamento,
  confirmarPagamentoComandaBar,
  recalcularTotaisComanda,
  resolverLimiteComanda,
  LIMITE_COMANDA_PADRAO,
} from '@/lib/bar-comanda'
import {
  assinarWebhookMockComandaBar,
  criarCobrancaPixComandaBar,
  getPixProvider,
  verificarWebhookMockComandaBar,
} from '@/lib/pix-gateway'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'

export type BarComandaActionState = {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<string, string[]>>
}

function revalidateBarComanda(tenantId: string) {
  invalidateAdminDirecao(tenantId)
  revalidatePath('/admin/bar')
  revalidatePath('/admin/bar/pdv')
  revalidatePath('/admin/bar/comandas')
  revalidatePath('/admin/bar/fiado')
  revalidatePath('/portal/bar')
}

function revalidateFinanceiro() {
  revalidatePath('/admin/financeiro')
  revalidatePath('/portal/financeiro')
  revalidatePath('/portal/balanco')
  revalidatePath('/portal/departamentos/financeiro')
  revalidatePath('/portal/departamentos', 'layout')
}

export type AbrirComandaBarResult =
  | { success: true; comandaId: string }
  | { success: false; error: string }

export type LancarItensComandaBarResult =
  | { success: true; vendaId: string; totalComanda: number; avisoLimitePct: number | null }
  | { success: false; error: string }

export type FecharComandaBarResult =
  | {
      success: true
      status: string
      pix?: Array<{ pagamentoId: string; copiaCola: string; externalId: string; provider: string }>
    }
  | { success: false; error: string }

export type QuitarComandaBarResult =
  | { success: true; status: string; saldo: number }
  | { success: false; error: string }

/** Abre comanda ABERTA na unidade (exige turno aberto). */
export async function abrirComandaBar(input: unknown): Promise<AbrirComandaBarResult> {
  try {
    const { session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ])
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = AbrirComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { codigo, tipo, membroId, titularNome, limite } = parsed.data

    const turno = await getTurnoAbertoBar(tenant.id, unidade.id)
    if (!turno) {
      return { success: false, error: 'Abra um turno de caixa antes de abrir comandas' }
    }

    // AVULSO: limite acima do padrão só com manage (action já é operate|manage).
    if (
      tipo === 'AVULSO' &&
      limite != null &&
      limite > LIMITE_COMANDA_PADRAO
    ) {
      await assertPermission(PERMISSIONS.BAR_MANAGE)
    }

    type MembroLite = { id: string; userId: string; nome: string }
    let membro: MembroLite | null = null
    if (tipo === 'MEMBRO') {
      membro = await db.saasMembro.findFirst({
        where: {
          id: membroId!,
          tenantId: tenant.id,
          sedeId: unidade.id,
          status: 'APROVADO',
        },
        select: { id: true, userId: true, nome: true },
      })
      if (!membro) {
        return { success: false, error: 'Membro titular inválido para esta unidade' }
      }
    }

    const comandaId: string = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const codigoEmUso: { id: string } | null = await tx.barComanda.findFirst({
        where: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          codigo,
          status: 'ABERTA',
        },
        select: { id: true },
      })
      if (codigoEmUso) throw new Error('Já existe uma comanda aberta com este código')

      if (membro) {
        const abertaMembro: { id: string } | null = await tx.barComanda.findFirst({
          where: {
            tenantId: tenant.id,
            sedeId: unidade.id,
            titularMembroId: membro.id,
            status: 'ABERTA',
          },
          select: { id: true },
        })
        if (abertaMembro) throw new Error('Este membro já tem uma comanda aberta nesta unidade')
      }

      const criada: { id: string } = await tx.barComanda.create({
        data: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          codigo,
          tipo,
          status: 'ABERTA',
          titularUserId: membro?.userId ?? null,
          titularMembroId: membro?.id ?? null,
          titularNome: tipo === 'MEMBRO' ? membro!.nome : titularNome!,
          limite: limite ?? null,
          total: 0,
          totalPago: 0,
          desconto: 0,
          turnoAberturaId: turno.id,
          abertaEm: new Date(),
          abertaPorId: session.user.id!,
        },
        select: { id: true },
      })
      return criada.id
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_ABERTA',
        entidade: 'BarComanda',
        entidadeId: comandaId,
        detalhes: { codigo, tipo, membroId: membro?.id ?? null, limite: limite ?? null },
      },
    })

    revalidateBarComanda(tenant.id)
    return { success: true, comandaId }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao abrir comanda' }
  }
}

/** Lança itens numa comanda ABERTA (BarVenda EM_COMANDA + baixa estoque). */
export async function lancarItensComandaBar(
  input: unknown,
): Promise<LancarItensComandaBarResult> {
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ])
    const { session, tenant, permissoesEfetivas, isSuperAdmin } = authz
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const podeLiberar =
      Boolean(isSuperAdmin) ||
      (permissoesEfetivas != null && hasPermission(permissoesEfetivas, PERMISSIONS.BAR_MANAGE))

    const parsed = LancarItensComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { comandaId, itens } = parsed.data

    const turno = await getTurnoAbertoBar(tenant.id, unidade.id)
    if (!turno) {
      return { success: false, error: 'Abra um turno de caixa antes de lançar itens' }
    }

    const porProduto = new Map<string, number>()
    for (const item of itens) {
      porProduto.set(item.produtoId, (porProduto.get(item.produtoId) ?? 0) + item.quantidade)
    }

    type Resultado = { vendaId: string; totalComanda: number; avisoLimitePct: number | null }

    const result: Resultado = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const comanda = await assertComandaUnidade(tx, {
        comandaId,
        tenantId: tenant.id,
        sedeId: unidade.id,
      })
      if (comanda.status !== 'ABERTA') throw new Error('Só é possível lançar em comanda aberta')

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

      const resumo = resumirVenda(linhas, 0)
      const limite = resolverLimiteComanda(comanda.limite)
      const limCheck = avaliarLimiteLancamento({
        totalAtual: Number(comanda.total),
        valorNovo: resumo.total,
        limite,
        podeLiberar,
      })
      if (!limCheck.ok) throw new Error(limCheck.error)

      // EM_COMANDA: baixa estoque, sem receita, metodoPagamento null.
      const venda: { id: string } = await tx.barVenda.create({
        data: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          comandaId: comanda.id,
          turnoId: turno.id,
          operadorId: session.user.id!,
          subtotal: resumo.subtotal,
          desconto: 0,
          total: resumo.total,
          metodoPagamento: null,
          status: 'EM_COMANDA' as StatusVendaBar,
          financeiroLancamentoId: null,
          itens: { create: linhas },
        },
        select: { id: true },
      })

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

      const totalComanda = await recalcularTotaisComanda(tx, comanda.id)
      return {
        vendaId: venda.id,
        totalComanda,
        avisoLimitePct: limCheck.avisoPct,
      }
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_ITEM_LANCADO',
        entidade: 'BarComanda',
        entidadeId: comandaId,
        detalhes: {
          vendaId: result.vendaId,
          totalComanda: result.totalComanda,
          liberadoManage: podeLiberar,
        },
      },
    })

    revalidateBarComanda(tenant.id)
    return {
      success: true,
      vendaId: result.vendaId,
      totalComanda: result.totalComanda,
      avisoLimitePct: result.avisoLimitePct,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao lançar itens' }
  }
}

/** Remove lançamento EM_COMANDA (devolve estoque ENTRADA). Gate bar:manage. */
export async function removerLancamentoComandaBar(
  input: unknown,
): Promise<BarComandaActionState & { totalComanda?: number }> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = RemoverLancamentoComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { vendaId, motivo } = parsed.data

    type VendaRow = {
      id: string
      comandaId: string | null
      status: StatusVendaBar
      total: Prisma.Decimal
      operadorId: string
      itens: Array<{ produtoId: string | null; quantidade: number }>
    }

    const result: { comandaId: string; totalComanda: number; operadorVendaId: string } =
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const venda: VendaRow | null = await tx.barVenda.findFirst({
          where: { id: vendaId, tenantId: tenant.id, sedeId: unidade.id },
          select: {
            id: true,
            comandaId: true,
            status: true,
            total: true,
            operadorId: true,
            itens: { select: { produtoId: true, quantidade: true } },
          },
        })
        if (!venda || !venda.comandaId) throw new Error('Lançamento não encontrado')
        if (venda.status !== 'EM_COMANDA') {
          throw new Error('Só é possível remover lançamentos em comanda')
        }

        const comanda = await assertComandaUnidade(tx, {
          comandaId: venda.comandaId,
          tenantId: tenant.id,
          sedeId: unidade.id,
        })
        if (comanda.status !== 'ABERTA') {
          throw new Error('Só é possível remover lançamentos de comanda aberta')
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
              sedeId: unidade.id,
              produtoId: item.produtoId,
              tipo: 'ENTRADA',
              quantidade: item.quantidade,
              motivo: `Remoção de lançamento — ${motivo}`,
              vendaId: venda.id,
              operadorId: session.user.id,
            },
          })
        }

        await tx.barVenda.update({
          where: { id: venda.id },
          data: { status: 'CANCELADA' },
        })

        const totalComanda = await recalcularTotaisComanda(tx, comanda.id)
        return {
          comandaId: comanda.id,
          totalComanda,
          operadorVendaId: venda.operadorId,
        }
      })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_ITEM_REMOVIDO',
        entidade: 'BarComanda',
        entidadeId: result.comandaId,
        detalhes: {
          vendaId,
          motivo,
          totalComanda: result.totalComanda,
          operadorVendaId: result.operadorVendaId,
        },
      },
    })

    // Mesma janela/limiar dos estornos — remoção + estorno do operador original.
    const desde = new Date(Date.now() - JANELA_ESTORNOS_ANOMALO_DIAS * 24 * 60 * 60 * 1000)
    const [estornos, remocoes]: [number, number] = await Promise.all([
      db.barVenda.count({
        where: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          operadorId: result.operadorVendaId,
          status: 'ESTORNADA',
          estornadoEm: { gte: desde },
        },
      }),
      db.auditLog.count({
        where: {
          tenantId: tenant.id,
          acao: 'BAR_COMANDA_ITEM_REMOVIDO',
          criadoEm: { gte: desde },
          detalhes: { path: ['operadorVendaId'], equals: result.operadorVendaId },
        },
      }),
    ])
    if (estornos + remocoes >= LIMIAR_ESTORNOS_ANOMALO) {
      await notificarUsuariosComPermissao(PERMISSIONS.BAR_MANAGE, {
        tenantId: tenant.id,
        tipo: 'BAR_ESTORNO_ANOMALO',
        titulo: 'Padrão anômalo de estornos/remoções detectado',
        corpo: `${estornos + remocoes} estornos/remoções do mesmo operador em ${unidade.nome} nos últimos ${JANELA_ESTORNOS_ANOMALO_DIAS} dias.`,
        link: '/admin/bar',
        atorId: session.user.id,
        excetoUserId: session.user.id,
      })
    }

    revalidateBarComanda(tenant.id)
    return { success: true, totalComanda: result.totalComanda }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao remover lançamento' }
  }
}

/**
 * Fecha comanda ABERTA.
 * Dinheiro/Cartão → CONFIRMADO + FinanceiroLancamento na hora.
 * PIX → PENDENTE; status só vira FECHADA_PAGA quando todos confirmarem (webhook).
 */
export async function fecharComandaBar(input: unknown): Promise<FecharComandaBarResult> {
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ])
    const { session, tenant, permissoesEfetivas, isSuperAdmin } = authz
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const isManage =
      Boolean(isSuperAdmin) ||
      (permissoesEfetivas != null && hasPermission(permissoesEfetivas, PERMISSIONS.BAR_MANAGE))

    const parsed = FecharComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { comandaId, desconto, motivoDesconto, pagamentos, vencimento } = parsed.data

    if (desconto > 0) {
      if (!isManage) {
        return { success: false, error: 'Desconto exige permissão de gerenciar o bar' }
      }
      if (!motivoDesconto) {
        return { success: false, error: 'Informe o motivo do desconto' }
      }
    }

    const turno = await getTurnoAbertoBar(tenant.id, unidade.id)
    if (!turno) {
      return { success: false, error: 'Abra um turno de caixa antes de fechar a comanda' }
    }

    type PixPendente = {
      pagamentoId: string
      valor: number
    }

    type TxResult = {
      status: string
      pixPendentes: PixPendente[]
      descontoAplicado: number
      totalPagoConfirmado: number
    }

    const txResult: TxResult = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const comanda = await assertComandaUnidade(tx, {
        comandaId,
        tenantId: tenant.id,
        sedeId: unidade.id,
      })
      if (comanda.status !== 'ABERTA') throw new Error('Comanda não está aberta')

      const ativos: number = await tx.barVenda.count({
        where: { comandaId: comanda.id, status: 'EM_COMANDA' },
      })
      if (ativos < 1) {
        throw new Error('Comanda sem consumo — cancele em vez de fechar')
      }

      // Garante total fresco antes do saldo.
      const total = await recalcularTotaisComanda(tx, comanda.id)
      const descontoEfetivo = round2(Math.min(desconto, total))
      if (descontoEfetivo > total) throw new Error('Desconto maior que o total')

      const jaPago = Number(comanda.totalPago)
      const somaPagamentos = round2(pagamentos.reduce((acc, p) => acc + p.valor, 0))
      const totalPagoProjetado = round2(jaPago + somaPagamentos)
      const saldoApos = saldoComanda({
        total,
        desconto: descontoEfetivo,
        totalPago: totalPagoProjetado,
      })
      const temPix = pagamentos.some((p) => p.metodo === 'PIX')

      // PIX pendente + débito no mesmo fechamento: ambíguo (webhook só completa
      // FECHADA_PAGA). Exija quitar o saldo com métodos presenciais ou PIX integral.
      if (temPix && saldoApos > 0) {
        throw new Error(
          'Não é possível fechar com débito enquanto houver PIX — cubra o total ou use Dinheiro/Cartão no restante',
        )
      }

      if (saldoApos > 0) {
        if (!isManage) {
          throw new Error('Fechar com débito exige permissão de gerenciar o bar')
        }
        if (comanda.tipo !== 'MEMBRO') {
          throw new Error('Comanda avulsa não pode fechar com débito')
        }
        if (!vencimento) {
          throw new Error('Informe o vencimento do débito')
        }
      }

      let vencimentoDate: Date | null = null
      if (saldoApos > 0) {
        vencimentoDate = new Date(vencimento!)
        if (Number.isNaN(vencimentoDate.getTime())) {
          throw new Error('Vencimento do débito inválido')
        }
      }

      if (descontoEfetivo > 0) {
        await tx.barComanda.update({
          where: { id: comanda.id },
          data: { desconto: descontoEfetivo },
        })
      }

      const pixPendentes: PixPendente[] = []
      let confirmadoNestaTx = 0

      for (const pag of pagamentos) {
        const isPix = pag.metodo === 'PIX'
        if (isPix) {
          const criado: { id: string } = await tx.barComandaPagamento.create({
            data: {
              comandaId: comanda.id,
              metodoPagamento: pag.metodo as MetodoPagamentoBar,
              valor: pag.valor,
              recebidoEm: new Date(),
              turnoId: turno.id,
              operadorId: session.user.id!,
              status: 'PENDENTE',
            },
            select: { id: true },
          })
          pixPendentes.push({ pagamentoId: criado.id, valor: pag.valor })
        } else {
          const lanc: { id: string } = await tx.financeiroLancamento.create({
            data: {
              tenantId: tenant.id,
              tipo: 'RECEITA',
              categoria: 'BAR',
              valor: pag.valor,
              descricao: `Pagamento comanda ${comanda.codigo}`.slice(0, 240),
              data: new Date(),
              observacao: `${pag.metodo} — comanda ${comanda.codigo}`,
              criadoPorId: session.user.id!,
            },
            select: { id: true },
          })
          await tx.barComandaPagamento.create({
            data: {
              comandaId: comanda.id,
              metodoPagamento: pag.metodo as MetodoPagamentoBar,
              valor: pag.valor,
              recebidoEm: new Date(),
              turnoId: turno.id,
              operadorId: session.user.id!,
              status: 'CONFIRMADO',
              pagoEm: new Date(),
              financeiroLancamentoId: lanc.id,
            },
          })
          confirmadoNestaTx = round2(confirmadoNestaTx + pag.valor)
        }
      }

      const novoTotalPago = round2(jaPago + confirmadoNestaTx)
      await tx.barComanda.update({
        where: { id: comanda.id },
        data: { totalPago: novoTotalPago },
      })

      const saldoConfirmado = saldoComanda({
        total,
        desconto: descontoEfetivo,
        totalPago: novoTotalPago,
      })

      // Com PIX pendente: permanece ABERTA (não fecha até webhook).
      let statusFinal = comanda.status as string
      if (pixPendentes.length === 0) {
        if (saldoConfirmado <= 0) {
          statusFinal = 'FECHADA_PAGA'
          await tx.barComanda.update({
            where: { id: comanda.id },
            data: {
              status: 'FECHADA_PAGA',
              fechadaEm: new Date(),
              fechadaPorId: session.user.id!,
              turnoFechamentoId: turno.id,
              desconto: descontoEfetivo,
            },
          })
        } else {
          statusFinal = 'FECHADA_COM_DEBITO'
          await tx.barComanda.update({
            where: { id: comanda.id },
            data: {
              status: 'FECHADA_COM_DEBITO',
              fechadaEm: new Date(),
              fechadaPorId: session.user.id!,
              turnoFechamentoId: turno.id,
              vencimento: vencimentoDate,
              desconto: descontoEfetivo,
            },
          })
        }
      } else if (descontoEfetivo > 0) {
        // Desconto já gravado; aguarda PIX para fechar.
        await tx.barComanda.update({
          where: { id: comanda.id },
          data: { desconto: descontoEfetivo },
        })
      }

      return {
        status: statusFinal,
        pixPendentes,
        descontoAplicado: descontoEfetivo,
        totalPagoConfirmado: novoTotalPago,
      }
    })

    // Cobranças PIX fora da tx (espelha registrarVendaBar).
    const pixOut: Array<{
      pagamentoId: string
      copiaCola: string
      externalId: string
      provider: string
    }> = []

    for (const pend of txResult.pixPendentes) {
      try {
        const cobranca = await criarCobrancaPixComandaBar({
          pagamentoId: pend.pagamentoId,
          tenantSlug: tenant.slug,
          valor: pend.valor,
          descricao: `Comanda bar`,
          payerEmail: session.user.email,
        })
        await db.barComandaPagamento.update({
          where: { id: pend.pagamentoId },
          data: {
            gatewayProvider: cobranca.provider,
            gatewayExternalId: cobranca.externalId,
            pixCopiaCola: cobranca.copiaCola,
          },
        })
        pixOut.push({
          pagamentoId: pend.pagamentoId,
          copiaCola: cobranca.copiaCola,
          externalId: cobranca.externalId,
          provider: cobranca.provider,
        })
      } catch {
        await db.barComandaPagamento.update({
          where: { id: pend.pagamentoId },
          data: { status: 'CANCELADO' },
        })
        return {
          success: false,
          error: 'Não foi possível gerar a cobrança PIX. Tente novamente.',
        }
      }
    }

    if (txResult.descontoAplicado > 0) {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: session.user.id,
          acao: 'BAR_COMANDA_DESCONTO',
          entidade: 'BarComanda',
          entidadeId: comandaId,
          detalhes: { desconto: txResult.descontoAplicado, motivo: motivoDesconto },
        },
      })
    }

    if (pagamentos.length > 0) {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: session.user.id,
          acao: 'BAR_COMANDA_PAGAMENTO',
          entidade: 'BarComanda',
          entidadeId: comandaId,
          detalhes: {
            pagamentos: pagamentos.map((p) => ({ metodo: p.metodo, valor: p.valor })),
            totalPagoConfirmado: txResult.totalPagoConfirmado,
          },
        },
      })
    }

    if (txResult.status !== 'ABERTA') {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: session.user.id,
          acao: 'BAR_COMANDA_FECHADA',
          entidade: 'BarComanda',
          entidadeId: comandaId,
          detalhes: {
            status: txResult.status,
            desconto: txResult.descontoAplicado,
            totalPago: txResult.totalPagoConfirmado,
            vencimento: vencimento ?? null,
          },
        },
      })
    }

    revalidateBarComanda(tenant.id)
    if (txResult.totalPagoConfirmado > 0) revalidateFinanceiro()

    if (pixOut.length > 0) {
      return { success: true, status: txResult.status, pix: pixOut }
    }
    return { success: true, status: txResult.status }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao fechar comanda' }
  }
}

/** Quita (parcial ou total) débito FECHADA_COM_DEBITO / VENCIDA. Gate bar:manage. */
export async function quitarComandaBar(input: unknown): Promise<QuitarComandaBarResult> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = QuitarComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { comandaId, metodo, valor } = parsed.data

    if (metodo === 'PIX') {
      // Quitação com PIX: cria PENDENTE e devolve cobranca — confirmação via webhook.
      // Para MVP da fase 2, exigimos método presencial na quitação (espelha fiado).
      // TODO fase 3: PIX na quitação com poll/mock.
      return {
        success: false,
        error: 'Quitação via PIX ainda não suportada nesta fase — use Dinheiro ou Cartão',
      }
    }

    const turno = await getTurnoAbertoBar(tenant.id, unidade.id)

    type QuitarTx = { status: string; saldo: number }
    const result: QuitarTx = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const comanda = await assertComandaUnidade(tx, {
        comandaId,
        tenantId: tenant.id,
        sedeId: unidade.id,
      })
      if (comanda.status !== 'FECHADA_COM_DEBITO' && comanda.status !== 'VENCIDA') {
        throw new Error('Só é possível quitar comandas com débito em aberto')
      }

      const saldoAtual = saldoComanda({
        total: Number(comanda.total),
        desconto: Number(comanda.desconto),
        totalPago: Number(comanda.totalPago),
      })
      if (saldoAtual <= 0) throw new Error('Comanda sem saldo em aberto')
      if (valor > saldoAtual + 0.001) {
        throw new Error(`Valor excede o saldo (R$ ${saldoAtual.toFixed(2)})`)
      }

      const lanc: { id: string } = await tx.financeiroLancamento.create({
        data: {
          tenantId: tenant.id,
          tipo: 'RECEITA',
          categoria: 'BAR',
          valor,
          descricao: `Quitação comanda ${comanda.codigo}`.slice(0, 240),
          data: new Date(),
          observacao: `${metodo} — quitação comanda ${comanda.codigo}`,
          criadoPorId: session.user.id!,
        },
        select: { id: true },
      })

      await tx.barComandaPagamento.create({
        data: {
          comandaId: comanda.id,
          metodoPagamento: metodo as MetodoPagamentoBar,
          valor,
          recebidoEm: new Date(),
          turnoId: turno?.id ?? null,
          operadorId: session.user.id!,
          status: 'CONFIRMADO',
          pagoEm: new Date(),
          financeiroLancamentoId: lanc.id,
        },
      })

      const novoTotalPago = round2(Number(comanda.totalPago) + valor)
      const novoSaldo = saldoComanda({
        total: Number(comanda.total),
        desconto: Number(comanda.desconto),
        totalPago: novoTotalPago,
      })

      let status = comanda.status as string
      if (novoSaldo <= 0) {
        status = 'QUITADA'
        await tx.barComanda.update({
          where: { id: comanda.id },
          data: { totalPago: novoTotalPago, status: 'QUITADA', pagoEm: new Date() },
        })
      } else {
        await tx.barComanda.update({
          where: { id: comanda.id },
          data: { totalPago: novoTotalPago },
        })
      }

      return { status, saldo: Math.max(0, novoSaldo) }
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_QUITADA',
        entidade: 'BarComanda',
        entidadeId: comandaId,
        detalhes: { metodo, valor, status: result.status, saldo: result.saldo },
      },
    })

    revalidateBarComanda(tenant.id)
    revalidateFinanceiro()
    if (result.status === 'QUITADA') {
      await reconciliarNotificacoesDoEvento(tenant.id, {
        tipo: 'BAR_COMANDA_VENCIDA',
        link: `/admin/bar/comandas?comanda=${comandaId}`,
      })
    }
    return { success: true, status: result.status, saldo: result.saldo }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao quitar comanda' }
  }
}

/**
 * Cancela comanda ABERTA sem consumo, ou perdão de débito
 * (FECHADA_COM_DEBITO/VENCIDA) — sem estornar estoque.
 */
export async function cancelarComandaBar(input: unknown): Promise<BarComandaActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = CancelarComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { comandaId, motivo } = parsed.data

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const comanda = await assertComandaUnidade(tx, {
        comandaId,
        tenantId: tenant.id,
        sedeId: unidade.id,
      })

      if (comanda.status === 'ABERTA') {
        const ativos: number = await tx.barVenda.count({
          where: { comandaId: comanda.id, status: 'EM_COMANDA' },
        })
        if (ativos > 0) {
          throw new Error(
            'Comanda com consumo: remova os lançamentos ou feche antes de cancelar',
          )
        }
      } else if (
        comanda.status !== 'FECHADA_COM_DEBITO' &&
        comanda.status !== 'VENCIDA'
      ) {
        throw new Error('Só é possível cancelar comanda aberta (vazia) ou com débito')
      }

      // Débito: NÃO devolve estoque (perdão de dívida).
      await tx.barComanda.update({
        where: { id: comanda.id },
        data: {
          status: 'CANCELADA',
          canceladaEm: new Date(),
          motivoCancelamento: motivo,
        },
      })
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_CANCELADA',
        entidade: 'BarComanda',
        entidadeId: comandaId,
        detalhes: { motivo },
      },
    })

    revalidateBarComanda(tenant.id)
    await reconciliarNotificacoesDoEvento(tenant.id, {
      tipo: 'BAR_COMANDA_VENCIDA',
      link: `/admin/bar/comandas?comanda=${comandaId}`,
    })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao cancelar comanda' }
  }
}

/** Eleva o limite da comanda. Gate bar:manage. */
export async function liberarLimiteComandaBar(input: unknown): Promise<BarComandaActionState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE)
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

    const parsed = LiberarLimiteComandaBarSchema.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
    }
    const { comandaId, novoLimite } = parsed.data

    const limiteAnterior = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const comanda = await assertComandaUnidade(tx, {
        comandaId,
        tenantId: tenant.id,
        sedeId: unidade.id,
      })
      if (comanda.status !== 'ABERTA') {
        throw new Error('Só é possível liberar limite de comanda aberta')
      }

      const efetivo =
        novoLimite ??
        round2(Math.max(Number(comanda.total), LIMITE_COMANDA_PADRAO))

      // AVULSO acima do padrão: já estamos em manage — permitido (§5.3 item 12).
      await tx.barComanda.update({
        where: { id: comanda.id },
        data: { limite: efetivo },
      })
      return { anterior: comanda.limite != null ? Number(comanda.limite) : null, novo: efetivo }
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_LIMITE_LIBERADO',
        entidade: 'BarComanda',
        entidadeId: comandaId,
        detalhes: limiteAnterior,
      },
    })

    revalidateBarComanda(tenant.id)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao liberar limite' }
  }
}

/**
 * Confirma PIX mock de um BarComandaPagamento (dev/demo).
 * Espelha confirmarPixMockBar.
 */
export async function confirmarPixMockComandaBar(
  pagamentoId: string,
): Promise<BarComandaActionState> {
  try {
    const { session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ])

    if (getPixProvider() !== 'mock') {
      return { error: 'Confirmação manual só disponível no modo mock' }
    }
    if (!pagamentoId || typeof pagamentoId !== 'string') {
      return { error: 'Pagamento inválido' }
    }

    type PagLite = {
      id: string
      status: string
      gatewayProvider: string | null
    }
    const pag: PagLite | null = await db.barComandaPagamento.findFirst({
      where: { id: pagamentoId, comanda: { tenantId: tenant.id } },
      select: { id: true, status: true, gatewayProvider: true },
    })
    if (!pag) return { error: 'Pagamento não encontrado' }
    if (pag.status === 'CONFIRMADO') return { success: true }
    if (pag.status === 'CANCELADO') return { error: 'Pagamento cancelado' }
    if (pag.gatewayProvider && pag.gatewayProvider !== 'mock') {
      return { error: 'Cobrança não é mock' }
    }

    const signature = assinarWebhookMockComandaBar(pag.id)
    if (!verificarWebhookMockComandaBar(pag.id, signature)) {
      return { error: 'Assinatura inválida' }
    }

    const result = await confirmarPagamentoComandaBar({
      tenantId: tenant.id,
      pagamentoId: pag.id,
      atorId: session.user.id,
    })
    if (!result.ok) return { error: result.error }

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'BAR_COMANDA_PAGAMENTO',
        entidade: 'BarComandaPagamento',
        entidadeId: pag.id,
        detalhes: { mock: true },
      },
    })

    revalidateBarComanda(tenant.id)
    revalidateFinanceiro()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao confirmar PIX da comanda' }
  }
}

/** Status da comanda para polling (após PIX no fechamento). */
export async function consultarStatusComandaBar(
  comandaId: string,
): Promise<
  | { success: true; status: string; totalPago: number; saldo: number }
  | { success: false; error: string }
> {
  try {
    const { tenant, session } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ])
    if (!comandaId || typeof comandaId !== 'string') {
      return { success: false, error: 'Comanda inválida' }
    }
    const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
    const comanda = await assertComandaUnidade(db, {
      comandaId,
      tenantId: tenant.id,
      sedeId: unidade.id,
    })
    const saldo = saldoComanda({
      total: Number(comanda.total),
      desconto: Number(comanda.desconto),
      totalPago: Number(comanda.totalPago),
    })
    return {
      success: true,
      status: comanda.status,
      totalPago: Number(comanda.totalPago),
      saldo,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao consultar comanda' }
  }
}
