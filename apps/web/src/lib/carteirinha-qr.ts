import 'server-only'
import { cache } from 'react'
import { db } from '@torcida/db'
import { lerPayload, montarPayload } from '@/lib/qr-token'
import { novoQrTokenSocio } from '@/lib/pix-gateway'
import { formatNomeTorcida, QR_CARTEIRINHA } from '@torcida/types'

/** Namespace do HMAC. Não mude: carteirinha já emitida pararia de validar. */
const PROPOSITO = QR_CARTEIRINHA

export type ValidacaoCarteirinha = {
  ok: boolean
  motivo?: string
  tenantNome?: string
  nome?: string
  numeroSocio?: number
  validade?: string
  adimplente?: boolean
  statusMembro?: string
  desligado?: boolean
}

/** Payload URL-safe: token.assinatura — verificado sem DB round-trip de crypto. */
export function montarPayloadQr(qrToken: string): string {
  return montarPayload(PROPOSITO, qrToken)
}

export function parsePayloadQr(payload: string): string | null {
  return lerPayload(PROPOSITO, payload)
}

export async function garantirQrTokenSocio(socioId: string, tenantId: string): Promise<string> {
  type Row = { id: string; qrToken: string | null }
  const socio: Row | null = await db.saasSocio.findFirst({
    where: { id: socioId, tenantId },
    select: { id: true, qrToken: true },
  })
  if (!socio) throw new Error('Carteirinha não encontrada')
  if (socio.qrToken) return socio.qrToken

  const qrToken = novoQrTokenSocio()
  await db.saasSocio.update({
    where: { id: socio.id },
    data: { qrToken, qrEmitidoEm: new Date() },
  })
  return qrToken
}

export const validarCarteirinhaPorPayload = cache(async function validarCarteirinhaPorPayload(
  payload: string,
): Promise<ValidacaoCarteirinha> {
  const token = parsePayloadQr(payload)
  if (!token) return { ok: false, motivo: 'QR inválido ou adulterado' }

  type SocioLite = {
    id: string
    nome: string
    numeroSocio: number
    validade: Date
    userId: string
    tenant: { id: string; nome: string }
  }
  const socio: SocioLite | null = await db.saasSocio.findFirst({
    where: { qrToken: token },
    select: {
      id: true,
      nome: true,
      numeroSocio: true,
      validade: true,
      userId: true,
      tenant: { select: { id: true, nome: true } },
    },
  })
  if (!socio) return { ok: false, motivo: 'Carteirinha não encontrada' }

  type MembroLite = {
    status: string
    adimplente: boolean
    desligadoEm: Date | null
  }
  const membro: MembroLite | null = await db.saasMembro.findUnique({
    where: {
      tenantId_userId: { tenantId: socio.tenant.id, userId: socio.userId },
    },
    select: { status: true, adimplente: true, desligadoEm: true },
  })

  const validadeIso = socio.validade.toISOString()
  const base = {
    tenantNome: formatNomeTorcida(socio.tenant.nome),
    nome: socio.nome,
    numeroSocio: socio.numeroSocio,
    validade: validadeIso,
    adimplente: membro?.adimplente ?? true,
    statusMembro: membro?.status,
    desligado: Boolean(membro?.desligadoEm),
  }

  if (membro?.desligadoEm) {
    return { ok: false, motivo: 'Associado desligado', ...base }
  }
  if (membro && membro.status !== 'APROVADO') {
    return { ok: false, motivo: 'Cadastro não aprovado', ...base }
  }
  if (socio.validade < new Date()) {
    return { ok: false, motivo: 'Carteirinha vencida', ...base }
  }
  if (membro && !membro.adimplente) {
    return { ok: false, motivo: 'Associado inadimplente', ...base }
  }

  return { ok: true, ...base }
})
