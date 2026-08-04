/**
 * Propagação da carteirinha (`SaasSocio`) entre o vínculo canônico da unidade e
 * o gêmeo espelho na Sede raiz (Caso B).
 *
 * `SaasSocio` é por tenant, mas o sócio é o MESMO nas duas pontas: mesmo
 * `numeroAssociado`, mesma validade. O desligamento já revogava a carteirinha
 * dos dois lados (`desligarMembro`); faltava o lado que a cria — sem isso o
 * sócio aprovado no PDE ficava eternamente em "Aguardando emissão" na Sede e
 * sumia das abas Emitidas/Ativos (que leem `SaasSocio`).
 *
 * Tudo aqui é **best-effort**: uma falha na ponta espelhada (nº já ocupado por
 * outra pessoa naquele tenant, por exemplo) nunca desfaz a operação que a
 * originou — grava `SOCIO_CARTEIRINHA_ESPELHO_FALHOU` para diagnóstico.
 */
import { db } from '@torcida/db'
import { emitirCarteirinhaInterna } from '@/lib/carteirinha-emissao'

type ParSocio = {
  tenantId: string
  userId: string
  nome: string
  numeroAssociado: string | null
}

type MembroParSelect = {
  id: string
  tenantId: string
  userId: string
  nome: string
  numeroAssociado: string | null
  tipo: string
  status: string
  desligadoEm: Date | null
}

const membroParSelect = {
  id: true,
  tenantId: true,
  userId: true,
  nome: true,
  numeroAssociado: true,
  tipo: true,
  status: true,
  desligadoEm: true,
} as const

/**
 * Vínculo gêmeo do sócio no outro tenant (origem→espelho ou espelho→origem).
 * `null` quando não há par, quando o par não é sócio aprovado ou já foi
 * desligado — nesses casos não existe carteirinha a espelhar.
 */
export async function resolverParDoSocio(
  tenantId: string,
  userId: string,
): Promise<ParSocio | null> {
  const membro: MembroParSelect | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: membroParSelect,
  })
  if (!membro) return null

  const par: MembroParSelect | null = membro.status === 'APROVADO' && !membro.desligadoEm
    ? await buscarPar(membro)
    : null
  if (!par) return null
  if (par.tipo !== 'SOCIO' || par.status !== 'APROVADO' || par.desligadoEm) return null

  return {
    tenantId: par.tenantId,
    userId: par.userId,
    nome: par.nome,
    numeroAssociado: par.numeroAssociado,
  }
}

async function buscarPar(membro: MembroParSelect): Promise<MembroParSelect | null> {
  const espelhado: { espelhado: boolean; membroOrigemId: string | null } | null =
    await db.saasMembro.findUnique({
      where: { id: membro.id },
      select: { espelhado: true, membroOrigemId: true },
    })
  if (!espelhado) return null

  if (espelhado.espelhado) {
    if (!espelhado.membroOrigemId) return null
    return db.saasMembro.findUnique({
      where: { id: espelhado.membroOrigemId },
      select: membroParSelect,
    })
  }
  return db.saasMembro.findUnique({
    where: { membroOrigemId: membro.id },
    select: membroParSelect,
  })
}

async function registrarFalha(
  tenantId: string,
  atorId: string,
  userId: string,
  motivo: string,
  origemTenantId: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId,
        atorId,
        acao: 'SOCIO_CARTEIRINHA_ESPELHO_FALHOU',
        entidade: 'SaasMembro',
        entidadeId: userId,
        detalhes: { motivo, origemTenantId, automatico: true },
      },
    })
  } catch (err) {
    console.error('[carteirinha-espelho] falha ao auditar', err)
  }
}

/**
 * Garante a carteirinha do par com a validade informada. Emite se não existir,
 * atualiza a validade se já existir (renovação). Idempotente.
 */
async function garantirCarteirinhaNoPar(opts: {
  par: ParSocio
  origemTenantId: string
  validade: Date
  expedidoEm: Date | null
  atorId: string
}): Promise<void> {
  const { par, origemTenantId, validade, expedidoEm, atorId } = opts

  const existente: { id: string; validade: Date } | null = await db.saasSocio.findFirst({
    where: { tenantId: par.tenantId, userId: par.userId },
    select: { id: true, validade: true },
  })

  if (existente) {
    if (existente.validade.getTime() === validade.getTime()) return
    await db.saasSocio.update({ where: { id: existente.id }, data: { validade } })
    await db.auditLog.create({
      data: {
        tenantId: par.tenantId,
        atorId,
        acao: 'SOCIO_CARTEIRINHA_RENOVADA',
        entidade: 'SaasSocio',
        entidadeId: existente.id,
        detalhes: {
          novaValidade: validade.toISOString().slice(0, 10),
          espelho: true,
          origemTenantId,
        },
      },
    })
    return
  }

  const numero = par.numeroAssociado?.trim() ?? ''
  if (!/^\d+$/.test(numero)) {
    await registrarFalha(par.tenantId, atorId, par.userId, 'sem_numero', origemTenantId)
    return
  }

  await emitirCarteirinhaInterna({
    tenantId: par.tenantId,
    userId: par.userId,
    nome: par.nome,
    numeroAssociado: numero,
    validade,
    expedidoEm,
    atorId,
    espelhoDeTenantId: origemTenantId,
  })
}

/**
 * Replica no par a carteirinha que acabou de existir em `tenantId`. No-op se o
 * tenant não tem carteirinha para o user ou se não há par (torcida sem Sede
 * acima, torcedor, membro desligado).
 */
export async function espelharCarteirinhaDoTenant(opts: {
  tenantId: string
  userId: string
  atorId: string
}): Promise<void> {
  const { tenantId, userId, atorId } = opts
  try {
    const par = await resolverParDoSocio(tenantId, userId)
    if (!par) return

    const origem: { validade: Date; expedidoEm: Date | null } | null =
      await db.saasSocio.findFirst({
        where: { tenantId, userId },
        select: { validade: true, expedidoEm: true },
      })
    if (!origem) return

    await garantirCarteirinhaNoPar({
      par,
      origemTenantId: tenantId,
      validade: origem.validade,
      expedidoEm: origem.expedidoEm,
      atorId,
    })
  } catch (err) {
    console.error('[espelharCarteirinhaDoTenant]', err)
    await registrarFalha(
      tenantId,
      atorId,
      userId,
      err instanceof Error ? err.message : 'erro_desconhecido',
      tenantId,
    )
  }
}

/**
 * Propaga a renovação. Se o par ainda não tem carteirinha (vínculo criado antes
 * da propagação existir), emite com a nova validade — auto-cura do legado.
 */
export async function espelharRenovacaoCarteirinha(opts: {
  tenantId: string
  userId: string
  validade: Date
  atorId: string
}): Promise<void> {
  const { tenantId, userId, validade, atorId } = opts
  try {
    const par = await resolverParDoSocio(tenantId, userId)
    if (!par) return

    const origem: { expedidoEm: Date | null } | null = await db.saasSocio.findFirst({
      where: { tenantId, userId },
      select: { expedidoEm: true },
    })

    await garantirCarteirinhaNoPar({
      par,
      origemTenantId: tenantId,
      validade,
      expedidoEm: origem?.expedidoEm ?? null,
      atorId,
    })
  } catch (err) {
    console.error('[espelharRenovacaoCarteirinha]', err)
    await registrarFalha(
      tenantId,
      atorId,
      userId,
      err instanceof Error ? err.message : 'erro_desconhecido',
      tenantId,
    )
  }
}

/**
 * Propaga a revogação: o `numeroSocio` precisa voltar ao pool nos dois tenants,
 * senão a Sede fica com o número preso por uma carteirinha órfã.
 */
export async function espelharRevogacaoCarteirinha(opts: {
  tenantId: string
  userId: string
  atorId: string
}): Promise<void> {
  const { tenantId, userId, atorId } = opts
  try {
    const par = await resolverParDoSocio(tenantId, userId)
    if (!par) return

    const socio: { id: string; nome: string; numeroSocio: number } | null =
      await db.saasSocio.findFirst({
        where: { tenantId: par.tenantId, userId: par.userId },
        select: { id: true, nome: true, numeroSocio: true },
      })
    if (!socio) return

    await db.saasSocio.delete({ where: { id: socio.id } })
    await db.auditLog.create({
      data: {
        tenantId: par.tenantId,
        atorId,
        acao: 'SOCIO_CARTEIRINHA_REVOGADA',
        entidade: 'SaasSocio',
        entidadeId: socio.id,
        detalhes: {
          nome: socio.nome,
          numeroSocio: socio.numeroSocio,
          espelho: true,
          origemTenantId: tenantId,
        },
      },
    })
  } catch (err) {
    console.error('[espelharRevogacaoCarteirinha]', err)
    await registrarFalha(
      tenantId,
      atorId,
      userId,
      err instanceof Error ? err.message : 'erro_desconhecido',
      tenantId,
    )
  }
}
