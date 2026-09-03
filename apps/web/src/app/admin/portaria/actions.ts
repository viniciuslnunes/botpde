'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { validarCarteirinhaPorPayload, parsePayloadQr } from '@/lib/carteirinha-qr'
import { extrairPayloadDeQr } from '@/lib/qr-token'

export type ResultadoPortariaEntrada =
  | {
      ok: true
      nome: string
      numeroSocio?: number
      jaEntrouHoje?: boolean
    }
  | { ok: false; error: string }

const manualSchema = z.object({
  visitanteNome: z.string().trim().min(2, 'Informe o nome do visitante').max(120),
  observacao: z.string().trim().max(280).optional(),
  sedeId: z.string().uuid().optional().nullable(),
})

function inicioDoDiaSp() {
  const agora = new Date()
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  sp.setHours(0, 0, 0, 0)
  return sp
}

async function jaEntrouHoje(tenantId: string, userId: string): Promise<boolean> {
  const count = await db.portariaEntrada.count({
    where: {
      tenantId,
      userId,
      criadoEm: { gte: inicioDoDiaSp() },
    },
  })
  return count > 0
}

export async function registrarEntradaPorQr(payloadBruto: string): Promise<ResultadoPortariaEntrada> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW)

  const payload = extrairPayloadDeQr(payloadBruto.trim())
  if (!payload) return { ok: false, error: 'QR inválido ou adulterado.' }

  const validacao = await validarCarteirinhaPorPayload(payload)
  if (!validacao.ok) {
    return { ok: false, error: validacao.motivo ?? 'Carteirinha inválida.' }
  }

  const token = parsePayloadQr(payload)
  if (!token) return { ok: false, error: 'QR inválido ou adulterado.' }

  type SocioLite = { id: string; userId: string; nome: string; numeroSocio: number }
  const socioRow: SocioLite | null = await db.saasSocio.findFirst({
    where: { qrToken: token, tenantId: tenant.id },
    select: { id: true, userId: true, nome: true, numeroSocio: true },
  })
  if (!socioRow) {
    return { ok: false, error: 'Carteirinha não pertence a esta torcida.' }
  }

  const repetiu = await jaEntrouHoje(tenant.id, socioRow.userId)

  await db.portariaEntrada.create({
    data: {
      tenantId: tenant.id,
      userId: socioRow.userId,
      metodo: 'QR_CARTEIRINHA',
      registradoPorId: session.user.id,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PORTARIA_ENTRADA_QR',
      entidade: 'PortariaEntrada',
      entidadeId: socioRow.userId,
      detalhes: {
        nome: socioRow.nome,
        numeroSocio: socioRow.numeroSocio,
        repetiuHoje: repetiu,
      },
    },
  })

  revalidatePath('/admin/portaria')

  return {
    ok: true,
    nome: socioRow.nome,
    numeroSocio: socioRow.numeroSocio,
    jaEntrouHoje: repetiu,
  }
}

export async function registrarEntradaManual(
  _prev: unknown,
  formData: FormData,
): Promise<ResultadoPortariaEntrada> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW)

  const parsed = manualSchema.safeParse({
    visitanteNome: formData.get('visitanteNome'),
    observacao: formData.get('observacao') || undefined,
    sedeId: formData.get('sedeId') || null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { visitanteNome, observacao, sedeId } = parsed.data

  if (sedeId) {
    const sede = await db.sede.findFirst({
      where: { id: sedeId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!sede) return { ok: false, error: 'Unidade não encontrada nesta torcida.' }
  }

  await db.portariaEntrada.create({
    data: {
      tenantId: tenant.id,
      sedeId: sedeId ?? null,
      visitanteNome,
      metodo: 'MANUAL',
      observacao: observacao || null,
      registradoPorId: session.user.id,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PORTARIA_ENTRADA_MANUAL',
      entidade: 'PortariaEntrada',
      entidadeId: visitanteNome,
      detalhes: { visitanteNome, sedeId: sedeId ?? null },
    },
  })

  revalidatePath('/admin/portaria')

  return { ok: true, nome: visitanteNome }
}
