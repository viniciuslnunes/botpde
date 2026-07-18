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
 *
 * `metadata`/`externalReference` são opcionais e só afetam o provedor MP;
 * o default preserva o comportamento histórico das cobranças de associação
 * (metadata `{ cobrancaId }`, external_reference = cobrancaId).
 */
export async function criarCobrancaPix(input: {
  cobrancaId: string
  tenantSlug: string
  valor: number
  descricao: string
  payerEmail?: string | null
  metadata?: Record<string, string>
  externalReference?: string
}): Promise<PixChargeResult> {
  const provider = getPixProvider()
  if (provider === 'mercadopago') {
    return criarPixMercadoPago({
      referencia: input.cobrancaId,
      valor: input.valor,
      descricao: input.descricao,
      payerEmail: input.payerEmail,
      externalReference: input.externalReference ?? input.cobrancaId,
      metadata: input.metadata ?? { cobrancaId: input.cobrancaId },
    })
  }
  return criarPixMock({
    referencia: input.cobrancaId,
    tenantSlug: input.tenantSlug,
    valor: input.valor,
  })
}

/**
 * Cobrança Pix para uma venda do Bar (`BarVenda`). Mesma lógica MP/mock das
 * cobranças de associação, mas com metadata `{ tipo: 'bar', vendaId }` para o
 * webhook diferenciar a origem.
 */
export async function criarCobrancaPixBar(input: {
  vendaId: string
  tenantSlug: string
  valor: number
  descricao: string
  payerEmail?: string | null
}): Promise<PixChargeResult> {
  const provider = getPixProvider()
  if (provider === 'mercadopago') {
    return criarPixMercadoPago({
      referencia: input.vendaId,
      valor: input.valor,
      descricao: input.descricao,
      payerEmail: input.payerEmail,
      externalReference: input.vendaId,
      metadata: { tipo: 'bar', vendaId: input.vendaId },
    })
  }
  return criarPixMock({
    referencia: input.vendaId,
    tenantSlug: input.tenantSlug,
    valor: input.valor,
  })
}

function criarPixMock(input: {
  referencia: string
  tenantSlug: string
  valor: number
}): PixChargeResult {
  const externalId = `mock_${input.referencia}`
  const valorStr = input.valor.toFixed(2)
  // Payload legível para demos — não é EMV real; validação via webhook mock.
  const copiaCola = [
    '00020126',
    `BR.GOV.BCB.PIX0114${input.tenantSlug.slice(0, 14).padEnd(14, '0')}`,
    `52040000530398654${String(valorStr.length).padStart(2, '0')}${valorStr}`,
    `5802BR5913TORCIDA SAAS6009SAO PAULO62`,
    `05${String(input.referencia.length).padStart(2, '0')}${input.referencia}`,
    '6304MOCK',
  ].join('')
  return { provider: 'mock', externalId, copiaCola }
}

async function criarPixMercadoPago(input: {
  referencia: string
  valor: number
  descricao: string
  payerEmail?: string | null
  externalReference: string
  metadata: Record<string, string>
}): Promise<PixChargeResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN ausente')

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.referencia,
    },
    body: JSON.stringify({
      transaction_amount: input.valor,
      description: input.descricao.slice(0, 200),
      payment_method_id: 'pix',
      payer: {
        email: input.payerEmail || 'associado@torcida.local',
      },
      external_reference: input.externalReference,
      metadata: input.metadata,
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
  return compararAssinatura(assinarWebhookMock(cobrancaId), signature)
}

/** Token opaco para webhook mock do Bar: HMAC(vendaId) em namespace próprio. */
export function assinarWebhookMockBar(vendaId: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`pix-mock-bar:${vendaId}`).digest('hex')
}

export function verificarWebhookMockBar(vendaId: string, signature: string): boolean {
  return compararAssinatura(assinarWebhookMockBar(vendaId), signature)
}

function compararAssinatura(expected: string, signature: string): boolean {
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
