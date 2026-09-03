import 'server-only'

import { db } from '@torcida/db'
import {
  competenciaMensalAtual,
  deveDispararRegua,
  deveGerarCobrancasHoje,
  parseFinanceiroCiclo,
} from '@torcida/types'

/**
 * Gera cobranças de mensalidade para sócios com plano ativo — idempotente por
 * competência `YYYY-MM` na descrição.
 */
export async function gerarCobrancasRecorrentesTenant(tenantId: string, agora = new Date()) {
  const tenant: { financeiroCiclo: unknown } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { financeiroCiclo: true },
  })
  if (!tenant) return { geradas: 0, ignoradas: 0 }

  const ciclo = parseFinanceiroCiclo(tenant.financeiroCiclo)
  if (!deveGerarCobrancasHoje(ciclo, agora)) return { geradas: 0, ignoradas: 0 }

  const competencia = competenciaMensalAtual(agora)
  const vencimento = new Date(agora)
  vencimento.setDate(vencimento.getDate() + ciclo.diasParaVencimento)

  type MembroRow = {
    userId: string
    id: string
    planoAssociacao: { id: string; nome: string; valor: { toNumber(): number } | number } | null
  }

  const membros: MembroRow[] = await db.saasMembro.findMany({
    where: {
      tenantId,
      status: 'APROVADO',
      desligadoEm: null,
      tipo: 'SOCIO',
      planoAssociacaoId: { not: null },
      planoAssociacao: { ativo: true },
    },
    select: {
      userId: true,
      id: true,
      planoAssociacao: { select: { id: true, nome: true, valor: true } },
    },
  })

  let geradas = 0
  let ignoradas = 0

  for (const m of membros) {
    if (!m.planoAssociacao) continue
    const descricao = `Mensalidade ${competencia} — ${m.planoAssociacao.nome}`
    const existente = await db.cobrancaAssociacao.findFirst({
      where: {
        tenantId,
        userId: m.userId,
        tipo: 'MENSALIDADE',
        descricao,
      },
      select: { id: true },
    })
    if (existente) {
      ignoradas += 1
      continue
    }

    const valor =
      typeof m.planoAssociacao.valor === 'number'
        ? m.planoAssociacao.valor
        : m.planoAssociacao.valor.toNumber()

    await db.cobrancaAssociacao.create({
      data: {
        tenantId,
        userId: m.userId,
        membroId: m.id,
        planoAssociacaoId: m.planoAssociacao.id,
        tipo: 'MENSALIDADE',
        descricao,
        valor,
        vencimento,
        status: 'PENDENTE',
      },
    })
    geradas += 1
  }

  return { geradas, ignoradas }
}

/** Régua: lembretes em D+0, D+7, D+14 conforme config do tenant. */
export async function dispararReguaCobrancasTenant(tenantId: string, agora = new Date()) {
  const tenant: { financeiroCiclo: unknown } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { financeiroCiclo: true },
  })
  if (!tenant) return 0

  const ciclo = parseFinanceiroCiclo(tenant.financeiroCiclo)
  if (!ciclo.ativo) return 0

  const abertas: Array<{ id: string; userId: string; descricao: string; vencimento: Date }> =
    await db.cobrancaAssociacao.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      select: { id: true, userId: true, descricao: true, vencimento: true },
      take: 500,
    })

  const { criarNotificacoesEmLote } = await import('@/lib/notificacoes')
  /** @type {Array<{ userId: string, tenantId: string, tipo: 'COBRANCA_VENCIDA', titulo: string, corpo: string, link: string }>} */
  const batch = []

  for (const c of abertas) {
    if (!deveDispararRegua(ciclo, c.vencimento, agora)) continue
    batch.push({
      userId: c.userId,
      tenantId,
      tipo: 'COBRANCA_VENCIDA' as const,
      titulo: 'Lembrete de cobrança',
      corpo: c.descricao,
      link: `/portal/cobrancas/${c.id}`,
    })
  }

  if (batch.length === 0) return 0
  return criarNotificacoesEmLote(batch)
}

export async function executarCicloFinanceiroTodosTenants(agora = new Date()) {
  const tenants: Array<{ id: string }> = await db.tenant.findMany({
    where: { ativo: true, sintetico: false },
    select: { id: true },
  })

  let geradas = 0
  let regua = 0
  for (const t of tenants) {
    const g = await gerarCobrancasRecorrentesTenant(t.id, agora)
    geradas += g.geradas
    regua += await dispararReguaCobrancasTenant(t.id, agora)
  }
  return { tenants: tenants.length, geradas, regua }
}
