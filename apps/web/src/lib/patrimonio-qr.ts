import 'server-only'
import { lerPayload, montarPayload } from '@/lib/qr-token'
import { QR_PATRIMONIO_ITEM } from '@torcida/types'

/**
 * QR do item do patrimônio — quarto consumidor de `qr-token.ts`.
 *
 * Diferente dos outros três: aqui o QR identifica um **objeto físico**, não uma
 * pessoa nem uma conta. Ele é impresso uma vez e colado na bandeira, no
 * instrumento, na caixa de som — e vive lá por anos. Por isso é estático e o
 * dado assinado é o próprio `PatrimonioItem.id`, sem coluna nova: reemitir
 * etiqueta de acervo inteiro porque o formato mudou seria caro de um jeito que
 * ninguém aceita depois de a cola secar.
 *
 * **A leitura decide algo?** Ela abre a ficha de um item — e ficha de acervo é
 * dado interno da torcida (quem está com o quê, quanto vale). Então **sim**,
 * passa pelo servidor: `lerPayload` confere a assinatura e a rota confere
 * vínculo e permissão antes de mostrar qualquer coisa. Uma etiqueta caída no
 * chão do estádio não pode virar inventário aberto para quem achar.
 */

const PROPOSITO = QR_PATRIMONIO_ITEM

export function montarQrItemPatrimonio(itemId: string): string {
  return montarPayload(PROPOSITO, itemId)
}

export function lerQrItemPatrimonio(payload: string): string | null {
  const itemId = lerPayload(PROPOSITO, payload)
  if (!itemId) return null
  return /^[0-9a-f-]{36}$/i.test(itemId) ? itemId : null
}
