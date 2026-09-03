import 'server-only'

import { db, type Prisma } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { REACTIVE_SEARCH_MAX_SUGESTOES } from '@/lib/reactive-search/types'
import { montarWhereListagem } from './query'
import { parseListagemParams, type SearchParamsCru } from './params'
import {
  LISTAGEM_DEPARTAMENTO_AREAS,
  LISTAGEM_DEPARTAMENTO_EQUIPES,
  LISTAGEM_DEPARTAMENTO_PROJETOS,
  LISTAGEM_TORCEDORES,
  LISTAGEM_ACESSOS_PESSOAS,
  LISTAGEM_SOCIOS_SOLICITACOES,
  LISTAGEM_SOCIOS_TODOS,
  LISTAGEM_SOCIOS_AGUARDANDO,
  LISTAGEM_SOCIOS_EMITIDAS,
  LISTAGEM_LOJA_PEDIDOS,
  LISTAGENS,
} from './specs'
import { buscaEmitidasSocios, validadeWhereEmitidasSocios } from './socios-busca'
import type { ListagemSpec, ListagemParams } from './spec'

export type ListagemTypeaheadItem = {
  id: string
  label: string
  sublabel?: string | null
  searchText?: string
}

const LIMITE = REACTIVE_SEARCH_MAX_SUGESTOES

export function specPorId(id: string): ListagemSpec | null {
  return LISTAGENS.find((s) => s.id === id) ?? null
}

function permissaoDoSpec(specId: string) {
  switch (specId) {
    case 'admin-departamento-areas':
    case 'admin-departamento-equipes':
    case 'admin-departamento-projetos':
    case 'admin-acessos-pessoas':
      return PERMISSIONS.ROLES_MANAGE
    case 'admin-loja-pedidos':
      return PERMISSIONS.STORE_MANAGE
    default:
      return PERMISSIONS.MEMBERS_VIEW
  }
}

async function resolverTenantId(spec: ListagemSpec): Promise<string | null> {
  if (spec.basePath.startsWith('/super-admin')) {
    const session = await auth()
    if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
      throw new Error('Acesso negado.')
    }
    return null
  }
  const { tenant } = await assertPermission(permissaoDoSpec(spec.id))
  return tenant.id
}

function rotuloPessoa(nome: string | null, nickname: string | null, email?: string | null): string {
  if (nome?.trim()) return nome.trim()
  if (nickname?.trim()) return `@${nickname.trim()}`
  return email?.trim() || 'Pessoa'
}

async function typeaheadDepartamentoAreas(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  const where: Prisma.DepartamentoAreaWhereInput = montarWhereListagem(
    LISTAGEM_DEPARTAMENTO_AREAS,
    params,
    { escopo: { tenantId } },
  )
  const rows: Array<{
    id: string
    nome: string
    descricao: string | null
    departamento: { nome: string }
  }> = await db.departamentoArea.findMany({
    where,
    take: LIMITE,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      descricao: true,
      departamento: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.nome,
    sublabel: r.departamento.nome,
    searchText: `${r.nome} ${r.descricao ?? ''} ${r.departamento.nome}`,
  }))
}

async function typeaheadDepartamentoEquipes(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  const escopoViaArea = { area: { tenantId } } as const
  const where: Prisma.DepartamentoAreaMembroWhereInput = montarWhereListagem(
    LISTAGEM_DEPARTAMENTO_EQUIPES,
    params,
    { escopo: { tenantId, viaRelacao: true }, extra: [escopoViaArea] },
  )
  const rows: Array<{
    areaId: string
    userId: string
    user: { nome: string | null; nickname: string | null; email: string | null }
    area: { nome: string; departamento: { nome: string } }
  }> = await db.departamentoAreaMembro.findMany({
    where,
    take: LIMITE,
    orderBy: [{ user: { nome: 'asc' } }],
    select: {
      areaId: true,
      userId: true,
      user: { select: { nome: true, nickname: true, email: true } },
      area: {
        select: {
          nome: true,
          departamento: { select: { nome: true } },
        },
      },
    },
  })
  return rows.map((r) => ({
    id: `${r.areaId}:${r.userId}`,
    label: rotuloPessoa(r.user.nome, r.user.nickname, r.user.email),
    sublabel: `${r.area.nome} · ${r.area.departamento.nome}`,
    searchText: [r.user.nome, r.user.nickname, r.user.email, r.area.nome].filter(Boolean).join(' '),
  }))
}

async function typeaheadDepartamentoProjetos(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  const where: Prisma.ProjetoWhereInput = montarWhereListagem(
    LISTAGEM_DEPARTAMENTO_PROJETOS,
    params,
    { escopo: { tenantId } },
  )
  const rows: Array<{
    id: string
    titulo: string
    descricao: string | null
    departamento: { nome: string }
  }> = await db.projeto.findMany({
    where,
    take: LIMITE,
    orderBy: { titulo: 'asc' },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      departamento: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.titulo,
    sublabel: r.departamento.nome,
    searchText: `${r.titulo} ${r.descricao ?? ''}`,
  }))
}

async function typeaheadTorcedores(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  const where: Prisma.SaasMembroWhereInput = montarWhereListagem(LISTAGEM_TORCEDORES, params, {
    escopo: { tenantId },
    extra: [{ tenantId, tipo: 'TORCEDOR' }],
  })
  const rows: Array<{
    id: string
    nome: string | null
    cidade: string | null
    nickname: string | null
    departamento: { nome: string } | null
  }> = await db.saasMembro.findMany({
    where,
    take: LIMITE,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      cidade: true,
      nickname: true,
      departamento: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.nome?.trim() || 'Sem nome',
    sublabel: [r.departamento?.nome, r.cidade].filter(Boolean).join(' · ') || null,
    searchText: [r.nome, r.nickname, r.cidade].filter(Boolean).join(' '),
  }))
}

async function typeaheadSaasMembro(
  spec: ListagemSpec,
  tenantId: string,
  params: ListagemParams,
  extra: Prisma.SaasMembroWhereInput[],
  rotuloVazio: string,
): Promise<ListagemTypeaheadItem[]> {
  const where: Prisma.SaasMembroWhereInput = montarWhereListagem(spec, params, {
    escopo: { tenantId },
    extra,
  })
  const rows: Array<{
    id: string
    nome: string | null
    cidade: string | null
    telefone: string | null
    numeroAssociado: number | null
    departamento: { nome: string } | null
  }> = await db.saasMembro.findMany({
    where,
    take: LIMITE,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      cidade: true,
      telefone: true,
      numeroAssociado: true,
      departamento: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.nome?.trim() || rotuloVazio,
    sublabel:
      [r.numeroAssociado ? `Nº ${r.numeroAssociado}` : null, r.departamento?.nome, r.cidade]
        .filter(Boolean)
        .join(' · ') || null,
    searchText: [r.nome, r.cidade, r.telefone, r.numeroAssociado, r.departamento?.nome]
      .filter(Boolean)
      .join(' '),
  }))
}

async function typeaheadSociosSolicitacoes(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  return typeaheadSaasMembro(
    LISTAGEM_SOCIOS_SOLICITACOES,
    tenantId,
    params,
    [{ tenantId, tipo: 'SOCIO', status: 'PENDENTE' }],
    'Solicitante',
  )
}

async function typeaheadSociosTodos(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  return typeaheadSaasMembro(
    LISTAGEM_SOCIOS_TODOS,
    tenantId,
    params,
    [{ tenantId, tipo: 'SOCIO', status: { in: ['PENDENTE', 'APROVADO'] } }],
    'Sócio',
  )
}

async function typeaheadSociosAguardando(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  return typeaheadSaasMembro(
    LISTAGEM_SOCIOS_AGUARDANDO,
    tenantId,
    params,
    [
      {
        tenantId,
        status: 'APROVADO',
        tipo: 'SOCIO',
        user: { socios: { none: { tenantId } } },
      },
    ],
    'Sócio',
  )
}

function textoParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function typeaheadSociosEmitidas(
  tenantId: string,
  params: ListagemParams,
  searchParams: SearchParamsCru,
): Promise<ListagemTypeaheadItem[]> {
  const now = new Date()
  const em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const status = textoParam(searchParams.status)
  const validadeWhere = validadeWhereEmitidasSocios(status, now, em30dias)
  const listagemSemQ: ListagemParams = { ...params, q: '' }
  const buscaExtra = buscaEmitidasSocios(params.q, tenantId)
  const extra: Prisma.SaasSocioWhereInput[] = [
    ...(Object.keys(validadeWhere).length > 0 ? [validadeWhere as Prisma.SaasSocioWhereInput] : []),
    ...(buscaExtra ? [buscaExtra as Prisma.SaasSocioWhereInput] : []),
  ]
  const where: Prisma.SaasSocioWhereInput = montarWhereListagem(
    LISTAGEM_SOCIOS_EMITIDAS,
    listagemSemQ,
    { escopo: { tenantId }, extra },
  )
  const rows: Array<{
    id: string
    nome: string | null
    numeroSocio: number
    user: { email: string | null }
  }> = await db.saasSocio.findMany({
    where,
    take: LIMITE,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      numeroSocio: true,
      user: { select: { email: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.nome?.trim() || 'Sócio',
    sublabel: r.user.email ?? `Nº ${r.numeroSocio}`,
    searchText: [r.nome, String(r.numeroSocio), r.user.email].filter(Boolean).join(' '),
  }))
}

async function typeaheadAcessosPessoas(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  const where: Prisma.UserWhereInput = montarWhereListagem(LISTAGEM_ACESSOS_PESSOAS, params, {
    escopo: { tenantId },
    extra: [
      {
        OR: [
          { userRoles: { some: { tenantId } } },
          { userDepartamentos: { some: { tenantId } } },
        ],
      },
    ],
  })
  const rows: Array<{
    id: string
    nome: string | null
    email: string | null
    nickname: string | null
  }> = await db.user.findMany({
    where,
    take: LIMITE,
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, email: true, nickname: true },
  })
  return rows.map((r) => ({
    id: r.id,
    label: rotuloPessoa(r.nome, r.nickname, r.email),
    sublabel: r.email,
    searchText: [r.nome, r.nickname, r.email].filter(Boolean).join(' '),
  }))
}

async function typeaheadLojaPedidos(
  tenantId: string,
  params: ListagemParams,
): Promise<ListagemTypeaheadItem[]> {
  const where: Prisma.SaasPedidoWhereInput = montarWhereListagem(LISTAGEM_LOJA_PEDIDOS, params, {
    escopo: { tenantId },
  })
  const rows: Array<{
    id: string
    cupomCodigo: string | null
    user: { nome: string | null; email: string | null }
  }> = await db.saasPedido.findMany({
    where,
    take: LIMITE,
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      cupomCodigo: true,
      user: { select: { nome: true, email: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.user.nome?.trim() || 'Pedido',
    sublabel: r.user.email ?? r.cupomCodigo,
    searchText: [r.user.nome, r.user.email, r.cupomCodigo].filter(Boolean).join(' '),
  }))
}

/** Sugestões rápidas para o dropdown da busca reativa (`ListagemBusca`). */
export async function buscarTypeaheadListagem(
  specId: string,
  searchParams: SearchParamsCru,
): Promise<ListagemTypeaheadItem[]> {
  const spec = specPorId(specId)
  if (!spec?.buscaEm?.length) return []

  const params = parseListagemParams(searchParams, spec)
  if (!params.q.trim()) return []

  const tenantId = await resolverTenantId(spec)
  if (tenantId === null && !spec.basePath.startsWith('/super-admin')) return []

  switch (spec.id) {
    case 'admin-departamento-areas':
      return typeaheadDepartamentoAreas(tenantId!, params)
    case 'admin-departamento-equipes':
      return typeaheadDepartamentoEquipes(tenantId!, params)
    case 'admin-departamento-projetos':
      return typeaheadDepartamentoProjetos(tenantId!, params)
    case 'admin-torcedores':
      return typeaheadTorcedores(tenantId!, params)
    case 'admin-socios-solicitacoes':
      return typeaheadSociosSolicitacoes(tenantId!, params)
    case 'admin-socios-todos':
      return typeaheadSociosTodos(tenantId!, params)
    case 'admin-socios-aguardando':
      return typeaheadSociosAguardando(tenantId!, params)
    case 'admin-socios-emitidas':
      return typeaheadSociosEmitidas(tenantId!, params, searchParams)
    case 'admin-acessos-pessoas':
      return typeaheadAcessosPessoas(tenantId!, params)
    case 'admin-loja-pedidos':
      return typeaheadLojaPedidos(tenantId!, params)
    default:
      return []
  }
}
