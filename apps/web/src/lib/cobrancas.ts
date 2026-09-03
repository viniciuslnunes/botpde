import 'server-only'
import { cache } from 'react'
import { db, Prisma } from '@torcida/db'
import type { StatusCobrancaAssociacao } from '@torcida/db'

export type CobrancaLite = {
  id: string
  userId: string
  membroId: string | null
  tipo: string
  descricao: string
  valor: Prisma.Decimal
  vencimento: Date
  status: StatusCobrancaAssociacao
  pagoEm: Date | null
  metodoPagamento: string | null
  pixCopiaCola: string | null
  gatewayProvider: string | null
  planoAssociacao: { id: string; nome: string } | null
  user: { id: string; nome: string | null; email: string | null }
}

/** Marca cobranças PENDENTE com vencimento passado como VENCIDA e avisa. */
export async function sincronizarCobrancasVencidas(tenantId: string): Promise<number> {
  const agora = new Date()
  const vencendo: Array<{ id: string; userId: string; descricao: string }> =
    await db.cobrancaAssociacao.findMany({
      where: {
        tenantId,
        status: 'PENDENTE',
        vencimento: { lt: agora },
      },
      select: { id: true, userId: true, descricao: true },
    })
  if (vencendo.length === 0) return 0

  await db.cobrancaAssociacao.updateMany({
    where: { id: { in: vencendo.map((c) => c.id) } },
    data: { status: 'VENCIDA' },
  })

  try {
    const { criarNotificacoesEmLote, listarDestinatariosAdmin } = await import(
      '@/lib/notificacoes'
    )
    const { PERMISSIONS } = await import('@torcida/types')

    await criarNotificacoesEmLote(
      vencendo.map((c) => ({
        userId: c.userId,
        tenantId,
        tipo: 'COBRANCA_VENCIDA' as const,
        titulo: 'Cobrança vencida',
        corpo: c.descricao,
        link: `/portal/cobrancas/${c.id}`,
      })),
    )

    const destinosAdmin = await listarDestinatariosAdmin(tenantId, PERMISSIONS.FINANCE_MANAGE)
    await criarNotificacoesEmLote(
      destinosAdmin.flatMap((userId) =>
        vencendo.map((c) => ({
          userId,
          tenantId,
          tipo: 'COBRANCA_VENCIDA' as const,
          titulo: 'Cobrança vencida',
          corpo: c.descricao,
          link: `/admin/financeiro/cobrancas?status=VENCIDA&cobranca=${c.id}`,
        })),
      ),
    )
  } catch {
    // Fan-out é best-effort: o status já virou VENCIDA.
  }

  return vencendo.length
}

/**
 * Recalcula `SaasMembro.adimplente` a partir de cobranças abertas (PENDENTE/VENCIDA)
 * e de pendência de cadastro dispensada sem completar (`lib/pendencias-cadastro`).
 */
export async function recalcularAdimplencia(
  tenantId: string,
  userId: string,
): Promise<boolean> {
  type Agg = { id: string }
  const abertas: Agg[] = await db.cobrancaAssociacao.findMany({
    where: {
      tenantId,
      userId,
      status: { in: ['PENDENTE', 'VENCIDA'] },
    },
    select: { id: true },
    take: 1,
  })
  // Import dinâmico evita ciclo cobrancas ↔ pendencias-cadastro-server.
  const { membroInadimplentePorCadastroDispensado } = await import(
    '@/lib/pendencias-cadastro-server'
  )
  const porCadastro = await membroInadimplentePorCadastroDispensado(tenantId, userId)
  const adimplente = abertas.length === 0 && !porCadastro
  await db.saasMembro.updateMany({
    where: { tenantId, userId },
    data: { adimplente },
  })
  return adimplente
}

export const listarCobrancasTenant = cache(async function listarCobrancasTenant(
  tenantId: string,
  opts?: { status?: StatusCobrancaAssociacao; userId?: string; limite?: number },
): Promise<CobrancaLite[]> {
  await sincronizarCobrancasVencidas(tenantId)
  const rows: CobrancaLite[] = await db.cobrancaAssociacao.findMany({
    where: {
      tenantId,
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.userId ? { userId: opts.userId } : {}),
    },
    orderBy: [{ status: 'asc' }, { vencimento: 'asc' }],
    take: opts?.limite ?? 40,
    select: {
      id: true,
      userId: true,
      membroId: true,
      tipo: true,
      descricao: true,
      valor: true,
      vencimento: true,
      status: true,
      pagoEm: true,
      metodoPagamento: true,
      pixCopiaCola: true,
      gatewayProvider: true,
      planoAssociacao: { select: { id: true, nome: true } },
      user: { select: { id: true, nome: true, email: true } },
    },
  })
  return rows
})

export async function baixarCobrancaComoPaga(input: {
  tenantId: string
  cobrancaId: string
  atorId: string
  metodo: 'MANUAL' | 'PIX'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  type Row = {
    id: string
    userId: string
    membroId: string | null
    status: StatusCobrancaAssociacao
    valor: Prisma.Decimal
    descricao: string
    financeiroLancamentoId: string | null
    eventoId: string | null
    tipo: string
  }
  const cob: Row | null = await db.cobrancaAssociacao.findFirst({
    where: { id: input.cobrancaId, tenantId: input.tenantId },
    select: {
      id: true,
      userId: true,
      membroId: true,
      status: true,
      valor: true,
      descricao: true,
      financeiroLancamentoId: true,
      eventoId: true,
      tipo: true,
    },
  })
  if (!cob) return { ok: false, error: 'Cobrança não encontrada' }
  if (cob.status === 'CANCELADA') return { ok: false, error: 'Cobrança cancelada' }
  if (cob.status === 'PAGA') {
    if (cob.tipo === 'MENSALIDADE') {
      const { registrarSinalConfiancaSafe } = await import('@/lib/confianca')
      registrarSinalConfiancaSafe({
        userId: cob.userId,
        tenantId: input.tenantId,
        sinal: 'MENSALIDADE',
        origemId: cob.id,
      })
    }
    return { ok: true }
  }

  // Vaga de caravana: lotação segura = PAGOs. Se o ônibus já está cheio,
  // não deixa baixar outra vaga (a pessoa fica CONFIRMADA com cobrança pendente).
  if (cob.eventoId) {
    const evento: {
      valorVaga: { toNumber(): number } | number | null
      capacidade: number | null
      sede: { capacidade: number | null } | null
    } | null = await db.evento.findFirst({
      where: { id: cob.eventoId, tenantId: input.tenantId },
      select: {
        valorVaga: true,
        capacidade: true,
        sede: { select: { capacidade: true } },
      },
    })
    if (evento) {
      const valorVagaNum =
        evento.valorVaga == null
          ? null
          : typeof evento.valorVaga === 'number'
            ? evento.valorVaga
            : evento.valorVaga.toNumber()
      const { capacidadeEfetiva, lotacaoCheia, contarOcupacaoEvento } = await import(
        '@/lib/eventos-capacidade'
      )
      const { temValorVaga } = await import('@torcida/types')
      if (temValorVaga(valorVagaNum)) {
        const ocupados = await contarOcupacaoEvento({
          tenantId: input.tenantId,
          eventoId: cob.eventoId,
          valorVaga: valorVagaNum,
        })
        const cap = capacidadeEfetiva(evento)
        if (lotacaoCheia(ocupados, cap)) {
          return {
            ok: false,
            error: 'Lotação esgotada — não há mais vagas pagas disponíveis nesta caravana.',
          }
        }
      }
    }
  }

  // Vaga de caravana (eventoId setado) vai para categoria CARAVANA — mensalidade
  // e adesão continuam MENSALIDADE. Sem isso o livro-caixa misturava as duas.
  const categoria = cob.eventoId ? 'CARAVANA' : 'MENSALIDADE'

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    let lancamentoId = cob.financeiroLancamentoId
    if (!lancamentoId) {
      const lanc = await tx.financeiroLancamento.create({
        data: {
          tenantId: input.tenantId,
          tipo: 'RECEITA',
          categoria,
          valor: cob.valor,
          descricao: cob.descricao,
          data: new Date(),
          observacao: `Baixa ${input.metodo} — cobrança ${cob.id}`,
          // Vaga paga é receita DAQUELA operação: sem isto, a arrecadação da
          // caravana entrava no caixa solta e o resultado da viagem nunca
          // fechava contra o custo do fretamento.
          eventoId: cob.eventoId ?? null,
          criadoPorId: input.atorId,
        },
        select: { id: true },
      })
      lancamentoId = lanc.id
    }

    await tx.cobrancaAssociacao.update({
      where: { id: cob.id },
      data: {
        status: 'PAGA',
        pagoEm: new Date(),
        metodoPagamento: input.metodo,
        financeiroLancamentoId: lancamentoId,
      },
    })
  })

  await recalcularAdimplencia(input.tenantId, cob.userId)
  await reconciliarNotificacoesCobranca(input.tenantId, cob.id)
  if (cob.tipo === 'MENSALIDADE') {
    const { registrarSinalConfiancaSafe } = await import('@/lib/confianca')
    registrarSinalConfiancaSafe({
      userId: cob.userId,
      tenantId: input.tenantId,
      sinal: 'MENSALIDADE',
      origemId: cob.id,
    })
  }
  return { ok: true }
}

/** Marca lidas as notificações desta cobrança (devedor + gestores). */
export async function reconciliarNotificacoesCobranca(
  tenantId: string,
  cobrancaId: string,
): Promise<void> {
  try {
    const { reconciliarNotificacoesDoEvento } = await import('@/lib/notificacoes')
    await reconciliarNotificacoesDoEvento(tenantId, {
      tipos: ['COBRANCA_PENDENTE', 'COBRANCA_VENCIDA'],
      links: [
        `/portal/cobrancas/${cobrancaId}`,
        `/admin/financeiro/cobrancas?cobranca=${cobrancaId}`,
        `/admin/financeiro/cobrancas?status=VENCIDA&cobranca=${cobrancaId}`,
      ],
    })
  } catch {
    // best-effort
  }
}
