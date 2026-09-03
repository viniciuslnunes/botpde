/**
 * Embarque por trecho (ida / volta) e o QR rotativo do evento.
 *
 * Complementa `caravana-embarque.js`, que resolve pagamento × presença de UMA
 * pessoa. Aqui mora o que o trecho acrescenta: qual perna está aberta, se o
 * sócio pode se auto-embarcar escaneando o QR do gestor, e o resumo do que o
 * motorista precisa ver antes de fechar a porta.
 *
 * Regras fechadas com o usuário (2026-09-02):
 * - QR do evento **rotativo**: o payload vale por uma janela curta, então print
 *   compartilhado em grupo morre sozinho.
 * - Walk-in **não** se auto-embarca: sem RSVP confirmado, só o gestor libera
 *   pelo check-in manual (que já existe, com override e AuditLog).
 * - Geofence fica para a fase 2: `lat`/`lng` são gravados, nada bloqueia.
 */

import { deveBloquearCheckInSemPagamento, resolverStatusVaga } from './caravana-embarque.js'

/** @typedef {'IDA' | 'VOLTA'} TrechoEmbarque */
/** @typedef {'QR_EVENTO' | 'QR_CARTEIRINHA' | 'MANUAL'} MetodoCheckin */

/** @type {Readonly<Record<TrechoEmbarque, { label: string, curto: string, ordem: number }>>} */
export const TRECHOS_EMBARQUE = Object.freeze({
  IDA: { label: 'Ida para o jogo', curto: 'Ida', ordem: 0 },
  VOLTA: { label: 'Volta do jogo', curto: 'Volta', ordem: 1 },
})

/** @type {ReadonlyArray<TrechoEmbarque>} */
export const TRECHOS = Object.freeze(['IDA', 'VOLTA'])

/** @type {Readonly<Record<MetodoCheckin, { label: string }>>} */
export const METODOS_CHECKIN = Object.freeze({
  QR_EVENTO: { label: 'QR do evento' },
  QR_CARTEIRINHA: { label: 'Carteirinha' },
  MANUAL: { label: 'Manual' },
})

/**
 * Duração da janela do QR do evento, em segundos.
 *
 * 30s equilibra as duas pontas: curto o bastante para um print no grupo não
 * servir, longo o bastante para alguém apontar a câmera, destravar o celular e
 * tocar em confirmar sem o código virar na mão.
 */
export const JANELA_QR_EMBARQUE_SEGUNDOS = 30

/**
 * Índice da janela de tempo — o mesmo princípio do TOTP. Servidor e payload
 * derivam o valor do relógio, ninguém precisa guardar o token em lugar nenhum.
 *
 * @param {number} agoraMs
 * @param {number} [janelaSegundos]
 * @returns {number}
 */
export function janelaQrEmbarque(agoraMs, janelaSegundos = JANELA_QR_EMBARQUE_SEGUNDOS) {
  return Math.floor(agoraMs / 1000 / janelaSegundos)
}

/**
 * Janelas que o servidor aceita: a atual e a anterior.
 *
 * Sem a anterior, quem escaneia no último segundo da janela leva "QR expirado"
 * na frente do ônibus, que é o pior lugar para pedir "tenta de novo".
 *
 * @param {number} agoraMs
 * @param {number} [janelaSegundos]
 * @returns {number[]}
 */
export function janelasAceitasQrEmbarque(agoraMs, janelaSegundos = JANELA_QR_EMBARQUE_SEGUNDOS) {
  const atual = janelaQrEmbarque(agoraMs, janelaSegundos)
  return [atual, atual - 1]
}

/**
 * Quando a janela atual expira (para o painel saber a hora de redesenhar).
 *
 * @param {number} agoraMs
 * @param {number} [janelaSegundos]
 * @returns {number} timestamp em ms
 */
export function expiraEmQrEmbarque(agoraMs, janelaSegundos = JANELA_QR_EMBARQUE_SEGUNDOS) {
  return (janelaQrEmbarque(agoraMs, janelaSegundos) + 1) * janelaSegundos * 1000
}

/**
 * @typedef {'OK'
 *   | 'EMBARQUE_FECHADO'
 *   | 'TRECHO_DIVERGENTE'
 *   | 'QR_EXPIRADO'
 *   | 'SEM_RSVP'
 *   | 'VAGA_NAO_PAGA'
 *   | 'JA_EMBARCADO'} CodigoAutoEmbarque
 */

/** @type {Readonly<Record<CodigoAutoEmbarque, string>>} */
export const MOTIVO_AUTO_EMBARQUE = Object.freeze({
  OK: 'Embarque confirmado',
  EMBARQUE_FECHADO: 'O embarque não está aberto. Procure quem está organizando a caravana.',
  TRECHO_DIVERGENTE:
    'Este QR é de outro trecho da viagem. Escaneie o código que está na tela agora.',
  QR_EXPIRADO: 'Este QR expirou. Aponte a câmera de novo para o código na tela.',
  SEM_RSVP: 'Você não está confirmado nesta caravana. Procure quem está organizando para embarcar.',
  VAGA_NAO_PAGA:
    'A vaga ainda não consta como paga. Regularize o pagamento ou procure a organização.',
  JA_EMBARCADO: 'Seu embarque neste trecho já estava registrado.',
})

/**
 * O sócio pode registrar o próprio embarque escaneando o QR do evento?
 *
 * Decide SÓ o caso do auto-embarque. Check-in feito por gestor (carteirinha ou
 * manual) continua passando por `deveBloquearCheckInSemPagamento`, que tem
 * override — aqui não existe override, porque não há gestor na frente da
 * câmera para autorizar.
 *
 * @param {{
 *   trechoAtivo: TrechoEmbarque | null | undefined,
 *   trechoDoToken: TrechoEmbarque,
 *   janelaValida: boolean,
 *   rsvpStatus: string | null | undefined,
 *   jaEmbarcado: boolean,
 *   valorVaga: number | string | null | undefined,
 *   cobrancaStatus?: string | null,
 *   checkInExigePagamento?: boolean | null,
 * }} input
 * @returns {{ ok: boolean, codigo: CodigoAutoEmbarque, motivo: string, alerta: boolean }}
 */
export function podeAutoEmbarcar(input) {
  /**
   * @param {CodigoAutoEmbarque} codigo
   * @param {boolean} [alerta]
   */
  const nao = (codigo, alerta = false) => ({
    ok: false,
    codigo,
    motivo: MOTIVO_AUTO_EMBARQUE[codigo],
    alerta,
  })

  if (!input.trechoAtivo) return nao('EMBARQUE_FECHADO')
  if (input.trechoAtivo !== input.trechoDoToken) return nao('TRECHO_DIVERGENTE')
  if (!input.janelaValida) return nao('QR_EXPIRADO')

  // Walk-in não se auto-embarca: sem RSVP confirmado, a lotação (e, na
  // caravana paga, a cobrança) ficaria furada sem ninguém decidir.
  if (input.rsvpStatus !== 'CONFIRMADO') return nao('SEM_RSVP')

  if (input.jaEmbarcado) return nao('JA_EMBARCADO')

  const status = resolverStatusVaga({
    valorVaga: input.valorVaga,
    cobrancaStatus: input.cobrancaStatus,
  })

  if (
    deveBloquearCheckInSemPagamento({
      checkInExigePagamento: input.checkInExigePagamento,
      valorVaga: input.valorVaga,
      alerta: status.alerta,
    })
  ) {
    return nao('VAGA_NAO_PAGA')
  }

  return { ok: true, codigo: 'OK', motivo: MOTIVO_AUTO_EMBARQUE.OK, alerta: status.alerta }
}

/**
 * Resumo do trecho para o painel do gestor — é a resposta para "posso ir
 * embora?": quantos confirmados, quantos já embarcaram, quantos faltam.
 *
 * @param {Array<{ confirmado?: boolean, embarcado: boolean, alerta?: boolean }>} linhas
 * @returns {{ confirmados: number, embarcados: number, faltando: number, embarcadosComAlerta: number }}
 */
export function resumirTrecho(linhas) {
  let confirmados = 0
  let embarcados = 0
  let embarcadosComAlerta = 0

  for (const l of linhas) {
    if (l.confirmado === false) continue
    confirmados += 1
    if (l.embarcado) {
      embarcados += 1
      if (l.alerta) embarcadosComAlerta += 1
    }
  }

  return {
    confirmados,
    embarcados,
    faltando: confirmados - embarcados,
    embarcadosComAlerta,
  }
}

/**
 * Raio em que um embarque é considerado "no ponto".
 *
 * 300m é folgado de propósito: o ponto de encontro raramente é a coordenada
 * cadastrada do evento (a sede fica na esquina, o ônibus para do outro lado da
 * praça) e o GPS de celular erra dezenas de metros em meio a prédios. O número
 * serve para **sinalizar**, nunca para bloquear — ver a nota abaixo.
 */
export const RAIO_EMBARQUE_ESPERADO_METROS = 300

const RAIO_TERRA_M = 6_371_000

/**
 * Distância entre duas coordenadas, em metros (haversine).
 *
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
export function distanciaMetros(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const lat1 = a.lat * rad
  const lat2 = b.lat * rad

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * O embarque aconteceu longe do local do evento?
 *
 * **Sinal, não trava** (decisão de 2026-09-02). GPS é falsificável por
 * qualquer app de mock location, então bloquear daria a sensação de segurança
 * sem a segurança — enquanto o custo do falso positivo é alto: recusar
 * embarque de quem está ali na sua frente porque o telefone negou a permissão
 * ou o sinal ricocheteou no prédio. Quem impede o print compartilhado é a
 * rotação do QR; isto aqui só dá contexto ao gestor.
 *
 * Devolve `avaliou: false` quando falta coordenada dos dois lados — evento sem
 * `lat`/`lng` e permissão negada são o caso comum, não erro.
 *
 * @param {{
 *   evento?: { lat?: number | null, lng?: number | null } | null,
 *   device?: { lat?: number | null, lng?: number | null } | null,
 *   raioMetros?: number,
 * }} input
 * @returns {{ avaliou: boolean, metros: number | null, longe: boolean }}
 */
export function avaliarDistanciaEmbarque(input) {
  const e = input.evento
  const d = input.device
  if (
    e == null ||
    d == null ||
    typeof e.lat !== 'number' ||
    typeof e.lng !== 'number' ||
    typeof d.lat !== 'number' ||
    typeof d.lng !== 'number'
  ) {
    return { avaliou: false, metros: null, longe: false }
  }

  const metros = distanciaMetros({ lat: e.lat, lng: e.lng }, { lat: d.lat, lng: d.lng })
  const raio = input.raioMetros ?? RAIO_EMBARQUE_ESPERADO_METROS
  return { avaliou: true, metros, longe: metros > raio }
}

/**
 * Trecho que o gestor provavelmente vai abrir a seguir. Só sugestão de UI: a
 * decisão continua sendo dele, e reabrir a ida depois da volta é válido
 * (alguém desceu para comprar água e o registro precisa refletir isso).
 *
 * @param {{ temCheckinIda: boolean, temCheckinVolta: boolean }} input
 * @returns {TrechoEmbarque}
 */
export function trechoSugerido(input) {
  if (!input.temCheckinIda) return 'IDA'
  if (!input.temCheckinVolta) return 'VOLTA'
  return 'VOLTA'
}
