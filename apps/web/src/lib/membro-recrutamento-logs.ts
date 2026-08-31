import 'server-only'

import { db } from '@torcida/db'
import {
  resumirLogsRecrutamento,
  type LogRecrutamentoLite,
} from '@/lib/membro-origem'

/**
 * Trilha de cadastro da página: tentativas, motivo da última reprovação e
 * canal de entrada. Uma query por página — nunca por linha.
 */
export async function carregarResumoRecrutamento(
  tenantId: string,
  membroIds: string[],
): Promise<ReturnType<typeof resumirLogsRecrutamento>> {
  if (membroIds.length === 0) {
    return {
      tentativasPorMembro: new Map(),
      motivoReprovacaoPorMembro: new Map(),
      origemCanalPorMembro: new Map(),
    }
  }

  const logs: LogRecrutamentoLite[] = await db.auditLog.findMany({
    where: {
      tenantId,
      entidade: 'SaasMembro',
      entidadeId: { in: membroIds },
      acao: {
        in: ['CADASTRO_SOLICITADO', 'RECADASTRO_SOLICITADO', 'MEMBRO_REPROVADO'],
      },
    },
    orderBy: { criadoEm: 'desc' },
    select: { entidadeId: true, acao: true, detalhes: true },
  })

  return resumirLogsRecrutamento(logs)
}
