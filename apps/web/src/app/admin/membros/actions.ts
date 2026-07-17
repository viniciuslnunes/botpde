'use server'

import { revalidatePath } from 'next/cache'
import { db, type Prisma } from '@torcida/db'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { notificarSafe } from '@/lib/notificacoes'
import { privatizarPerfilAoAprovarSocio } from '@/lib/social'
import {
  AtualizarMembroLgeSchema,
  DesligarMembroSchema,
  formatDataCompetenciaInput,
  PERMISSIONS,
} from '@torcida/types'

/**
 * Concede acesso básico ao portal quando um membro é aprovado:
 * Role de sistema 'member' (se ainda não tiver).
 * Idempotente: seguro chamar mais de uma vez para o mesmo usuário/tenant.
 *
 * Sócio/Torcedor NÃO são departamentos (ver schema Departamento) — o tipo
 * vive em SaasMembro.tipo; departamentos reais (Financeiro, Comunicação…)
 * são atribuídos depois pelo admin.
 */
async function concederAcessoBasico(
  tenantId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
) {
  const memberRole = await client.role.findFirst({
    where: { tenantId, nome: 'member', isSystem: true },
  })

  if (!memberRole) return

  await client.userRole.upsert({
    where: { userId_tenantId_roleId: { userId, tenantId, roleId: memberRole.id } },
    create: { userId, tenantId, roleId: memberRole.id },
    update: {},
  })
}

export async function aprovarMembro(membroId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const membro = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const atualizado = await tx.saasMembro.update({
      where: { id: membroId, tenantId: tenant.id },
      data: {
        status: 'APROVADO',
        aprovadoPorId: session.user.id,
        aprovadoPorNome: session.user.name ?? 'Admin',
        aprovadoEm: new Date(),
      },
    })

    await concederAcessoBasico(tenant.id, atualizado.userId, tx)

    if (atualizado.tipo === 'SOCIO') {
      await privatizarPerfilAoAprovarSocio(atualizado.userId, tenant.id, tx)
    }

    return atualizado
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_APROVADO',
      entidade: 'SaasMembro',
      entidadeId: membroId,
    },
  })

  await notificarSafe({
    userId: membro.userId,
    tenantId: tenant.id,
    tipo: 'MEMBRO_APROVADO',
    titulo: 'Sua solicitação foi aprovada',
    corpo: `Você agora é membro de ${tenant.nome}.`,
    link: '/portal/carteirinha',
  })

  revalidatePath('/admin/membros')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/carteirinha')
  revalidatePath(`/portal/comunidade/perfil/${membro.userId}`)
}

export async function reprovarMembro(membroId: string, motivo?: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_REJECT)

  const membro = await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'REPROVADO',
      aprovadoPorId: session.user.id,
      aprovadoPorNome: session.user.name ?? 'Admin',
      aprovadoEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_REPROVADO',
      entidade: 'SaasMembro',
      entidadeId: membroId,
      detalhes: motivo ? { motivo } : undefined,
    },
  })

  await notificarSafe({
    userId: membro.userId,
    tenantId: tenant.id,
    tipo: 'MEMBRO_REPROVADO',
    titulo: 'Sua solicitação foi reprovada',
    corpo: motivo?.trim()
      ? motivo.trim()
      : `Sua solicitação de ingresso em ${tenant.nome} não foi aprovada.`,
    link: '/portal/carteirinha',
  })

  revalidatePath('/admin/membros')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/carteirinha')
}

export async function reverterMembro(membroId: string) {
  // Reverte aprovação/reprovação para pendente — reaproveita MEMBERS_APPROVE
  // (não existe permissão dedicada para "reverter"; é a mesma decisão de
  // aprovação sendo desfeita).
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'PENDENTE',
      aprovadoPorId: null,
      aprovadoPorNome: null,
      aprovadoEm: null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_REVERTIDO_PENDENTE',
      entidade: 'SaasMembro',
      entidadeId: membroId,
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath('/portal/departamentos', 'layout')
}

export type MembroLgeState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function formToLgePayload(formData: FormData) {
  return {
    membroId: formData.get('membroId'),
    rg: formData.get('rg') ?? undefined,
    cpf: formData.get('cpf') ?? undefined,
    filiacao: formData.get('filiacao') ?? undefined,
    escolaridade: formData.get('escolaridade') ?? undefined,
    profissao: formData.get('profissao') ?? undefined,
    dataNascimento: formData.get('dataNascimento') ?? undefined,
    planoAssociacaoId: formData.get('planoAssociacaoId') ?? undefined,
  }
}

export async function atualizarDadosLge(
  _prev: MembroLgeState,
  formData: FormData,
): Promise<MembroLgeState> {
  const { session, tenant } = await assertAnyPermission([
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_APPROVE,
  ])

  const parsed = AtualizarMembroLgeSchema.safeParse(formToLgePayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data
  const existente: { id: string } | null = await db.saasMembro.findFirst({
    where: { id: data.membroId, tenantId: tenant.id },
    select: { id: true },
  })
  if (!existente) return { error: 'Membro não encontrado' }

  if (data.planoAssociacaoId) {
    const plano: { id: string } | null = await db.planoAssociacao.findFirst({
      where: { id: data.planoAssociacaoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!plano) return { errors: { planoAssociacaoId: ['Plano inválido'] } }
  }

  let dataNascimento: Date | null = null
  if (data.dataNascimento) {
    const { parseDataCompetencia } = await import('@torcida/types')
    dataNascimento = parseDataCompetencia(data.dataNascimento)
  }

  await db.saasMembro.update({
    where: { id: existente.id },
    data: {
      rg: data.rg ?? null,
      cpf: data.cpf ?? null,
      filiacao: data.filiacao ?? null,
      escolaridade: data.escolaridade ?? null,
      profissao: data.profissao ?? null,
      dataNascimento,
      planoAssociacaoId: data.planoAssociacaoId ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_LGE_ATUALIZADO',
      entidade: 'SaasMembro',
      entidadeId: existente.id,
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath(`/admin/membros/${existente.id}`)
  return { ok: true }
}

export async function desligarMembro(
  _prev: MembroLgeState,
  formData: FormData,
): Promise<MembroLgeState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_DISMISS)

  const parsed = DesligarMembroSchema.safeParse({
    membroId: formData.get('membroId'),
    motivo: formData.get('motivo'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const membro: { id: string; desligadoEm: Date | null } | null = await db.saasMembro.findFirst({
    where: { id: parsed.data.membroId, tenantId: tenant.id },
    select: { id: true, desligadoEm: true },
  })
  if (!membro) return { error: 'Membro não encontrado' }
  if (membro.desligadoEm) return { error: 'Membro já desligado' }

  await db.saasMembro.update({
    where: { id: membro.id },
    data: {
      desligadoEm: new Date(),
      desligadoMotivo: parsed.data.motivo,
      desligadoPorId: session.user.id,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_DESLIGADO',
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: { motivo: parsed.data.motivo },
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath(`/admin/membros/${membro.id}`)
  return { ok: true }
}

function csvEscape(val: string): string {
  if (/[",\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

export async function exportarCadastroLgeCsv(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: string }
> {
  const { tenant } = await assertPermission(PERMISSIONS.MEMBERS_EXPORT_LGE)

  type Row = {
    nome: string
    cpf: string | null
    rg: string | null
    filiacao: string | null
    escolaridade: string | null
    profissao: string | null
    dataNascimento: Date | null
    cidade: string | null
    telefone: string | null
    status: string
    adimplente: boolean
    desligadoEm: Date | null
  }

  const rows: Row[] = await db.saasMembro.findMany({
    where: { tenantId: tenant.id },
    orderBy: { nome: 'asc' },
    select: {
      nome: true,
      cpf: true,
      rg: true,
      filiacao: true,
      escolaridade: true,
      profissao: true,
      dataNascimento: true,
      cidade: true,
      telefone: true,
      status: true,
      adimplente: true,
      desligadoEm: true,
    },
  })

  const header =
    'nome,cpf,rg,filiacao,escolaridade,profissao,dataNascimento,cidade,telefone,status,adimplente,desligadoEm'
  const lines = rows.map((r) =>
    [
      r.nome,
      r.cpf ?? '',
      r.rg ?? '',
      r.filiacao ?? '',
      r.escolaridade ?? '',
      r.profissao ?? '',
      r.dataNascimento ? formatDataCompetenciaInput(r.dataNascimento) : '',
      r.cidade ?? '',
      r.telefone ?? '',
      r.status,
      r.adimplente ? 'sim' : 'nao',
      r.desligadoEm ? r.desligadoEm.toISOString() : '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  )

  const csv = [header, ...lines].join('\n')
  const filename = `lge-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv`
  return { ok: true, csv, filename }
}
