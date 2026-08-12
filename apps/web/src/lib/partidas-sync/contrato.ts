/**
 * Contrato do provedor de jogos (decisão #7) — parte **pura**, sem rede e sem
 * banco. Quem consome o sync não sabe qual provedor respondeu.
 *
 * Vive em `partidas-sync/` e não em `partidas/` porque `lib/partidas.ts` já
 * existe (leitura de `Partida` para a Agenda) e um diretório de mesmo nome
 * disputaria o especificador `@/lib/partidas`.
 *
 * Ver `docs/data/integracao-api-football.md` e `ARCHITECTURE.md` §5.26.
 */

export type StatusPartida = 'AGENDADA' | 'AO_VIVO' | 'ENCERRADA' | 'CANCELADA'
export type MandoJogo = 'CASA' | 'FORA'

/** Uma partida normalizada, pronta para virar `Partida`. */
export type PartidaExterna = {
  /** `fixture.id` do provedor → `Partida.fonteExternalId`. */
  fonteExternalId: string
  /** Id externo do clube da casa e do visitante (para casar com `Afiliacao`). */
  timeCasaExternalId: string
  timeForaExternalId: string
  adversarioCasa: string
  adversarioFora: string
  dataHora: Date
  competicao: string | null
  local: string | null
  status: StatusPartida
  placarCasa: number | null
  placarFora: number | null
}

export type JanelaSync = { de: Date; ate: Date }

export type Provedor = {
  nome: string
  listarPartidas(params: {
    competicoes: number[]
    janela: JanelaSync
    temporada: number
  }): Promise<PartidaExterna[]>
}

/**
 * `fixture.status.short` → nosso enum.
 *
 * `PST` (adiado) volta a ser AGENDADA de propósito: o provedor regrava a data,
 * e tratar como cancelada apagaria da Agenda um jogo que só mudou de dia.
 * `SUSP`/`INT` seguem AO_VIVO porque a partida ainda não terminou.
 */
const STATUS_POR_CODIGO: Record<string, StatusPartida> = {
  TBD: 'AGENDADA',
  NS: 'AGENDADA',
  PST: 'AGENDADA',
  '1H': 'AO_VIVO',
  HT: 'AO_VIVO',
  '2H': 'AO_VIVO',
  ET: 'AO_VIVO',
  P: 'AO_VIVO',
  LIVE: 'AO_VIVO',
  SUSP: 'AO_VIVO',
  INT: 'AO_VIVO',
  FT: 'ENCERRADA',
  AET: 'ENCERRADA',
  PEN: 'ENCERRADA',
  AWD: 'ENCERRADA',
  WO: 'ENCERRADA',
  CANC: 'CANCELADA',
  ABD: 'CANCELADA',
}

/**
 * Status desconhecido cai em AGENDADA — o provedor adiciona códigos novos sem
 * avisar, e sumir com o jogo da Agenda é pior que mostrá-lo como agendado.
 */
export function mapearStatus(codigo: string | null | undefined): StatusPartida {
  if (!codigo) return 'AGENDADA'
  return STATUS_POR_CODIGO[codigo.toUpperCase()] ?? 'AGENDADA'
}

/**
 * Mando é derivação nossa: a API não tem o conceito de "nosso clube".
 * @param timeCasaExternalId id externo do mandante no fixture
 * @param nossoExternalId `Afiliacao.apiExternalId` do clube da torcida
 */
export function derivarMando(timeCasaExternalId: string, nossoExternalId: string): MandoJogo {
  return timeCasaExternalId === nossoExternalId ? 'CASA' : 'FORA'
}

/**
 * Dados de `Partida` do ponto de vista de UM clube nosso.
 * Um fixture Corinthians × Palmeiras vira duas Partidas quando as duas torcidas
 * estão na plataforma — uma por `Afiliacao`, com mando e placar espelhados.
 */
export function paraPartida(
  externa: PartidaExterna,
  nossoExternalId: string,
): {
  adversario: string
  competicao: string | null
  dataHora: Date
  local: string | null
  mando: MandoJogo
  placarCasa: number | null
  placarFora: number | null
  status: StatusPartida
  fonteExternalId: string
} {
  const mando = derivarMando(externa.timeCasaExternalId, nossoExternalId)
  return {
    adversario: mando === 'CASA' ? externa.adversarioFora : externa.adversarioCasa,
    competicao: externa.competicao,
    dataHora: externa.dataHora,
    local: externa.local,
    mando,
    placarCasa: externa.placarCasa,
    placarFora: externa.placarFora,
    status: externa.status,
    fonteExternalId: externa.fonteExternalId,
  }
}

/**
 * Janela padrão do sync: passado curto fecha placar de jogos recém-terminados;
 * futuro cobre o horizonte de planejamento de caravana.
 */
export function janelaPadrao(agora = new Date(), diasAtras = 7, diasFrente = 30): JanelaSync {
  const de = new Date(agora)
  de.setDate(de.getDate() - diasAtras)
  const ate = new Date(agora)
  ate.setDate(ate.getDate() + diasFrente)
  return { de, ate }
}

/**
 * Tolerância para reconhecer que uma `Partida` cadastrada à mão é o mesmo jogo
 * que veio do provedor. Três horas cobrem erro de digitação de horário e
 * mudança de fuso sem colidir com o jogo seguinte do mesmo clube.
 */
export const JANELA_ADOCAO_MS = 3 * 60 * 60 * 1000

/**
 * A partida manual `candidata` é o mesmo jogo que `externa`?
 *
 * Sem isto, todo tenant que já usava a Agenda veria o jogo duplicado no dia
 * seguinte ao primeiro sync: o registro manual não tem `fonteExternalId`, então
 * o unique do banco não impede o insert.
 */
export function ehMesmoJogo(
  candidata: { dataHora: Date; adversario: string; fonteExternalId: string | null },
  externa: { dataHora: Date; adversario: string },
): boolean {
  if (candidata.fonteExternalId) return false
  const delta = Math.abs(candidata.dataHora.getTime() - externa.dataHora.getTime())
  if (delta > JANELA_ADOCAO_MS) return false
  return normalizarAdversario(candidata.adversario) === normalizarAdversario(externa.adversario)
}

/** Compara nome de adversário ignorando acento, caixa e ruído de pontuação. */
export function normalizarAdversario(nome: string): string {
  return String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
