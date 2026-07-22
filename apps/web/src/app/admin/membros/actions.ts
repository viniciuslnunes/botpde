'use server'

import { revalidatePath } from 'next/cache'
import { invalidarBadgesAutorTenant } from '@/lib/comunidade-cache'
import { db, syncMembershipFromRoles, type Prisma } from '@torcida/db'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { notificarSafe } from '@/lib/notificacoes'
import { privatizarPerfilAoAprovarSocio } from '@/lib/social'
import { invalidatePermissionsCache } from '@/lib/tenant'
import {
  AtualizarMembroLgeSchema,
  DesligarMembroSchema,
  formatDataCompetenciaInput,
  PAPEL_DEPARTAMENTO,
  PERMISSIONS,
} from '@torcida/types'

/**
 * Concede acesso básico ao portal quando um membro é aprovado:
 * Role de sistema 'member' (se ainda não tiver).
 * Idempotente: seguro chamar mais de uma vez para o mesmo usuário/tenant.
 *
 * Sócio/Torcedor NÃO são departamentos (ver schema Departamento) — o tipo
 * vive em SaasMembro.tipo; departamentos reais (Financeiro, Comunicação…)
 * vêm da preferência do onboarding (SaasMembro.departamentoId) só neste
 * momento, ou depois via /admin/acessos.
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

/**
 * Aplica o departamento pretendido no onboarding (perfil Membro · área +
 * projeção UserDepartamento). Só chamar com membro já APROVADO.
 */
async function aplicarDepartamentoPreferido(
  tenantId: string,
  userId: string,
  departamentoId: string,
  client: Prisma.TransactionClient,
) {
  const depto: { id: string } | null = await client.departamento.findFirst({
    where: { id: departamentoId, tenantId },
    select: { id: true },
  })
  if (!depto) return

  const roleMembro: { id: string } | null = await client.role.findFirst({
    where: {
      tenantId,
      departamentoId,
      papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO,
    },
    select: { id: true },
  })

  if (roleMembro) {
    await client.userRole.upsert({
      where: {
        userId_tenantId_roleId: { userId, tenantId, roleId: roleMembro.id },
      },
      create: { userId, tenantId, roleId: roleMembro.id },
      update: {},
    })
  } else {
    await client.userDepartamento.upsert({
      where: {
        userId_tenantId_departamentoId: { userId, tenantId, departamentoId },
      },
      create: { userId, tenantId, departamentoId },
      update: {},
    })
  }

  await syncMembershipFromRoles(client, { userId, tenantId })
}

/**
 * Remove membership de área no tenant (UserDepartamento, gestores e perfis
 * com departamento). Usado ao reprovar/reverter — pendente/reprovado não
 * herda departamento.
 */
async function limparMembershipDepartamentos(
  tenantId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
) {
  const rolesDeArea: { id: string }[] = await client.role.findMany({
    where: { tenantId, departamentoId: { not: null } },
    select: { id: true },
  })
  if (rolesDeArea.length > 0) {
    await client.userRole.deleteMany({
      where: {
        userId,
        tenantId,
        roleId: { in: rolesDeArea.map((r) => r.id) },
      },
    })
  }

  await client.userDepartamento.deleteMany({ where: { userId, tenantId } })
  await client.departamentoGestor.deleteMany({
    where: { userId, departamento: { tenantId } },
  })
}

export type AprovarMembroOpts = {
  /** Default true: aplica SaasMembro.departamentoId como membership. */
  incluirDepartamento?: boolean
}

export async function aprovarMembro(membroId: string, opts?: AprovarMembroOpts) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)
  const incluirDepartamento = opts?.incluirDepartamento !== false

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
      if (incluirDepartamento && atualizado.departamentoId) {
        await aplicarDepartamentoPreferido(
          tenant.id,
          atualizado.userId,
          atualizado.departamentoId,
          tx,
        )
      }
    }

    return atualizado
  })

  invalidatePermissionsCache(membro.userId, tenant.id)

  // Auto-vínculo no canal oficial da unidade (governança hierárquica, Fase 2):
  // se o tenant tem Sede com canal provisionado, o membro aprovado entra nele.
  // SEMPRE aqui (aprovação) — nunca em GET/solicitação (anti-padrão write-on-GET).
  const sedesComCanal: { canalConversaId: string | null }[] = await db.sede.findMany({
    where: { tenantId: tenant.id, canalConversaId: { not: null } },
    select: { canalConversaId: true },
  })
  for (const sede of sedesComCanal) {
    if (!sede.canalConversaId) continue
    await db.membroConversa.upsert({
      where: {
        conversaId_userId: { conversaId: sede.canalConversaId, userId: membro.userId },
      },
      create: { conversaId: sede.canalConversaId, userId: membro.userId, papel: 'MEMBRO' },
      update: { saiuEm: null },
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_APROVADO',
      entidade: 'SaasMembro',
      entidadeId: membroId,
      detalhes:
        membro.departamentoId != null
          ? {
              departamentoId: membro.departamentoId,
              incluirDepartamento,
            }
          : undefined,
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

  invalidarBadgesAutorTenant(tenant.id)
  revalidatePath('/admin/membros')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/carteirinha')
  revalidatePath(`/portal/comunidade/perfil/${membro.userId}`)
}

export async function reprovarMembro(membroId: string, motivo?: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_REJECT)

  const membro = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const atualizado = await tx.saasMembro.update({
      where: { id: membroId, tenantId: tenant.id },
      data: {
        status: 'REPROVADO',
        aprovadoPorId: session.user.id,
        aprovadoPorNome: session.user.name ?? 'Admin',
        aprovadoEm: new Date(),
      },
    })

    // Preferência do onboarding NÃO vira equipe; limpa qualquer membership
    // órfã (ex.: bug antigo que upsertava UserDepartamento no cadastro).
    await limparMembershipDepartamentos(tenant.id, atualizado.userId, tx)

    return atualizado
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

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const atualizado = await tx.saasMembro.update({
      where: { id: membroId, tenantId: tenant.id },
      data: {
        status: 'PENDENTE',
        aprovadoPorId: null,
        aprovadoPorNome: null,
        aprovadoEm: null,
      },
    })

    // Pendente não herda departamento — remove membership concedida na aprovação.
    await limparMembershipDepartamentos(tenant.id, atualizado.userId, tx)
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

/**
 * Corrige / transfere a unidade territorial do membro (SaasMembro.sedeId).
 * Afeta KPIs da Visão da torcida, contagens em Sedes e escopo de eventos.
 */
export async function reatribuirSedeMembro(
  membroId: string,
  sedeId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const membro = await db.saasMembro.findFirst({
    where: { id: membroId, tenantId: tenant.id },
    select: { id: true, sedeId: true },
  })
  if (!membro) return { ok: false, error: 'Membro não encontrado.' }

  let sedeAlvoId: string | null = sedeId?.trim() || null
  if (sedeAlvoId) {
    const sede = await db.sede.findFirst({
      where: { id: sedeAlvoId, tenantId: tenant.id, ativa: true },
      select: { id: true },
    })
    if (!sede) return { ok: false, error: 'Unidade não encontrada ou inativa.' }
    sedeAlvoId = sede.id
  }

  if (membro.sedeId === sedeAlvoId) return { ok: true }

  await db.saasMembro.update({
    where: { id: membro.id },
    data: { sedeId: sedeAlvoId },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_SEDE_REATRIBUIDA',
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: {
        sedeIdAntes: membro.sedeId,
        sedeIdDepois: sedeAlvoId,
      },
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath(`/admin/membros/${membro.id}`)
  revalidatePath('/admin/sedes')
  revalidatePath('/admin/torcida')
  return { ok: true }
}
