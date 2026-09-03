import 'server-only'
import { QR_BAR_VENDA } from '@torcida/types'
import { lerPayload, montarPayload } from '@/lib/qr-token'

/**
 * Vale da compra antecipada do bar — o QR que o sócio mostra no balcão.
 *
 * **Não confundir com o QR da comanda** (`comanda-qr.ts`), que é lido no
 * cliente. Aqui a leitura **libera mercadoria**, então passa por action no
 * servidor com verificação de assinatura, como a retirada de pedido da Loja.
 * A regra é a de sempre: verificar é obrigatório quando a leitura decide algo.
 *
 * Estático e sem coluna nova: o dado assinado é o próprio `BarVenda.id`. O
 * replay fecha do outro lado — venda já retirada recusa a segunda leitura.
 */

const PROPOSITO = QR_BAR_VENDA

export function montarQrVendaBar(vendaId: string): string {
  return montarPayload(PROPOSITO, vendaId)
}

export function lerQrVendaBar(payload: string): string | null {
  const vendaId = lerPayload(PROPOSITO, payload)
  if (!vendaId) return null
  return /^[0-9a-f-]{36}$/i.test(vendaId) ? vendaId : null
}
