import { Suspense, type ReactNode } from 'react'
import { db, type Prisma } from '@torcida/db'
import { redirect } from 'next/navigation'
import { Users, UserCheck, UserX, Clock } from 'lucide-react'
import {
  PERMISSIONS,
  formatNomeTorcida,
  labelCategoriaReprovacao,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { tenantsAreRivais } from '@/lib/hierarquia'
import {
  distribuirMembros,
  resumirFilaPendentes,
  resumirFunilMembros,
  resumirReprovacoes,
  serieAprovadosMensal,
  serieEntradasFilaMensal,
  serieFunilMensal,
  serieReprovadosMensal,
  type DistribuicaoMembros,
  type FilaPendentesResumo,
  type FunilMembrosResumo,
  type FunilMensalPonto,
  type ReprovacoesResumo,
  type SerieAprovadosPonto,
  type SerieReprovadosPonto,
  type StatusMembrosInsight,
} from '@/lib/membros-insights'
import {
  AdminChartPeriodFilter,
  AdminExpansionPanel,
  AdminTabs,
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  StatCard,
  type AdminChartPeriod,
} from '@/components/admin/ui'
import { DonutChart, MiniBarChart } from '@/components/admin/charts'
import {
  resolverIntervaloCustomizado,
  resolverIntervaloMeses,
  type IntervaloAnalise,
} from '@/lib/admin-insights'
import {
  construirHrefListagem,
  parseListagemParams,
  serializarListagemParams,
  type ListagemFacetas,
} from '@/lib/listagem'
import { LISTAGEM_MEMBROS } from '@/lib/listagem/specs'
import {
  carregarFacetas,
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import type { OpcoesDinamicas } from '@/lib/listagem/ui'
import { mapToAdminMembroItem } from '@/lib/admin-membro-map'
import { getAreasEfetivadasPorUser } from '@/lib/get-areas-efetivadas'
import { AdminMembrosTable } from './admin-membros-client'
import { ExportarLgeButton } from './exportar-lge-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Membros — Admin' }

type StatusFilter = StatusMembrosInsight

const SPEC = LISTAGEM_MEMBROS

/** Classes de visibilidade responsiva por coluna — a tabela esconde as laterais. */
const COLUNA_CLASSE: Record<string, string> = {
  nome: 'px-3 sm:px-4',
  tipo: 'hidden sm:table-cell',
  departamento: 'hidden md:table-cell',
  sede: 'hidden lg:table-cell',
  cidade: 'hidden xl:table-cell',
  status: 'hidden sm:table-cell',
  criadoEm: 'hidden 2xl:table-cell',
}

/**
 * Complemento de `COLUNA_CLASSE`: cada filtro reaparece na barra exatamente nos
 * breakpoints em que a coluna dele não está na tabela.
 */
const FILTROS_COMPACTOS = [
  { filtroId: 'tipo', classe: 'sm:hidden' },
  { filtroId: 'departamento', classe: 'md:hidden' },
  { filtroId: 'sede', classe: 'lg:hidden' },
  { filtroId: 'cidade', classe: 'xl:hidden' },
  { filtroId: 'criadoEm', classe: '2xl:hidden' },
] as const

const CATEGORIA_CURTA: Record<string, string> = {
  DADOS_INCORRETOS: 'Dados',
  DOCUMENTACAO: 'Docs',
  VINCULO_NAO_COMPROVADO: 'Vínculo',
  DUPLICIDADE: 'Duplicidade',
  RESTRICAO: 'Restrição',
  FORA_DE_PERFIL: 'Perfil',
  OUTRO: 'Outro',
}

function parseStatusFiltro(valor: string | undefined): StatusFilter {
  switch (valor) {
    case 'PENDENTE':
    case 'APROVADO':
    case 'REPROVADO':
      return valor
    default:
      return 'TODOS'
  }
}

function parsePeriodoGrafico(valor: string | undefined): AdminChartPeriod {
  switch (valor) {
    case '6m':
    case '9m':
    case 'custom':
      return valor
    default:
      return '3m'
  }
}

const dataIsoSp = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatarDataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function descricaoInsights(status: StatusFilter, periodoLabel: string): string {
  switch (status) {
    case 'PENDENTE':
      return `Fila atual · aging do tempo de espera · entradas em ${periodoLabel}.`
    case 'APROVADO':
      return `Base aprovada · aprovações e desligamentos em ${periodoLabel} vs período anterior.`
    case 'REPROVADO':
      return `Reprovações em ${periodoLabel} vs período anterior · reenvio × definitivo · motivos.`
    default:
      return `${periodoLabel} vs período anterior · evolução mensal da base.`
  }
}

type InsightsPeriodoProps = {
  tenantId: string
  intervalo: IntervaloAnalise
  periodControl: ChartPeriodControlProps
}

type ChartPeriodControlProps = {
  periodo: AdminChartPeriod
  customStart: string
  customEnd: string
  maxDate: string
  periodExtraParams: Record<string, string | undefined>
}

function ChartHeader({
  title,
  periodControl,
}: {
  title: string
  periodControl: ChartPeriodControlProps
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {title}
      </h3>
      <AdminChartPeriodFilter
        basePath="/admin/membros"
        activePeriod={periodControl.periodo}
        customStart={periodControl.customStart}
        customEnd={periodControl.customEnd}
        maxDate={periodControl.maxDate}
        extraParams={periodControl.periodExtraParams}
      />
    </div>
  )
}

async function InsightsTodos({ tenantId, intervalo, periodControl }: InsightsPeriodoProps) {
  const [funil, serie, distribuicao]: [
    FunilMembrosResumo,
    FunilMensalPonto[],
    DistribuicaoMembros,
  ] = await Promise.all([
    resumirFunilMembros(tenantId, intervalo),
    serieFunilMensal(tenantId, intervalo),
    distribuirMembros(tenantId, 'APROVADO'),
  ])

  return (
    <>
      <StatCard
        label="Novos cadastros no período"
        value={funil.atual.novos}
        delta={{ atual: funil.atual.novos, anterior: funil.anterior.novos }}
      />
      <StatCard
        label="Aprovações no período"
        value={funil.atual.aprovados}
        delta={{ atual: funil.atual.aprovados, anterior: funil.anterior.aprovados }}
      />
      <StatCard
        label="Desligamentos no período"
        value={funil.atual.desligados}
        tone={funil.atual.desligados > 0 ? 'danger' : 'default'}
        delta={{
          atual: funil.atual.desligados,
          anterior: funil.anterior.desligados,
          invertido: true,
        }}
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <ChartHeader title="Novos × desligados por mês" periodControl={periodControl} />
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
    </>
  )
}

async function InsightsPendentes({ tenantId, intervalo, periodControl }: InsightsPeriodoProps) {
  const [fila, serie]: [FilaPendentesResumo, FunilMensalPonto[]] = await Promise.all([
    resumirFilaPendentes(tenantId, intervalo),
    serieEntradasFilaMensal(tenantId, intervalo),
  ])

  return (
    <>
      <StatCard label="Na fila agora" value={fila.estoque} tone="warning" />
      <StatCard
        label="Entraram na fila no período"
        value={fila.novos.atual}
        delta={{ atual: fila.novos.atual, anterior: fila.novos.anterior }}
      />
      <StatCard
        label="Aguardando 15+ dias"
        value={fila.aging.find((b) => b.faixa === '15+ dias')?.quantidade ?? 0}
        tone={
          (fila.aging.find((b) => b.faixa === '15+ dias')?.quantidade ?? 0) > 0
            ? 'danger'
            : 'default'
        }
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Aging da fila
        </h3>
        <MiniBarChart
          data={fila.aging.map((b) => ({
            rotulo: b.faixa,
            valor: b.quantidade,
            cor: 'rgb(var(--color-warning) / 0.75)',
          }))}
        />
      </div>
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Fila por tipo
        </h3>
        <DonutChart
          data={[
            { rotulo: 'Sócios', valor: fila.porTipo.socios },
            { rotulo: 'Torcedores', valor: fila.porTipo.torcedores },
          ]}
          centro={String(fila.porTipo.socios + fila.porTipo.torcedores)}
        />
      </div>
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5 lg:col-span-3">
        <ChartHeader title="Entradas na fila por mês" periodControl={periodControl} />
        <MiniBarChart
          data={serie.map((p) => ({
            rotulo: p.mes,
            valor: p.novos,
            cor: 'rgb(var(--color-warning) / 0.75)',
          }))}
        />
      </div>
    </>
  )
}

async function InsightsAprovados({ tenantId, intervalo, periodControl }: InsightsPeriodoProps) {
  const [funil, serie, distribuicao]: [
    FunilMembrosResumo,
    SerieAprovadosPonto[],
    DistribuicaoMembros,
  ] = await Promise.all([
    resumirFunilMembros(tenantId, intervalo),
    serieAprovadosMensal(tenantId, intervalo),
    distribuirMembros(tenantId, 'APROVADO'),
  ])

  const base = distribuicao.socios + distribuicao.torcedores

  return (
    <>
      <StatCard label="Base aprovada" value={base} />
      <StatCard
        label="Aprovações no período"
        value={funil.atual.aprovados}
        tone="success"
        delta={{ atual: funil.atual.aprovados, anterior: funil.anterior.aprovados }}
      />
      <StatCard
        label="Desligamentos no período"
        value={funil.atual.desligados}
        tone={funil.atual.desligados > 0 ? 'danger' : 'default'}
        delta={{
          atual: funil.atual.desligados,
          anterior: funil.anterior.desligados,
          invertido: true,
        }}
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <ChartHeader title="Aprovações × desligamentos por mês" periodControl={periodControl} />
        <MiniBarChart
          data={serie.map((p) => ({
            rotulo: p.mes,
            valor: p.aprovados,
            valorSecundario: p.desligados,
          }))}
          legenda={{ principal: 'Aprovações', secundaria: 'Desligados' }}
        />
      </div>
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Base por tipo
        </h3>
        <DonutChart
          data={[
            { rotulo: 'Sócios', valor: distribuicao.socios },
            { rotulo: 'Torcedores', valor: distribuicao.torcedores },
          ]}
          centro={String(base)}
        />
      </div>
    </>
  )
}

async function InsightsReprovados({ tenantId, intervalo, periodControl }: InsightsPeriodoProps) {
  const [resumo, serie]: [ReprovacoesResumo, SerieReprovadosPonto[]] = await Promise.all([
    resumirReprovacoes(tenantId, intervalo),
    serieReprovadosMensal(tenantId, intervalo),
  ])

  return (
    <>
      <StatCard label="Reprovados na fila" value={resumo.estoque} tone="danger" />
      <StatCard
        label="Reprovações no período"
        value={resumo.reprovados.atual}
        tone={resumo.reprovados.atual > 0 ? 'warning' : 'default'}
        delta={{
          atual: resumo.reprovados.atual,
          anterior: resumo.reprovados.anterior,
          invertido: true,
        }}
      />
      <StatCard
        label="Podem reenviar"
        value={resumo.permiteReenvio}
        badge={
          resumo.definitivos > 0 ? `${resumo.definitivos} definitivos` : undefined
        }
        badgeTone="danger"
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <ChartHeader title="Reprovações por mês" periodControl={periodControl} />
        <MiniBarChart
          data={serie.map((p) => ({
            rotulo: p.mes,
            valor: p.reprovados,
            cor: 'rgb(var(--color-danger) / 0.7)',
          }))}
        />
      </div>
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Motivos
        </h3>
        <DonutChart
          data={
            resumo.porCategoria.length > 0
              ? resumo.porCategoria.map((c) => ({
                  rotulo: CATEGORIA_CURTA[c.id] ?? labelCategoriaReprovacao(c.id) ?? c.id,
                  valor: c.quantidade,
                }))
              : [{ rotulo: 'Sem dados', valor: 0 }]
          }
          centro={String(resumo.estoque)}
        />
      </div>
    </>
  )
}

async function MembrosInsights({
  tenantId,
  status,
  intervalo,
  periodo,
  periodoLabel,
  customStart,
  customEnd,
  maxDate,
  periodExtraParams,
}: {
  tenantId: string
  status: StatusFilter
  intervalo: IntervaloAnalise
  periodo: AdminChartPeriod
  periodoLabel: string
  customStart: string
  customEnd: string
  maxDate: string
  periodExtraParams: Record<string, string | undefined>
}) {
  const periodControl: ChartPeriodControlProps = {
    periodo,
    customStart,
    customEnd,
    maxDate,
    periodExtraParams,
  }
  let body: ReactNode
  switch (status) {
    case 'PENDENTE':
      body = (
        <InsightsPendentes
          tenantId={tenantId}
          intervalo={intervalo}
          periodControl={periodControl}
        />
      )
      break
    case 'APROVADO':
      body = (
        <InsightsAprovados
          tenantId={tenantId}
          intervalo={intervalo}
          periodControl={periodControl}
        />
      )
      break
    case 'REPROVADO':
      body = (
        <InsightsReprovados
          tenantId={tenantId}
          intervalo={intervalo}
          periodControl={periodControl}
        />
      )
      break
    default:
      body = (
        <InsightsTodos tenantId={tenantId} intervalo={intervalo} periodControl={periodControl} />
      )
  }

  return (
    <AdminExpansionPanel
      title="Movimento da base"
      description={descricaoInsights(status, periodoLabel)}
      defaultOpen
    >
      {body}
    </AdminExpansionPanel>
  )
}

export default async function MembrosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
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
  const texto = (chave: string): string | undefined => {
    const valor = params[chave]
    return typeof valor === 'string' ? valor : undefined
  }

  const listagem = parseListagemParams(params, SPEC)
  const statusFiltro = parseStatusFiltro(listagem.filtros.status?.[0])
  const periodoGrafico = parsePeriodoGrafico(texto('periodoGrafico'))
  const hoje = new Date()
  const maxDate = dataIsoSp.format(hoje)
  const inicioPadrao = resolverIntervaloMeses(3).inicio
  const customStartPadrao = dataIsoSp.format(inicioPadrao)
  const customIntervaloInformado =
    periodoGrafico === 'custom'
      ? resolverIntervaloCustomizado(texto('de'), texto('ate'))
      : null
  const customStart = customIntervaloInformado ? texto('de')! : customStartPadrao
  const customEnd = customIntervaloInformado ? texto('ate')! : maxDate
  const intervalo =
    periodoGrafico === 'custom'
      ? (customIntervaloInformado ??
        resolverIntervaloCustomizado(customStartPadrao, maxDate)!)
      : resolverIntervaloMeses(periodoGrafico === '9m' ? 9 : periodoGrafico === '6m' ? 6 : 3)
  const periodoLabel =
    periodoGrafico === 'custom'
      ? `de ${formatarDataCurta(customStart)} a ${formatarDataCurta(customEnd)}`
      : `últimos ${periodoGrafico === '9m' ? 9 : periodoGrafico === '6m' ? 6 : 3} meses`
  // Params que não pertencem ao contrato da listagem (período dos gráficos):
  // viajam como `extras` para que trocar filtro não zere o recorte do insight.
  const extrasDaRota: Record<string, string | undefined> = {
    periodoGrafico: periodoGrafico === '3m' ? undefined : periodoGrafico,
    de: periodoGrafico === 'custom' ? customStart : undefined,
    ate: periodoGrafico === 'custom' ? customEnd : undefined,
  }

  const where: Prisma.SaasMembroWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { tenantId: tenant.id },
  })

  const [membros, total, contagens, sedes, departamentosOpts] = await Promise.all([
    db.saasMembro.findMany({
      where,
      include: {
        user: { select: { nome: true, email: true, avatarUrl: true } },
        departamento: { select: { id: true, nome: true } },
        departamentoSede: { select: { nome: true } },
        sede: { select: { id: true, nome: true, tipo: true } },
      },
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
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
    db.departamento.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    }),
  ])

  type SedeOpt = { id: string; nome: string; tipo: string }
  const sedesOpts: SedeOpt[] = sedes
  const paginacao = resumirPaginacao(total, listagem)

  // Rótulos dos ids nos popovers e nos chips (a faceta só devolve o id).
  const dinamicas: OpcoesDinamicas = {
    sede: [
      { valor: 'nenhuma', label: 'Sem unidade' },
      ...sedesOpts.map((s) => ({ valor: s.id, label: s.nome })),
    ],
    departamento: [
      { valor: 'sem', label: 'Sem área' },
      ...departamentosOpts.map((d: { id: string; nome: string }) => ({
        valor: d.id,
        label: d.nome,
      })),
    ],
  }

  // Contagem por opção: cada faceta ignora o próprio filtro, então o número ao
  // lado de "Sócio" mostra quantos apareceriam se a opção fosse marcada.
  const facetas: ListagemFacetas = await carregarFacetas(
    SPEC,
    listagem,
    { escopo: { tenantId: tenant.id } },
    async (campo, whereFaceta) => {
      const linhas = await db.saasMembro.groupBy({
        by: [campo as 'tipo'],
        where: whereFaceta as Prisma.SaasMembroWhereInput,
        _count: { _all: true },
      })
      return linhas.map((linha: Record<string, unknown> & { _count: { _all: number } }) => ({
        valor: (linha[campo] as string | null) ?? null,
        count: linha._count._all,
      }))
    },
    {
      sede: Object.fromEntries(dinamicas.sede!.map((o) => [o.valor, o.label])),
      departamento: Object.fromEntries(
        dinamicas.departamento!.map((o) => [o.valor, o.label]),
      ),
    },
  )

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

  // Área pretendida × área em vigor: com a fila first-wins da torcida, o nível
  // que não decidiu fica com a área pendente até efetivar aqui.
  const areasEfetivadasPorUser = await getAreasEfetivadasPorUser(
    tenant.id,
    membros.map((m: (typeof membros)[number]) => m.userId),
  )

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
  const nomeUnidadePorId = new Map(
    unidadesOrigem.map((u) => [u.id, formatNomeTorcida(u.nome)]),
  )

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

  // Trocar de aba de status volta para a primeira página: manter o offset
  // mostraria uma fatia arbitrária de um resultado diferente.
  const tabHrefs: Record<string, string> = Object.fromEntries(
    tabs.map((tab) => [
      tab.status,
      construirHrefListagem(SPEC, listagem, {
        pagina: 1,
        filtros: { status: tab.status === 'TODOS' ? null : [tab.status] },
        extras: extrasDaRota,
      }),
    ]),
  )

  // O filtro de período dos gráficos precisa carregar o estado da listagem
  // inteiro, senão mudar o recorte do insight apagaria busca e filtros.
  const periodExtraParams: Record<string, string | undefined> = Object.fromEntries(
    serializarListagemParams(SPEC, listagem).entries(),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Membros</h1>
              <p className="text-sm tabular-nums text-[rgb(var(--foreground-muted))]">
                {paginacao.total === 0
                  ? 'Nenhum resultado'
                  : `${paginacao.faixa.de}–${paginacao.faixa.ate} de ${paginacao.total}`}
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
            href: tabHrefs[tab.status],
            countClass:
              tab.status === 'PENDENTE'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : undefined,
          }))}
          activeId={statusFiltro}
          paramKey="status"
        />

        <div className="mt-3">
          <ListagemToolbar
            spec={SPEC}
            params={listagem}
            paginacao={paginacao}
            facetas={facetas}
            dinamicas={dinamicas}
            extras={extrasDaRota}
            escopoChave={tenant.id}
            filtrosCompactos={FILTROS_COMPACTOS}
          />
        </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto py-4">
        <div className="app-container">
        <div className="mb-8">
          <Suspense
            key={`${statusFiltro}-${periodoGrafico}-${customStart}-${customEnd}`}
            fallback={
              <div className="animate-pulse space-y-3">
                <div className="h-10 w-full max-w-md rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
                  ))}
                </div>
              </div>
            }
          >
            <MembrosInsights
              tenantId={tenant.id}
              status={statusFiltro}
              intervalo={intervalo}
              periodo={periodoGrafico}
              periodoLabel={periodoLabel}
              customStart={customStart}
              customEnd={customEnd}
              maxDate={maxDate}
              periodExtraParams={periodExtraParams}
            />
          </Suspense>
        </div>

        <AdminMembrosTable
          cabecalho={SPEC.colunas.map((coluna) => (
            <ListagemTh
              key={coluna.id}
              spec={SPEC}
              params={listagem}
              coluna={coluna}
              facetas={facetas}
              dinamicas={dinamicas}
              extras={extrasDaRota}
              className={COLUNA_CLASSE[coluna.id] ?? ''}
            />
          ))}
          spec={SPEC}
          params={listagem}
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
                reprovadoEm: membro.reprovadoEm,
                reprovadoPorNome: membro.reprovadoPorNome,
                reprovadoCategoria: membro.reprovadoCategoria,
                reprovadoMotivo: membro.reprovadoMotivo,
                reprovadoPontos: membro.reprovadoPontos,
                reprovadoPermiteReenvio: membro.reprovadoPermiteReenvio,
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
                  ? { id: membro.departamento.id, nome: membro.departamento.nome }
                  : null,
                departamentoSede: membro.departamentoSede
                  ? { nome: membro.departamentoSede.nome }
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
                areasEfetivadas: areasEfetivadasPorUser.get(membro.userId) ?? new Set<string>(),
              },
            ),
          )}
        />

        <ListagemPaginacao
          spec={SPEC}
          params={listagem}
          paginacao={paginacao}
          extras={extrasDaRota}
        />
        </div>
      </div>
    </div>
  )
}
