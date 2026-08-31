/**
 * Rastro de entrada do cadastro (sócio/torcedor): de qual unidade veio e por
 * qual canal (convite, onboarding, importação…). A unidade de solicitação já
 * existia no espelho (`aprovadoNaUnidadeNome`); o canal passa a ser gravado em
 * `AuditLog.detalhes.origem` no CADASTRO_SOLICITADO.
 */

export const ORIGEM_CANAIS = [
  'convite',
  'onboarding',
  'associe-se',
  'importacao',
  'upgrade_torcedor',
  'portal',
] as const

export type OrigemCanal = (typeof ORIGEM_CANAIS)[number]

export const ORIGEM_CANAL_LABEL: Record<OrigemCanal, string> = {
  convite: 'Link de convite',
  onboarding: 'Onboarding',
  'associe-se': 'Associe-se',
  importacao: 'Importação',
  upgrade_torcedor: 'Upgrade de torcedor',
  portal: 'Cadastro no portal',
}

export type OrigemExibicao = {
  /** Unidade de onde o vínculo nasceu (PDE/Subsede) ou "Nesta unidade". */
  unidadeNome: string
  canal: OrigemCanal | null
  canalLabel: string | null
  /** true = espelho na Sede cujo pedido veio de outra unidade. */
  viaUnidade: boolean
}

export function isOrigemCanal(valor: unknown): valor is OrigemCanal {
  return typeof valor === 'string' && (ORIGEM_CANAIS as readonly string[]).includes(valor)
}

/** Lê `detalhes.origem` de um AuditLog de cadastro. */
export function canalDeAuditDetalhes(detalhes: unknown): OrigemCanal | null {
  if (!detalhes || typeof detalhes !== 'object') return null
  const origem = (detalhes as { origem?: unknown }).origem
  return isOrigemCanal(origem) ? origem : null
}

export function canalDeEntrada(opts: {
  viaConvite: boolean
  origemAssocieSe?: boolean
}): OrigemCanal {
  if (opts.viaConvite) return 'convite'
  if (opts.origemAssocieSe) return 'associe-se'
  return 'onboarding'
}

export function resolverOrigemExibicao(input: {
  aprovadoNaUnidadeNome?: string | null
  espelhado?: boolean
  importacaoId?: string | null
  origemCanal?: OrigemCanal | null
}): OrigemExibicao {
  const unidade = input.aprovadoNaUnidadeNome?.trim() || null
  const viaUnidade = Boolean(input.espelhado && unidade)
  const canal: OrigemCanal | null =
    input.origemCanal ?? (input.importacaoId ? 'importacao' : null)
  return {
    unidadeNome: unidade ?? (input.espelhado ? 'Unidade de origem' : 'Nesta unidade'),
    canal,
    canalLabel: canal ? ORIGEM_CANAL_LABEL[canal] : null,
    viaUnidade,
  }
}

export type LogRecrutamentoLite = {
  entidadeId: string | null
  acao: string
  detalhes: unknown
}

/**
 * Resume a trilha de cadastro já carregada pela listagem (tentativas, último
 * motivo de reprovação, canal de entrada). `logs` deve vir do mais novo para
 * o mais antigo — o mesmo `orderBy: { criadoEm: 'desc' }` das páginas.
 */
export function resumirLogsRecrutamento(logs: readonly LogRecrutamentoLite[]): {
  tentativasPorMembro: Map<string, number>
  motivoReprovacaoPorMembro: Map<string, string>
  origemCanalPorMembro: Map<string, OrigemCanal>
} {
  const tentativasPorMembro = new Map<string, number>()
  const motivoReprovacaoPorMembro = new Map<string, string>()
  const origemCanalPorMembro = new Map<string, OrigemCanal>()

  for (const log of logs) {
    if (!log.entidadeId) continue
    if (log.acao === 'CADASTRO_SOLICITADO' || log.acao === 'RECADASTRO_SOLICITADO') {
      tentativasPorMembro.set(
        log.entidadeId,
        (tentativasPorMembro.get(log.entidadeId) ?? 0) + 1,
      )
    }
    if (log.acao === 'MEMBRO_REPROVADO' && !motivoReprovacaoPorMembro.has(log.entidadeId)) {
      const detalhes = log.detalhes
      if (
        detalhes &&
        typeof detalhes === 'object' &&
        'motivo' in detalhes &&
        typeof (detalhes as { motivo: unknown }).motivo === 'string'
      ) {
        motivoReprovacaoPorMembro.set(
          log.entidadeId,
          (detalhes as { motivo: string }).motivo,
        )
      }
    }
  }

  // Canal de entrada = o CADASTRO_SOLICITADO mais antigo com origem conhecida.
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const log = logs[i]
    if (!log?.entidadeId || log.acao !== 'CADASTRO_SOLICITADO') continue
    if (origemCanalPorMembro.has(log.entidadeId)) continue
    const canal = canalDeAuditDetalhes(log.detalhes)
    if (canal) origemCanalPorMembro.set(log.entidadeId, canal)
  }

  return { tentativasPorMembro, motivoReprovacaoPorMembro, origemCanalPorMembro }
}
