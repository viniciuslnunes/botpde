import 'server-only'
import { montarPayload } from '@/lib/qr-token'
import { QR_BAR_COMANDA } from '@torcida/types'

/**
 * QR da comanda do bar — terceiro consumidor de `qr-token.ts`.
 *
 * Estático e ligado a **uma conta**, como a retirada de pedido: o sócio abre
 * `/portal/bar`, mostra o código no balcão e o operador escaneia em vez de
 * digitar o número da comanda. É o mesmo gesto que o cartão de comanda de
 * papel já faz, sem o erro de digitação que troca a conta de duas pessoas.
 *
 * **Este payload não autoriza nada** — o PDV só o usa para escolher, entre as
 * comandas abertas que já estão na tela do operador, qual carregar. Por isso a
 * leitura acontece no cliente (`qr-payload.ts`) e não passa por action. A
 * assinatura continua sendo gerada aqui para o formato ficar igual ao dos
 * outros QR do produto e para a verificação existir no dia em que alguma tela
 * quiser decidir algo a partir dela.
 */

const PROPOSITO = QR_BAR_COMANDA

export function montarQrComanda(comandaId: string): string {
  return montarPayload(PROPOSITO, comandaId)
}
