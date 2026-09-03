import 'server-only'
import { lerPayload, montarPayload } from '@/lib/qr-token'
import { QR_PEDIDO_RETIRADA } from '@torcida/types'

/**
 * QR de retirada do pedido da loja — o segundo consumidor de `qr-token.ts`.
 *
 * **Estático, ao contrário do embarque.** No ônibus o QR é do *evento* e vale
 * para qualquer um que o aponte, então precisa rodar antes de virar print no
 * grupo. Aqui o QR é do *pedido de uma pessoa*: o balcão vê o nome do
 * comprador na tela antes de entregar, e o pior caso do vazamento é alguém
 * tentar retirar a encomenda de outro — que o conferente barra olhando. Somem-se
 * dois motivos práticos: o comprador precisa mostrar o código com o celular
 * possivelmente sem sinal dentro da sede, e um QR que muda não pode ser salvo
 * na galeria nem impresso junto do comprovante.
 *
 * O replay é fechado no outro lado: pedido já `ENTREGUE` recusa a segunda
 * leitura, então bipar duas vezes não entrega duas vezes.
 *
 * Não há coluna nova: o dado assinado é o próprio id do pedido. O propósito no
 * HMAC é o que impede este token de valer como carteirinha ou como embarque.
 */

const PROPOSITO = QR_PEDIDO_RETIRADA

export function montarQrRetirada(pedidoId: string): string {
  return montarPayload(PROPOSITO, pedidoId)
}

export function lerQrRetirada(payload: string): string | null {
  const pedidoId = lerPayload(PROPOSITO, payload)
  if (!pedidoId) return null
  // O id é uuid; recusar qualquer outro formato evita levar lixo assinado ao banco.
  return /^[0-9a-f-]{36}$/i.test(pedidoId) ? pedidoId : null
}
