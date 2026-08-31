/**
 * Ledger de confiança na torcida. Best-effort: falha no sinal não derruba
 * check-in, baixa de cobrança nem aprovação.
 */
import 'server-only'
import { after } from 'next/server'
import { db, Prisma } from '@torcida/db'
import {
  isSinalConfianca,
  materializarSaldoConfianca,
  MENSAGEM_CAPACIDADE_CONFIANCA,
  origemConfereConfianca,
  pisoNivelPorCargos,
  SINAL_CONFIANCA,
  somarScoreEventos,
  temCapacidade,
} from '@torcida/types'
import { ExpectedError } from '@/lib/expected-error'

export type SinalConfiancaInput = {
  userId: string
  tenantId: string
  sinal: 'CHECKIN' | 'MENSALIDADE' | 'APROVACAO' | 'REPROVACAO'
  origemId: string
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

type Tx = Prisma.TransactionClient

async function vinculoAprovadoNoTenant(
  tx: Tx,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const membro: { status: string; desligadoEm: Date | null } | null = await tx.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true, desligadoEm: true },
  })
  return Boolean(membro && membro.status === 'APROVADO' && !membro.desligadoEm)
}

async function carregarOrigem(
  tx: Tx,
  input: SinalConfiancaInput,
): Promise<{
  userId: string
  tenantId: string
  tipo?: string | null
  status?: string | null
  checkedInAt?: Date | null
} | null> {
  if (input.sinal === 'CHECKIN') {
    const rsvp: {
      userId: string
      checkedInAt: Date | null
      evento: { tenantId: string }
    } | null = await tx.eventoRsvp.findUnique({
      where: { id: input.origemId },
      select: { userId: true, checkedInAt: true, evento: { select: { tenantId: true } } },
    })
    if (!rsvp) return null
    return { userId: rsvp.userId, tenantId: rsvp.evento.tenantId, checkedInAt: rsvp.checkedInAt }
  }
  if (input.sinal === 'MENSALIDADE') {
    const cob: {
      userId: string
      tenantId: string
      tipo: string
      status: string
    } | null = await tx.cobrancaAssociacao.findUnique({
      where: { id: input.origemId },
      select: { userId: true, tenantId: true, tipo: true, status: true },
    })
    return cob
  }
  const membro: { userId: string; tenantId: string; status: string } | null =
    await tx.saasMembro.findUnique({
      where: { id: input.origemId },
      select: { userId: true, tenantId: true, status: true },
    })
  return membro
}

async function recalcularSaldoConfiancaTx(tx: Tx, userId: string, tenantId: string): Promise<void> {
  const [eventos, cargos]: [
    Array<{ sinal: string; peso: number; criadoEm: Date }>,
    Array<{ role: { nome: string; isSystem: boolean } }>,
  ] = await Promise.all([
    tx.confiancaEvento.findMany({
      where: { userId, tenantId },
      select: { sinal: true, peso: true, criadoEm: true },
    }),
    tx.userRole.findMany({
      where: { userId, tenantId },
      select: { role: { select: { nome: true, isSystem: true } } },
    }),
  ])

  const score = somarScoreEventos(eventos)
  const { nivel } = materializarSaldoConfianca({
    score,
    pisoNivel: pisoNivelPorCargos(cargos.map((c) => c.role)),
  })

  await tx.confiancaSaldo.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, score, nivel },
    update: { score, nivel },
  })
}

export type NivelConfiancaResolvido = { score: number; nivel: number }

/** Piso de cargo ao vivo — promover a owner vale no request, sem esperar sinal. */
export async function resolverNivelConfianca(
  userId: string,
  tenantId: string,
): Promise<NivelConfiancaResolvido> {
  const [saldo, cargos]: [
    { score: number } | null,
    Array<{ role: { nome: string; isSystem: boolean } }>,
  ] = await Promise.all([
    db.confiancaSaldo.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { score: true },
    }),
    db.userRole.findMany({
      where: { userId, tenantId },
      select: { role: { select: { nome: true, isSystem: true } } },
    }),
  ])
  return materializarSaldoConfianca({
    score: saldo?.score ?? 0,
    pisoNivel: pisoNivelPorCargos(cargos.map((c) => c.role)),
  })
}

export type CapacidadeConfianca = 'grupo:criar' | 'canal:criar' | 'sala:hospedar'

/** Tenant sintético (CN) não tem eixo local — capacidade sempre verdadeira. */
export async function temCapacidadeConfianca(
  userId: string,
  tenantId: string,
  capacidade: CapacidadeConfianca,
): Promise<boolean> {
  const tenant: { sintetico: boolean } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { sintetico: true },
  })
  if (!tenant || tenant.sintetico) return true
  const { nivel } = await resolverNivelConfianca(userId, tenantId)
  return temCapacidade(nivel, capacidade)
}

export async function assertCapacidadeConfianca(
  userId: string,
  tenantId: string,
  capacidade: CapacidadeConfianca,
): Promise<void> {
  if (await temCapacidadeConfianca(userId, tenantId, capacidade)) return
  throw new ExpectedError(MENSAGEM_CAPACIDADE_CONFIANCA[capacidade])
}

export async function registrarSinalConfianca(input: SinalConfiancaInput): Promise<void> {
  if (!input.userId || !input.tenantId || !input.origemId) return
  if (!isSinalConfianca(input.sinal)) return
  const spec = SINAL_CONFIANCA[input.sinal]
  const chaveLock = `confianca:${input.tenantId}:${input.userId}`

  await db.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chaveLock}))`

    if (
      (input.sinal === 'CHECKIN' || input.sinal === 'MENSALIDADE') &&
      !(await vinculoAprovadoNoTenant(tx, input.userId, input.tenantId))
    ) {
      return
    }

    const origem = await carregarOrigem(tx, input)
    if (!origemConfereConfianca(input.sinal, input, origem)) return

    try {
      await tx.confiancaEvento.create({
        data: {
          userId: input.userId,
          tenantId: input.tenantId,
          sinal: input.sinal,
          peso: spec.peso,
          origemTipo: spec.origemTipo,
          origemId: input.origemId,
        },
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
    }

    await recalcularSaldoConfiancaTx(tx, input.userId, input.tenantId)
  })
}

/** Fora do response (padrão Comunidade). Retry idempotente regrava o saldo. */
export function registrarSinalConfiancaSafe(input: SinalConfiancaInput): void {
  const run = () => {
    void registrarSinalConfianca(input).catch((err: unknown) => {
      console.error('[confianca]', input.sinal, input.origemId, err)
    })
  }
  try {
    after(run)
  } catch {
    run()
  }
}
