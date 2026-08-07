'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidarBadgesAutorTenant } from '@/lib/comunidade-cache'
import { notificarSafe } from '@/lib/notificacoes'
import { db, syncMembershipFromRoles, type Prisma } from '@torcida/db'
import { assertPermission, assertPodeDelegar } from '@/lib/authz'
import { diffAcessoUsuario } from '@/lib/acesso-audit-diff'
import { vincularMembroCanaisAposAprovacao } from '@/lib/canais'
import {
  ALL_PERMISSIONS,
  MAX_VICE_PRESIDENTES,
  PERMISSIONS,
  SYSTEM_ROLES,
  applyPermissionCascade,
  canManageDepartamento,
  calculateEffectivePermissions,
  hasPermission,
  isMembroElegivelDepartamento,
  permissionsOfRole,
  podeTerVice,
  PAPEL_DEPARTAMENTO,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import {
  getActiveTenant,
  getUserPermissionsInTenant,
  invalidatePermissionsCache,
} from '@/lib/tenant'

const ALL_PERMISSIONS_SET: readonly string[] = ALL_PERMISSIONS

interface RoleLite {
  id: string
  nome: string
  isSystem: boolean
  permissions: string[]
  permissionsExtras: string[]
  departamentoId: string | null
  papelNoDepartamento: string | null
}
interface DepartamentoLite {
  id: string
  nome: string
  permissions: string[]
  permissionsGestor: string[]
}
interface UserRoleLite {
  roleId: string
}
interface UserPermissionLite {
  permission: string
  granted: boolean
}

/**
 * Mudança de acesso não cabe nos 5s de transação interativa do Prisma: além
 * dos `UserRole`/`UserPermission`, ela sincroniza a presença do usuário nos
 * canais de **todos** os departamentos e áreas do tenant
 * (`sincronizarCanaisDepartamentoUsuario`). Numa torcida com os departamentos
 * canônicos
 * e o banco atrás do proxy, o default estoura e a promoção falha inteira, com
 * "Transaction not found" — mesmo motivo que já obrigou
 * `TRANSACAO_DECISAO_MEMBRO_OPTS` em `admin/membros/actions.ts`.
 */
const TRANSACAO_ACESSO_OPTS = { timeout: 20_000, maxWait: 10_000 }

const IdSchema = z.string().min(1)
const SalvarAcessoSchema = z.object({
  userId: IdSchema,
  perfilIds: z.array(IdSchema),
  permissoes: z.array(z.string()),
})
const PerfilCompostoSchema = z.object({
  nome: z.string().trim().min(2),
  cor: z.string().trim(),
  userId: z.string().trim(),
  departamentoId: z.string().trim(),
  papelNoDepartamento: z.string().trim(),
  permissionsExtras: z.array(z.string()),
})
const VinculoDepartamentoSchema = z.object({
  departamentoId: IdSchema,
  targetUserId: IdSchema,
})

type MembroElegibilidade = {
  tenantId: string
  tipo: string
  status: string
  desligadoEm: Date | null
  espelhado: boolean
  membroOrigemId: string | null
}

async function assertMembroElegivelParaDepartamento(
  userId: string,
  tenantId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<void> {
  const membro: MembroElegibilidade | null = await client.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: {
      tenantId: true,
      tipo: true,
      status: true,
      desligadoEm: true,
      espelhado: true,
      membroOrigemId: true,
    },
  })
  if (!isMembroElegivelDepartamento(membro, tenantId)) {
    throw new Error(
      'Somente sócio aprovado, ativo e com vínculo canônico nesta torcida pode atuar em departamento.',
    )
  }
}

/**
 * Salva o acesso do usuário: perfis + overrides de permissões adicionais.
 * Membership de departamento é projeção dos perfis vinculados (sync).
 */
export async function salvarAcessoUsuario(userId: string, formData: FormData) {
  const ctx = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const { session, tenant } = ctx

  const entrada = SalvarAcessoSchema.safeParse({
    userId,
    perfilIds: formData.getAll('perfilIds'),
    permissoes: formData.getAll('permissoes'),
  })
  if (!entrada.success) throw new Error('Dados de acesso inválidos')

  const perfilIds = new Set(entrada.data.perfilIds)
  const permissoesEfetivas = new Set<string>(
    applyPermissionCascade(
      [],
      entrada.data.permissoes.filter((p) => ALL_PERMISSIONS_SET.includes(p)),
    ),
  )

  const usuarioExiste = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!usuarioExiste) throw new Error('Usuário não encontrado')

  const rolesTenant: RoleLite[] = await db.role.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      nome: true,
      isSystem: true,
      permissions: true,
      permissionsExtras: true,
      departamentoId: true,
      papelNoDepartamento: true,
    },
  })
  const departamentosTenant: DepartamentoLite[] = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nome: true, permissions: true, permissionsGestor: true },
  })
  const deptoById = new Map(departamentosTenant.map((d) => [d.id, d]))

  const userRolesAtuais: UserRoleLite[] = await db.userRole.findMany({
    where: { userId, tenantId: tenant.id },
    select: { roleId: true },
  })
  const userPermissionsAtuais: UserPermissionLite[] = await db.userPermission.findMany({
    where: { userId, tenantId: tenant.id },
    select: { permission: true, granted: true },
  })

  const viceRole: RoleLite | undefined = rolesTenant.find(
    (r) => r.isSystem && r.nome === SYSTEM_ROLES.VICE,
  )
  if (viceRole && perfilIds.has(viceRole.id)) {
    const sedeDoTenant: { tipo: string } | null = await db.sede.findFirst({
      where: { tenantId: tenant.id, tipo: 'SEDE' },
      select: { tipo: true },
    })
    if (!podeTerVice(sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO')) {
      throw new Error('Vice-presidente existe apenas na Sede principal da torcida.')
    }
    const outrosVices: number = await db.userRole.count({
      where: { tenantId: tenant.id, roleId: viceRole.id, userId: { not: userId } },
    })
    if (outrosVices >= MAX_VICE_PRESIDENTES) {
      throw new Error(
        `Limite de ${MAX_VICE_PRESIDENTES} vice-presidentes já atingido nesta torcida.`,
      )
    }
  }

  const validRoleIds = new Set(rolesTenant.map((r) => r.id))
  const roleIdsAtuais = new Set(userRolesAtuais.map((r) => r.roleId))
  const atribuiPerfilDepartamento = rolesTenant.some(
    (role) => role.departamentoId && perfilIds.has(role.id),
  )

  // Liderança (OWNER/ADMIN) recém-atribuída aqui nunca passou pelo auto-vínculo
  // de canais de `aprovarMembro` — sem isso a pessoa vira admin do tenant mas
  // fica de fora do canal oficial da própria unidade até pedir entrada manual.
  const liderancaRoleIds = new Set(
    rolesTenant
      .filter((r) => r.isSystem && (r.nome === SYSTEM_ROLES.OWNER || r.nome === SYSTEM_ROLES.ADMIN))
      .map((r) => r.id),
  )
  const ganhouLideranca = [...liderancaRoleIds].some(
    (id) => perfilIds.has(id) && !roleIdsAtuais.has(id),
  )

  const cobertoPorPerfis = new Set<string>()
  for (const role of rolesTenant) {
    if (!perfilIds.has(role.id)) continue
    const depto = role.departamentoId ? (deptoById.get(role.departamentoId) ?? null) : null
    for (const p of permissionsOfRole(role, depto)) cobertoPorPerfis.add(p)
  }

  // ── Limite de delegação (Achado 6) ────────────────────────────────────────
  // Atribuir cargo é conceder o pacote inteiro dele. Sem este limite, um
  // `admin` (que por desenho não tem `settings:manage`) se atribuía o cargo de
  // sistema `owner` — a única guarda aqui era a de `vice` — e passava até em
  // `assertTenantOwner`. Só o que está sendo ACRESCENTADO é checado: retirar
  // acesso nunca é escalada, e quem já tinha um cargo continua editável.
  const perfisAcrescentados = rolesTenant.filter(
    (role) => perfilIds.has(role.id) && !roleIdsAtuais.has(role.id),
  )
  for (const role of perfisAcrescentados) {
    const depto = role.departamentoId ? (deptoById.get(role.departamentoId) ?? null) : null
    assertPodeDelegar(ctx, permissionsOfRole(role, depto), `o cargo "${role.nome}" com`)
  }

  const overridesAtuais = new Map(userPermissionsAtuais.map((p) => [p.permission, p.granted]))

  // Override CONCEDIDO segue a mesma regra; override NEGADO (tirar acesso) não.
  const overridesConcedidos = [...permissoesEfetivas].filter(
    (p) => !cobertoPorPerfis.has(p) && overridesAtuais.get(p) !== true,
  )
  assertPodeDelegar(ctx, overridesConcedidos, 'como permissão avulsa')

  // ── Diff legível para o histórico ─────────────────────────────────────────
  // Calculado ANTES da transação, quando o estado anterior ainda está em mão.
  // Cargo de sistema aparece com o rótulo da unidade (Presidente/Liderança),
  // não com o nome interno do papel.
  const sedeParaRotulo: { tipo: string } | null = rolesTenant.some((r) => r.isSystem)
    ? await db.sede.findFirst({
        where: { tenantId: tenant.id, tipo: 'SEDE' },
        select: { tipo: true },
      })
    : null
  const tipoSedeRotulo = sedeParaRotulo?.tipo ?? 'PONTO_ENCONTRO'

  const alteracoes = diffAcessoUsuario({
    rolesTenant,
    deptoById,
    tipoSede: tipoSedeRotulo,
    perfilIdsAntes: roleIdsAtuais,
    perfilIdsDepois: perfilIds,
    overridesAntes: userPermissionsAtuais,
    permissoesDepois: permissoesEfetivas,
    cobertoDepois: cobertoPorPerfis,
  })

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    if (atribuiPerfilDepartamento) {
      await assertMembroElegivelParaDepartamento(userId, tenant.id, tx)
    }
    for (const roleId of perfilIds) {
      if (!validRoleIds.has(roleId) || roleIdsAtuais.has(roleId)) continue
      await tx.userRole.create({ data: { userId, tenantId: tenant.id, roleId } })
    }
    for (const roleId of roleIdsAtuais) {
      if (!perfilIds.has(roleId)) {
        await tx.userRole.deleteMany({ where: { userId, tenantId: tenant.id, roleId } })
      }
    }

    await syncMembershipFromRoles(tx, { userId, tenantId: tenant.id })

    for (const permission of ALL_PERMISSIONS) {
      const desejaConceder = permissoesEfetivas.has(permission)
      const coberto = cobertoPorPerfis.has(permission)
      const overrideAtual = overridesAtuais.get(permission)

      if (desejaConceder === coberto) {
        if (overrideAtual !== undefined) {
          await tx.userPermission.deleteMany({ where: { userId, tenantId: tenant.id, permission } })
        }
        continue
      }

      if (overrideAtual !== desejaConceder) {
        await tx.userPermission.upsert({
          where: { userId_tenantId_permission: { userId, tenantId: tenant.id, permission } },
          create: { userId, tenantId: tenant.id, permission, granted: desejaConceder },
          update: { granted: desejaConceder },
        })
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'ACESSO_USUARIO_ATUALIZADO',
        entidade: 'User',
        entidadeId: userId,
        detalhes: {
          // `alteracoes` é o formato que o histórico do cadastro já sabe ler
          // (campo · de → para). Sem ele, o log guardava só ids crus, que não
          // dizem a ninguém o que mudou nem de onde saiu.
          ...(alteracoes.length > 0
            ? { alteracoes }
            : { resumo: 'Nenhuma alteração efetiva' }),
          perfilIds: [...perfilIds],
          permissoesEfetivas: [...permissoesEfetivas],
        },
      },
    })
  }, TRANSACAO_ACESSO_OPTS)

  if (ganhouLideranca) {
    const membro: { sedeId: string | null } | null = await db.saasMembro.findFirst({
      where: { userId, tenantId: tenant.id },
      select: { sedeId: true },
    })
    await vincularMembroCanaisAposAprovacao({
      tenantId: tenant.id,
      userId,
      sedeId: membro?.sedeId ?? null,
      fallbackCriadoPorId: session.user.id,
    })
  }

  invalidatePermissionsCache(userId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)

  await notificarSafe({
    userId,
    tenantId: tenant.id,
    tipo: 'ACESSO_ATUALIZADO',
    titulo: 'Seu acesso foi atualizado',
    corpo: 'Seus perfis ou permissões nesta torcida mudaram.',
    link: '/portal',
    atorId: session.user.id,
  })

  revalidatePath('/admin/acessos')
  revalidatePath('/admin/hierarquia')
  revalidatePath('/portal/departamentos')
}

/**
 * Cria um novo perfil a partir de departamento + papel + extras (composição).
 * Se `userId` for enviado, atribui o perfil à pessoa e sincroniza membership.
 */
export async function salvarPerfilComposto(formData: FormData) {
  const ctx = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const { session, tenant } = ctx

  const entrada = PerfilCompostoSchema.safeParse({
    nome: formData.get('nome'),
    cor: formData.get('cor') ?? '#6b7280',
    userId: formData.get('userId') ?? '',
    departamentoId: formData.get('departamentoId') ?? '',
    papelNoDepartamento: formData.get('papelNoDepartamento') ?? '',
    permissionsExtras: formData.getAll('permissionsExtras'),
  })
  if (!entrada.success) throw new Error('Dados do perfil inválidos')

  const { nome, cor } = entrada.data
  const userId = entrada.data.userId || null
  const departamentoIdRaw = entrada.data.departamentoId
  const papelRaw = entrada.data.papelNoDepartamento
  const extras = applyPermissionCascade(
    [],
    entrada.data.permissionsExtras.filter((p) =>
      ALL_PERMISSIONS_SET.includes(p),
    ),
  )

  // ── Limite de delegação (Achado 6, segunda porta) ─────────────────────────
  // `salvarAcessoUsuario` ganhou este guard; esta função ficou de fora e
  // continuava sendo escalada por outro caminho: criar um cargo carregando
  // `settings:manage` e vesti-lo no mesmo request (`userId` no formulário).
  // Medido em fluxo por `audit:achados` §7 #6 — um `admin` de
  // torcida-organizada-coringao-chopp-sp criou e assumiu o cargo.
  assertPodeDelegar(ctx, extras, `no perfil "${nome}"`)

  const departamentoId = departamentoIdRaw || null
  const papelNoDepartamento =
    papelRaw === PAPEL_DEPARTAMENTO.GESTOR || papelRaw === PAPEL_DEPARTAMENTO.MEMBRO
      ? papelRaw
      : null

  if (Boolean(departamentoId) !== Boolean(papelNoDepartamento)) {
    throw new Error('Departamento e papel (membro/gestor) devem ser informados juntos.')
  }

  if (departamentoId) {
    const depto = await db.departamento.findFirst({
      where: { id: departamentoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!depto) throw new Error('Departamento não encontrado')
  }

  const existing = await db.role.findFirst({
    where: { tenantId: tenant.id, nome },
  })
  if (existing) throw new Error('Já existe um perfil com este nome')

  const role = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.role.create({
      data: {
        tenantId: tenant.id,
        nome,
        cor: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#6b7280',
        isSystem: false,
        permissions: departamentoId ? [] : extras,
        permissionsExtras: departamentoId ? extras : [],
        departamentoId,
        papelNoDepartamento,
      },
    })

    if (userId) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw new Error('Usuário não encontrado')
      if (departamentoId) {
        await assertMembroElegivelParaDepartamento(userId, tenant.id, tx)
      }
      await tx.userRole.create({
        data: { userId, tenantId: tenant.id, roleId: created.id },
      })
      // Extras do perfil deixam de ser overrides pontuais na pessoa
      for (const permission of extras) {
        await tx.userPermission.deleteMany({
          where: { userId, tenantId: tenant.id, permission },
        })
      }
      await syncMembershipFromRoles(tx, { userId, tenantId: tenant.id })
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'ROLE_CRIADO',
        entidade: 'Role',
        entidadeId: created.id,
        detalhes: {
          nome,
          departamentoId,
          papelNoDepartamento,
          permissionsExtras: extras,
          origem: 'perfil_composto',
          atribuidoA: userId,
        },
      },
    })

    return created
  })

  if (userId) invalidatePermissionsCache(userId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)
  revalidatePath('/admin/acessos')
  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/hierarquia')

  return {
    success: true as const,
    id: role.id,
    nome: role.nome,
    cor: role.cor,
    isSystem: role.isSystem,
    permissionsExtras: role.permissionsExtras,
    departamentoId: role.departamentoId,
    papelNoDepartamento: role.papelNoDepartamento,
  }
}

async function assertPodeGerirDepartamento(departamentoId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) throw new Error('Não autorizado')

  // SA operador não gerencia departamentos — só RBAC/gestor reais (dual-hat ok).
  const {
    rolePermissions,
    overrides,
  }: {
    rolePermissions: string[]
    overrides: { permission: string; granted: boolean }[]
  } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (hasPermission(effective, PERMISSIONS.ROLES_MANAGE)) {
    return { session, tenant }
  }

  const gestao: { departamentoId: string }[] = await db.departamentoGestor.findMany({
    where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
    select: { departamentoId: true },
  })
  const gestorIds = gestao.map((g) => g.departamentoId)
  if (!canManageDepartamento(effective, gestorIds, departamentoId)) {
    throw new Error('Sem permissão')
  }

  return { session, tenant }
}

export async function adicionarMembroDepartamento(
  rawDepartamentoId: string,
  rawTargetUserId: string,
) {
  const entrada = VinculoDepartamentoSchema.safeParse({
    departamentoId: rawDepartamentoId,
    targetUserId: rawTargetUserId,
  })
  if (!entrada.success) throw new Error('Dados do vínculo inválidos')
  const { departamentoId, targetUserId } = entrada.data

  const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)
  const departamento: { id: string; nome: string } | null = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
    select: { id: true, nome: true },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  const roleMembro = await db.role.findFirst({
    where: {
      tenantId: tenant.id,
      departamentoId,
      papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO,
    },
    select: { id: true },
  })
  if (!roleMembro) {
    throw new Error('Perfil de membro do departamento não encontrado')
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await assertMembroElegivelParaDepartamento(targetUserId, tenant.id, tx)
    const ja: { id: string } | null = await tx.userRole.findFirst({
      where: { userId: targetUserId, tenantId: tenant.id, roleId: roleMembro.id },
      select: { id: true },
    })
    if (!ja) {
      await tx.userRole.create({
        data: { userId: targetUserId, tenantId: tenant.id, roleId: roleMembro.id },
      })
    }
    await syncMembershipFromRoles(tx, { userId: targetUserId, tenantId: tenant.id })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_MEMBRO_ADICIONADO',
        entidade: 'Departamento',
        entidadeId: departamentoId,
        detalhes: { userId: targetUserId },
      },
    })
  }, TRANSACAO_ACESSO_OPTS)

  invalidatePermissionsCache(targetUserId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)

  await notificarSafe({
    userId: targetUserId,
    tenantId: tenant.id,
    tipo: 'DEPARTAMENTO_ADICIONADO',
    titulo: 'Você entrou em um departamento',
    corpo: `Você foi adicionado a ${departamento.nome}.`,
    link: '/portal/departamentos',
    atorId: session.user.id,
  })

  revalidatePath('/admin/acessos')
  revalidatePath('/portal/departamentos', 'layout')
}

export async function removerMembroDepartamento(departamentoId: string, targetUserId: string) {
  const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)

  const departamento: { id: string; nome: string } | null = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
    select: { id: true, nome: true },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userRole.deleteMany({
      where: {
        userId: targetUserId,
        tenantId: tenant.id,
        role: { departamentoId },
      },
    })
    // Quem sai do departamento perde as áreas deste departamento antes do
    // sync — assim os canais das frentes também removem o usuário.
    await tx.departamentoAreaMembro.deleteMany({
      where: { userId: targetUserId, area: { departamentoId } },
    })
    await syncMembershipFromRoles(tx, { userId: targetUserId, tenantId: tenant.id })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_MEMBRO_REMOVIDO',
        entidade: 'Departamento',
        entidadeId: departamentoId,
        detalhes: { userId: targetUserId },
      },
    })
  }, TRANSACAO_ACESSO_OPTS)

  invalidatePermissionsCache(targetUserId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)

  await notificarSafe({
    userId: targetUserId,
    tenantId: tenant.id,
    tipo: 'DEPARTAMENTO_REMOVIDO',
    titulo: 'Você saiu de um departamento',
    corpo: `Você foi removido de ${departamento.nome}.`,
    link: '/portal/departamentos',
    atorId: session.user.id,
  })

  revalidatePath('/admin/acessos')
  revalidatePath('/portal/departamentos', 'layout')
}
