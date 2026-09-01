import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  CalendarRange,
  Drum,
  History,
  Music2,
  Users,
  Wrench,
} from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoBateria } from '@/lib/bateria-direcao'
import {
  listarCandidatosResponsavelPatrimonio,
  listarPatrimonio,
} from '@/lib/patrimonio'
import { AdminEventosList } from '@/app/admin/eventos/admin-eventos-list'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
import { DepartamentoSemanaOps } from '@/components/admin/departamento-semana-ops'
import {
  PatrimonioItensLista,
  type PatrimonioRow,
} from '@/components/patrimonio/patrimonio-itens-lista'
import { PatrimonioAuditoriaTimeline } from '@/components/patrimonio/patrimonio-auditoria-timeline'
import { parseAcervoTab } from '@/lib/acervo-tab'
import { fichaVistoriaDoItem } from '@/lib/patrimonio-vistoria-ficha'
import {
  listarAuditoriaInventario,
  type PatrimonioAuditoriaEntrada,
} from '@/lib/patrimonio-auditoria'
import {
  AdminInboxList,
  AdminPageHeader,
  AdminPendingTabs,
  adminTabIds,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  DirecaoListaSkeleton,
  KpiGrid,
  StatCard,
  type AdminTabItem,
} from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Baterias — Admin' }

async function BateriaKpis({
  tenantId,
  podeVerPatrimonio,
}: {
  tenantId: string
  podeVerPatrimonio: boolean
}) {
  const ops = await carregarDirecaoBateria(tenantId, {
    incluirInstrumentos: podeVerPatrimonio,
  })
  return (
    <KpiGrid cols={4}>
      <StatCard label="Próximos (45d)" value={ops.proximos} icon={<Music2 className="h-5 w-5" />} />
      <StatCard
        label="Confirmados"
        value={ops.confirmadosProximos}
        icon={<Users className="h-5 w-5" />}
      />
      <StatCard
        label="Faltosos (último)"
        value={ops.faltososUltimo}
        tone={ops.faltososUltimo > 0 ? 'warning' : 'default'}
        icon={<AlertTriangle className="h-5 w-5" />}
        href="/admin/bateria?tab=pendencias"
      />
      {podeVerPatrimonio ? (
        <StatCard
          label="Instrumentos em uso"
          value={ops.instrumentosEmUso}
          tone={ops.instrumentosEmUso > 0 ? 'warning' : 'default'}
          icon={<Wrench className="h-5 w-5" />}
          href="/admin/bateria?tab=instrumentos"
        />
      ) : (
        <StatCard
          label="Instrumentos"
          value="—"
          badge="Sem acesso ao patrimônio"
          badgeTone="default"
        />
      )}
    </KpiGrid>
  )
}

const BATERIA_TABS = ['instrumentos', 'ensaios', 'pendencias', 'historico'] as const

async function BateriaTabsEPainel({
  tenantId,
  podeVerPatrimonio,
  podeGerirPatrimonio,
  podeVincular,
  tab,
}: {
  tenantId: string
  podeVerPatrimonio: boolean
  podeGerirPatrimonio: boolean
  podeVincular: boolean
  tab: (typeof BATERIA_TABS)[number]
}) {
  const [ops, instrumentos, candidatos, auditoria] = await Promise.all([
    carregarDirecaoBateria(tenantId, {
      incluirInstrumentos: podeVerPatrimonio,
    }),
    podeVerPatrimonio
      ? listarPatrimonio(tenantId, {
          filtro: { categoria: 'INSTRUMENTO', page: 1 },
          pageSize: 120,
        })
      : Promise.resolve(null),
    podeGerirPatrimonio
      ? listarCandidatosResponsavelPatrimonio(tenantId)
      : Promise.resolve([]),
    podeVerPatrimonio
      ? listarAuditoriaInventario(tenantId, 'INSTRUMENTO')
      : Promise.resolve([] as PatrimonioAuditoriaEntrada[]),
  ])
  const itensInstrumento: PatrimonioRow[] = (instrumentos?.itens ?? []).map((i) => ({
    id: i.id,
    nome: i.nome,
    categoria: i.categoria,
    status: i.status,
    quantidade: i.quantidade,
    localizacao: i.localizacao,
    valorEstimado: i.valorEstimado != null ? Number(i.valorEstimado) : null,
    observacao: i.observacao,
    fotoUrl: i.fotoUrl,
    fotoPreviewUrl: i.fotoPreviewUrl,
    responsavelId: i.responsavel?.id ?? null,
    responsavelNome: i.responsavel?.nome ?? null,
    ...fichaVistoriaDoItem(i.meta),
  }))

  const aba =
    !podeVerPatrimonio && (tab === 'instrumentos' || tab === 'historico') ? 'ensaios' : tab
  const { tabId, panelId } = adminTabIds('tab', aba)
  const iconeTab = 'h-4 w-4 shrink-0'
  const tabs: AdminTabItem[] = [
    ...(podeVerPatrimonio
      ? [
          {
            id: 'instrumentos',
            label: 'Instrumentos',
            icon: <Drum className={iconeTab} />,
            count: itensInstrumento.length,
          },
        ]
      : []),
    {
      id: 'ensaios',
      label: 'Ensaios',
      icon: <Music2 className={iconeTab} />,
      count: ops.lista.length,
    },
    {
      id: 'pendencias',
      label: 'Precisa de você',
      icon: <AlertTriangle className={iconeTab} />,
      count: ops.pendencias.length,
      countClass:
        ops.pendencias.length > 0
          ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400'
          : undefined,
    },
    ...(podeVerPatrimonio
      ? [
          {
            id: 'historico',
            label: 'Histórico',
            icon: <History className={iconeTab} />,
            count: auditoria.length,
          },
        ]
      : []),
  ]

  return (
    <>
      <AdminPendingTabs tabs={tabs} basePath="/admin/bateria" activeId={aba} paramKey="tab" />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-3">
        {aba === 'instrumentos' && podeVerPatrimonio ? (
          <>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Acervo da bateria — a foto diferencia surdos, caixas e repiques parecidos.
            </p>
            <PatrimonioItensLista
              itens={itensInstrumento}
              podeGerir={podeGerirPatrimonio}
              candidatos={candidatos}
              tenantId={tenantId}
              total={itensInstrumento.length}
              page={1}
              pageSize={Math.max(itensInstrumento.length, 1)}
              basePath="/admin/bateria"
              query={{ tab: 'instrumentos' }}
              categoriaTravada="INSTRUMENTO"
              emptyTitle="Nenhum instrumento cadastrado"
              emptyDescription="Cadastre surdos, caixas e outros com foto."
              emptyIcon={<Drum className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
            />
          </>
        ) : null}

        {aba === 'ensaios' ? (
          <div className="space-y-6">
            <BateriaKpis tenantId={tenantId} podeVerPatrimonio={podeVerPatrimonio} />
            <DepartamentoSemanaOps
              itens={ops.semana}
              partidas={ops.partidasSemana}
              semanaHref="/admin/eventos?vista=semana&tipo=ENSAIO"
              podeVincularPartida={podeVincular}
              titulo="Semana da bateria"
            />
            <AdminEventosList
              eventos={ops.lista}
              emptyTitle="Nenhum ensaio futuro"
              emptyDescription="Crie o próximo ensaio para a bateria marcar presença."
              detailBasePath="/admin/bateria"
            />
          </div>
        ) : null}

        {aba === 'pendencias' ? (
          <AdminInboxList
            itens={ops.pendencias}
            podeAgir={false}
            emptyTitle="Nenhuma pendência operativa."
            emptyDescription="Ensaios e instrumentos estão sob controle."
          />
        ) : null}

        {aba === 'historico' && podeVerPatrimonio ? (
          <PatrimonioAuditoriaTimeline
            entradas={auditoria}
            emptyDescription="Baixas e exclusões de instrumentos — quem fez e quando."
          />
        ) : null}
      </div>
    </>
  )
}

async function BateriaActions({
  tenantId,
  podeGerir,
}: {
  tenantId: string
  podeGerir: boolean
}) {
  if (!podeGerir) return null
  const [sedes, partidas, afiliacaoId, projetos] = await Promise.all([
    listSedesAtivasParaEvento(tenantId),
    listPartidasParaEvento(tenantId),
    getAfiliacaoIdDoTenant(tenantId),
    listarProjetosParaEvento(tenantId),
  ])
  return (
    <NovoEventoButton
      defaultTipo="ENSAIO"
      sedes={sedes}
      partidas={partidas}
      projetos={projetos}
      temAfiliacao={Boolean(afiliacaoId)}
      redirectTo="/admin/bateria"
    />
  )
}

export default async function AdminBateriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  let podeVerPatrimonio = false
  let podeGerirPatrimonio = false
  let podeVincular = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    session = authz.session
    tenant = authz.tenant
    const efetivas = authz.permissoesEfetivas ?? []
    podeGerir =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(efetivas, PERMISSIONS.EVENTS_MANAGE) ||
      hasPermission(efetivas, PERMISSIONS.EVENTS_CREATE)
    podeVincular =
      Boolean(authz.isSuperAdmin) || hasPermission(efetivas, PERMISSIONS.EVENTS_MANAGE)
    podeVerPatrimonio =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(efetivas, PERMISSIONS.PATRIMONY_VIEW) ||
      hasPermission(efetivas, PERMISSIONS.PATRIMONY_MANAGE)
    podeGerirPatrimonio =
      Boolean(authz.isSuperAdmin) || hasPermission(efetivas, PERMISSIONS.PATRIMONY_MANAGE)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  const sp = await searchParams
  const tab = parseAcervoTab(sp.tab, BATERIA_TABS, 'instrumentos')

  return (
    <>
      <AdminPageHeader
        title="Baterias"
        description="Semana de ensaios — cruzamento com o jogo e instrumentos."
        icon={<Drum className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/eventos?vista=semana&tipo=ENSAIO"
              className="app-touch-line inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Agenda da semana
            </Link>
            <Suspense fallback={null}>
              <BateriaActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoKpisSkeleton cols={4} />
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <BateriaTabsEPainel
            tenantId={tenant.id}
            podeVerPatrimonio={podeVerPatrimonio}
            podeGerirPatrimonio={podeGerirPatrimonio}
            podeVincular={podeVincular}
            tab={tab}
          />
        </Suspense>
      </div>
    </>
  )
}
