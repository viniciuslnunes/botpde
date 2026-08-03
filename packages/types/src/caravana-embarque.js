/**
 * Cruzamento pagamento da vaga × embarque no dia da viagem.
 *
 * RSVP, cobrança AVULSA e check-in já existem em trilhos separados. Este
 * módulo **compõe** o status operacional. Políticas:
 * - Check-in: default avisa e permite; com `checkInExigePagamento` bloqueia
 *   (override do gestor).
 * - Lotação com `valorVaga`: vaga segura = cobrança PAGA (CONFIRMADO sem
 *   pagar é intenção, não ocupa o ônibus).
 */

/** @typedef {'NAO_APLICA' | 'PAGO' | 'PENDENTE' | 'SEM_COBRANCA' | 'CANCELADA' | 'VENCIDA'} StatusPagamentoVaga */
/** @typedef {'EMBARCADO' | 'AGUARDANDO'} StatusEmbarque */

/**
 * @typedef {{
 *   pagamento: StatusPagamentoVaga,
 *   embarque: StatusEmbarque,
 *   alerta: boolean,
 *   labelPagamento: string,
 * }} StatusVagaEmbarque
 */

/** @type {Readonly<Record<StatusPagamentoVaga, { label: string, tom: 'neutral' | 'success' | 'warning' | 'danger' }>>} */
export const STATUS_PAGAMENTO_VAGA = Object.freeze({
  NAO_APLICA: { label: 'Sem cobrança', tom: 'neutral' },
  PAGO: { label: 'Pago', tom: 'success' },
  PENDENTE: { label: 'Pendente', tom: 'warning' },
  SEM_COBRANCA: { label: 'Sem cobrança', tom: 'warning' },
  CANCELADA: { label: 'Cancelada', tom: 'danger' },
  VENCIDA: { label: 'Vencida', tom: 'danger' },
})

/**
 * Valor de vaga cobrado? `null`/0/negativo = caravana sem preço (embarque livre).
 *
 * @param {number | string | null | undefined} valorVaga
 * @returns {boolean}
 */
export function temValorVaga(valorVaga) {
  if (valorVaga == null || valorVaga === '') return false
  const n = typeof valorVaga === 'number' ? valorVaga : Number(valorVaga)
  return Number.isFinite(n) && n > 0
}

/**
 * Caravana paga: lotação conta quem **pagou**, não quem só confirmou RSVP.
 *
 * @param {number | string | null | undefined} valorVaga
 * @returns {boolean}
 */
export function lotacaoPorPagamento(valorVaga) {
  return temValorVaga(valorVaga)
}

/**
 * Hard-block no check-in? Precisa flag do evento + vaga cobrada + status em alerta.
 *
 * @param {{
 *   checkInExigePagamento?: boolean | null,
 *   valorVaga: number | string | null | undefined,
 *   alerta: boolean,
 *   override?: boolean,
 * }} input
 * @returns {boolean} true = deve bloquear
 */
export function deveBloquearCheckInSemPagamento(input) {
  if (input.override) return false
  if (!input.checkInExigePagamento) return false
  if (!temValorVaga(input.valorVaga)) return false
  return Boolean(input.alerta)
}

/**
 * Resolve o status operacional de uma pessoa na lista de embarque.
 *
 * @param {{
 *   valorVaga: number | string | null | undefined,
 *   cobrancaStatus?: string | null,
 *   checkedInAt?: Date | string | null,
 * }} input
 * @returns {StatusVagaEmbarque}
 */
export function resolverStatusVaga(input) {
  const embarque = input.checkedInAt ? 'EMBARCADO' : 'AGUARDANDO'

  if (!temValorVaga(input.valorVaga)) {
    return {
      pagamento: 'NAO_APLICA',
      embarque,
      alerta: false,
      labelPagamento: STATUS_PAGAMENTO_VAGA.NAO_APLICA.label,
    }
  }

  const raw = input.cobrancaStatus ?? null
  /** @type {StatusPagamentoVaga} */
  let pagamento
  if (raw === 'PAGA') pagamento = 'PAGO'
  else if (raw === 'PENDENTE') pagamento = 'PENDENTE'
  else if (raw === 'CANCELADA') pagamento = 'CANCELADA'
  else if (raw === 'VENCIDA') pagamento = 'VENCIDA'
  else pagamento = 'SEM_COBRANCA'

  const alerta = pagamento !== 'PAGO'

  return {
    pagamento,
    embarque,
    alerta,
    labelPagamento: STATUS_PAGAMENTO_VAGA[pagamento].label,
  }
}

/**
 * KPIs do dia da viagem a partir das linhas já resolvidas.
 *
 * @param {Array<StatusVagaEmbarque & { confirmado?: boolean }>} linhas
 * @returns {{
 *   confirmados: number,
 *   embarcados: number,
 *   pagos: number,
 *   pagosEmbarcados: number,
 *   pagosFaltando: number,
 *   embarcadosSemPagar: number,
 *   pendentesPagamento: number,
 * }}
 */
export function resumirEmbarqueComPagamento(linhas) {
  let confirmados = 0
  let embarcados = 0
  let pagos = 0
  let pagosEmbarcados = 0
  let pagosFaltando = 0
  let embarcadosSemPagar = 0
  let pendentesPagamento = 0

  for (const l of linhas) {
    if (l.confirmado === false) continue
    confirmados += 1
    const emb = l.embarque === 'EMBARCADO'
    if (emb) embarcados += 1
    if (l.pagamento === 'PAGO') {
      pagos += 1
      if (emb) pagosEmbarcados += 1
      else pagosFaltando += 1
    }
    if (emb && l.alerta) embarcadosSemPagar += 1
    if (l.alerta && !emb) pendentesPagamento += 1
  }

  return {
    confirmados,
    embarcados,
    pagos,
    pagosEmbarcados,
    pagosFaltando,
    embarcadosSemPagar,
    pendentesPagamento,
  }
}
