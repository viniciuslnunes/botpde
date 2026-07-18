'use server'

import { db } from '@torcida/db'
import { CriarPartidaRapidaSchema, PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { getAfiliacaoIdDoTenant } from '@/lib/partidas'
import { revalidatePath } from 'next/cache'

export type PartidaState = {
  ok?: boolean
  partidaId?: string
  errors?: Record<string, string[]>
  message?: string
}

/**
 * Resolve partidaId do form: select existente, ou cria rápida se
 * `partidaNovaAdversario` vier preenchido. Valida afiliação do tenant.
 */
export async function resolvePartidaIdFromForm(
  tenantId: string,
  formData: FormData,
): Promise<{ partidaId: string | null; error?: PartidaState }> {
  const afiliacaoId = await getAfiliacaoIdDoTenant(tenantId)
  if (!afiliacaoId) {
    const raw = formData.get('partidaId')
    if (raw && raw !== '' && raw !== '__nova__') {
      return {
        partidaId: null,
        error: {
          errors: {
            partidaId: ['Vincule uma afiliação (clube) ao tenant para ligar partidas.'],
          },
        },
      }
    }
    return { partidaId: null }
  }

  const rawId = formData.get('partidaId')
  const criarNova = rawId === '__nova__' || Boolean(formData.get('partidaNovaAdversario'))

  if (criarNova && formData.get('partidaNovaAdversario')) {
    const parsed = CriarPartidaRapidaSchema.safeParse({
      adversario: formData.get('partidaNovaAdversario'),
      competicao: formData.get('partidaNovaCompeticao') || undefined,
      dataHora: formData.get('partidaNovaData') || formData.get('data'),
      local: formData.get('partidaNovaLocal') || formData.get('local') || undefined,
      mando: formData.get('partidaNovaMando') || 'CASA',
    })
    if (!parsed.success) {
      return {
        partidaId: null,
        error: {
          errors: {
            partidaId: ['Dados da partida inválidos'],
            ...Object.fromEntries(
              Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [
                `partidaNova${k[0]!.toUpperCase()}${k.slice(1)}`,
                v as string[],
              ]),
            ),
          },
        },
      }
    }
    const dataHora = new Date(parsed.data.dataHora)
    if (Number.isNaN(dataHora.getTime())) {
      return { partidaId: null, error: { errors: { partidaId: ['Data do jogo inválida'] } } }
    }
    const partida = await db.partida.create({
      data: {
        afiliacaoId,
        adversario: parsed.data.adversario,
        competicao: parsed.data.competicao ?? null,
        dataHora,
        local: parsed.data.local ?? null,
        mando: parsed.data.mando,
        status: 'AGENDADA',
      },
      select: { id: true },
    })
    return { partidaId: partida.id }
  }

  if (typeof rawId === 'string' && rawId && rawId !== '__nova__') {
    const partida: { id: string } | null = await db.partida.findFirst({
      where: { id: rawId, afiliacaoId },
      select: { id: true },
    })
    if (!partida) {
      return { partidaId: null, error: { errors: { partidaId: ['Partida inválida'] } } }
    }
    return { partidaId: partida.id }
  }

  return { partidaId: null }
}

/** Cria partida avulsa (admin) sem evento. */
export async function criarPartidaRapida(
  _prev: PartidaState,
  formData: FormData,
): Promise<PartidaState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)
  const afiliacaoId = await getAfiliacaoIdDoTenant(tenant.id)
  if (!afiliacaoId) {
    return { message: 'Tenant sem afiliação (clube) vinculada.' }
  }

  const parsed = CriarPartidaRapidaSchema.safeParse({
    adversario: formData.get('adversario'),
    competicao: formData.get('competicao') || undefined,
    dataHora: formData.get('dataHora'),
    local: formData.get('local') || undefined,
    mando: formData.get('mando') || 'CASA',
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const dataHora = new Date(parsed.data.dataHora)
  if (Number.isNaN(dataHora.getTime())) {
    return { errors: { dataHora: ['Data inválida'] } }
  }

  const partida = await db.partida.create({
    data: {
      afiliacaoId,
      adversario: parsed.data.adversario,
      competicao: parsed.data.competicao ?? null,
      dataHora,
      local: parsed.data.local ?? null,
      mando: parsed.data.mando,
      status: 'AGENDADA',
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PARTIDA_CRIADA',
      entidade: 'Partida',
      entidadeId: partida.id,
      detalhes: { adversario: parsed.data.adversario },
    },
  })

  revalidatePath('/admin/eventos')
  return { ok: true, partidaId: partida.id }
}
