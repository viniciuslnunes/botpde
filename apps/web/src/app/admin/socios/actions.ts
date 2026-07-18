'use server'

import { revalidatePath } from 'next/cache'
import { db, Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { novoQrTokenSocio } from '@/lib/pix-gateway'
import { PERMISSIONS } from '@torcida/types'

// Carteirinha/sócio reaproveita MEMBERS_APPROVE — não existe permissão
// dedicada para "gerenciar sócios" ainda; emitir/renovar/revogar carteirinha
// é parte do mesmo fluxo de aprovação de associado.

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  )
}

export async function emitirCarteirinha(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const userId = String(formData.get('userId') ?? '').trim()
  const nome = String(formData.get('nome') ?? '').trim()
  const validadeStr = String(formData.get('validade') ?? '').trim()

  if (!userId || !nome || !validadeStr) throw new Error('Todos os campos são obrigatórios')

  const validade = new Date(validadeStr)
  if (isNaN(validade.getTime())) throw new Error('Data de validade inválida')

  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: { id: true, status: true, tipo: true },
  })
  if (!membro) throw new Error('Membro não encontrado')
  if (membro.status !== 'APROVADO') throw new Error('Membro não está aprovado')
  if (membro.tipo !== 'SOCIO') throw new Error('Apenas membros do tipo Sócio podem receber carteirinha')

  const jaTem: { id: string } | null = await db.saasSocio.findFirst({
    where: { tenantId: tenant.id, userId },
    select: { id: true },
  })
  if (jaTem) throw new Error('Este membro já possui carteirinha')

  const qrToken = novoQrTokenSocio()
  let socio: { id: string; numeroSocio: number } | null = null

  // Advisory lock por tenant + retry em unique — evita race no MAX+1
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      socio = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`socio-num:${tenant.id}`}))`
        const ultimo: { numeroSocio: number } | null = await tx.saasSocio.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { numeroSocio: 'desc' },
          select: { numeroSocio: true },
        })
        const proximoNumero = (ultimo?.numeroSocio ?? 0) + 1
        return tx.saasSocio.create({
          data: {
            tenantId: tenant.id,
            userId,
            numeroSocio: proximoNumero,
            nome,
            validade,
            qrToken,
            qrEmitidoEm: new Date(),
          },
          select: { id: true, numeroSocio: true },
        })
      })
      break
    } catch (err: unknown) {
      if (isUniqueViolation(err) && attempt < 2) continue
      throw err
    }
  }

  if (!socio) throw new Error('Não foi possível emitir a carteirinha')

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_CARTEIRINHA_EMITIDA',
      entidade: 'SaasSocio',
      entidadeId: socio.id,
      detalhes: { nome, numeroSocio: socio.numeroSocio },
    },
  })

  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}

export async function renovarCarteirinha(socioId: string, novaValidade: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

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
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const socio = await db.saasSocio.findFirst({
    where: { id: socioId, tenantId: tenant.id },
    select: { id: true, nome: true, numeroSocio: true },
  })
  if (!socio) throw new Error('Carteirinha não encontrada')

  await db.saasSocio.delete({
    where: { id: socio.id, tenantId: tenant.id },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_CARTEIRINHA_REVOGADA',
      entidade: 'SaasSocio',
      entidadeId: socio.id,
      detalhes: { nome: socio.nome, numeroSocio: socio.numeroSocio },
    },
  })

  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}
