import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  mapToAdminMembroItem,
  membroDetalheSelect,
  type MembroDetalheRow,
} from '@/lib/admin-membro-map'
import {
  nextSortDir,
  parseDirParam,
  parseSortParam,
  type SortDir,
} from '@/lib/admin-list-sort'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
  formatNomeTorcida,
} from '@torcida/types'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminSociosClient } from './admin-socios-client'
import type { AdminMembroItem } from '@/app/admin/membros/admin-membro-item'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sócios — Admin' }

const POR_PAGINA = 20

type StatusFiltro = 'aguardando' | 'todos' | 'ativos' | 'vencendo' | 'vencidos'

const SOCIOS_EMITIDOS_SORT = ['numero', 'nome', 'validade', 'email'] as const
const SOCIOS_AGUARDANDO_SORT = [
  'numero',
  'nome',
  'sede',
  'cidade',
  'aprovadoEm',
] as const

type SocioEmitidoSort = (typeof SOCIOS_EMITIDOS_SORT)[number]
type SocioAguardandoSort = (typeof SOCIOS_AGUARDANDO_SORT)[number]

const EMITIDOS_DEFAULT_DIR: Partial<Record<SocioEmitidoSort, SortDir>> = {
  numero: 'asc',
  nome: 'asc',
  validade: 'asc',
  email: 'asc',
}

const AGUARDANDO_DEFAULT_DIR: Partial<Record<SocioAguardandoSort, SortDir>> = {
  numero: 'asc',
  nome: 'asc',
  sede: 'asc',
  cidade: 'asc',
  aprovadoEm: 'desc',
}

function parseStatus(raw: string): StatusFiltro | '' {
  if (
    raw === 'aguardando' ||
    raw === 'todos' ||
    raw === 'ativos' ||
    raw === 'vencendo' ||
    raw === 'vencidos'
  ) {
    return raw
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

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    status?: string
    pagina?: string
    sede?: string
    sort?: string
    dir?: string
  }>
}) {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const busca = params.q?.trim() ?? ''
  const statusRaw = parseStatus(params.status ?? '')
  const sedeFiltro = params.sede ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const now = new Date()
  const em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const numeroBusca = parseInt(busca, 10)

  let podeEmitir = isSuperAdminEmail(session.user.email)
  if (!podeEmitir && session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeEmitir = hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE)
  }

  // Anti-join via User.socios — evita NOT IN gigante em tenants grandes
  const elegivelBase = {
    tenantId: tenant.id,
    status: 'APROVADO' as const,
    tipo: 'SOCIO' as const,
    user: { socios: { none: { tenantId: tenant.id } } },
  }
  const elegivelWhere = {
    ...elegivelBase,
    ...(sedeFiltro === 'nenhuma'
      ? { sedeId: null }
      : sedeFiltro
        ? { sedeId: sedeFiltro }
        : {}),
  }

  const [emitidas, ativos, vencendo, vencidos, aguardando] = await Promise.all([
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
  ])

  const contagens = { emitidas, ativos, vencendo, vencidos, aguardando }

  const statusFiltro: StatusFiltro =
    statusRaw ||
    (aguardando > 0 && emitidas === 0 ? 'aguardando' : 'todos')

  const isAguardando = statusFiltro === 'aguardando'

  const sort = isAguardando
    ? (parseSortParam(params.sort, SOCIOS_AGUARDANDO_SORT, 'aprovadoEm') as SocioAguardandoSort)
    : (parseSortParam(params.sort, SOCIOS_EMITIDOS_SORT, 'numero') as SocioEmitidoSort)
  const dir = parseDirParam(
    params.dir,
    isAguardando
      ? (AGUARDANDO_DEFAULT_DIR[sort as SocioAguardandoSort] ?? 'desc')
      : (EMITIDOS_DEFAULT_DIR[sort as SocioEmitidoSort] ?? 'asc'),
  )

  const sedesOpts: { id: string; nome: string; tipo: string }[] =
    await db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, tipo: true },
    })

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
  let totalLista = 0
  /** Nº do recrutamento por userId — preenchido ao listar emitidas. */
  const numeroAssociadoPorUserId = new Map<string, string | null>()
  const detalhePorUserId = new Map<string, AdminMembroItem>()

  if (isAguardando) {
    const elegivelBuscaWhere = {
      ...elegivelWhere,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' as const } },
              { cidade: { contains: busca, mode: 'insensitive' as const } },
              { telefone: { contains: busca } },
              { discordTag: { contains: busca, mode: 'insensitive' as const } },
              { numeroAssociado: { contains: busca } },
            ],
          }
        : {}),
    }
    const aguardandoOrderBy =
      sort === 'sede'
        ? { sede: { nome: dir } }
        : sort === 'numero'
          ? { numeroAssociado: dir }
          : { [sort]: dir }

    const [rows, total]: [MembroDetalheRow[], number] = await Promise.all([
      db.saasMembro.findMany({
        where: elegivelBuscaWhere,
        select: membroDetalheSelect,
        orderBy: aguardandoOrderBy,
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }) as Promise<MembroDetalheRow[]>,
      db.saasMembro.count({ where: elegivelBuscaWhere }),
    ])
    elegiveisDetalhe = rows
    totalLista = total

    const nomesUnidade = await resolverNomesUnidade(
      rows.map((m: MembroDetalheRow) => m.aprovadoNaUnidadeTenantId),
    )
    for (const m of rows) {
      detalhePorUserId.set(
        m.userId,
        mapToAdminMembroItem(m, {
          aprovadoNaUnidadeNome: m.aprovadoNaUnidadeTenantId
            ? (nomesUnidade.get(m.aprovadoNaUnidadeTenantId) ?? null)
            : null,
        }),
      )
    }
  } else {
    const validadeWhere =
      statusFiltro === 'ativos'
        ? { validade: { gte: now } }
        : statusFiltro === 'vencidos'
          ? { validade: { lt: now } }
          : statusFiltro === 'vencendo'
            ? { validade: { gt: now, lt: em30dias } }
            : {}

    // Alinha carteirinhas legadas (MAX+1) com o nº informado no recrutamento,
    // para a ordenação por numeroSocio refletir o número real do associado.
    const carteirinhas: {
      id: string
      userId: string
      numeroSocio: number
    }[] = await db.saasSocio.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, userId: true, numeroSocio: true },
    })
    if (carteirinhas.length > 0) {
      const membrosNum: { userId: string; numeroAssociado: string | null }[] =
        await db.saasMembro.findMany({
          where: {
            tenantId: tenant.id,
            userId: { in: carteirinhas.map((c) => c.userId) },
          },
          select: { userId: true, numeroAssociado: true },
        })
      const numPorUser = new Map(
        membrosNum.map((m) => [m.userId, m.numeroAssociado?.trim() ?? '']),
      )
      for (const [userId, raw] of numPorUser) {
        numeroAssociadoPorUserId.set(userId, raw || null)
      }
      for (const c of carteirinhas) {
        const raw = numPorUser.get(c.userId) ?? ''
        if (!/^\d+$/.test(raw)) continue
        const n = parseInt(raw, 10)
        if (n === c.numeroSocio) continue
        try {
          await db.saasSocio.update({
            where: { id: c.id },
            data: { numeroSocio: n },
          })
        } catch {
          // Conflito de unicidade: mantém o valor antigo; a UI ainda mostra o nº do cadastro.
        }
      }
    }

    const userIdsComNumeroBusca =
      busca && !Number.isNaN(numeroBusca)
        ? (
            await db.saasMembro.findMany({
              where: {
                tenantId: tenant.id,
                tipo: 'SOCIO',
                OR: [
                  { numeroAssociado: busca },
                  { numeroAssociado: String(numeroBusca) },
                ],
              },
              select: { userId: true },
            })
          ).map((m: { userId: string }) => m.userId)
        : []

    const userIdsPorSede =
      sedeFiltro === 'nenhuma' || sedeFiltro
        ? (
            await db.saasMembro.findMany({
              where: {
                tenantId: tenant.id,
                tipo: 'SOCIO',
                ...(sedeFiltro === 'nenhuma'
                  ? { sedeId: null }
                  : { sedeId: sedeFiltro }),
              },
              select: { userId: true },
            })
          ).map((m: { userId: string }) => m.userId)
        : null

    if (userIdsPorSede && userIdsPorSede.length === 0) {
      socios = []
      totalLista = 0
    } else {
    const socioWhere = {
      tenantId: tenant.id,
      ...validadeWhere,
      ...(userIdsPorSede
        ? { userId: { in: userIdsPorSede } }
        : {}),
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' as const } },
              ...(!Number.isNaN(numeroBusca)
                ? [
                    { numeroSocio: numeroBusca },
                    ...(userIdsComNumeroBusca.length > 0
                      ? [{ userId: { in: userIdsComNumeroBusca } }]
                      : []),
                  ]
                : []),
            ],
          }
        : {}),
    }

    const emitidosOrderBy =
      sort === 'email'
        ? { user: { email: dir } }
        : sort === 'numero'
          ? { numeroSocio: dir }
          : { [sort]: dir }

    const [rows, total]: [SocioRow[], number] = await Promise.all([
      db.saasSocio.findMany({
        where: socioWhere,
        select: {
          id: true,
          userId: true,
          numeroSocio: true,
          nome: true,
          validade: true,
          user: { select: { email: true, avatarUrl: true } },
        },
        orderBy: emitidosOrderBy,
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      db.saasSocio.count({ where: socioWhere }),
    ])
    socios = rows
    totalLista = total

    if (rows.length > 0) {
      const membrosPagina = (await db.saasMembro.findMany({
        where: {
          tenantId: tenant.id,
          userId: { in: rows.map((s: SocioRow) => s.userId) },
          tipo: 'SOCIO',
        },
        select: membroDetalheSelect,
      })) as MembroDetalheRow[]
      const nomesUnidade = await resolverNomesUnidade(
        membrosPagina.map((m: MembroDetalheRow) => m.aprovadoNaUnidadeTenantId),
      )
      for (const m of membrosPagina) {
        numeroAssociadoPorUserId.set(m.userId, m.numeroAssociado?.trim() || null)
        detalhePorUserId.set(
          m.userId,
          mapToAdminMembroItem(m, {
            aprovadoNaUnidadeNome: m.aprovadoNaUnidadeTenantId
              ? (nomesUnidade.get(m.aprovadoNaUnidadeTenantId) ?? null)
              : null,
          }),
        )
      }
    }
    }
  }

  // Opções leves do modal de emissão (cap) — só se pode emitir
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
  const elegiveisModal: OptRow[] = podeEmitir
    ? await db.saasMembro.findMany({
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
      })
    : []

  const totalPaginas = Math.max(1, Math.ceil(totalLista / POR_PAGINA))

  const defaultSort = isAguardando ? 'aprovadoEm' : 'numero'
  const defaultDir = isAguardando ? 'desc' : 'asc'

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged: Record<string, string | undefined> = {
      status: statusFiltro,
      q: busca || undefined,
      sede: sedeFiltro || undefined,
      sort,
      dir,
      pagina: String(pagina),
      ...overrides,
    }
    if (merged.status && merged.status !== 'todos') p.set('status', merged.status)
    if (merged.q) p.set('q', merged.q)
    if (merged.sede) p.set('sede', merged.sede)
    const sortVal = merged.sort || defaultSort
    const dirVal = merged.dir || defaultDir
    if (!(sortVal === defaultSort && dirVal === defaultDir)) {
      p.set('sort', sortVal)
      p.set('dir', dirVal)
    }
    if (merged.pagina && merged.pagina !== '1') p.set('pagina', merged.pagina)
    const qs = p.toString()
    return `/admin/socios${qs ? `?${qs}` : ''}`
  }

  function sortHref(column: string) {
    const defaultForCol = isAguardando
      ? (AGUARDANDO_DEFAULT_DIR[column as SocioAguardandoSort] ?? 'asc')
      : (EMITIDOS_DEFAULT_DIR[column as SocioEmitidoSort] ?? 'asc')
    const nextDir = nextSortDir(column, sort, dir, defaultForCol)
    return buildHref({ sort: column, dir: nextDir, pagina: '1' })
  }

  const sortCols = isAguardando ? SOCIOS_AGUARDANDO_SORT : SOCIOS_EMITIDOS_SORT
  const sortHrefs: Record<string, string> = Object.fromEntries(
    sortCols.map((col) => [col, sortHref(col)]),
  )
  const tabHrefs: Record<string, string> = {
    aguardando: buildHref({ status: 'aguardando', pagina: '1' }),
    todos: buildHref({ status: 'todos', pagina: '1' }),
    ativos: buildHref({ status: 'ativos', pagina: '1' }),
    vencendo: buildHref({ status: 'vencendo', pagina: '1' }),
    vencidos: buildHref({ status: 'vencidos', pagina: '1' }),
  }
  // Params a preservar ao trocar de tab via AdminTabs — mesma regra de
  // omissão de `buildHref` (sort/dir só entram na URL quando divergem do
  // default da aba atual).
  const tabExtraParams: Record<string, string | undefined> = {
    q: busca || undefined,
    sede: sedeFiltro || undefined,
    sort: sort === defaultSort && dir === defaultDir ? undefined : sort,
    dir: sort === defaultSort && dir === defaultDir ? undefined : dir,
  }

  return (
    <div className="flex h-full flex-col">
      <AdminSociosClient
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
        busca={busca}
        sedeFiltro={sedeFiltro}
        sedes={sedesOpts}
        sort={sort}
        dir={dir}
        sortHrefs={sortHrefs}
        tabHrefs={tabHrefs}
        tabExtraParams={tabExtraParams}
        podeEmitir={podeEmitir}
      />

      {totalPaginas > 1 && (
        <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-3">
          <div className="app-container flex items-center justify-between text-sm">
            <p className="text-[rgb(var(--foreground-muted))]">
              Página {pagina} de {totalPaginas}
              {totalLista > 0 ? ` · ${totalLista} resultado${totalLista !== 1 ? 's' : ''}` : ''}
            </p>
            <div className="flex gap-2">
              {pagina > 1 && (
                <Link
                  href={buildHref({ pagina: String(pagina - 1) })}
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  ← Anterior
                </Link>
              )}
              {pagina < totalPaginas && (
                <Link
                  href={buildHref({ pagina: String(pagina + 1) })}
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
