'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { emitirCarteirinhaInterna } from '@/lib/carteirinha-emissao'
import {
  espelharCarteirinhaDoTenant,
  espelharRenovacaoCarteirinha,
  espelharRevogacaoCarteirinha,
} from '@/lib/carteirinha-espelho'
import { notificarSafe } from '@/lib/notificacoes'
import { PERMISSIONS } from '@torcida/types'
import {
  lockNumeroAssociadoDaTorcida,
  validarNumeroAssociadoUnicoNaTorcida,
} from '@/lib/membros-sede'

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
  numeroAssociado: z
    .string()
    .trim()
    .max(7)
    .regex(/^\d*$/, 'Use só números')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
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
    numeroAssociado: String(formData.get('numeroAssociado') ?? ''),
  })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')
  }

  const { userId, nome } = parsed.data
  const validade = new Date(parsed.data.validade)

  type MembroEmit = {
    id: string
    status: string
    tipo: string
    numeroAssociado: string | null
    espelhado: boolean
    membroOrigemId: string | null
  }
  const membro: MembroEmit | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: {
      id: true,
      status: true,
      tipo: true,
      numeroAssociado: true,
      espelhado: true,
      membroOrigemId: true,
    },
  })
  if (!membro) throw new Error('Membro não encontrado')
  if (membro.status !== 'APROVADO') throw new Error('Membro não está aprovado')
  if (membro.tipo !== 'SOCIO')
    throw new Error('Apenas membros do tipo Sócio podem receber carteirinha')

  let numeroRaw = membro.numeroAssociado?.trim() ?? ''
  if (!numeroRaw) {
    numeroRaw = parsed.data.numeroAssociado?.trim() ?? ''
    if (!/^\d+$/.test(numeroRaw)) {
      throw new ExpectedError(
        'Informe o número de associado para emitir a carteirinha.',
      )
    }
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockNumeroAssociadoDaTorcida(tx, tenant.id)
      await validarNumeroAssociadoUnicoNaTorcida(
        tx,
        tenant.id,
        userId,
        numeroRaw,
        membro.id,
      )
      await tx.saasMembro.update({
        where: { id: membro.id },
        data: { numeroAssociado: numeroRaw },
      })
      if (membro.espelhado && membro.membroOrigemId) {
        await tx.saasMembro.update({
          where: { id: membro.membroOrigemId },
          data: { numeroAssociado: numeroRaw },
        })
      } else {
        const espelho: { id: string } | null = await tx.saasMembro.findUnique({
          where: { membroOrigemId: membro.id },
          select: { id: true },
        })
        if (espelho) {
          await tx.saasMembro.update({
            where: { id: espelho.id },
            data: { numeroAssociado: numeroRaw },
          })
        }
      }
    })
  }
  const resultado = await emitirCarteirinhaInterna({
    tenantId: tenant.id,
    userId,
    nome,
    numeroAssociado: numeroRaw,
    validade,
    atorId: session.user.id,
  })
  if (resultado.jaExistia) throw new Error('Este membro já possui carteirinha')

  // Mesmo sócio nos dois níveis: replica no gêmeo (unidade↔Sede raiz).
  await espelharCarteirinhaDoTenant({
    tenantId: tenant.id,
    userId,
    atorId: session.user.id,
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

  // A validade não pode divergir entre unidade e Sede — é a mesma carteirinha.
  await espelharRenovacaoCarteirinha({
    tenantId: tenant.id,
    userId: socio.userId,
    validade,
    atorId: session.user.id,
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

/**
 * Alinha o `numeroSocio` de carteirinhas legadas (emitidas com sequencial MAX+1)
 * ao nº informado no recrutamento, para a ordenação por número casar com o
 * número exibido.
 *
 * Existe como ação explícita porque é uma escrita: rodava a cada abertura da
 * lista, o que tornava um GET mutante — sem auditoria, sem consentimento e
 * disparado por qualquer refresh ou prefetch.
 */
export async function sincronizarNumerosSocio(): Promise<{
  corrigidas: number
  conflitos: number
}> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const carteirinhas: { id: string; userId: string; numeroSocio: number }[] =
    await db.saasSocio.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, userId: true, numeroSocio: true },
    })
  if (carteirinhas.length === 0) return { corrigidas: 0, conflitos: 0 }

  const membros: { userId: string; numeroAssociado: string | null }[] =
    await db.saasMembro.findMany({
      where: { tenantId: tenant.id, userId: { in: carteirinhas.map((c) => c.userId) } },
      select: { userId: true, numeroAssociado: true },
    })
  const numeroPorUser = new Map(
    membros.map((m) => [m.userId, m.numeroAssociado?.trim() ?? '']),
  )

  const pendentes = carteirinhas.flatMap((c) => {
    const raw = numeroPorUser.get(c.userId) ?? ''
    if (!/^\d+$/.test(raw)) return []
    const numero = parseInt(raw, 10)
    if (numero === c.numeroSocio) return []
    return [{ id: c.id, de: c.numeroSocio, para: numero }]
  })
  if (pendentes.length === 0) return { corrigidas: 0, conflitos: 0 }

  let corrigidas = 0
  let conflitos = 0
  for (const pendente of pendentes) {
    try {
      // Lock por torcida: o nº é único por tenant, e emitir carteirinha usa o
      // mesmo lock — sem ele, sync e emissão podem disputar o mesmo número.
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`socio-num:${tenant.id}`}))`
        await tx.saasSocio.update({
          where: { id: pendente.id },
          data: { numeroSocio: pendente.para },
        })
      })
      corrigidas++
    } catch (err: unknown) {
      // Número já ocupado por outra carteirinha: a UI segue mostrando o nº do
      // cadastro; resolver exige corrigir a duplicidade no recrutamento.
      if (!isUniqueViolation(err)) throw err
      conflitos++
    }
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SOCIO_NUMEROS_SINCRONIZADOS',
      entidade: 'SaasSocio',
      entidadeId: tenant.id,
      detalhes: {
        corrigidas,
        conflitos,
        alteracoes: pendentes.slice(0, 50),
      },
    },
  })

  revalidatePath('/admin/socios')
  return { corrigidas, conflitos }
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

  // Revogar de um lado só deixaria o `numeroSocio` preso no outro tenant.
  await espelharRevogacaoCarteirinha({
    tenantId: tenant.id,
    userId: socio.userId,
    atorId: session.user.id,
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
