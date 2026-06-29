'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'

async function assertAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) throw new Error('Não autorizado')

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

export async function emitirCarteirinha(formData: FormData) {
  const { session, tenant } = await assertAdmin()

  const userId = String(formData.get('userId') ?? '').trim()
  const nome = String(formData.get('nome') ?? '').trim()
  const validadeStr = String(formData.get('validade') ?? '').trim()

  if (!userId || !nome || !validadeStr) throw new Error('Todos os campos são obrigatórios')

  const validade = new Date(validadeStr)
  if (isNaN(validade.getTime())) throw new Error('Data de validade inválida')

  // Verifica se o membro é SOCIO aprovado
  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
  })
  if (!membro) throw new Error('Membro não encontrado')
  if (membro.status !== 'APROVADO') throw new Error('Membro não está aprovado')
  if (membro.tipo !== 'SOCIO') throw new Error('Apenas membros do tipo Sócio podem receber carteirinha')

  // Gera próximo número de sócio
  const ultimo = await db.saasSocio.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { numeroSocio: 'desc' },
  })
  const proximoNumero = (ultimo?.numeroSocio ?? 0) + 1

  const socio = await db.saasSocio.create({
    data: {
      tenantId: tenant.id,
      userId,
      numeroSocio: proximoNumero,
      nome,
      validade,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_CARTEIRINHA_EMITIDA',
      entidade: 'SaasSocio',
      entidadeId: socio.id,
      detalhes: { nome, numeroSocio: proximoNumero },
    },
  })

  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}

export async function renovarCarteirinha(socioId: string, novaValidade: string) {
  const { session, tenant } = await assertAdmin()

  const validade = new Date(novaValidade)
  if (isNaN(validade.getTime())) throw new Error('Data de validade inválida')

  await db.saasSocio.update({
    where: { id: socioId, tenantId: tenant.id },
    data: { validade },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_CARTEIRINHA_RENOVADA',
      entidade: 'SaasSocio',
      entidadeId: socioId,
      detalhes: { novaValidade },
    },
  })

  revalidatePath('/admin/socios')
}

export async function revogarCarteirinha(socioId: string) {
  const { session, tenant } = await assertAdmin()

  const socio = await db.saasSocio.findFirst({
    where: { id: socioId, tenantId: tenant.id },
  })
  if (!socio) throw new Error('Carteirinha não encontrada')

  await db.saasSocio.delete({ where: { id: socioId } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_CARTEIRINHA_REVOGADA',
      detalhes: { nome: socio.nome, numeroSocio: socio.numeroSocio },
    },
  })

  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}
