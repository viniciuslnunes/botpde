import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

export type PixChargeResult = {
  provider: 'mock' | 'mercadopago'
  externalId: string
  copiaCola: string
}

/** Mock sempre disponível; Mercado Pago quando há token. */
export function getPixProvider(): 'mock' | 'mercadopago' {
  const mode = (process.env.PIX_GATEWAY_MODE ?? 'mock').trim().toLowerCase()
  if (mode === 'mercadopago' && process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
    return 'mercadopago'
  }
  return 'mock'
}

export function isPixGatewayConfigured(): boolean {
  return getPixProvider() === 'mercadopago' || (process.env.PIX_GATEWAY_MODE ?? 'mock') === 'mock'
}

/**
 * Gera cobrança Pix. Em `mock`, cria payload determinístico para demos/dev
 * (sem provedor externo). Mercado Pago: Preference/Pix API mínima.
 */
export async function criarCobrancaPix(input: {
  cobrancaId: string
  tenantSlug: string
  valor: number
  descricao: string
  payerEmail?: string | null
}): Promise<PixChargeResult> {
  const provider = getPixProvider()
  if (provider === 'mercadopago') {
    return criarPixMercadoPago(input)
  }
  return criarPixMock(input)
}

function criarPixMock(input: {
  cobrancaId: string
  tenantSlug: string
  valor: number
  descricao: string
}): PixChargeResult {
  const externalId = `mock_${input.cobrancaId}`
  const valorStr = input.valor.toFixed(2)
  // Payload legível para demos — não é EMV real; validação via webhook mock.
  const copiaCola = [
    '00020126',
    `BR.GOV.BCB.PIX0114${input.tenantSlug.slice(0, 14).padEnd(14, '0')}`,
    `52040000530398654${String(valorStr.length).padStart(2, '0')}${valorStr}`,
    `5802BR5913TORCIDA SAAS6009SAO PAULO62`,
    `05${String(input.cobrancaId.length).padStart(2, '0')}${input.cobrancaId}`,
    '6304MOCK',
  ].join('')
  return { provider: 'mock', externalId, copiaCola }
}

async function criarPixMercadoPago(input: {
  cobrancaId: string
  valor: number
  descricao: string
  payerEmail?: string | null
}): Promise<PixChargeResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN ausente')

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.cobrancaId,
    },
    body: JSON.stringify({
      transaction_amount: input.valor,
      description: input.descricao.slice(0, 200),
      payment_method_id: 'pix',
      payer: {
        email: input.payerEmail || 'associado@torcida.local',
      },
      external_reference: input.cobrancaId,
      metadata: { cobrancaId: input.cobrancaId },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Mercado Pago Pix falhou (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    id: number
    point_of_interaction?: {
      transaction_data?: { qr_code?: string }
    }
  }
  const copiaCola = data.point_of_interaction?.transaction_data?.qr_code
  if (!copiaCola) throw new Error('Mercado Pago não retornou QR Pix')

  return {
    provider: 'mercadopago',
    externalId: String(data.id),
    copiaCola,
  }
}

/** Token opaco para webhook mock: HMAC(cobrancaId). */
export function assinarWebhookMock(cobrancaId: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`pix-mock:${cobrancaId}`).digest('hex')
}

export function verificarWebhookMock(cobrancaId: string, signature: string): boolean {
  const expected = assinarWebhookMock(cobrancaId)
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(signature, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function novoQrTokenSocio(): string {
  return randomBytes(24).toString('base64url')
}
