/**
 * Emissão de carteirinha digital (`SaasSocio`) — compartilhada entre
 * emissão manual (`emitirCarteirinha`) e auto-emissão na aprovação
 * (sócio EXISTENTE com nº + expedição + periodicidade).
 */
import { db, Prisma } from '@torcida/db'
import { ExpectedError } from '@/lib/expected-error'
import { novoQrTokenSocio } from '@/lib/pix-gateway'
import { calcularValidadeCarteirinha } from '@/lib/carteirinha-validade'
import type { PeriodicidadePlano } from '@/lib/carteirinha-validade'

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export type EmitirCarteirinhaParams = {
  tenantId: string
  userId: string
  nome: string
  /** Número já validado (dígitos do cadastro). */
  numeroAssociado: string
  validade: Date
  /** Data de expedição usada no cálculo (opcional na emissão manual). */
  expedidoEm?: Date | null
  atorId: string
  /** Se true, não notifica o sócio (ex.: lote). Default: notifica. */
  silencioso?: boolean
  /**
   * Emissão espelhada: tenant de onde a carteirinha veio (origem↔Sede raiz).
   * Só marca o `AuditLog` — quem propaga é `lib/carteirinha-espelho.ts`.
   */
  espelhoDeTenantId?: string
}

export type EmitirCarteirinhaResultado = {
  id: string
  numeroSocio: number
  validade: Date
  jaExistia: boolean
}

/**
 * Cria `SaasSocio` no tenant da origem. Idempotente se já houver carteirinha
 * para o user (retorna `jaExistia: true` sem erro).
 */
export async function emitirCarteirinhaInterna(
  params: EmitirCarteirinhaParams,
): Promise<EmitirCarteirinhaResultado> {
  const numeroRaw = params.numeroAssociado.trim()
  if (!/^\d+$/.test(numeroRaw)) {
    throw new ExpectedError(
      'Sócio sem número de associado no cadastro. Atualize o nº informado no recrutamento antes de emitir.',
    )
  }
  const numeroSocio = parseInt(numeroRaw, 10)
  if (!Number.isFinite(numeroSocio) || numeroSocio < 1) {
    throw new ExpectedError('Número de associado inválido.')
  }

  const jaTem: { id: string; numeroSocio: number; validade: Date } | null =
    await db.saasSocio.findFirst({
      where: { tenantId: params.tenantId, userId: params.userId },
      select: { id: true, numeroSocio: true, validade: true },
    })
  if (jaTem) {
    return {
      id: jaTem.id,
      numeroSocio: jaTem.numeroSocio,
      validade: jaTem.validade,
      jaExistia: true,
    }
  }

  const qrToken = novoQrTokenSocio()
  let socio: { id: string; numeroSocio: number; validade: Date } | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      socio = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`socio-num:${params.tenantId}`}))`
        const conflito: { id: string } | null = await tx.saasSocio.findFirst({
          where: { tenantId: params.tenantId, numeroSocio },
          select: { id: true },
        })
        if (conflito) {
          throw new ExpectedError(
            `Já existe carteirinha com o nº ${numeroRaw} nesta torcida.`,
          )
        }
        return tx.saasSocio.create({
          data: {
            tenantId: params.tenantId,
            userId: params.userId,
            numeroSocio,
            nome: params.nome,
            validade: params.validade,
            expedidoEm: params.expedidoEm ?? null,
            qrToken,
            qrEmitidoEm: new Date(),
          },
          select: { id: true, numeroSocio: true, validade: true },
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
      tenantId: params.tenantId,
      atorId: params.atorId,
      acao: 'SOCIO_CARTEIRINHA_EMITIDA',
      entidade: 'SaasSocio',
      entidadeId: socio.id,
      detalhes: {
        nome: params.nome,
        numeroSocio: socio.numeroSocio,
        numeroAssociado: numeroRaw,
        auto: Boolean(params.expedidoEm),
        validade: params.validade.toISOString().slice(0, 10),
        ...(params.espelhoDeTenantId
          ? { espelho: true, origemTenantId: params.espelhoDeTenantId }
          : {}),
      },
    },
  })

  return {
    id: socio.id,
    numeroSocio: socio.numeroSocio,
    validade: socio.validade,
    jaExistia: false,
  }
}

/**
 * Auto-emite na aprovação quando o cadastro tem nº + expedição + periodicidade.
 * Best-effort: falha não desfaz a aprovação (sócio fica em Aguardando emissão).
 */
export async function tentarAutoEmitirCarteirinhaAposAprovacao(opts: {
  tenantId: string
  userId: string
  nome: string
  tipo: string
  numeroAssociado: string | null
  dataExpedicaoCarteirinha: Date | null
  periodicidadePretendida: string | null
  atorId: string
}): Promise<{ emitida: boolean; motivo?: string }> {
  if (opts.tipo !== 'SOCIO') return { emitida: false, motivo: 'nao_socio' }
  if (!opts.numeroAssociado?.trim()) return { emitida: false, motivo: 'sem_numero' }
  if (!opts.dataExpedicaoCarteirinha) return { emitida: false, motivo: 'sem_expedicao' }
  if (!opts.periodicidadePretendida) return { emitida: false, motivo: 'sem_periodicidade' }

  const periodicidade = opts.periodicidadePretendida as PeriodicidadePlano
  let validade: Date
  try {
    validade = calcularValidadeCarteirinha(opts.dataExpedicaoCarteirinha, periodicidade)
  } catch {
    return { emitida: false, motivo: 'validade_invalida' }
  }

  try {
    const r = await emitirCarteirinhaInterna({
      tenantId: opts.tenantId,
      userId: opts.userId,
      nome: opts.nome,
      numeroAssociado: opts.numeroAssociado,
      validade,
      expedidoEm: opts.dataExpedicaoCarteirinha,
      atorId: opts.atorId,
    })
    return { emitida: true, motivo: r.jaExistia ? 'ja_existia' : undefined }
  } catch (err) {
    console.error('[tentarAutoEmitirCarteirinhaAposAprovacao]', err)
    return {
      emitida: false,
      motivo: err instanceof Error ? err.message : 'erro_emissao',
    }
  }
}
