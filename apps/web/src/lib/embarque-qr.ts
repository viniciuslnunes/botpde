import 'server-only'
import {
  expiraEmQrEmbarque,
  janelaQrEmbarque,
  janelasAceitasQrEmbarque,
  JANELA_QR_EMBARQUE_SEGUNDOS,
} from '@torcida/types/evento-embarque'
import type { TrechoEmbarque } from '@torcida/db'
import { lerPayload, montarPayload } from '@/lib/qr-token'
import { QR_EMBARQUE } from '@torcida/types'

/**
 * QR **rotativo** do embarque: o payload carrega evento, trecho e a janela de
 * tempo em que foi emitido, tudo coberto pela assinatura.
 *
 * Por que rotativo: um QR fixo exibido na porta do ônibus é fotografado e cai
 * no grupo do WhatsApp em segundos — trinta pessoas marcariam embarque de
 * casa, e a pergunta que o motorista precisa responder ("posso fechar a
 * porta?") passaria a ter resposta errada. Com a janela de
 * `JANELA_QR_EMBARQUE_SEGUNDOS`, o print morre sozinho.
 *
 * Nada é gravado para emitir: a janela sai do relógio, como no TOTP. Servidor
 * e painel são o mesmo processo, então não há relógio de terceiro para
 * divergir — e a janela anterior é aceita para quem escaneia no estouro.
 */

const PROPOSITO = QR_EMBARQUE
const SEPARADOR = '~'

export type PayloadEmbarque = {
  eventoId: string
  trecho: TrechoEmbarque
  janela: number
}

/** Payload do QR exibido agora, e o instante em que ele deixa de ser desenhado. */
export function montarQrEmbarque(
  eventoId: string,
  trecho: TrechoEmbarque,
  agoraMs: number = Date.now(),
): { payload: string; expiraEm: number; janelaSegundos: number } {
  const janela = janelaQrEmbarque(agoraMs)
  const dados = [eventoId, trecho, String(janela)].join(SEPARADOR)
  return {
    payload: montarPayload(PROPOSITO, dados),
    expiraEm: expiraEmQrEmbarque(agoraMs),
    janelaSegundos: JANELA_QR_EMBARQUE_SEGUNDOS,
  }
}

/**
 * Lê o payload escaneado. Devolve `null` quando a assinatura não confere ou o
 * formato é outro — a validade da janela é decidida à parte, porque "QR
 * expirado" e "QR falso" merecem mensagens diferentes na frente do ônibus.
 */
export function lerQrEmbarque(payload: string): PayloadEmbarque | null {
  const dados = lerPayload(PROPOSITO, payload)
  if (!dados) return null

  const partes = dados.split(SEPARADOR)
  if (partes.length !== 3) return null

  const [eventoId, trecho, janelaRaw] = partes
  if (!eventoId) return null
  if (trecho !== 'IDA' && trecho !== 'VOLTA') return null

  const janela = Number(janelaRaw)
  if (!Number.isInteger(janela)) return null

  return { eventoId, trecho, janela }
}

/** A janela do payload ainda é aceita (a atual ou a imediatamente anterior)? */
export function janelaEmbarqueValida(janela: number, agoraMs: number = Date.now()): boolean {
  return janelasAceitasQrEmbarque(agoraMs).includes(janela)
}
