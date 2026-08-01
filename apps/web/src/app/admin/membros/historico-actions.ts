'use server'

import { db } from '@torcida/db'
import { assertAnyPermission } from '@/lib/authz'
import { labelAcaoAuditoria } from '@/lib/audit-labels'
import {
  labelCategoriaReprovacao,
  labelPontoReprovacao,
  PERMISSIONS,
} from '@torcida/types'

export type MembroHistoricoDetalhe = { label: string; valor: string }

export type MembroHistoricoEntrada = {
  id: string
  acao: string
  acaoLabel: string
  quandoLabel: string
  atorNome: string
  atorEmail: string | null
  /** `solicitante` = o próprio dono do cadastro; `sistema` = sem ator (jobs). */
  atorTipo: 'admin' | 'solicitante' | 'sistema'
  detalhes: MembroHistoricoDetalhe[]
}

export type MembroHistoricoResultado =
  | { ok: true; entradas: MembroHistoricoEntrada[] }
  | { ok: false; error: string }

const HISTORICO_LIMITE = 100

/**
 * Ações gravadas contra `User` que pertencem a este cadastro. Lista fechada de
 * propósito: `entidade: 'User'` também guarda coisas de outra natureza
 * (moderação, conta), que não são histórico do vínculo com a torcida.
 */
const ACOES_ACESSO = ['ACESSO_USUARIO_ATUALIZADO']

/** Ids internos que não dizem nada para quem lê o histórico. */
const CHAVES_IGNORADAS = new Set([
  'membroOrigemId',
  'espelhoId',
  'decididoEmTenantId',
  'departamentoId',
  'origemTenantId',
  'sedeIdAntes',
  'sedeIdDepois',
])

const CHAVE_LABEL: Record<string, string> = {
  motivo: 'Justificativa',
  categoria: 'Tipo de problema',
  pontos: 'Etapas apontadas',
  permiteReenvio: 'Reenvio permitido',
  incluirDepartamento: 'Incluído no departamento',
  automatico: 'Sincronização automática',
}

function formatarQuando(d: Date): string {
  return new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function humanizarChave(chave: string): string {
  const espacado = chave.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return espacado.charAt(0).toUpperCase() + espacado.slice(1).toLowerCase()
}

function alteracoesLegiveis(valor: unknown): MembroHistoricoDetalhe[] | null {
  if (!Array.isArray(valor)) return null
  const saida: MembroHistoricoDetalhe[] = []
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue
    const linha = item as { campo?: unknown; de?: unknown; para?: unknown }
    if (typeof linha.campo !== 'string') continue
    const de = typeof linha.de === 'string' && linha.de ? linha.de : '—'
    const para = typeof linha.para === 'string' && linha.para ? linha.para : '—'
    saida.push({ label: linha.campo, valor: `${de} → ${para}` })
  }
  return saida
}

/** Traduz o JSON de `AuditLog.detalhes` em pares rótulo/valor para leitura. */
function descreverDetalhes(detalhes: unknown): MembroHistoricoDetalhe[] {
  if (!detalhes || typeof detalhes !== 'object' || Array.isArray(detalhes)) return []
  const saida: MembroHistoricoDetalhe[] = []

  for (const [chave, valor] of Object.entries(detalhes as Record<string, unknown>)) {
    if (CHAVES_IGNORADAS.has(chave)) continue
    if (valor === null || valor === undefined || valor === '') continue

    if (chave === 'alteracoes') {
      const linhas = alteracoesLegiveis(valor)
      if (linhas && linhas.length > 0) saida.push(...linhas)
      continue
    }

    if (chave === 'categoria' && typeof valor === 'string') {
      saida.push({ label: CHAVE_LABEL.categoria, valor: labelCategoriaReprovacao(valor) ?? valor })
      continue
    }

    if (chave === 'pontos') {
      if (!Array.isArray(valor) || valor.length === 0) continue
      saida.push({
        label: CHAVE_LABEL.pontos,
        valor: valor
          .filter((p): p is string => typeof p === 'string')
          .map((p) => labelPontoReprovacao(p))
          .join(', '),
      })
      continue
    }

    const label = CHAVE_LABEL[chave] ?? humanizarChave(chave)
    if (typeof valor === 'boolean') {
      saida.push({ label, valor: valor ? 'Sim' : 'Não' })
      continue
    }
    if (typeof valor === 'string' || typeof valor === 'number') {
      saida.push({ label, valor: String(valor) })
    }
  }

  return saida
}

/**
 * Histórico de alterações do cadastro (aba "Histórico" do card de detalhes).
 * Lê o AuditLog do tenant atual para o registro e seu gêmeo espelho — cobre
 * tanto ações de administradores quanto do próprio solicitante (cadastro e
 * reenvios).
 */
export async function listarHistoricoMembro(
  membroId: string,
): Promise<MembroHistoricoResultado> {
  const { tenant } = await assertAnyPermission([
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_APPROVE,
  ])

  type MembroRef = {
    id: string
    userId: string
    membroOrigemId: string | null
    membroEspelho: { id: string } | null
  }
  const membro: MembroRef | null = await db.saasMembro.findFirst({
    where: { id: membroId, tenantId: tenant.id },
    select: {
      id: true,
      userId: true,
      membroOrigemId: true,
      membroEspelho: { select: { id: true } },
    },
  })
  if (!membro) return { ok: false, error: 'Membro não encontrado.' }

  const entidadeIds = [membro.id, membro.membroOrigemId, membro.membroEspelho?.id ?? null].filter(
    (id): id is string => !!id,
  )

  type LogRow = {
    id: string
    acao: string
    criadoEm: Date
    detalhes: unknown
    atorId: string | null
    ator: { nome: string | null; email: string | null } | null
  }
  const selectLog = {
    id: true,
    acao: true,
    criadoEm: true,
    detalhes: true,
    atorId: true,
    ator: { select: { nome: true, email: true } },
  }

  // O histórico é o do CADASTRO, mas cargo/área/permissão são gravados contra
  // o `User` (é o usuário que tem acesso, não a ficha). Sem esta segunda
  // leitura, mexer no acesso pela aba Acessos não deixaria rastro nenhum aqui.
  const [logsMembro, logsAcesso]: [LogRow[], LogRow[]] = await Promise.all([
    db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entidade: 'SaasMembro',
        entidadeId: { in: entidadeIds },
      },
      orderBy: { criadoEm: 'desc' },
      take: HISTORICO_LIMITE,
      select: selectLog,
    }),
    db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entidade: 'User',
        entidadeId: membro.userId,
        acao: { in: ACOES_ACESSO },
      },
      orderBy: { criadoEm: 'desc' },
      take: HISTORICO_LIMITE,
      select: selectLog,
    }),
  ])

  const logs: LogRow[] = [...logsMembro, ...logsAcesso]
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
    .slice(0, HISTORICO_LIMITE)

  return {
    ok: true,
    entradas: logs.map((log) => ({
      id: log.id,
      acao: log.acao,
      acaoLabel: labelAcaoAuditoria(log.acao),
      quandoLabel: formatarQuando(log.criadoEm),
      atorNome: log.ator?.nome?.trim() || log.ator?.email || 'Sistema',
      atorEmail: log.ator?.nome?.trim() ? (log.ator?.email ?? null) : null,
      atorTipo: !log.atorId
        ? ('sistema' as const)
        : log.atorId === membro.userId
          ? ('solicitante' as const)
          : ('admin' as const),
      detalhes: descreverDetalhes(log.detalhes),
    })),
  }
}
