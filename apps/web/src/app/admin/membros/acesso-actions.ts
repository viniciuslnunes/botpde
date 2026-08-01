'use server'

import { db } from '@torcida/db'
import {
  PERMISSIONS,
  PAPEL_DEPARTAMENTO,
  isDepartamentoLegado,
  permissionsOfRole,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import type {
  AccessDepartamentoOpt,
  AccessRoleOpt,
  AccessUsuario,
} from '@/components/admin/access-user-panel'

export interface MembroAcessoDados {
  usuario: AccessUsuario
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
}

export type MembroAcessoResultado =
  | { ok: true; dados: MembroAcessoDados }
  | { ok: false; error: string }

interface RoleRow {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  permissions: string[]
  permissionsExtras: string[]
  departamentoId: string | null
  papelNoDepartamento: string | null
}

interface DepartamentoRow {
  id: string
  nome: string
  cor: string
  slug: string
  permissions: string[]
  permissionsGestor: string[]
}

/**
 * Dados do painel de acesso de **um** membro — a aba Acessos do card de
 * detalhes. O usuário-alvo vem do próprio cadastro aberto (`membroId` →
 * `userId`), nunca de escolha manual: quem está com o card do Lucas na tela
 * altera o acesso do Lucas, sem risco de errar a pessoa numa lista.
 *
 * Gate próprio (`roles:manage`): ver o cadastro (`members:view`) não dá direito
 * de mexer em cargo, área ou permissão.
 */
export async function carregarAcessoMembro(
  membroId: string,
): Promise<MembroAcessoResultado> {
  let tenantId: string
  try {
    const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)
    tenantId = tenant.id
  } catch {
    return { ok: false, error: 'Você não tem permissão para gerenciar acessos.' }
  }

  const membro: { userId: string } | null = await db.saasMembro.findFirst({
    where: { id: membroId, tenantId },
    select: { userId: true },
  })
  if (!membro) return { ok: false, error: 'Cadastro não encontrado nesta torcida.' }

  const [usuario, rolesRaw, departamentosRaw, sedeDoTenant]: [
    {
      id: string
      nome: string | null
      email: string | null
      avatarUrl: string | null
      userRoles: { roleId: string }[]
      userDepartamentos: { departamentoId: string }[]
      departamentosGeridos: { departamentoId: string }[]
      userPermissions: { permission: string; granted: boolean }[]
    } | null,
    RoleRow[],
    DepartamentoRow[],
    { tipo: string } | null,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: membro.userId },
      select: {
        id: true,
        nome: true,
        email: true,
        avatarUrl: true,
        userRoles: { where: { tenantId }, select: { roleId: true } },
        userDepartamentos: { where: { tenantId }, select: { departamentoId: true } },
        departamentosGeridos: {
          where: { departamento: { tenantId } },
          select: { departamentoId: true },
        },
        userPermissions: { where: { tenantId }, select: { permission: true, granted: true } },
      },
    }),
    db.role.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { ordem: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        cor: true,
        isSystem: true,
        permissions: true,
        permissionsExtras: true,
        departamentoId: true,
        papelNoDepartamento: true,
      },
    }),
    db.departamento.findMany({
      where: { tenantId },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        cor: true,
        slug: true,
        permissions: true,
        permissionsGestor: true,
      },
    }),
    db.sede.findFirst({ where: { tenantId, tipo: 'SEDE' }, select: { tipo: true } }),
  ])

  if (!usuario) return { ok: false, error: 'Usuário do cadastro não encontrado.' }

  // Mapa completo (inclui slugs legados) resolve a herança dos perfis
  // "Membro · Torcedor"; a lista de áreas oferecida na UI esconde os legados.
  const deptoById = new Map(departamentosRaw.map((d) => [d.id, d]))

  const roles: AccessRoleOpt[] = rolesRaw.map((role) => {
    const depto = role.departamentoId ? (deptoById.get(role.departamentoId) ?? null) : null
    return {
      id: role.id,
      nome: role.nome,
      cor: role.cor,
      isSystem: role.isSystem,
      permissions: permissionsOfRole(role, depto),
      permissionsPacote: depto
        ? role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
          ? [...depto.permissions, ...depto.permissionsGestor]
          : [...depto.permissions]
        : [],
      permissionsExtras: role.permissionsExtras,
      departamentoId: role.departamentoId,
      papelNoDepartamento: role.papelNoDepartamento,
    }
  })

  return {
    ok: true,
    dados: {
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        avatarUrl: usuario.avatarUrl,
        perfilIds: usuario.userRoles.map((r) => r.roleId),
        departamentoIds: usuario.userDepartamentos.map((d) => d.departamentoId),
        gestorDepartamentoIds: usuario.departamentosGeridos.map((g) => g.departamentoId),
        permissoesAdicionais: usuario.userPermissions,
      },
      roles,
      departamentos: departamentosRaw
        .filter((d) => !isDepartamentoLegado(d))
        .map((d) => ({
          id: d.id,
          nome: d.nome,
          cor: d.cor,
          permissions: d.permissions,
          permissionsGestor: d.permissionsGestor,
        })),
      tipoSede: sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO',
    },
  }
}
