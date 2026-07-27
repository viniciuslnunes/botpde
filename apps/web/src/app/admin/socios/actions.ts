'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { novoQrTokenSocio } from '@/lib/pix-gateway'
import { notificarSafe } from '@/lib/notificacoes'
import { PERMISSIONS } from '@torcida/types'

// Carteirinha/sócio reaproveita MEMBERS_APPROVE — não existe permissão
// dedicada para "gerenciar sócios" ainda; emitir/renovar/revogar carteirinha
// é parte do mesmo fluxo de aprovação de associado.

const EmitirCarteirinhaSchema = z.object({
  userId: z.string().uuid('Membro inválido'),
  nome: z.string().trim().min(1, 'Nome obrigatório').max(120),
  validade: z
    .string()
    .min(1, 'Validade obrigatória')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data de validade inválida'),
})

const RenovarCarteirinhaSchema = z.object({
  socioId: z.string().uuid('Carteirinha inválida'),
  novaValidade: z
    .string()
    .min(1, 'Validade obrigatória')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data de validade inválida'),
})

const RevogarCarteirinhaSchema = z.object({
  socioId: z.string().uuid('Carteirinha inválida'),
})

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export async function emitirCarteirinha(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const parsed = EmitirCarteirinhaSchema.safeParse({
    userId: String(formData.get('userId') ?? ''),
    nome: String(formData.get('nome') ?? ''),
    validade: String(formData.get('validade') ?? ''),
  })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')
  }

  const { userId, nome } = parsed.data
  const validade = new Date(parsed.data.validade)

  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: { id: true, status: true, tipo: true, numeroAssociado: true },
  })
  if (!membro) throw new Error('Membro não encontrado')
  if (membro.status !== 'APROVADO') throw new Error('Membro não está aprovado')
  if (membro.tipo !== 'SOCIO')
    throw new Error('Apenas membros do tipo Sócio podem receber carteirinha')

  const numeroRaw = membro.numeroAssociado?.trim() ?? ''
  if (!/^\d+$/.test(numeroRaw)) {
    throw new ExpectedError(
      'Sócio sem número de associado no cadastro. Atualize o nº informado no recrutamento antes de emitir.',
    )
  }
  const numeroSocio = parseInt(numeroRaw, 10)
  if (!Number.isFinite(numeroSocio) || numeroSocio < 1) {
    throw new ExpectedError('Número de associado inválido.')
  }

  const jaTem: { id: string } | null = await db.saasSocio.findFirst({
    where: { tenantId: tenant.id, userId },
    select: { id: true },
  })
  if (jaTem) throw new Error('Este membro já possui carteirinha')

  const qrToken = novoQrTokenSocio()
  let socio: { id: string; numeroSocio: number } | null = null

  // Advisory lock por tenant + retry em unique — nº = o do recrutamento (não sequencial)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      socio = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`socio-num:${tenant.id}`}))`
        const conflito: { id: string } | null = await tx.saasSocio.findFirst({
          where: { tenantId: tenant.id, numeroSocio },
          select: { id: true },
        })
        if (conflito) {
          throw new ExpectedError(
            `Já existe carteirinha com o nº ${numeroRaw} nesta torcida.`,
          )
        }
        return tx.saasSocio.create({
          data: {
            tenantId: tenant.id,
            userId,
            numeroSocio,
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
      if (err instanceof ExpectedError) throw err
      if (isUniqueViolation(err) && attempt < 2) continue
      if (isUniqueViolation(err)) {
        throw new ExpectedError(
          `Já existe carteirinha com o nº ${numeroRaw} nesta torcida.`,
        )
      }
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
      detalhes: { nome, numeroSocio: socio.numeroSocio, numeroAssociado: numeroRaw },
    },
  })

  await notificarSafe({
    userId,
    tenantId: tenant.id,
    tipo: 'SOCIO_CARTEIRINHA_EMITIDA',
    titulo: 'Carteirinha de sócio emitida',
    corpo: `Você é o sócio nº ${numeroRaw}.`,
    link: '/portal/carteirinha',
    atorId: session.user.id,
  })

  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}

export async function renovarCarteirinha(socioId: string, novaValidade: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const parsed = RenovarCarteirinhaSchema.safeParse({ socioId, novaValidade })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')
  }

  const validade = new Date(parsed.data.novaValidade)

  const socio = await db.saasSocio.findFirst({
    where: { id: parsed.data.socioId, tenantId: tenant.id },
    select: { id: true, userId: true },
  })
  if (!socio) throw new Error('Carteirinha não encontrada')

  await db.saasSocio.update({
    where: { id: socio.id },
    data: { validade },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_CARTEIRINHA_RENOVADA',
      entidade: 'SaasSocio',
      entidadeId: socio.id,
      detalhes: { novaValidade: parsed.data.novaValidade },
    },
  })

  await notificarSafe({
    userId: socio.userId,
    tenantId: tenant.id,
    tipo: 'SOCIO_CARTEIRINHA_RENOVADA',
    titulo: 'Carteirinha renovada',
    corpo: `Sua carteirinha agora é válida até ${parsed.data.novaValidade}.`,
    link: '/portal/carteirinha',
    atorId: session.user.id,
  })

  revalidatePath('/admin/socios')
}

export async function revogarCarteirinha(socioId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const parsed = RevogarCarteirinhaSchema.safeParse({ socioId })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')
  }

  const socio = await db.saasSocio.findFirst({
    where: { id: parsed.data.socioId, tenantId: tenant.id },
    select: { id: true, nome: true, numeroSocio: true, userId: true },
  })
  if (!socio) throw new Error('Carteirinha não encontrada')

  await db.saasSocio.delete({
    where: { id: socio.id },
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

  await notificarSafe({
    userId: socio.userId,
    tenantId: tenant.id,
    tipo: 'SOCIO_CARTEIRINHA_REVOGADA',
    titulo: 'Carteirinha revogada',
    link: '/portal/carteirinha',
    atorId: session.user.id,
  })

  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}
