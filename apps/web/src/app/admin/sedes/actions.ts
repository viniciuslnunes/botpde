'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

async function assertAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  const role = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
    },
  })
  if (!role) throw new Error('Sem permissão')
  return { session, tenant }
}

const sedeSchema = z.object({
  nome: z.string().min(3, 'Nome muito curto').max(100),
  tipo: z.enum(['SEDE', 'SUBSEDE', 'PONTO_ENCONTRO']),
  sedeId: z
    .string()
    .optional()
    .transform((v) => v || null),
  endereco: z.string().max(200).optional().transform((v) => v || null),
  cidade: z.string().max(100).optional().transform((v) => v || null),
  estado: z.string().max(2).optional().transform((v) => v || null),
  cep: z.string().max(9).optional().transform((v) => v || null),
  capacidade: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : null))
    .pipe(z.number().int().positive().nullable().optional()),
  responsavel: z.string().max(100).optional().transform((v) => v || null),
  telefone: z.string().max(20).optional().transform((v) => v || null),
  horarios: z.string().max(200).optional().transform((v) => v || null),
  descricao: z.string().max(1000).optional().transform((v) => v || null),
})

export type SedeState = {
  errors?: Record<string, string[]>
  message?: string
}

function parseSedeForm(formData: FormData) {
  return {
    nome: formData.get('nome') as string,
    tipo: formData.get('tipo') as string,
    sedeId: formData.get('sedeId') as string | undefined,
    endereco: formData.get('endereco') as string | undefined,
    cidade: formData.get('cidade') as string | undefined,
    estado: formData.get('estado') as string | undefined,
    cep: formData.get('cep') as string | undefined,
    capacidade: formData.get('capacidade') as string | undefined,
    responsavel: formData.get('responsavel') as string | undefined,
    telefone: formData.get('telefone') as string | undefined,
    horarios: formData.get('horarios') as string | undefined,
    descricao: formData.get('descricao') as string | undefined,
  }
}

export async function criarSede(
  _prev: SedeState,
  formData: FormData,
): Promise<SedeState> {
  const { session, tenant } = await assertAdmin()

  const parsed = sedeSchema.safeParse(parseSedeForm(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, tipo, sedeId, ...rest } = parsed.data

  // Valida que a sede pai pertence ao mesmo tenant
  if (sedeId) {
    const pai = await db.sede.findUnique({ where: { id: sedeId }, select: { tenantId: true } })
    if (!pai || pai.tenantId !== tenant.id) {
      return { errors: { sedeId: ['Sede pai não encontrada.'] } }
    }
  }

  const sede = await db.sede.create({
    data: {
      tenantId: tenant.id,
      nome,
      tipo,
      sedeId: sedeId ?? null,
      ...rest,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      usuarioId: session.user.id,
      acao: 'SEDE_CRIADA',
      entidade: 'Sede',
      entidadeId: sede.id,
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  redirect('/admin/sedes')
}

export async function editarSede(
  sedeId: string,
  _prev: SedeState,
  formData: FormData,
): Promise<SedeState> {
  const { session, tenant } = await assertAdmin()

  const parsed = sedeSchema.safeParse(parseSedeForm(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const existing = await db.sede.findUnique({ where: { id: sedeId }, select: { tenantId: true } })
  if (!existing || existing.tenantId !== tenant.id) {
    return { message: 'Sede não encontrada.' }
  }

  const { nome, tipo, sedeId: sedePaiId, ...rest } = parsed.data

  await db.sede.update({
    where: { id: sedeId },
    data: { nome, tipo, sedeId: sedePaiId ?? null, ...rest },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      usuarioId: session.user.id,
      acao: 'SEDE_EDITADA',
      entidade: 'Sede',
      entidadeId: sedeId,
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  redirect('/admin/sedes')
}

export async function alterarStatusSede(sedeId: string, ativa: boolean) {
  const { session, tenant } = await assertAdmin()

  const existing = await db.sede.findUnique({ where: { id: sedeId }, select: { tenantId: true } })
  if (!existing || existing.tenantId !== tenant.id) throw new Error('Sede não encontrada')

  await db.sede.update({ where: { id: sedeId }, data: { ativa } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      usuarioId: session.user.id,
      acao: ativa ? 'SEDE_ATIVADA' : 'SEDE_DESATIVADA',
      entidade: 'Sede',
      entidadeId: sedeId,
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
}
