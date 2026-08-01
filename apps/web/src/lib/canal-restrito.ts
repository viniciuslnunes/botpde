import 'server-only'
import { cache } from 'react'
import { db } from '@torcida/db'
import type { StatusReativacaoCanal } from '@torcida/db'
import {
  PRAZO_REATIVACAO_DIAS,
  getTenantsRestritos,
  prazoReativacaoAPartirDe,
} from '@/lib/isolamento'

/**
 * R5 — canal restrito: estado apresentável do isolamento de uma unidade e a
 * máquina de estados da solicitação de reativação enviada pela Sede.
 *
 * O corte de visibilidade em si vive em `lib/isolamento.ts` (lido pelo motor de
 * hierarquia). Aqui mora o que a UI e as Server Actions precisam saber: quem
 * fechou, quando, se existe pedido em aberto e quanto tempo falta.
 */

export { PRAZO_REATIVACAO_DIAS, prazoReativacaoAPartirDe }

export interface SolicitacaoReativacaoLite {
  id: string
  solicitanteTenantId: string
  solicitadoPorNome: string | null
  mensagem: string | null
  prazoEm: Date
  criadoEm: Date
  /** Milissegundos até o prazo; 0 quando já venceu. */
  restanteMs: number
}

export interface EstadoCanalRestrito {
  tenantId: string
  /** Estado EFETIVO — já desconta a expiração automática do prazo. */
  restrito: boolean
  desde: Date | null
  /** Solicitação da Sede ainda em aberto, se houver. */
  solicitacaoPendente: SolicitacaoReativacaoLite | null
  /** Última decisão registrada (recusa/imposição), para contexto na UI. */
  ultimaDecisao: {
    status: StatusReativacaoCanal
    motivo: string | null
    decididoEm: Date | null
  } | null
}

const ESTADO_ABERTO: Omit<EstadoCanalRestrito, 'tenantId'> = {
  restrito: false,
  desde: null,
  solicitacaoPendente: null,
  ultimaDecisao: null,
}

interface TenantEstadoRow {
  id: string
  canalRestrito: boolean
  canalRestritoDesde: Date | null
}

interface SolicitacaoRow {
  id: string
  tenantId: string
  solicitanteTenantId: string
  mensagem: string | null
  prazoEm: Date
  criadoEm: Date
  status: StatusReativacaoCanal
  motivo: string | null
  decididoEm: Date | null
  solicitadoPorId: string | null
}

function toSolicitacaoLite(
  row: SolicitacaoRow,
  agora: number,
  nomes: Map<string, string | null>,
): SolicitacaoReativacaoLite {
  return {
    id: row.id,
    solicitanteTenantId: row.solicitanteTenantId,
    solicitadoPorNome: row.solicitadoPorId ? (nomes.get(row.solicitadoPorId) ?? null) : null,
    mensagem: row.mensagem,
    prazoEm: row.prazoEm,
    criadoEm: row.criadoEm,
    restanteMs: Math.max(0, row.prazoEm.getTime() - agora),
  }
}

/**
 * Estado do canal de vários tenants em duas queries — usado pela listagem de
 * unidades da Sede (`/admin/sedes`, `/admin/torcida`) sem N+1.
 */
export const getEstadoCanalRestritoEmLote = cache(
  async (tenantIds: string[]): Promise<Map<string, EstadoCanalRestrito>> => {
    const estado = new Map<string, EstadoCanalRestrito>()
    for (const id of tenantIds) estado.set(id, { tenantId: id, ...ESTADO_ABERTO })
    if (tenantIds.length === 0) return estado

    const [tenants, solicitacoes, restritos]: [
      TenantEstadoRow[],
      SolicitacaoRow[],
      Set<string>,
    ] = await Promise.all([
      db.tenant.findMany({
        where: { id: { in: tenantIds }, canalRestrito: true },
        select: { id: true, canalRestrito: true, canalRestritoDesde: true },
      }),
      db.solicitacaoReativacaoCanal.findMany({
        where: { tenantId: { in: tenantIds } },
        orderBy: { criadoEm: 'desc' },
        // Só interessam a pendente atual e a última decisão de cada unidade —
        // o histórico completo cresce sem teto e não é lido aqui.
        take: Math.min(tenantIds.length * 10 + 20, 300),
        select: {
          id: true,
          tenantId: true,
          solicitanteTenantId: true,
          mensagem: true,
          prazoEm: true,
          criadoEm: true,
          status: true,
          motivo: true,
          decididoEm: true,
          // `SolicitacaoReativacaoCanal` guarda só o id do autor (sem relação
          // com `User`) — o nome é resolvido depois, e apenas para as pendentes.
          solicitadoPorId: true,
        },
      }),
      getTenantsRestritos(),
    ])

    const agora = Date.now()

    // Só a pendente em prazo mostra autor na UI — buscar nome de todo o
    // histórico seria desperdício.
    const autoresPendentes = [
      ...new Set(
        solicitacoes
          .filter((s) => s.status === 'PENDENTE' && s.prazoEm.getTime() > agora)
          .map((s) => s.solicitadoPorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const nomes = new Map<string, string | null>()
    if (autoresPendentes.length > 0) {
      const autores: { id: string; nome: string | null }[] = await db.user.findMany({
        where: { id: { in: autoresPendentes } },
        select: { id: true, nome: true },
      })
      for (const a of autores) nomes.set(a.id, a.nome)
    }

    for (const t of tenants) {
      estado.set(t.id, {
        tenantId: t.id,
        // O estado efetivo vem de `getTenantsRestritos`, não da coluna crua:
        // um prazo vencido já reativa a unidade antes do cron materializar.
        restrito: restritos.has(t.id),
        desde: t.canalRestritoDesde,
        solicitacaoPendente: null,
        ultimaDecisao: null,
      })
    }

    for (const s of solicitacoes) {
      const atual = estado.get(s.tenantId)
      if (!atual) continue
      if (s.status === 'PENDENTE') {
        // Pedido vencido não é mais "pendente" para o usuário — o canal já voltou.
        if (s.prazoEm.getTime() <= agora) continue
        if (!atual.solicitacaoPendente)
          atual.solicitacaoPendente = toSolicitacaoLite(s, agora, nomes)
        continue
      }
      if (!atual.ultimaDecisao) {
        atual.ultimaDecisao = {
          status: s.status,
          motivo: s.motivo,
          decididoEm: s.decididoEm,
        }
      }
    }

    return estado
  },
)

export const getEstadoCanalRestrito = cache(
  async (tenantId: string): Promise<EstadoCanalRestrito> => {
    const mapa = await getEstadoCanalRestritoEmLote([tenantId])
    return mapa.get(tenantId) ?? { tenantId, ...ESTADO_ABERTO }
  },
)

/**
 * Solicitação PENDENTE e ainda dentro do prazo — a única que a liderança pode
 * responder. Vencida, a resposta perde o objeto: o canal já foi reaberto.
 */
export async function getSolicitacaoRespondivel(
  tenantId: string,
): Promise<{ id: string; solicitanteTenantId: string; prazoEm: Date } | null> {
  const pendente: { id: string; solicitanteTenantId: string; prazoEm: Date } | null =
    await db.solicitacaoReativacaoCanal.findFirst({
      where: { tenantId, status: 'PENDENTE', prazoEm: { gt: new Date() } },
      orderBy: { criadoEm: 'desc' },
      select: { id: true, solicitanteTenantId: true, prazoEm: true },
    })
  return pendente
}

/** Existe pedido em aberto? Impede a Sede de empilhar solicitações. */
export async function temSolicitacaoEmAberto(tenantId: string): Promise<boolean> {
  return (await getSolicitacaoRespondivel(tenantId)) !== null
}
