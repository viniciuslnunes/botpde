import { db } from '@torcida/db'
import { SYSTEM_ROLES, rotuloCargoSistema } from '@torcida/types'

/** Pessoa exibida no mural organizacional. */
export interface OrgPerson {
  id: string
  nome: string
  email: string | null
  avatarUrl: string | null
  /** Badges secundárias (ex.: Sócio) quando a pessoa também tem vínculo de base */
  badges: string[]
}

export interface OrgDepartamentoBranch {
  id: string
  nome: string
  slug: string
  cor: string
  gestores: OrgPerson[]
  membros: OrgPerson[]
}

export interface OrganizacaoTree {
  tenantNome: string
  tipoSede: string
  rotuloPresidente: string
  rotuloVice: string
  presidentes: OrgPerson[]
  vices: OrgPerson[]
  diretoria: OrgDepartamentoBranch | null
  departamentos: OrgDepartamentoBranch[]
  /** Associados sócio sem cargo de liderança / depto */
  sociosBase: OrgPerson[]
  /** Torcedores aprovados sem cargo de liderança / depto */
  torcedoresBase: OrgPerson[]
}

interface UserLite {
  id: string
  nome: string | null
  email: string | null
  avatarUrl: string | null
}

function toPerson(user: UserLite, badges: string[] = []): OrgPerson {
  return {
    id: user.id,
    nome: user.nome?.trim() || user.email || 'Sem nome',
    email: user.email,
    avatarUrl: user.avatarUrl,
    badges,
  }
}

/**
 * Monta a árvore de governança do tenant:
 * Presidente → Vice → Diretoria → departamentos (gestor → membro) → base (sócios / torcedores).
 *
 * Pessoas em cargos de liderança ou departamentos não repetem na base —
 * a base é quem só tem vínculo de associado.
 */
export async function getOrganizacaoTree(tenantId: string, tenantNome: string): Promise<OrganizacaoTree> {
  const sedeDoTenant: { tipo: string } | null = await db.sede.findFirst({
    where: { tenantId, tipo: 'SEDE' },
    select: { tipo: true },
  })
  const tipoSede = sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO'

  const roles: { id: string; nome: string }[] = await db.role.findMany({
    where: {
      tenantId,
      isSystem: true,
      nome: { in: [SYSTEM_ROLES.OWNER, SYSTEM_ROLES.VICE] },
    },
    select: { id: true, nome: true },
  })
  const ownerRoleId = roles.find((r) => r.nome === SYSTEM_ROLES.OWNER)?.id
  const viceRoleId = roles.find((r) => r.nome === SYSTEM_ROLES.VICE)?.id

  const roleIdsLideranca = [ownerRoleId, viceRoleId].filter((id): id is string => Boolean(id))

  const userRoles: { userId: string; roleId: string; user: UserLite }[] =
    roleIdsLideranca.length > 0
      ? await db.userRole.findMany({
          where: { tenantId, roleId: { in: roleIdsLideranca } },
          select: {
            userId: true,
            roleId: true,
            user: { select: { id: true, nome: true, email: true, avatarUrl: true } },
          },
        })
      : []

  const [departamentosRaw, userDepartamentos, gestores, membrosAprovados]: [
    { id: string; nome: string; slug: string; cor: string; ordem: number }[],
    { userId: string; departamentoId: string; user: UserLite }[],
    { userId: string; departamentoId: string; user: UserLite }[],
    { userId: string; tipo: string; nome: string; user: UserLite }[],
  ] = await Promise.all([
    db.departamento.findMany({
      where: { tenantId },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, slug: true, cor: true, ordem: true },
    }),
    db.userDepartamento.findMany({
      where: { tenantId },
      select: {
        userId: true,
        departamentoId: true,
        user: { select: { id: true, nome: true, email: true, avatarUrl: true } },
      },
    }),
    db.departamentoGestor.findMany({
      where: { departamento: { tenantId } },
      select: {
        userId: true,
        departamentoId: true,
        user: { select: { id: true, nome: true, email: true, avatarUrl: true } },
      },
    }),
    db.saasMembro.findMany({
      where: { tenantId, status: 'APROVADO' },
      select: {
        userId: true,
        tipo: true,
        nome: true,
        user: { select: { id: true, nome: true, email: true, avatarUrl: true } },
      },
    }),
  ])

  const tipoPorUser = new Map<string, string>()
  for (const m of membrosAprovados) {
    tipoPorUser.set(m.userId, m.tipo)
  }

  function badgesFor(userId: string): string[] {
    const tipo = tipoPorUser.get(userId)
    if (tipo === 'SOCIO') return ['Sócio']
    if (tipo === 'TORCEDOR') return ['Torcedor']
    return []
  }

  const presidentes: OrgPerson[] = []
  const vices: OrgPerson[] = []
  const emLideranca = new Set<string>()

  for (const ur of userRoles) {
    const person = toPerson(ur.user, badgesFor(ur.userId))
    if (ur.roleId === ownerRoleId) {
      presidentes.push(person)
      emLideranca.add(ur.userId)
    } else if (ur.roleId === viceRoleId) {
      vices.push(person)
      emLideranca.add(ur.userId)
    }
  }

  const deptosFiltrados = departamentosRaw.filter(
    (d) => d.slug !== 'socio' && d.slug !== 'torcedor',
  )

  const branches: OrgDepartamentoBranch[] = deptosFiltrados.map((dept) => {
    const gestIds = new Set(
      gestores.filter((g) => g.departamentoId === dept.id).map((g) => g.userId),
    )
    const gestPeople = gestores
      .filter((g) => g.departamentoId === dept.id)
      .map((g) => toPerson(g.user, badgesFor(g.userId)))
    const memPeople = userDepartamentos
      .filter((m) => m.departamentoId === dept.id && !gestIds.has(m.userId))
      .map((m) => toPerson(m.user, badgesFor(m.userId)))

    for (const p of [...gestPeople, ...memPeople]) {
      emLideranca.add(p.id)
    }

    return {
      id: dept.id,
      nome: dept.nome,
      slug: dept.slug,
      cor: dept.cor,
      gestores: gestPeople,
      membros: memPeople,
    }
  })

  const diretoria = branches.find((b) => b.slug === 'diretoria') ?? null
  const departamentos = branches.filter((b) => b.slug !== 'diretoria')

  const sociosBase: OrgPerson[] = []
  const torcedoresBase: OrgPerson[] = []
  for (const m of membrosAprovados) {
    if (emLideranca.has(m.userId)) continue
    const person = toPerson(
      {
        id: m.user.id,
        nome: m.user.nome ?? m.nome,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      },
      [],
    )
    if (m.tipo === 'SOCIO') sociosBase.push(person)
    else torcedoresBase.push(person)
  }

  sociosBase.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  torcedoresBase.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    tenantNome,
    tipoSede,
    rotuloPresidente: rotuloCargoSistema(SYSTEM_ROLES.OWNER, tipoSede),
    rotuloVice: rotuloCargoSistema(SYSTEM_ROLES.VICE, tipoSede),
    presidentes,
    vices,
    diretoria,
    departamentos,
    sociosBase,
    torcedoresBase,
  }
}
