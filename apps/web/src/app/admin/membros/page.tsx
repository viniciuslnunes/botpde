import { Suspense, type ReactNode } from 'react'
import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { Users, UserCheck, UserX, Clock } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { tenantsAreRivais } from '@/lib/hierarquia'
import {
  distribuirMembros,
  resumirFunilMembros,
  serieFunilMensal,
  type DistribuicaoMembros,
  type FunilMembrosResumo,
  type FunilMensalPonto,
} from '@/lib/membros-insights'
import {
  AdminTabs,
  InsightSection,
  StatCard,
  TablePagination,
} from '@/components/admin/ui'
import { DonutChart, MiniBarChart } from '@/components/admin/charts'
import {
  nextSortDir,
  parseDirParam,
  parseSortParam,
  type SortDir,
} from '@/lib/admin-list-sort'
import { mapToAdminMembroItem } from '@/lib/admin-membro-map'
import { AdminMembrosTable } from './admin-membros-client'
import { ExportarLgeButton } from './exportar-lge-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Membros — Admin' }

type StatusFilter = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'TODOS'

const MEMBROS_SORT_COLS = [
  'nome',
  'tipo',
  'departamento',
  'sede',
  'cidade',
  'status',
  'criadoEm',
] as const

type MembroSortCol = (typeof MEMBROS_SORT_COLS)[number]

const MEMBRO_SORT_DEFAULT_DIR: Partial<Record<MembroSortCol, SortDir>> = {
  criadoEm: 'desc',
  nome: 'asc',
  tipo: 'asc',
  departamento: 'asc',
  sede: 'asc',
  cidade: 'asc',
  status: 'asc',
}

async function MembrosInsights({ tenantId }: { tenantId: string }) {
  const [funil, serie, distribuicao]: [
    FunilMembrosResumo,
    FunilMensalPonto[],
    DistribuicaoMembros,
  ] = await Promise.all([
    resumirFunilMembros(tenantId, '30d'),
    serieFunilMensal(tenantId, 12),
    distribuirMembros(tenantId),
  ])

  const semBase = distribuicao.socios + distribuicao.torcedores === 0
  if (semBase && funil.atual.novos === 0 && funil.anterior.novos === 0) return null

  return (
    <InsightSection
      title="Movimento da base"
      description="Últimos 30 dias vs período anterior · funil mensal dos últimos 12 meses."
    >
      <StatCard
        label="Novos cadastros (30d)"
        value={funil.atual.novos}
        delta={{ atual: funil.atual.novos, anterior: funil.anterior.novos }}
      />
      <StatCard
        label="Aprovações (30d)"
        value={funil.atual.aprovados}
        delta={{ atual: funil.atual.aprovados, anterior: funil.anterior.aprovados }}
      />
      <StatCard
        label="Desligamentos (30d)"
        value={funil.atual.desligados}
        tone={funil.atual.desligados > 0 ? 'danger' : 'default'}
        delta={{
          atual: funil.atual.desligados,
          anterior: funil.anterior.desligados,
          invertido: true,
        }}
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Novos × desligados por mês
        </h3>
        <MiniBarChart
          data={serie.map((p) => ({
            rotulo: p.mes,
            valor: p.novos,
            valorSecundario: p.desligados,
          }))}
          legenda={{ principal: 'Novos', secundaria: 'Desligados' }}
        />
      </div>
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Base aprovada por tipo
        </h3>
        <DonutChart
          data={[
            { rotulo: 'Sócios', valor: distribuicao.socios },
            { rotulo: 'Torcedores', valor: distribuicao.torcedores },
          ]}
          centro={String(distribuicao.socios + distribuicao.torcedores)}
        />
      </div>
    </InsightSection>
  )
}

export default async function MembrosPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    q?: string
    pagina?: string
    sede?: string
    tipo?: string
    sort?: string
    dir?: string
  }>
}) {
  // Gate de leitura: dados de cadastro (comprovante, telefone) são RESTRITOS —
  // esconder o link no menu não basta, a URL direta precisa ser bloqueada.
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const statusFiltro = (params.status as StatusFilter) ?? 'TODOS'
  const busca = params.q ?? ''
  const sedeFiltro = params.sede ?? ''
  const tipoFiltro =
    params.tipo === 'SOCIO' || params.tipo === 'TORCEDOR' ? params.tipo : ''
  const sort = parseSortParam(params.sort, MEMBROS_SORT_COLS, 'criadoEm') as MembroSortCol
  const dir = parseDirParam(
    params.dir,
    MEMBRO_SORT_DEFAULT_DIR[sort] ?? 'desc',
  )
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const porPagina = 20

  const where = {
    tenantId: tenant.id,
    ...(statusFiltro !== 'TODOS' ? { status: statusFiltro } : {}),
    ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    ...(sedeFiltro === 'nenhuma'
      ? { sedeId: null }
      : sedeFiltro
        ? { sedeId: sedeFiltro }
        : {}),
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

  const orderBy =
    sort === 'departamento'
      ? { departamento: { nome: dir } }
      : sort === 'sede'
        ? { sede: { nome: dir } }
        : { [sort]: dir }

  const [membros, total, contagens, sedes] = await Promise.all([
    db.saasMembro.findMany({
      where,
      include: {
        user: { select: { nome: true, email: true, avatarUrl: true } },
        departamento: { select: { id: true, nome: true } },
        sede: { select: { id: true, nome: true, tipo: true } },
      },
      orderBy,
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    db.saasMembro.count({ where }),
    db.saasMembro.groupBy({
      by: ['status'],
      where: { tenantId: tenant.id },
      _count: true,
    }),
    db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, tipo: true },
    }),
  ])

  type SedeOpt = { id: string; nome: string; tipo: string }
  const sedesOpts: SedeOpt[] = sedes

  const totalPaginas = Math.ceil(total / porPagina)

  // Alerta informativo: sócio (desta página) já aprovado como sócio em torcida
  // rival. Select mínimo — nunca trazer nome/prova de outro tenant; o client
  // recebe só um booleano, sem identificar a torcida rival.
  const userIdsSocios = membros
    .filter((m: (typeof membros)[number]) => m.tipo === 'SOCIO')
    .map((m: (typeof membros)[number]) => m.userId)
  const membroIds = membros.map((m: (typeof membros)[number]) => m.id)
  type LogMembro = {
    entidadeId: string | null
    acao: string
    detalhes: unknown
    criadoEm: Date
  }

  // As três leituras secundárias são independentes → um round-trip só.
  // - rival: sócio já aprovado como sócio em torcida rival (booleano p/ o client);
  // - reprovações: contagem de reprovações em recrutamento de outra torcida;
  // - logs: tentativas + motivo da última reprovação (AuditLog, sem mudar schema).
  const [sociosOutrosTenants, reprovacoesOutrosTenants, logsMembros]: [
    { userId: string; tenantId: string }[],
    { userId: string }[],
    LogMembro[],
  ] = await Promise.all([
    userIdsSocios.length > 0
      ? db.saasMembro.findMany({
          where: {
            userId: { in: userIdsSocios },
            status: 'APROVADO',
            tipo: 'SOCIO',
            tenantId: { not: tenant.id },
          },
          select: { userId: true, tenantId: true },
        })
      : Promise.resolve([]),
    userIdsSocios.length > 0
      ? db.saasMembro.findMany({
          where: {
            userId: { in: userIdsSocios },
            status: 'REPROVADO',
            tipo: 'SOCIO',
            tenantId: { not: tenant.id },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
    membroIds.length > 0
      ? db.auditLog.findMany({
          where: {
            tenantId: tenant.id,
            entidade: 'SaasMembro',
            entidadeId: { in: membroIds },
            acao: { in: ['CADASTRO_SOLICITADO', 'RECADASTRO_SOLICITADO', 'MEMBRO_REPROVADO'] },
          },
          orderBy: { criadoEm: 'desc' },
          select: { entidadeId: true, acao: true, detalhes: true, criadoEm: true },
        })
      : Promise.resolve([]),
  ])

  // Rival: resolve a rivalidade dos tenants distintos encontrados.
  let userIdsComRivalSocio = new Set<string>()
  if (sociosOutrosTenants.length > 0) {
    const outrosTenantIds = [...new Set(sociosOutrosTenants.map((s) => s.tenantId))]
    const checagens = await Promise.all(
      outrosTenantIds.map(
        async (id) => [id, await tenantsAreRivais(tenant.id, id)] as const,
      ),
    )
    const tenantsRivais = new Set(checagens.filter(([, rival]) => rival).map(([id]) => id))
    userIdsComRivalSocio = new Set(
      sociosOutrosTenants.filter((s) => tenantsRivais.has(s.tenantId)).map((s) => s.userId),
    )
  }

  const reprovacoesOutraTorcidaPorUser = new Map<string, number>()
  for (const r of reprovacoesOutrosTenants) {
    reprovacoesOutraTorcidaPorUser.set(
      r.userId,
      (reprovacoesOutraTorcidaPorUser.get(r.userId) ?? 0) + 1,
    )
  }
  const tentativasPorMembro = new Map<string, number>()
  const motivoReprovacaoPorMembro = new Map<string, string>()
  for (const log of logsMembros) {
    if (!log.entidadeId) continue
    if (log.acao === 'CADASTRO_SOLICITADO' || log.acao === 'RECADASTRO_SOLICITADO') {
      tentativasPorMembro.set(log.entidadeId, (tentativasPorMembro.get(log.entidadeId) ?? 0) + 1)
    }
    // Logs em ordem decrescente — o primeiro MEMBRO_REPROVADO é o mais recente.
    if (log.acao === 'MEMBRO_REPROVADO' && !motivoReprovacaoPorMembro.has(log.entidadeId)) {
      const detalhes = log.detalhes
      if (
        detalhes &&
        typeof detalhes === 'object' &&
        'motivo' in detalhes &&
        typeof (detalhes as { motivo: unknown }).motivo === 'string'
      ) {
        motivoReprovacaoPorMembro.set(log.entidadeId, (detalhes as { motivo: string }).motivo)
      }
    }
  }

  const unidadeOrigemIds = [
    ...new Set(
      membros
        .map((m: (typeof membros)[number]) => m.aprovadoNaUnidadeTenantId)
        .filter((id: string | null): id is string => !!id),
    ),
  ]
  const unidadesOrigem: { id: string; nome: string }[] =
    unidadeOrigemIds.length > 0
      ? await db.tenant.findMany({
          where: { id: { in: unidadeOrigemIds } },
          select: { id: true, nome: true },
        })
      : []
  const nomeUnidadePorId = new Map(unidadesOrigem.map((u) => [u.id, u.nome]))

  const count: Record<string, number> = { PENDENTE: 0, APROVADO: 0, REPROVADO: 0 }
  for (const c of contagens) count[c.status] = c._count

  const tabIconClass = 'h-4 w-4 shrink-0'
  const tabs: {
    status: StatusFilter
    label: string
    icon: ReactNode
    count?: number
  }[] = [
    {
      status: 'TODOS',
      label: 'Todos',
      icon: <Users className={tabIconClass} aria-hidden />,
      count: Object.values(count).reduce((a, b) => a + b, 0),
    },
    {
      status: 'PENDENTE',
      label: 'Pendentes',
      icon: <Clock className={tabIconClass} aria-hidden />,
      count: count.PENDENTE,
    },
    {
      status: 'APROVADO',
      label: 'Aprovados',
      icon: <UserCheck className={tabIconClass} aria-hidden />,
      count: count.APROVADO,
    },
    {
      status: 'REPROVADO',
      label: 'Reprovados',
      icon: <UserX className={tabIconClass} aria-hidden />,
      count: count.REPROVADO,
    },
  ]

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged: Record<string, string | undefined> = {
      status: statusFiltro,
      q: busca || undefined,
      sede: sedeFiltro || undefined,
      tipo: tipoFiltro || undefined,
      sort,
      dir,
      pagina: String(pagina),
      ...overrides,
    }
    if (merged.status && merged.status !== 'TODOS') p.set('status', merged.status)
    if (merged.q) p.set('q', merged.q)
    if (merged.sede) p.set('sede', merged.sede)
    if (merged.tipo) p.set('tipo', merged.tipo)
    const sortVal = merged.sort || 'criadoEm'
    const dirVal = merged.dir || 'desc'
    if (!(sortVal === 'criadoEm' && dirVal === 'desc')) {
      p.set('sort', sortVal)
      p.set('dir', dirVal)
    }
    if (merged.pagina && merged.pagina !== '1') p.set('pagina', merged.pagina)
    const qs = p.toString()
    return `/admin/membros${qs ? `?${qs}` : ''}`
  }

  function sortHref(column: string) {
    const col = column as MembroSortCol
    const defaultDir = MEMBRO_SORT_DEFAULT_DIR[col] ?? 'asc'
    const nextDir = nextSortDir(col, sort, dir, defaultDir)
    return buildHref({ sort: col, dir: nextDir, pagina: '1' })
  }

  const sortHrefs: Record<string, string> = Object.fromEntries(
    MEMBROS_SORT_COLS.map((col) => [col, sortHref(col)]),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Membros</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {total} {total === 1 ? 'resultado' : 'resultados'}
              </p>
            </div>
            <div className="shrink-0">
              <ExportarLgeButton />
            </div>
          </div>

        <AdminTabs
          tabs={tabs.map((tab) => ({
            id: tab.status,
            label: tab.label,
            icon: tab.icon,
            count: tab.count,
            countClass:
              tab.status === 'PENDENTE'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : undefined,
          }))}
          basePath="/admin/membros"
          activeId={statusFiltro}
          paramKey="status"
          extraParams={{
            q: busca || undefined,
            sede: sedeFiltro || undefined,
            tipo: tipoFiltro || undefined,
            sort: sort !== 'criadoEm' ? sort : undefined,
            dir: sort !== 'criadoEm' || dir !== 'desc' ? dir : undefined,
          }}
        />

        {/* Busca + filtros */}
        <form method="GET" action="/admin/membros" className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {statusFiltro !== 'TODOS' && (
            <input type="hidden" name="status" value={statusFiltro} />
          )}
          {sort !== 'criadoEm' && <input type="hidden" name="sort" value={sort} />}
          {(sort !== 'criadoEm' || dir !== 'desc') && (
            <input type="hidden" name="dir" value={dir} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, nº, cidade, telefone ou Discord…"
            className="w-full flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)] sm:min-w-[14rem]"
          />
          <select
            name="tipo"
            defaultValue={tipoFiltro}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] sm:w-40"
          >
            <option value="">Todos os tipos</option>
            <option value="SOCIO">Sócios</option>
            <option value="TORCEDOR">Torcedores</option>
          </select>
          <select
            name="sede"
            defaultValue={sedeFiltro}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] sm:w-56"
          >
            <option value="">Todas as unidades</option>
            <option value="nenhuma">Sem unidade</option>
            {sedesOpts.map((s: SedeOpt) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Filtrar
          </button>
        </form>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto py-4">
        <div className="app-container">
        <AdminMembrosTable
          sort={sort}
          dir={dir}
          sortHrefs={sortHrefs}
          membros={membros.map((membro: (typeof membros)[number]) =>
            mapToAdminMembroItem(
              {
                id: membro.id,
                userId: membro.userId,
                nome: membro.nome,
                tipo: membro.tipo,
                status: membro.status,
                cidade: membro.cidade,
                telefone: membro.telefone,
                idade: membro.idade,
                discordTag: membro.discordTag,
                discordId: membro.discordId,
                numeroAssociado: membro.numeroAssociado,
                anosSocio: membro.anosSocio,
                imagemProva: membro.imagemProva,
                cep: membro.cep,
                numero: membro.numero,
                bloco: membro.bloco,
                complemento: membro.complemento,
                dataNascimento: membro.dataNascimento,
                sexo: membro.sexo,
                estadoCivil: membro.estadoCivil,
                nacionalidade: membro.nacionalidade,
                rg: membro.rg,
                cpf: membro.cpf,
                filiacao: membro.filiacao,
                escolaridade: membro.escolaridade,
                profissao: membro.profissao,
                logradouro: membro.logradouro,
                bairro: membro.bairro,
                uf: membro.uf,
                fotoDocumentoUrl: membro.fotoDocumentoUrl,
                comprovanteResidenciaUrl: membro.comprovanteResidenciaUrl,
                responsavelNome: membro.responsavelNome,
                responsavelDocumento: membro.responsavelDocumento,
                autorizacaoMenorAceitaEm: membro.autorizacaoMenorAceitaEm,
                termoResponsabilidadeAceitoEm: membro.termoResponsabilidadeAceitoEm,
                adimplente: membro.adimplente,
                aprovadoPorNome: membro.aprovadoPorNome,
                aprovadoEm: membro.aprovadoEm,
                desligadoEm: membro.desligadoEm,
                desligadoMotivo: membro.desligadoMotivo,
                criadoEm: membro.criadoEm,
                atualizadoEm: membro.atualizadoEm,
                espelhado: membro.espelhado,
                aprovadoNaUnidadeTenantId: membro.aprovadoNaUnidadeTenantId,
                user: {
                  email: membro.user.email,
                  avatarUrl: membro.user.avatarUrl,
                },
                departamento: membro.departamento
                  ? { nome: membro.departamento.nome }
                  : null,
                sede: membro.sede ? { nome: membro.sede.nome } : null,
              },
              {
                aprovadoNaUnidadeNome: membro.aprovadoNaUnidadeTenantId
                  ? (nomeUnidadePorId.get(membro.aprovadoNaUnidadeTenantId) ?? null)
                  : null,
                alertaRivalSocio:
                  membro.tipo === 'SOCIO' && userIdsComRivalSocio.has(membro.userId),
                reprovacoesOutraTorcida:
                  membro.tipo === 'SOCIO'
                    ? reprovacoesOutraTorcidaPorUser.get(membro.userId)
                    : undefined,
                tentativas: tentativasPorMembro.get(membro.id) ?? 1,
                ultimoMotivoReprovacao: motivoReprovacaoPorMembro.get(membro.id),
              },
            ),
          )}
        />

        <TablePagination
          page={pagina}
          totalPages={totalPaginas}
          buildHref={(p) => buildHref({ pagina: String(p) })}
        />

        <div className="mt-8">
          <Suspense
            fallback={
              <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
                ))}
              </div>
            }
          >
            <MembrosInsights tenantId={tenant.id} />
          </Suspense>
        </div>
        </div>
      </div>
    </div>
  )
}
