import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { casoLiderancaDaSede, SYSTEM_ROLES } from '@torcida/types'
import { ExpectedError } from '@/lib/expected-error'
import { invalidatePermissionsCache } from '@/lib/tenant'
import { vincularMembroCanaisAposAprovacao, vincularResponsavelAoCanalDaSede } from '@/lib/canais'
import { notificarSafe } from '@/lib/notificacoes'

/**
 * Troca de gestão — presidência da torcida e liderança de unidade.
 *
 * Presidente de torcida não é vitalício: a maioria das organizadas troca a
 * gestão a cada 3–4 anos. Antes deste módulo a mesma decisão morava em três
 * lugares divergentes (`super-admin/torcidas/actions.ts`, o campo
 * `responsavelUserId` do formulário de sede e o fallback de
 * `promoverSedeParaTenant`), cada um com regras próprias. Aqui a regra é uma
 * só, nos dois formatos de unidade que o produto tem:
 *
 * - **Caso B** (unidade com portal próprio, e a Sede raiz): a liderança é o
 *   cargo de sistema `owner` no tenant. Trocar = mover `UserRole`.
 * - **Caso A** (subsede/PDE sem portal): não existe cargo — a liderança é
 *   `Sede.responsavelUserId`, identidade sem poder de RBAC próprio.
 *
 * **Escopo nunca atravessa tenant.** Quem chama passa o tenant em que tem
 * `leadership:transfer`; alvo fora dele é recusado aqui, não só na UI. O
 * presidente da Sede não escolhe o presidente de uma subsede promovida — ela
 * virou torcida com mandato próprio.
 */

export type CasoLideranca = 'A' | 'B'

export type AlvoLideranca =
  /** Presidência do tenant (Sede raiz ou unidade promovida). */
  | { caso: 'B'; tenantId: string }
  /** Liderança de uma unidade sem portal próprio, dentro do tenant. */
  | { caso: 'A'; tenantId: string; sedeId: string }

export type LiderAtual = {
  userId: string
  nome: string | null
  email: string | null
}

export type TransferirLiderancaInput = {
  alvo: AlvoLideranca
  novoUserId: string
  atorId: string
  atorNome?: string | null
  /** Registrado no `AuditLog` — troca de gestão sempre tem contexto. */
  motivo?: string | null
  /**
   * Presidente que sai vira `admin` do tenant em vez de perder o acesso
   * (Caso B). Ex-presidente sem acesso ao portal que ele construiu é perda de
   * memória operacional, não segurança. Desligue só quando a saída for
   * disciplinar.
   */
  manterAnteriorComoAdmin?: boolean
  /**
   * Exige que o sucessor já seja `SaasMembro` APROVADO no tenant. `true` no
   * fluxo do próprio presidente — ele escolhe entre os seus. O super-admin
   * passa `false` para conseguir dar presidência a um portal vazio (unidade
   * recém-promovida, sem quadro associativo ainda).
   */
  exigirMembroAprovado?: boolean
}

export type TransferirLiderancaResult = {
  caso: CasoLideranca
  tenantId: string
  sedeId: string | null
  anteriores: LiderAtual[]
  novo: LiderAtual
}

const AUDIT_ACAO: Record<CasoLideranca, string> = {
  B: 'LIDERANCA_TRANSFERIDA',
  A: 'LIDERANCA_UNIDADE_TRANSFERIDA',
}

// ── Leitura ───────────────────────────────────────────────────────────────────

/**
 * Sede com portal próprio (Caso B) é a que vive em tenant diferente do da sua
 * Sede-mãe. Só olha estrutura — nunca gateado por canal restrito
 * (ARCHITECTURE §5.13).
 */
async function sedeTemPortalProprio(sedeId: string): Promise<boolean> {
  const sede: { tenantId: string | null; sede: { tenantId: string | null } | null } | null =
    await db.sede.findUnique({
      where: { id: sedeId },
      select: { tenantId: true, sede: { select: { tenantId: true } } },
    })
  if (!sede?.tenantId || !sede.sede?.tenantId) return false
  return sede.sede.tenantId !== sede.tenantId
}

/** Presidente(s) atual(is) do tenant — cargo de sistema `owner`. No máximo um por regra. */
export async function liderancaAtualDoTenant(tenantId: string): Promise<LiderAtual[]> {
  const rows: { userId: string; user: { nome: string | null; email: string | null } }[] =
    await db.userRole.findMany({
      where: { tenantId, role: { isSystem: true, nome: SYSTEM_ROLES.OWNER } },
      select: { userId: true, user: { select: { nome: true, email: true } } },
    })
  return rows.map((r) => ({ userId: r.userId, nome: r.user.nome, email: r.user.email }))
}

/** Liderança atual de uma unidade Caso A — no máximo uma. */
export async function liderancaAtualDaSede(sedeId: string): Promise<LiderAtual[]> {
  const sede: {
    responsavelUserId: string | null
    responsavelUser: { nome: string | null; email: string | null } | null
  } | null = await db.sede.findUnique({
    where: { id: sedeId },
    select: {
      responsavelUserId: true,
      responsavelUser: { select: { nome: true, email: true } },
    },
  })
  if (!sede?.responsavelUserId) return []
  return [
    {
      userId: sede.responsavelUserId,
      nome: sede.responsavelUser?.nome ?? null,
      email: sede.responsavelUser?.email ?? null,
    },
  ]
}

/**
 * Liderança que a UI da unidade deve mostrar: cargo `owner` no Caso B,
 * `responsavelUserId` no Caso A. Evita a ficha da Sede raiz aparecer
 * "sem liderança" quando o presidente só existe como UserRole.
 */
export async function resolverLiderancaDaSede(opts: {
  sedeId: string
  tipo: string
  tenantId: string | null
  parentTenantId: string | null
}): Promise<LiderAtual[]> {
  if (casoLiderancaDaSede(opts) === 'B' && opts.tenantId) {
    return liderancaAtualDoTenant(opts.tenantId)
  }
  return liderancaAtualDaSede(opts.sedeId)
}

/** Unidade "cara" do tenant (Sede raiz ou a sede promovida), a que alinha `responsavelUserId`. */
async function sedeCaraDoTenant(
  tenantId: string,
): Promise<{ id: string; canalConversaId: string | null } | null> {
  const sede: { id: string; canalConversaId: string | null } | null = await db.sede.findFirst({
    where: { tenantId },
    select: { id: true, canalConversaId: true },
    orderBy: { criadoEm: 'asc' },
  })
  return sede
}

/**
 * Espelha o owner do tenant em `Sede.responsavelUserId` da unidade cara.
 * Sem isso a hierarquia (cargo) e a ficha da unidade (campo) divergem.
 */
export async function alinhaSedeDoTenantComOwner(
  tenantId: string,
  lider: { userId: string; nome: string | null },
): Promise<void> {
  const sede = await sedeCaraDoTenant(tenantId)
  if (!sede) return
  await db.sede.update({
    where: { id: sede.id },
    data: { responsavelUserId: lider.userId, responsavel: lider.nome },
  })
}

export type CandidatoLideranca = {
  userId: string
  nome: string
  email: string | null
  avatarUrl: string | null
  /** Rótulo da unidade a que o membro pertence — desempata homônimos. */
  unidade: string | null
}

/**
 * Quem pode receber a presidência: `SaasMembro` APROVADO do tenant. Sucessor
 * vem de dentro — o produto não conhece "presidente externo", e exigir vínculo
 * mantém a carteirinha, os canais e o histórico coerentes com o cargo.
 */
export async function candidatosLideranca(
  tenantId: string,
  opts: { excluirUserIds?: string[]; busca?: string | null } = {},
): Promise<CandidatoLideranca[]> {
  const excluir = new Set(opts.excluirUserIds ?? [])
  const busca = opts.busca?.trim()

  const rows: {
    userId: string
    nome: string
    sede: { nome: string } | null
    user: { email: string | null; avatarUrl: string | null }
  }[] = await db.saasMembro.findMany({
    where: {
      tenantId,
      status: 'APROVADO',
      espelhado: false,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' as const } },
              { user: { email: { contains: busca, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    select: {
      userId: true,
      nome: true,
      sede: { select: { nome: true } },
      user: { select: { email: true, avatarUrl: true } },
    },
    orderBy: { nome: 'asc' },
    take: 100,
  })

  return rows
    .filter((r) => !excluir.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      nome: r.nome,
      email: r.user.email,
      avatarUrl: r.user.avatarUrl,
      unidade: r.sede?.nome ?? null,
    }))
}

// ── Escrita ───────────────────────────────────────────────────────────────────

async function garantirMembroAprovado(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  sedeId: string | null,
  ator: { id: string; nome?: string | null },
): Promise<void> {
  const user: { nome: string | null } | null = await tx.user.findUnique({
    where: { id: userId },
    select: { nome: true },
  })
  await tx.saasMembro.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    create: {
      tenantId,
      userId,
      sedeId,
      tipo: 'SOCIO',
      nome: user?.nome ?? 'Presidente',
      status: 'APROVADO',
      aprovadoPorId: ator.id,
      aprovadoPorNome: ator.nome ?? 'Transferência de presidência',
      aprovadoEm: new Date(),
    },
    update: { status: 'APROVADO' },
  })
}

/**
 * Move a presidência (Caso B) ou a liderança da unidade (Caso A) para
 * `novoUserId`. Idempotente: transferir para quem já é o líder devolve o
 * estado atual sem gravar `AuditLog` duplicado.
 *
 * Grava `AuditLog` e notifica os dois lados sempre — troca de gestão é o tipo
 * de evento que alguém vai querer reconstituir dois anos depois.
 */
export async function transferirLideranca(
  input: TransferirLiderancaInput,
): Promise<TransferirLiderancaResult> {
  const {
    alvo,
    novoUserId,
    atorId,
    atorNome,
    motivo = null,
    manterAnteriorComoAdmin = true,
    exigirMembroAprovado = true,
  } = input

  const tenant: { id: string; nome: string } | null = await db.tenant.findUnique({
    where: { id: alvo.tenantId },
    select: { id: true, nome: true },
  })
  if (!tenant) throw new ExpectedError('Torcida não encontrada.')

  const novo: { id: string; nome: string | null; email: string | null } | null =
    await db.user.findUnique({
      where: { id: novoUserId },
      select: { id: true, nome: true, email: true },
    })
  if (!novo) {
    throw new ExpectedError('Pessoa não encontrada — ela precisa ter conta na plataforma.')
  }

  const membro: { status: string; sedeId: string | null } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: novoUserId } },
    select: { status: true, sedeId: true },
  })
  if (exigirMembroAprovado && membro?.status !== 'APROVADO') {
    throw new ExpectedError(
      'A presidência só passa para quem já é membro aprovado desta unidade. Aprove o cadastro antes.',
    )
  }

  return alvo.caso === 'B'
    ? transferirPresidenciaTenant({
        tenant,
        novo,
        sedeIdDoMembro: membro?.sedeId ?? null,
        atorId,
        atorNome,
        motivo,
        manterAnteriorComoAdmin,
      })
    : transferirLiderancaUnidade({
        tenant,
        sedeId: alvo.sedeId,
        novo,
        atorId,
        atorNome,
        motivo,
      })
}

async function transferirPresidenciaTenant(params: {
  tenant: { id: string; nome: string }
  novo: { id: string; nome: string | null; email: string | null }
  sedeIdDoMembro: string | null
  atorId: string
  atorNome?: string | null
  motivo: string | null
  manterAnteriorComoAdmin: boolean
}): Promise<TransferirLiderancaResult> {
  const { tenant, novo, sedeIdDoMembro, atorId, atorNome, motivo, manterAnteriorComoAdmin } = params

  const ownerRole: { id: string } | null = await db.role.findFirst({
    where: { tenantId: tenant.id, nome: SYSTEM_ROLES.OWNER, isSystem: true },
    select: { id: true },
  })
  if (!ownerRole) {
    throw new ExpectedError(
      'Cargo de presidente não existe nesta torcida. Rode o seed de cargos de sistema antes.',
    )
  }

  const anteriores = await liderancaAtualDoTenant(tenant.id)
  const substituidos = anteriores.filter((a) => a.userId !== novo.id)

  if (substituidos.length === 0 && anteriores.length === 1) {
    return { caso: 'B', tenantId: tenant.id, sedeId: null, anteriores, novo: toLider(novo) }
  }

  const adminRole: { id: string } | null = manterAnteriorComoAdmin
    ? await db.role.findFirst({
        where: { tenantId: tenant.id, nome: SYSTEM_ROLES.ADMIN, isSystem: true },
        select: { id: true },
      })
    : null

  // A unidade própria do tenant (Sede raiz, ou a subsede promovida) passa a
  // apontar para o novo presidente: `responsavelUserId` é a identidade que a
  // UI mostra, e deixá-la no antecessor faz o portal exibir dois líderes.
  const sedeDoTenant: { id: string; canalConversaId: string | null } | null =
    await db.sede.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true, canalConversaId: true },
      orderBy: { criadoEm: 'asc' },
    })

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const anterior of substituidos) {
      await tx.userRole.deleteMany({
        where: { tenantId: tenant.id, userId: anterior.userId, roleId: ownerRole.id },
      })
      if (adminRole) {
        await tx.userRole.upsert({
          where: {
            userId_tenantId_roleId: {
              userId: anterior.userId,
              tenantId: tenant.id,
              roleId: adminRole.id,
            },
          },
          create: { userId: anterior.userId, tenantId: tenant.id, roleId: adminRole.id },
          update: {},
        })
      }
    }

    await tx.userRole.upsert({
      where: {
        userId_tenantId_roleId: { userId: novo.id, tenantId: tenant.id, roleId: ownerRole.id },
      },
      create: { userId: novo.id, tenantId: tenant.id, roleId: ownerRole.id },
      update: {},
    })

    await garantirMembroAprovado(tx, tenant.id, novo.id, sedeIdDoMembro ?? sedeDoTenant?.id ?? null, {
      id: atorId,
      nome: atorNome,
    })

    if (sedeDoTenant) {
      await tx.sede.update({
        where: { id: sedeDoTenant.id },
        data: { responsavelUserId: novo.id, responsavel: novo.nome ?? null },
      })
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId,
        acao: AUDIT_ACAO.B,
        entidade: 'Tenant',
        entidadeId: tenant.id,
        detalhes: {
          novoPresidenteId: novo.id,
          novoPresidenteEmail: novo.email,
          novoPresidenteNome: novo.nome,
          anteriores: substituidos.map((a) => ({ userId: a.userId, email: a.email })),
          anterioresViraramAdmin: Boolean(adminRole),
          motivo,
        },
      },
    })
  })

  invalidatePermissionsCache(novo.id, tenant.id)
  for (const anterior of substituidos) invalidatePermissionsCache(anterior.userId, tenant.id)

  await vincularMembroCanaisAposAprovacao({
    tenantId: tenant.id,
    userId: novo.id,
    sedeId: sedeIdDoMembro ?? sedeDoTenant?.id ?? null,
    fallbackCriadoPorId: novo.id,
  })
  if (sedeDoTenant) {
    await vincularResponsavelAoCanalDaSede({
      sedeId: sedeDoTenant.id,
      canalConversaId: sedeDoTenant.canalConversaId,
      responsavelUserId: novo.id,
    })
  }

  await notificarSafe({
    userId: novo.id,
    tenantId: tenant.id,
    tipo: 'ACESSO_ATUALIZADO',
    titulo: `Você é o novo presidente de ${tenant.nome}`,
    corpo: motivo ?? 'A presidência foi transferida para você.',
    link: '/admin',
    atorId,
  })
  for (const anterior of substituidos) {
    await notificarSafe({
      userId: anterior.userId,
      tenantId: tenant.id,
      tipo: 'ACESSO_ATUALIZADO',
      titulo: `A presidência de ${tenant.nome} foi transferida`,
      corpo: manterAnteriorComoAdmin
        ? `${novo.nome ?? 'O novo presidente'} assumiu. Seu acesso continua como administrador.`
        : `${novo.nome ?? 'O novo presidente'} assumiu.`,
      link: '/admin',
      atorId,
    })
  }

  return {
    caso: 'B',
    tenantId: tenant.id,
    sedeId: sedeDoTenant?.id ?? null,
    anteriores: substituidos,
    novo: toLider(novo),
  }
}

async function transferirLiderancaUnidade(params: {
  tenant: { id: string; nome: string }
  sedeId: string
  novo: { id: string; nome: string | null; email: string | null }
  atorId: string
  atorNome?: string | null
  motivo: string | null
}): Promise<TransferirLiderancaResult> {
  const { tenant, sedeId, novo, atorId, motivo } = params

  const sede: {
    id: string
    nome: string
    tenantId: string | null
    canalConversaId: string | null
    responsavelUserId: string | null
  } | null = await db.sede.findUnique({
    where: { id: sedeId },
    select: {
      id: true,
      nome: true,
      tenantId: true,
      canalConversaId: true,
      responsavelUserId: true,
    },
  })
  if (!sede || sede.tenantId !== tenant.id) {
    throw new ExpectedError('Unidade não encontrada nesta torcida.')
  }
  if (await sedeTemPortalProprio(sedeId)) {
    throw new ExpectedError(
      'Esta unidade tem portal próprio — a presidência dela é decidida dentro do portal dela.',
    )
  }

  const anteriores = await liderancaAtualDaSede(sedeId)
  if (sede.responsavelUserId === novo.id) {
    return { caso: 'A', tenantId: tenant.id, sedeId, anteriores, novo: toLider(novo) }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.sede.update({
      where: { id: sedeId },
      data: { responsavelUserId: novo.id, responsavel: novo.nome ?? null },
    })

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId,
        acao: AUDIT_ACAO.A,
        entidade: 'Sede',
        entidadeId: sedeId,
        detalhes: {
          unidade: sede.nome,
          novoLiderId: novo.id,
          novoLiderEmail: novo.email,
          novoLiderNome: novo.nome,
          anteriores: anteriores.map((a) => ({ userId: a.userId, email: a.email })),
          motivo,
        },
      },
    })
  })

  await vincularResponsavelAoCanalDaSede({
    sedeId,
    canalConversaId: sede.canalConversaId,
    responsavelUserId: novo.id,
  })

  await notificarSafe({
    userId: novo.id,
    tenantId: tenant.id,
    tipo: 'SEDE_RESPONSAVEL_DEFINIDO',
    titulo: `Você é a nova liderança de ${sede.nome}`,
    corpo: motivo ?? `A liderança de ${sede.nome} foi transferida para você.`,
    link: '/portal/sedes',
    atorId,
  })
  for (const anterior of anteriores) {
    await notificarSafe({
      userId: anterior.userId,
      tenantId: tenant.id,
      tipo: 'SEDE_RESPONSAVEL_DEFINIDO',
      titulo: `A liderança de ${sede.nome} foi transferida`,
      corpo: `${novo.nome ?? 'Outra pessoa'} assumiu a unidade.`,
      link: '/portal/sedes',
      atorId,
    })
  }

  return { caso: 'A', tenantId: tenant.id, sedeId, anteriores, novo: toLider(novo) }
}

/**
 * Tira a presidência sem sucessor — a unidade fica sem owner, estado em que o
 * super-admin volta a operar as configurações reservadas
 * (`assertOwnerOuSuportePlataforma`). É o "remover-me da posse" de um portal
 * que nunca foi seu, e a única saída quando a gestão acabou sem sucessão.
 */
export async function removerLideranca(params: {
  alvo: AlvoLideranca
  atorId: string
  motivo?: string | null
}): Promise<{ caso: CasoLideranca; removidos: LiderAtual[] }> {
  const { alvo, atorId, motivo = null } = params

  if (alvo.caso === 'A') {
    const removidos = await liderancaAtualDaSede(alvo.sedeId)
    const sede: { tenantId: string | null; nome: string } | null = await db.sede.findUnique({
      where: { id: alvo.sedeId },
      select: { tenantId: true, nome: true },
    })
    if (!sede || sede.tenantId !== alvo.tenantId) {
      throw new ExpectedError('Unidade não encontrada nesta torcida.')
    }
    if (removidos.length === 0) return { caso: 'A', removidos }

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sede.update({
        where: { id: alvo.sedeId },
        data: { responsavelUserId: null, responsavel: null },
      })
      await tx.auditLog.create({
        data: {
          tenantId: alvo.tenantId,
          atorId,
          acao: 'LIDERANCA_UNIDADE_REMOVIDA',
          entidade: 'Sede',
          entidadeId: alvo.sedeId,
          detalhes: {
            unidade: sede.nome,
            removidos: removidos.map((r) => ({ userId: r.userId, email: r.email })),
            motivo,
          },
        },
      })
    })

    for (const r of removidos) {
      if (r.userId === atorId) continue
      await notificarSafe({
        userId: r.userId,
        tenantId: alvo.tenantId,
        tipo: 'SEDE_RESPONSAVEL_DEFINIDO',
        titulo: `Você não é mais a liderança de ${sede.nome}`,
        corpo: motivo ?? `A liderança de ${sede.nome} foi encerrada.`,
        link: '/portal/sedes',
        atorId,
      })
    }

    return { caso: 'A', removidos }
  }

  const ownerRole: { id: string } | null = await db.role.findFirst({
    where: { tenantId: alvo.tenantId, nome: SYSTEM_ROLES.OWNER, isSystem: true },
    select: { id: true },
  })
  if (!ownerRole) throw new ExpectedError('Cargo de presidente não existe nesta torcida.')

  const removidos = await liderancaAtualDoTenant(alvo.tenantId)
  if (removidos.length === 0) return { caso: 'B', removidos }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userRole.deleteMany({ where: { tenantId: alvo.tenantId, roleId: ownerRole.id } })
    await tx.auditLog.create({
      data: {
        tenantId: alvo.tenantId,
        atorId,
        acao: 'OWNER_REMOVIDO',
        entidade: 'Tenant',
        entidadeId: alvo.tenantId,
        detalhes: {
          removidos: removidos.map((r) => ({ userId: r.userId, email: r.email })),
          motivo,
        },
      },
    })
  })

  for (const r of removidos) invalidatePermissionsCache(r.userId, alvo.tenantId)

  const tenantNome: { nome: string } | null = await db.tenant.findUnique({
    where: { id: alvo.tenantId },
    select: { nome: true },
  })
  for (const r of removidos) {
    if (r.userId === atorId) continue
    await notificarSafe({
      userId: r.userId,
      tenantId: alvo.tenantId,
      tipo: 'ACESSO_ATUALIZADO',
      titulo: `Você não é mais presidente de ${tenantNome?.nome ?? 'esta torcida'}`,
      corpo: motivo ?? 'A presidência foi encerrada. A unidade fica sem owner até uma nova indicação.',
      link: '/admin',
      atorId,
    })
  }

  return { caso: 'B', removidos }
}

function toLider(u: { id: string; nome: string | null; email: string | null }): LiderAtual {
  return { userId: u.id, nome: u.nome, email: u.email }
}
