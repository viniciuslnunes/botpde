import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  saudeOrcamento,
  STATUS_PROJETO_ABERTOS,
} from '@torcida/types'
import { resumirFinanceiro } from '@/lib/financeiro'
import { resumirInadimplencia } from '@/lib/cobrancas-insights'
import { listarCobrancasTenant } from '@/lib/cobrancas'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import { slaLabel, type AdminInboxItem } from '@/lib/admin-inbox'

const DIA_MS = 24 * 60 * 60 * 1000
const LIMITE_INBOX = 8
const JANELA_ORFAOS_DIAS = 90

export type DirecaoProjetoAlerta = {
  id: string
  titulo: string
  percentual: number
  realizado: number
  previsto: number
  href: string
}

export type FinanceiroDirecao = {
  saldo7d: number
  saldo30d: number
  inadimplencia: {
    quantidade: number
    valor: number
    taxa: number | null
    d7Quantidade: number
  }
  orfaosRateio: number
  projetosAlerta: DirecaoProjetoAlerta[]
  pendencias: AdminInboxItem[]
}

async function fetchDirecaoFinanceiro(tenantId: string): Promise<FinanceiroDirecao> {
  const agora = new Date()
  const desdeOrfaos = new Date(agora.getTime() - JANELA_ORFAOS_DIAS * DIA_MS)
  const ha7 = new Date(agora.getTime() - 7 * DIA_MS)
  const ha30 = new Date(agora.getTime() - 30 * DIA_MS)
  const dataAte = formatDataCompetenciaInput(agora)
  const dataDe7 = formatDataCompetenciaInput(ha7)
  const dataDe30 = formatDataCompetenciaInput(ha30)

  type ProjetoRow = {
    id: string
    titulo: string
    departamento: { slug: string }
    orcamentoPrevisto: { toNumber(): number } | number | null
  }
  type SomaProjeto = { projetoId: string | null; _sum: { valor: unknown } }
  type ResumoLite = { saldo: number }

  const [resumo7d, resumo30d, inad, cobrancasVencidas, projetosAbertos, orfaosRateio]: [
    ResumoLite,
    ResumoLite,
    Awaited<ReturnType<typeof resumirInadimplencia>>,
    Awaited<ReturnType<typeof listarCobrancasTenant>>,
    ProjetoRow[],
    number,
  ] = await Promise.all([
    resumirFinanceiro(tenantId, { dataDe: dataDe7, dataAte }),
    resumirFinanceiro(tenantId, { dataDe: dataDe30, dataAte }),
    resumirInadimplencia(tenantId),
    listarCobrancasTenant(tenantId, { status: 'VENCIDA', limite: 24 }),
    db.projeto.findMany({
      where: {
        tenantId,
        status: { in: [...STATUS_PROJETO_ABERTOS] },
        orcamentoPrevisto: { not: null, gt: 0 },
      },
      orderBy: { titulo: 'asc' },
      take: 80,
      select: {
        id: true,
        titulo: true,
        orcamentoPrevisto: true,
        departamento: { select: { slug: true } },
      },
    }),
    db.financeiroLancamento.count({
      where: {
        tenantId,
        tipo: 'DESPESA',
        departamentoId: null,
        data: { gte: desdeOrfaos },
      },
    }),
  ])

  const idsProjeto = projetosAbertos.map((p) => p.id)
  const somas: SomaProjeto[] =
    idsProjeto.length === 0
      ? []
      : await db.financeiroLancamento.groupBy({
          by: ['projetoId'],
          where: { tenantId, tipo: 'DESPESA', projetoId: { in: idsProjeto } },
          _sum: { valor: true },
        })
  const gastoPorId = new Map<string, number>()
  for (const s of somas) {
    if (s.projetoId) gastoPorId.set(s.projetoId, Number(s._sum.valor ?? 0))
  }

  const projetosAlerta: DirecaoProjetoAlerta[] = []
  for (const p of projetosAbertos) {
    const previsto =
      p.orcamentoPrevisto == null
        ? null
        : typeof p.orcamentoPrevisto === 'number'
          ? p.orcamentoPrevisto
          : p.orcamentoPrevisto.toNumber()
    const realizado = gastoPorId.get(p.id) ?? 0
    const saude = saudeOrcamento(realizado, previsto)
    if (!saude?.estourou || previsto == null) continue
    projetosAlerta.push({
      id: p.id,
      titulo: p.titulo,
      percentual: saude.percentual,
      realizado,
      previsto,
      href: `/portal/departamentos/${p.departamento.slug}#projetos`,
    })
  }
  projetosAlerta.sort((a, b) => b.percentual - a.percentual)

  let d7Quantidade = 0
  const pendencias: AdminInboxItem[] = []

  for (const c of cobrancasVencidas) {
    const dias = Math.floor((agora.getTime() - c.vencimento.getTime()) / DIA_MS)
    if (dias >= 7) d7Quantidade += 1
  }

  const ordenadas = [...cobrancasVencidas].sort((a, b) => {
    const diasA = Math.floor((agora.getTime() - a.vencimento.getTime()) / DIA_MS)
    const diasB = Math.floor((agora.getTime() - b.vencimento.getTime()) / DIA_MS)
    if (diasA >= 7 !== diasB >= 7) return diasA >= 7 ? -1 : 1
    return a.vencimento.getTime() - b.vencimento.getTime()
  })

  for (const c of ordenadas.slice(0, LIMITE_INBOX)) {
    const dias = Math.floor((agora.getTime() - c.vencimento.getTime()) / DIA_MS)
    const nome = c.user.nome?.trim() || c.user.email || 'Associado'
    const valor = formatarMoedaBRL(Number(c.valor))
    const sla = slaLabel(c.vencimento, { agora, modo: 'idade' })
    pendencias.push({
      id: `cob-${c.id}`,
      titulo:
        dias >= 7
          ? `${nome} · ${sla} · ${valor}`
          : `${nome} · vencida · ${valor}`,
      detalhe: `${c.descricao} · venceu em ${formatDataCompetenciaInput(c.vencimento)}`,
      href: '/admin/financeiro/cobrancas?status=VENCIDA',
      tom: dias >= 7 ? 'danger' : 'warning',
      sla,
      acao: { tipo: 'baixar_cobranca', cobrancaId: c.id, label: 'Dar baixa' },
    })
  }

  for (const p of projetosAlerta.slice(0, 4)) {
    pendencias.push({
      id: `proj-${p.id}`,
      titulo: `Orçamento estourado · ${p.titulo}`,
      detalhe: `${formatarMoedaBRL(p.realizado)} de ${formatarMoedaBRL(p.previsto)} previsto (${p.percentual}%)`,
      href: p.href,
      tom: 'danger',
    })
  }

  if (orfaosRateio > 0) {
    pendencias.push({
      id: 'orfaos-rateio',
      titulo: `${orfaosRateio} despesa${orfaosRateio === 1 ? '' : 's'} sem departamento`,
      detalhe: `Últimos ${JANELA_ORFAOS_DIAS} dias — rateie para ver gasto por área.`,
      href: '/admin/financeiro/lancamentos?tipo=DESPESA',
      tom: 'warning',
    })
  }

  return {
    saldo7d: resumo7d.saldo,
    saldo30d: resumo30d.saldo,
    inadimplencia: {
      quantidade: inad.quantidadeEmAtraso,
      valor: inad.valorEmAtraso,
      taxa: inad.taxaInadimplencia,
      d7Quantidade,
    },
    orfaosRateio,
    projetosAlerta: projetosAlerta.slice(0, 6),
    pendencias,
  }
}

/**
 * Posto de comando do Financeiro admin — agrega o que o tesoureiro precisa
 * agir hoje. Lê só; mutações e sync de vencidas ficam em Server Action.
 * Cache TTL ~45s (S3.6).
 */
export const carregarDirecaoFinanceiro = cache(async function carregarDirecaoFinanceiro(
  tenantId: string,
): Promise<FinanceiroDirecao> {
  return unstable_cache(
    () => fetchDirecaoFinanceiro(tenantId),
    ['admin-direcao-financeiro', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
