import { db, type Prisma } from '@torcida/db'
import { redirect } from 'next/navigation'
import { AccessControlNav, parseAccessSecao } from '@/components/admin/access-control-nav'
import {
  AccessPessoasLista,
  type AccessPessoaRow,
} from '@/components/admin/access-pessoas-lista'
import { AccessUserPanelRoute } from '@/components/admin/access-user-panel-route'
import { RolesManager, DepartamentosManager } from '@/components/admin/config-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { assertPermission } from '@/lib/authz'
import {
  construirHrefListagem,
  parseListagemParams,
  temFiltroAtivo,
  type ListagemFacetas,
} from '@/lib/listagem'
import { LISTAGEM_ACESSOS_PESSOAS } from '@/lib/listagem/specs'
import type { OpcoesDinamicas } from '@/lib/listagem/ui'
import {
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import {
  PERMISSIONS,
  permissionsOfRole,
  rotuloCargoSistema,
  PAPEL_DEPARTAMENTO,
  isDepartamentoLegado,
} from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Controle de acesso — Admin' }

const SPEC = LISTAGEM_ACESSOS_PESSOAS

interface RoleLite {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  permissions: string[]
  permissionsExtras: string[]
  departamentoId: string | null
  papelNoDepartamento: string | null
  ordem: number
}
interface DepartamentoLite {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
  slug: string
  moduloPortal: string | null
  ordem: number
}
interface UsoPorRole {
  roleId: string
  _count: { roleId: number }
}
interface UsoPorDepartamento {
  departamentoId: string
  _count: { departamentoId: number }
}

/** Linha da listagem: vínculos já escopados no `select`, não cruzados em memória. */
interface PessoaRaw {
  id: string
  nome: string | null
  email: string | null
  avatarUrl: string | null
  userRoles: { roleId: string }[]
  userDepartamentos: { departamentoId: string }[]
  departamentosGeridos: { departamentoId: string }[]
  userPermissions: { permission: string; granted: boolean }[]
}

/**
 * Quem aparece no Controle de acesso: qualquer vínculo com a torcida (membro,
 * cargo, área ou permissão avulsa). Continua partindo de `User` de propósito —
 * quem recebeu cargo sem ser membro precisa ser gerenciável.
 */
function vinculoComTenant(tenantId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { membros: { some: { tenantId } } },
      { userRoles: { some: { tenantId } } },
      { userDepartamentos: { some: { tenantId } } },
      { userPermissions: { some: { tenantId } } },
    ],
  }
}

function selectPessoa(tenantId: string) {
  return {
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
  } satisfies Prisma.UserSelect
}

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const secao = parseAccessSecao(typeof params.secao === 'string' ? params.secao : undefined)
  const usuarioSelecionado =
    typeof params.usuario === 'string' && params.usuario.trim() ? params.usuario.trim() : null
  const listagem = parseListagemParams(params, SPEC)
  const extrasDaRota: Record<string, string | undefined> = { secao }

  const [usoPorRole, usoPorDepartamento, rolesRaw, departamentosRaw, sedeDoTenant]: [
    UsoPorRole[],
    UsoPorDepartamento[],
    RoleLite[],
    DepartamentoLite[],
    { tipo: string } | null,
  ] = await Promise.all([
    db.userRole.groupBy({
      by: ['roleId'],
      where: { tenantId: tenant.id },
      _count: { roleId: true },
    }),
    db.userDepartamento.groupBy({
      by: ['departamentoId'],
      where: { tenantId: tenant.id },
      _count: { departamentoId: true },
    }),
    db.role.findMany({
      where: { tenantId: tenant.id },
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
        ordem: true,
      },
    }),
    db.departamento.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        cor: true,
        permissions: true,
        permissionsGestor: true,
        slug: true,
        moduloPortal: true,
        ordem: true,
      },
    }),
    db.sede.findFirst({
      where: { tenantId: tenant.id, tipo: 'SEDE' },
      select: { tipo: true },
    }),
  ])

  const usoMap = new Map(usoPorRole.map((u) => [u.roleId, u._count.roleId]))
  const roles = rolesRaw.map((role) => ({ ...role, emUso: usoMap.get(role.id) ?? 0 }))

  // UI de áreas esconde slugs legados (tipos de membro); o mapa completo abaixo
  // ainda resolve herança de perfis tipo "Membro · Torcedor".
  const departamentos = departamentosRaw.filter((d) => !isDepartamentoLegado(d))
  const deptoById = new Map(departamentosRaw.map((d) => [d.id, d]))

  const rolesComEfetivas = roles.map((role) => {
    const depto = role.departamentoId ? (deptoById.get(role.departamentoId) ?? null) : null
    return {
      ...role,
      permissions: permissionsOfRole(role, depto),
      permissionsPacote: depto
        ? role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
          ? [...depto.permissions, ...depto.permissionsGestor]
          : [...depto.permissions]
        : [],
    }
  })

  const tipoSede: string = sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO'
  const permissoesPorRole = new Map(rolesComEfetivas.map((r) => [r.id, r.permissions]))

  /** Permissões concedidas que nenhum perfil do usuário já cobre. */
  function contarExtras(pessoa: PessoaRaw): number {
    const coberto = new Set(
      pessoa.userRoles.flatMap((r) => permissoesPorRole.get(r.roleId) ?? []),
    )
    return pessoa.userPermissions.filter((p) => p.granted && !coberto.has(p.permission))
      .length
  }

  // Painel de uma pessoa: consulta só ela. Antes, editar um acesso carregava a
  // torcida inteira (usuários + todas as tabelas de vínculo) para achar 1 linha.
  if (secao === 'pessoas' && usuarioSelecionado) {
    const pessoa: PessoaRaw | null = await db.user.findFirst({
      where: { id: usuarioSelecionado, ...vinculoComTenant(tenant.id) },
      select: selectPessoa(tenant.id),
    })
    const voltarHref = construirHrefListagem(SPEC, listagem, { extras: extrasDaRota })

    if (!pessoa) redirect(voltarHref)

    return (
      <MotionReveal>
        <AccessUserPanelRoute
          usuario={{
            id: pessoa.id,
            nome: pessoa.nome,
            email: pessoa.email,
            avatarUrl: pessoa.avatarUrl,
            perfilIds: pessoa.userRoles.map((r) => r.roleId),
            departamentoIds: pessoa.userDepartamentos.map((d) => d.departamentoId),
            gestorDepartamentoIds: pessoa.departamentosGeridos.map((g) => g.departamentoId),
            permissoesAdicionais: pessoa.userPermissions,
          }}
          roles={rolesComEfetivas}
          departamentos={departamentos}
          tipoSede={tipoSede}
          voltarHref={voltarHref}
        />
      </MotionReveal>
    )
  }

  // Contagem de pessoas: sempre necessária (badge da aba). As linhas só quando a
  // aba de pessoas está aberta — abrir Cargos não paga a listagem de pessoas.
  // `User` é tabela global: o recorte por torcida é o vínculo em `extra`, não uma
  // coluna `tenantId` — daí `viaRelacao`.
  const wherePessoas: Prisma.UserWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { tenantId: tenant.id, viaRelacao: true },
    extra: [vinculoComTenant(tenant.id)],
  })

  const listarPessoas = secao === 'pessoas'
  const filtrando = temFiltroAtivo(listagem)
  const [pessoasRaw, totalFiltrado, totalVinculadas]: [PessoaRaw[], number, number] =
    await Promise.all([
      listarPessoas
        ? db.user.findMany({
            where: wherePessoas,
            select: selectPessoa(tenant.id),
            orderBy: montarOrderByListagem(SPEC, listagem),
            ...montarPaginacao(listagem),
          })
        : Promise.resolve([]),
      db.user.count({ where: wherePessoas }),
      // O badge da aba conta o universo da seção, não o resultado do filtro:
      // filtrar por "Sem perfil" não deve fazer a aba dizer que a torcida
      // encolheu. Sem filtro, os dois números são o mesmo — não paga a query.
      filtrando
        ? db.user.count({ where: vinculoComTenant(tenant.id) })
        : Promise.resolve(-1),
    ])

  const paginacao = resumirPaginacao(totalFiltrado, listagem)
  const totalPessoas = totalVinculadas === -1 ? totalFiltrado : totalVinculadas

  const rotuloRole = (role: RoleLite): string =>
    role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome

  // Contagens dos popovers de filtro. Vêm de `groupBy` que a página já fazia
  // para o "em uso" dos cargos — filtro facetado sem query nova.
  const facetas: ListagemFacetas = {
    cargo: [
      ...rolesRaw.map((role) => ({
        valor: role.id,
        label: rotuloRole(role),
        count: usoMap.get(role.id) ?? 0,
      })),
      { valor: 'sem', label: 'Sem perfil', count: 0 },
    ],
    area: [
      ...departamentos.map((depto) => ({
        valor: depto.id,
        label: depto.nome,
        count:
          usoPorDepartamento.find((u) => u.departamentoId === depto.id)?._count
            .departamentoId ?? 0,
      })),
      { valor: 'sem', label: 'Sem área', count: 0 },
    ],
  }
  const dinamicas: OpcoesDinamicas = {
    cargo: rolesRaw.map((role) => ({ valor: role.id, label: rotuloRole(role) })),
    area: departamentos.map((depto) => ({ valor: depto.id, label: depto.nome })),
  }

  const roleById = new Map(rolesRaw.map((r) => [r.id, r]))
  const pessoas: AccessPessoaRow[] = pessoasRaw.map((pessoa) => {
    const gestorDe = new Set(pessoa.departamentosGeridos.map((g) => g.departamentoId))
    return {
      id: pessoa.id,
      nome: pessoa.nome,
      email: pessoa.email,
      avatarUrl: pessoa.avatarUrl,
      perfis: pessoa.userRoles
        .map((r) => roleById.get(r.roleId))
        .filter((r): r is RoleLite => !!r)
        .map((r) => ({ id: r.id, nome: r.nome, cor: r.cor, isSystem: r.isSystem })),
      areas: pessoa.userDepartamentos
        .map((d) => deptoById.get(d.departamentoId))
        .filter((d): d is DepartamentoLite => !!d && !isDepartamentoLegado(d))
        .map((d) => ({
          id: d.id,
          nome: d.nome,
          cor: d.cor,
          gestor: gestorDe.has(d.id),
        })),
      extras: contarExtras(pessoa),
    }
  })

  return (
    <div className="space-y-6">
      <AccessControlNav
        secao={secao}
        counts={{
          pessoas: totalPessoas,
          cargos: rolesComEfetivas.length,
          departamentos: departamentos.length,
        }}
      />

      <MotionReveal>
        {secao === 'cargos' && (
          <RolesManager roles={rolesComEfetivas} departamentos={departamentos} tipoSede={tipoSede} />
        )}
        {secao === 'departamentos' && <DepartamentosManager departamentos={departamentos} />}
        {secao === 'pessoas' && (
          <AccessPessoasLista
            spec={SPEC}
            params={listagem}
            paginacao={paginacao}
            pessoas={pessoas}
            facetas={facetas}
            dinamicas={dinamicas}
            tipoSede={tipoSede}
            tenantId={tenant.id}
            extras={extrasDaRota}
          />
        )}
      </MotionReveal>
    </div>
  )
}
