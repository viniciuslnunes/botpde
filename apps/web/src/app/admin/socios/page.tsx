import { type ReactNode } from 'react'
import { db, type Prisma } from '@torcida/db'
import { assertAnyPermission } from '@/lib/authz'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { alertasRecrutamentoCrossTenant } from '@/lib/membro-alertas-cross-tenant'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  mapToAdminMembroItem,
  membroDetalheSelect,
  type MembroDetalheRow,
} from '@/lib/admin-membro-map'
import { getAreasEfetivadasPorUser } from '@/lib/get-areas-efetivadas'
import { carregarResumoRecrutamento } from '@/lib/membro-recrutamento-logs'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
  formatNomeTorcida,
} from '@torcida/types'
import { redirect } from 'next/navigation'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
} from '@/components/admin/ui'
import {
  construirHrefListagem,
  parseListagemParams,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import {
  LISTAGEM_SOCIOS_AGUARDANDO,
  LISTAGEM_SOCIOS_EMITIDAS,
  LISTAGEM_SOCIOS_SOLICITACOES,
} from '@/lib/listagem/specs'
import {
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
  type ListagemWhere,
} from '@/lib/listagem/query'
import type { OpcoesDinamicas } from '@/lib/listagem/ui'
import { AdminSociosClient } from './admin-socios-client'
import { AdminMembrosTable } from '@/app/admin/membros/admin-membros-client'
import { SincronizarNumerosAviso } from './sincronizar-numeros-aviso'
import { sugerirProximoNumeroAssociado } from '@/lib/membros-sede'
import type { AdminMembroItem } from '@/app/admin/membros/admin-membro-item'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sócios — Admin' }

type StatusFiltro = 'solicitacoes' | 'aguardando' | 'todos' | 'ativos' | 'vencendo' | 'vencidos'

function parseStatus(raw: string): StatusFiltro | '' {
  if (
    raw === 'solicitacoes' ||
    raw === 'PENDENTE' ||
    raw === 'aguardando' ||
    raw === 'todos' ||
    raw === 'ativos' ||
    raw === 'vencendo' ||
    raw === 'vencidos'
  ) {
    return raw === 'PENDENTE' ? 'solicitacoes' : raw
  }
  return ''
}

/** Nº exibido = o do recrutamento; fallback no sequencial legado da carteirinha. */
function labelNumeroSocio(
  numeroAssociado: string | null | undefined,
  numeroSocio: number,
): string {
  const raw = numeroAssociado?.trim()
  if (raw) return raw
  return String(numeroSocio)
}

async function resolverNomesUnidade(
  tenantIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(tenantIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return new Map()
  const rows: { id: string; nome: string }[] = await db.tenant.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true },
  })
  return new Map(rows.map((u) => [u.id, formatNomeTorcida(u.nome)]))
}

/**
 * Busca em emitidas: `numeroSocio` é Int (não cabe em `contains` do contrato) e
 * o nº do recrutamento mora em SaasMembro. Monta o OR completo da busca livre
 * aqui e zera `q` no parse usado pelo where padrão.
 */
function buscaEmitidas(
  termo: string,
  tenantId: string,
): ListagemWhere | null {
  const q = termo.trim()
  if (!q) return null
  const or: ListagemWhere[] = [
    { nome: { contains: q, mode: 'insensitive' } },
  ]
  if (/^\d+$/.test(q)) {
    const n = parseInt(q, 10)
    or.push({ numeroSocio: n })
    or.push({
      user: {
        membros: {
          some: {
            tenantId,
            tipo: 'SOCIO',
            OR: [
              { numeroAssociado: q },
              { numeroAssociado: String(n) },
            ],
          },
        },
      },
    })
  }
  return { OR: or }
}

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.MEMBERS_APPROVE,
    ]))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const texto = (chave: string): string => {
    const valor = params[chave]
    return typeof valor === 'string' ? valor : ''
  }

  const now = new Date()
  const em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const superAdmin = isSuperAdminEmail(session.user.email)
  let podeEmitir = superAdmin
  // Aba Acessos do card: `roles:manage`, a mesma permissão do Controle de
  // acesso. Esconder a aba é só affordance — quem chamar a action sem ela
  // continua barrado no servidor.
  let podeGerirAcessos = superAdmin
  // Bloquear/apagar no card do sócio: as mesmas permissões de /admin/torcedores.
  // O gate real está nas Server Actions; aqui é só affordance.
  let podeBloquear = superAdmin
  let podeApagar = superAdmin
  if (!superAdmin && session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeEmitir = hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE)
    podeGerirAcessos = hasPermission(effective, PERMISSIONS.ROLES_MANAGE)
    podeBloquear = hasPermission(effective, PERMISSIONS.MEMBERS_BLOCK)
    podeApagar = hasPermission(effective, PERMISSIONS.MEMBERS_PURGE)
  }

  // Anti-join via User.socios — evita NOT IN gigante em tenants grandes
  const elegivelBase: Prisma.SaasMembroWhereInput = {
    tenantId: tenant.id,
    status: 'APROVADO',
    tipo: 'SOCIO',
    user: { socios: { none: { tenantId: tenant.id } } },
  }

  const solicitacoesBase: Prisma.SaasMembroWhereInput = {
    tenantId: tenant.id,
    tipo: 'SOCIO',
    status: 'PENDENTE',
  }

  const [emitidas, ativos, vencendo, vencidos, aguardando, solicitacoesCount] =
    await Promise.all([
      db.saasSocio.count({ where: { tenantId: tenant.id } }),
      db.saasSocio.count({
        where: { tenantId: tenant.id, validade: { gte: now } },
      }),
      db.saasSocio.count({
        where: {
          tenantId: tenant.id,
          validade: { gt: now, lt: em30dias },
        },
      }),
      db.saasSocio.count({
        where: { tenantId: tenant.id, validade: { lt: now } },
      }),
      db.saasMembro.count({ where: elegivelBase }),
      db.saasMembro.count({ where: solicitacoesBase }),
    ])

  const contagens = {
    emitidas,
    ativos,
    vencendo,
    vencidos,
    aguardando,
    solicitacoes: solicitacoesCount,
  }

  const statusRaw = parseStatus(texto('status'))
  const statusFiltro: StatusFiltro =
    statusRaw ||
    (solicitacoesCount > 0
      ? 'solicitacoes'
      : aguardando > 0 && emitidas === 0
        ? 'aguardando'
        : 'todos')
  const isAguardando = statusFiltro === 'aguardando'
  const isSolicitacoes = statusFiltro === 'solicitacoes'

  // Três modelos/contratos. A aba status decide qual.
  const SPEC: ListagemSpec = isSolicitacoes
    ? LISTAGEM_SOCIOS_SOLICITACOES
    : isAguardando
      ? LISTAGEM_SOCIOS_AGUARDANDO
      : LISTAGEM_SOCIOS_EMITIDAS
  const listagem = parseListagemParams(params, SPEC)
  // Sempre gravar `status` na URL — inclusive `todos` (Emitidas). Omitir
  // colidia com o default inteligente da página (sem status → Solicitações
  // quando há pedidos pendentes).
  const extrasDaRota: Record<string, string | undefined> = {
    status: statusFiltro,
  }

  const sedesOpts: { id: string; nome: string; tipo: string }[] =
    await db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, tipo: true },
    })

  const dinamicas: OpcoesDinamicas = {
    sede: [
      { valor: 'nenhuma', label: 'Sem unidade' },
      ...sedesOpts.map((s) => ({ valor: s.id, label: s.nome })),
    ],
  }

  type SocioRow = {
    id: string
    userId: string
    numeroSocio: number
    nome: string
    validade: Date
    user: { email: string | null; avatarUrl: string | null }
  }

  let socios: SocioRow[] = []
  let elegiveisDetalhe: MembroDetalheRow[] = []
  const solicitacoesItens: AdminMembroItem[] = []
  let totalLista = 0
  const numeroAssociadoPorUserId = new Map<string, string | null>()
  const detalhePorUserId = new Map<string, AdminMembroItem>()
  let numerosDessincronizados = 0

  if (isSolicitacoes) {
    const where: Prisma.SaasMembroWhereInput = montarWhereListagem(
      SPEC,
      listagem,
      {
        escopo: { tenantId: tenant.id },
        extra: [solicitacoesBase],
      },
    )

    const [rows, total]: [MembroDetalheRow[], number] = await Promise.all([
      db.saasMembro.findMany({
        where,
        select: membroDetalheSelect,
        orderBy: montarOrderByListagem(SPEC, listagem),
        ...montarPaginacao(listagem),
      }) as Promise<MembroDetalheRow[]>,
      db.saasMembro.count({ where }),
    ])
    totalLista = total

    const userIds = rows.map((m) => m.userId)
    const membroIds = rows.map((m) => m.id)
    const [alertasCross, resumoRecrutamento, nomesUnidade, areasEfetivadas]: [
      Awaited<ReturnType<typeof alertasRecrutamentoCrossTenant>>,
      Awaited<ReturnType<typeof carregarResumoRecrutamento>>,
      Map<string, string>,
      Map<string, Set<string>>,
    ] = await Promise.all([
      alertasRecrutamentoCrossTenant(tenant.id, userIds),
      carregarResumoRecrutamento(tenant.id, membroIds),
      resolverNomesUnidade(rows.map((m) => m.aprovadoNaUnidadeTenantId)),
      getAreasEfetivadasPorUser(tenant.id, userIds),
    ])
    const { userIdsComRivalSocio, reprovacoesRivalPorUser: reprovacoesOutraTorcidaPorUser } =
      alertasCross
    const { tentativasPorMembro, motivoReprovacaoPorMembro, origemCanalPorMembro } =
      resumoRecrutamento

    for (const m of rows) {
      const item = mapToAdminMembroItem(m, {
        aprovadoNaUnidadeNome: m.aprovadoNaUnidadeTenantId
          ? (nomesUnidade.get(m.aprovadoNaUnidadeTenantId) ?? null)
          : null,
        alertaRivalSocio: userIdsComRivalSocio.has(m.userId),
        reprovacoesOutraTorcida: reprovacoesOutraTorcidaPorUser.get(m.userId),
        tentativas: tentativasPorMembro.get(m.id) ?? 1,
        ultimoMotivoReprovacao: motivoReprovacaoPorMembro.get(m.id),
        origemCanal: origemCanalPorMembro.get(m.id) ?? null,
        areasEfetivadas: areasEfetivadas.get(m.userId) ?? new Set<string>(),
      })
      solicitacoesItens.push(item)
      detalhePorUserId.set(m.userId, item)
    }
  } else if (isAguardando) {
    const where: Prisma.SaasMembroWhereInput = montarWhereListagem(
      SPEC,
      listagem,
      {
        escopo: { tenantId: tenant.id },
        extra: [elegivelBase],
      },
    )

    const [rows, total]: [MembroDetalheRow[], number] = await Promise.all([
      db.saasMembro.findMany({
        where,
        select: membroDetalheSelect,
        orderBy: montarOrderByListagem(SPEC, listagem),
        ...montarPaginacao(listagem),
      }) as Promise<MembroDetalheRow[]>,
      db.saasMembro.count({ where }),
    ])
    elegiveisDetalhe = rows
    totalLista = total

    const [nomesUnidade, areasEfetivadas, resumoRecrutamento] = await Promise.all([
      resolverNomesUnidade(rows.map((m) => m.aprovadoNaUnidadeTenantId)),
      getAreasEfetivadasPorUser(tenant.id, rows.map((m) => m.userId)),
      carregarResumoRecrutamento(tenant.id, rows.map((m) => m.id)),
    ])
    for (const m of rows) {
      detalhePorUserId.set(
        m.userId,
        mapToAdminMembroItem(m, {
          aprovadoNaUnidadeNome: m.aprovadoNaUnidadeTenantId
            ? (nomesUnidade.get(m.aprovadoNaUnidadeTenantId) ?? null)
            : null,
          origemCanal: resumoRecrutamento.origemCanalPorMembro.get(m.id) ?? null,
          areasEfetivadas: areasEfetivadas.get(m.userId) ?? new Set<string>(),
        }),
      )
    }
  } else {
    const validadeWhere: ListagemWhere =
      statusFiltro === 'ativos'
        ? { validade: { gte: now } }
        : statusFiltro === 'vencidos'
          ? { validade: { lt: now } }
          : statusFiltro === 'vencendo'
            ? { validade: { gt: now, lt: em30dias } }
            : {}

    // Busca numérica/nome montada à mão — zera `q` no contrato para não
    // AND-ar com o contains de nome sozinho.
    const listagemSemQ: ListagemParams = { ...listagem, q: '' }
    const buscaExtra = buscaEmitidas(listagem.q, tenant.id)

    const where: Prisma.SaasSocioWhereInput = montarWhereListagem(
      SPEC,
      listagemSemQ,
      {
        escopo: { tenantId: tenant.id },
        extra: [
          ...(Object.keys(validadeWhere).length > 0 ? [validadeWhere] : []),
          ...(buscaExtra ? [buscaExtra] : []),
        ],
      },
    )

    const [rows, total]: [SocioRow[], number] = await Promise.all([
      db.saasSocio.findMany({
        where,
        select: {
          id: true,
          userId: true,
          numeroSocio: true,
          nome: true,
          validade: true,
          user: { select: { email: true, avatarUrl: true } },
        },
        orderBy: montarOrderByListagem(SPEC, listagem),
        ...montarPaginacao(listagem),
      }),
      db.saasSocio.count({ where }),
    ])
    socios = rows
    totalLista = total

    if (rows.length > 0) {
      const membrosPagina = (await db.saasMembro.findMany({
        where: {
          tenantId: tenant.id,
          userId: { in: rows.map((s) => s.userId) },
          tipo: 'SOCIO',
        },
        select: membroDetalheSelect,
      })) as MembroDetalheRow[]
      const [nomesUnidade, areasEfetivadas, resumoRecrutamento] = await Promise.all([
        resolverNomesUnidade(membrosPagina.map((m) => m.aprovadoNaUnidadeTenantId)),
        getAreasEfetivadasPorUser(tenant.id, membrosPagina.map((m) => m.userId)),
        carregarResumoRecrutamento(tenant.id, membrosPagina.map((m) => m.id)),
      ])
      for (const m of membrosPagina) {
        numeroAssociadoPorUserId.set(m.userId, m.numeroAssociado?.trim() || null)
        detalhePorUserId.set(
          m.userId,
          mapToAdminMembroItem(m, {
            aprovadoNaUnidadeNome: m.aprovadoNaUnidadeTenantId
              ? (nomesUnidade.get(m.aprovadoNaUnidadeTenantId) ?? null)
              : null,
            origemCanal: resumoRecrutamento.origemCanalPorMembro.get(m.id) ?? null,
            areasEfetivadas: areasEfetivadas.get(m.userId) ?? new Set<string>(),
          }),
        )
      }

      numerosDessincronizados = rows.filter((s) => {
        const raw = numeroAssociadoPorUserId.get(s.userId) ?? ''
        return /^\d+$/.test(raw) && parseInt(raw, 10) !== s.numeroSocio
      }).length
    }
  }

  // Bloqueios em lote, só dos usuários que aparecem nesta página. Inclui os
  // ancestrais: bloqueio na Sede vale aqui e o card precisa refletir isso.
  const escopoBloqueio = [tenant.id, ...(await getAncestorTenantIds(tenant.id))]
  const bloqueios: { userId: string }[] = await db.membroBloqueio.findMany({
    where: {
      tenantId: { in: escopoBloqueio },
      userId: { in: [...detalhePorUserId.keys()] },
    },
    select: { userId: true },
  })
  const bloqueadosUserIds = [...new Set(bloqueios.map((b) => b.userId))]

  type OptRow = {
    id: string
    userId: string
    nome: string
    numeroAssociado: string | null
    discordTag: string | null
    cidade: string | null
    telefone: string | null
    aprovadoEm: Date | null
    user: { avatarUrl: string | null }
    sede: { nome: string } | null
    departamento: { nome: string } | null
  }
  const [elegiveisModal, proximoNumero]: [OptRow[], string] = podeEmitir
    ? await Promise.all([
        db.saasMembro.findMany({
          where: elegivelBase,
          select: {
            id: true,
            userId: true,
            nome: true,
            numeroAssociado: true,
            discordTag: true,
            cidade: true,
            telefone: true,
            aprovadoEm: true,
            user: { select: { avatarUrl: true } },
            sede: { select: { nome: true } },
            departamento: { select: { nome: true } },
          },
          orderBy: { nome: 'asc' },
          take: 300,
        }),
        sugerirProximoNumeroAssociado(tenant.id),
      ])
    : [[], '1']

  const paginacao = resumirPaginacao(totalLista, listagem)

  // Trocar de aba volta à página 1 e zera sort inválido entre os dois specs
  // (aprovadoEm não existe em emitidas e vice-versa). `status` vai sempre
  // na URL (também `todos`), senão o default da página manda de volta para
  // Solicitações quando há pedidos pendentes.
  const tabHrefs: Record<string, string> = Object.fromEntries(
    (
      ['solicitacoes', 'aguardando', 'todos', 'ativos', 'vencendo', 'vencidos'] as const
    ).map((status) => {
        const specTab =
          status === 'solicitacoes'
            ? LISTAGEM_SOCIOS_SOLICITACOES
            : status === 'aguardando'
              ? LISTAGEM_SOCIOS_AGUARDANDO
              : LISTAGEM_SOCIOS_EMITIDAS
        // Re-parse com o spec destino: sort/dir inválidos caem no padrão.
        const paramsTab = parseListagemParams(
          {
            ...Object.fromEntries(
              Object.entries(params).map(([k, v]) => [
                k,
                Array.isArray(v) ? v[0] : v,
              ]),
            ),
            status,
            pagina: '1',
          },
          specTab,
        )
        return [
          status,
          construirHrefListagem(specTab, paramsTab, {
            pagina: 1,
            extras: { status },
          }),
        ]
      }),
  )

  const COLUNA_CLASSE: Record<string, string> = isSolicitacoes
    ? {
        departamento: 'hidden sm:table-cell',
        sede: 'hidden md:table-cell',
        cidade: 'hidden lg:table-cell',
        criadoEm: 'hidden xl:table-cell',
      }
    : isAguardando
      ? {
          departamento: 'hidden sm:table-cell',
          sede: 'hidden md:table-cell',
          cidade: 'hidden lg:table-cell',
          aprovadoEm: 'hidden xl:table-cell',
        }
      : {
          departamento: 'hidden md:table-cell',
          email: 'hidden lg:table-cell',
        }

  const cabecalho: ReactNode = SPEC.colunas.map((coluna) => (
    <ListagemTh
      key={coluna.id}
      spec={SPEC}
      params={listagem}
      coluna={coluna}
      dinamicas={dinamicas}
      extras={extrasDaRota}
      className={COLUNA_CLASSE[coluna.id] ?? ''}
    />
  ))

  const toolbar = (
    <ListagemToolbar
      spec={SPEC}
      params={listagem}
      paginacao={paginacao}
      dinamicas={dinamicas}
      extras={extrasDaRota}
      escopoChave={`${tenant.id}:${isSolicitacoes ? 'solicitacoes' : isAguardando ? 'aguardando' : 'emitidas'}`}
      filtrosCompactos={
        isSolicitacoes || isAguardando
          ? [{ filtroId: 'sede', classe: 'md:hidden' }]
          : [{ filtroId: 'sede' }]
      }
    />
  )

  const paginacaoEl = (
    <ListagemPaginacao
      spec={SPEC}
      params={listagem}
      paginacao={paginacao}
      extras={extrasDaRota}
    />
  )

  return (
    <div className="flex h-full flex-col">
      {numerosDessincronizados > 0 && podeEmitir && (
        <SincronizarNumerosAviso quantidade={numerosDessincronizados} />
      )}

      <AdminSociosClient
        solicitacoes={solicitacoesItens}
        solicitacoesTabela={
          isSolicitacoes ? (
            <AdminMembrosTable
              cabecalho={cabecalho}
              spec={SPEC}
              params={listagem}
              classesPorColuna={COLUNA_CLASSE}
              podeGerirAcessos={podeGerirAcessos}
              podeBloquear={podeBloquear}
              podeApagar={podeApagar}
              bloqueadosUserIds={bloqueadosUserIds}
              membros={solicitacoesItens}
            />
          ) : null
        }
        socios={socios.map((s) => ({
          id: s.id,
          userId: s.userId,
          numeroSocio: s.numeroSocio,
          numeroLabel: labelNumeroSocio(
            numeroAssociadoPorUserId.get(s.userId),
            s.numeroSocio,
          ),
          nome: s.nome,
          validadeIso: s.validade.toISOString().split('T')[0] ?? '',
          validadeLabel: s.validade.toLocaleDateString('pt-BR'),
          email: s.user.email,
          departamentoNome: detalhePorUserId.get(s.userId)?.departamentoNome ?? null,
          avatarUrl: s.user.avatarUrl,
          vencida: s.validade < now,
          vencendo: s.validade > now && s.validade < em30dias,
          detalhe: detalhePorUserId.get(s.userId) ?? null,
        }))}
        elegiveis={elegiveisDetalhe.map((m) => {
          const detalhe = detalhePorUserId.get(m.userId)!
          return {
            userId: m.userId,
            membroId: m.id,
            nome: m.nome,
            numeroAssociado: m.numeroAssociado,
            discordTag: m.discordTag,
            telefone: m.telefone,
            cidade: m.cidade,
            avatarUrl: m.user.avatarUrl,
            sedeNome: m.sede?.nome ?? null,
            departamentoNome: m.departamento?.nome ?? null,
            aprovadoEmLabel: m.aprovadoEm
              ? m.aprovadoEm.toLocaleDateString('pt-BR')
              : null,
            detalhe,
          }
        })}
        elegiveisModal={elegiveisModal.map((m) => ({
          userId: m.userId,
          membroId: m.id,
          nome: m.nome,
          numeroAssociado: m.numeroAssociado,
          discordTag: m.discordTag,
          telefone: m.telefone,
          cidade: m.cidade,
          avatarUrl: m.user.avatarUrl,
          sedeNome: m.sede?.nome ?? null,
          departamentoNome: m.departamento?.nome ?? null,
          aprovadoEmLabel: m.aprovadoEm
            ? m.aprovadoEm.toLocaleDateString('pt-BR')
            : null,
          detalhe: null,
        }))}
        contagens={contagens}
        statusFiltro={statusFiltro}
        tabHrefs={tabHrefs}
        podeEmitir={podeEmitir}
        podeGerirAcessos={podeGerirAcessos}
        podeBloquear={podeBloquear}
        podeApagar={podeApagar}
        bloqueadosUserIds={bloqueadosUserIds}
        toolbar={toolbar}
        cabecalho={cabecalho}
        paginacao={paginacaoEl}
        temFiltroAtivo={
          listagem.q.length > 0 || Object.keys(listagem.filtros).length > 0
        }
        proximoNumero={proximoNumero}
      />
    </div>
  )
}
