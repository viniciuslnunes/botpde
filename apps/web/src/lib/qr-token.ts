import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/**
 * Primitiva de QR do produto — assinatura HMAC com propósito (namespace).
 *
 * Extraída de `carteirinha-qr.ts`, que foi o primeiro caso de uso, quando o
 * embarque de caravana virou o segundo. O formato do payload e a entrada do
 * HMAC são **byte a byte os mesmos** de antes (`carteirinha:<token>`), senão
 * carteirinha já emitida — impressa, printada, salva na galeria — pararia de
 * validar no portão.
 *
 * O propósito é o que impede um QR de um módulo valer em outro: token de
 * carteirinha não vira token de embarque nem de pedido da loja, porque a
 * assinatura cobre o namespace junto com os dados.
 *
 * Nada disso vai para serviço externo: a imagem do QR é desenhada no cliente,
 * o segredo nunca sai do servidor.
 */

/** Assinatura URL-safe de `<proposito>:<dados>`. */
export function assinarQr(proposito: string, dados: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`${proposito}:${dados}`).digest('base64url')
}

/** Payload transportável no QR: `dados.assinatura`. */
export function montarPayload(proposito: string, dados: string): string {
  return `${dados}.${assinarQr(proposito, dados)}`
}

/**
 * Devolve os dados se a assinatura confere, `null` se não. Comparação em tempo
 * constante — o payload vem de fora e é o único gate antes do banco.
 */
export function lerPayload(proposito: string, payload: string): string | null {
  const corte = payload.lastIndexOf('.')
  if (corte <= 0 || corte === payload.length - 1) return null

  const dados = payload.slice(0, corte)
  const assinatura = payload.slice(corte + 1)
  const esperada = assinarQr(proposito, dados)

  try {
    const a = Buffer.from(esperada)
    const b = Buffer.from(assinatura)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  return dados
}

/**
 * Extrai o payload de um QR que pode ter vindo como URL completa.
 *
 * A câmera nativa do celular abre `https://…/embarque?t=<payload>`, mas o
 * campo de colar do painel recebe o payload cru — os dois caminhos chegam na
 * mesma action.
 */
export function extrairPayloadDeQr(bruto: string): string {
  const texto = bruto.trim()
  if (!texto.includes('t=')) return texto
  try {
    return new URL(texto, 'https://local.invalid').searchParams.get('t')?.trim() ?? texto
  } catch {
    return texto
  }
}
