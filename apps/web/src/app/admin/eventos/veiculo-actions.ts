'use server'

import { db } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { CaravanaVeiculoSchema, PERMISSIONS, podeAlocarNoVeiculo } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'

/**
 * Frota da caravana. A capacidade que importa na estrada é a do ônibus, não a
 * do evento: alocar além dela é gente em pé na viagem, então o limite é
 * checado no servidor a cada alocação.
 */

export type VeiculoState = {
  ok?: boolean
  errors?: Record<string, string[]>
  message?: string
}

function revalidarFrota(tenantId: string, eventoId: string) {
  invalidateAdminDirecao(tenantId)
  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath(`/admin/eventos/${eventoId}/manifesto`)
  revalidatePath(`/portal/eventos/${eventoId}`)
}

async function assertCaravanaDoTenant(
  eventoId: string,
  tenantId: string,
): Promise<{ id: string; tipo: string } | null> {
  return db.evento.findFirst({
    where: { id: eventoId, tenantId },
    select: { id: true, tipo: true },
  })
}

export async function salvarVeiculoCaravana(
  veiculoId: string | null,
  _prev: VeiculoState,
  formData: FormData,
): Promise<VeiculoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const parsed = CaravanaVeiculoSchema.safeParse({
    eventoId: formData.get('eventoId'),
    identificacao: formData.get('identificacao'),
    placa: formData.get('placa') ?? undefined,
    empresa: formData.get('empresa') ?? undefined,
    capacidade: formData.get('capacidade'),
    responsavelId: formData.get('responsavelId') ?? undefined,
    pontoEmbarque: formData.get('pontoEmbarque') ?? undefined,
    horarioEmbarque: formData.get('horarioEmbarque') ?? undefined,
    observacao: formData.get('observacao') ?? undefined,
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }
  const dados = parsed.data

  const evento = await assertCaravanaDoTenant(dados.eventoId, tenant.id)
  if (!evento) return { message: 'Evento não encontrado.' }

  if (dados.responsavelId) {
    const membro: { id: string } | null = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, userId: dados.responsavelId, status: 'APROVADO' },
      select: { id: true },
    })
    if (!membro) {
      return { errors: { responsavelId: ['Responsável precisa ser membro aprovado'] } }
    }
  }

  const horario = dados.horarioEmbarque ? new Date(dados.horarioEmbarque) : null
  if (horario && Number.isNaN(horario.getTime())) {
    return { errors: { horarioEmbarque: ['Horário inválido'] } }
  }

  // Reduzir a capacidade abaixo de quem já está dentro deixaria o ônibus
  // "excedido" em silêncio — melhor barrar e mandar realocar antes.
  if (veiculoId) {
    const ocupados = await db.eventoRsvp.count({
      where: { veiculoId, status: 'CONFIRMADO' },
    })
    if (dados.capacidade < ocupados) {
      return {
        errors: {
          capacidade: [`Já há ${ocupados} pessoa(s) neste veículo — realoque antes de reduzir`],
        },
      }
    }
  }

  const payload = {
    identificacao: dados.identificacao,
    placa: dados.placa ?? null,
    empresa: dados.empresa ?? null,
    capacidade: dados.capacidade,
    responsavelId: dados.responsavelId ?? null,
    pontoEmbarque: dados.pontoEmbarque ?? null,
    horarioEmbarque: horario,
    observacao: dados.observacao ?? null,
  }

  let id = veiculoId
  if (veiculoId) {
    const existente: { id: string } | null = await db.caravanaVeiculo.findFirst({
      where: { id: veiculoId, tenantId: tenant.id, eventoId: evento.id },
      select: { id: true },
    })
    if (!existente) return { message: 'Veículo não encontrado.' }
    await db.caravanaVeiculo.update({ where: { id: veiculoId }, data: payload })
  } else {
    const criado: { id: string } = await db.caravanaVeiculo.create({
      data: {
        tenantId: tenant.id,
        eventoId: evento.id,
        criadoPorId: session.user.id,
        ...payload,
      },
      select: { id: true },
    })
    id = criado.id
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: veiculoId ? 'CARAVANA_VEICULO_EDITADO' : 'CARAVANA_VEICULO_CRIADO',
      entidade: 'CaravanaVeiculo',
      entidadeId: id ?? '',
      detalhes: {
        eventoId: evento.id,
        identificacao: dados.identificacao,
        capacidade: dados.capacidade,
        empresa: dados.empresa ?? null,
      },
    },
  })

  revalidarFrota(tenant.id, evento.id)
  return { ok: true }
}

/** Remove o veículo; quem estava nele volta para "sem ônibus", não some. */
export async function excluirVeiculoCaravana(veiculoId: string): Promise<VeiculoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const veiculo: { id: string; eventoId: string; identificacao: string } | null =
    await db.caravanaVeiculo.findFirst({
      where: { id: veiculoId, tenantId: tenant.id },
      select: { id: true, eventoId: true, identificacao: true },
    })
  if (!veiculo) return { message: 'Veículo não encontrado.' }

  const desalocados = await db.eventoRsvp.updateMany({
    where: { veiculoId: veiculo.id },
    data: { veiculoId: null },
  })
  await db.caravanaVeiculo.delete({ where: { id: veiculo.id } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'CARAVANA_VEICULO_EXCLUIDO',
      entidade: 'CaravanaVeiculo',
      entidadeId: veiculo.id,
      detalhes: {
        eventoId: veiculo.eventoId,
        identificacao: veiculo.identificacao,
        passageirosDesalocados: desalocados.count,
      },
    },
  })

  revalidarFrota(tenant.id, veiculo.eventoId)
  return { ok: true }
}

/** Coloca (ou tira) alguém de um ônibus. `veiculoId` nulo = sem lugar ainda. */
export async function alocarPassageiroVeiculo(
  eventoId: string,
  userId: string,
  veiculoId: string | null,
): Promise<VeiculoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const evento = await assertCaravanaDoTenant(eventoId, tenant.id)
  if (!evento) return { message: 'Evento não encontrado.' }

  const rsvp: { id: string; veiculoId: string | null } | null = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId, userId } },
    select: { id: true, veiculoId: true },
  })
  if (!rsvp) return { message: 'Pessoa não está inscrita nesta caravana.' }

  if (veiculoId) {
    const veiculo: { id: string; capacidade: number } | null =
      await db.caravanaVeiculo.findFirst({
        where: { id: veiculoId, tenantId: tenant.id, eventoId },
        select: { id: true, capacidade: true },
      })
    if (!veiculo) return { message: 'Veículo não encontrado nesta caravana.' }

    const ocupados = await db.eventoRsvp.count({
      where: { veiculoId: veiculo.id, status: 'CONFIRMADO' },
    })
    const checagem = podeAlocarNoVeiculo(
      { capacidade: veiculo.capacidade, ocupados },
      rsvp.veiculoId === veiculo.id,
    )
    if (!checagem.permitido) return { message: checagem.motivo ?? 'Veículo lotado.' }
  }

  await db.eventoRsvp.update({
    where: { id: rsvp.id },
    data: { veiculoId },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'CARAVANA_PASSAGEIRO_ALOCADO',
      entidade: 'EventoRsvp',
      entidadeId: rsvp.id,
      detalhes: { eventoId, userId, de: rsvp.veiculoId, para: veiculoId },
    },
  })

  revalidarFrota(tenant.id, eventoId)
  return { ok: true }
}
