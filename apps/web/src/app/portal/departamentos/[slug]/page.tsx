import { Suspense, type ReactNode } from 'react'
import { db } from '@torcida/db'
import {
  hasPermission,
  hrefHomeDepartamento,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  lerFluxoPrefs,
  missionDepartamento,
  PERMISSIONS,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
  subareasDepartamento,
} from '@torcida/types'
import { DepartamentoEquipe } from '../_components/departamento-equipe'
import { DepartamentoFilaMembros } from '../_components/departamento-fila-membros'
import { DepartamentoFilaArea } from '../_components/departamento-fila-area'
import { DepartamentoProximaAcao } from '../_components/departamento-proxima-acao'
import { DepartamentoFluxoPrefs } from '../_components/departamento-fluxo-prefs'
import { resolverFluxosDepartamento } from '../_components/departamento-proxima-acao-data'
import { DepartamentoAreasBlock } from './_components/departamento-areas-block'
import { DepartamentoProjetosBlock } from './_components/departamento-projetos-block'
import { DepartamentoSectionCard } from './_components/departamento-section-card'
import { DepartamentoCockpitHeader } from './_components/departamento-cockpit-header'
import { DepartamentoDominioPanel } from './_components/departamento-dominio-panel'
import { DepartamentoHashRedirect } from './_components/departamento-hash-redirect'
import { DepartamentoIcone } from '../_components/departamento-icone'
import { resolveAcessoPluginEvento } from '@/lib/eventos-plugin-access'
import { getDepartamentoContexto } from './_lib/contexto'
import {
  areasFiltroDe,
  carregarAreaMembros,
  carregarCanaisDisponiveis,
  carregarContagensCockpit,
  carregarDiretoriaKpis,
  carregarEquipe,
  carregarFilaPendentes,
  carregarPedidosArea,
  carregarProjetos,
  carregarSlugsCampanhaAno,
  montarAreasResumo,
} from './_lib/carregar-cockpit'
import {
  parseDepartamentoTab,
  primeiroSearchParam,
  rotuloTabPainel,
  tabSugeridaPeloFoco,
} from './_lib/tabs'
import { adminTabIds, type AdminTabItem } from '@/components/admin/ui'
import { DepartamentoCockpitTabs } from './_components/departamento-cockpit-tabs'
import { Inbox, Layers, Target, UserPlus, Users } from 'lucide-react'
import type { Metadata } from 'next'

type Params = { slug: string }

const ICONE_TAB = 'h-4 w-4 shrink-0'

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Departamento · ${slug}` }
}

export default async function DepartamentoHomePage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) return null

  const {
    userId,
    tenant,
    departamento: depto,
    capability,
    isSuperAdmin,
    isAtuacao,
    permissoesEfetivas,
    podeGerirEquipe,
    podeAprovarArea,
    podeVerFinanceiro,
    podeVerPatrimonio,
    podeVerAcervoBandeiras,
    podeModerar,
    areas,
    minhasAreas,
  } = ctx

  const isGestor = podeGerirEquipe
  const podeVerPedidos =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.STORE_VIEW_ORDERS)
  const panel = capability?.portalPanel ?? 'generico'
  const temFila = panel === 'diretoria'
  const temPedidos = isGestor
  const sp = await searchParams
  const focoAreaId = primeiroSearchParam(sp.area)
  const focoProjetoId = primeiroSearchParam(sp.projeto)
  const focoPessoaId = primeiroSearchParam(sp.pessoa)
  const aba = parseDepartamentoTab(
    primeiroSearchParam(sp.tab) ??
      tabSugeridaPeloFoco({
        area: focoAreaId,
        projeto: focoProjetoId,
        pessoa: focoPessoaId,
      }) ??
      undefined,
    { temFila, temPedidos },
  )

  const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
  const moduloHref = hrefModuloPortal(moduloKey)
  const operacaoHref = isGestor ? hrefOperacaoAdmin(moduloKey) : null
  const moduloLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
  const mission = missionDepartamento(depto.slug)
  const atalhos = subareasDepartamento(depto.slug)
    .filter((s): s is typeof s & { href: string } => Boolean(s.href?.startsWith('/')))
    .map((s) => ({ id: s.id, label: s.label, href: s.href }))

  const precisaAreaMembros = aba === 'areas' || aba === 'equipe'
  const precisaCanais = isGestor && (aba === 'painel' || aba === 'areas')
  const precisaPluginAcesso = aba === 'painel' && (panel === 'caravanas' || panel === 'bateria')

  const [contagens, pedidosArea, kpisPack, acessoPlugin, carnavalProximos, areaMembros] =
    await Promise.all([
      carregarContagensCockpit({
        tenantId: tenant.id,
        departamentoId: depto.id,
        temFila,
      }),
      temPedidos ? carregarPedidosArea({ tenantId: tenant.id, departamentoId: depto.id }) : [],
      temFila && (aba === 'painel' || aba === 'fila')
        ? carregarDiretoriaKpis(tenant.id)
        : Promise.resolve(null),
      precisaPluginAcesso
        ? Promise.all([
            resolveAcessoPluginEvento(
              userId,
              tenant.id,
              'caravanas',
              permissoesEfetivas,
              [],
              isSuperAdmin,
            ),
            resolveAcessoPluginEvento(
              userId,
              tenant.id,
              'bateria',
              permissoesEfetivas,
              [],
              isSuperAdmin,
            ),
          ])
        : Promise.resolve(null),
      aba === 'painel' && panel === 'carnaval'
        ? db.evento.count({
            where: { tenantId: tenant.id, tipo: 'GERAL', data: { gte: new Date() } },
          })
        : Promise.resolve(0),
      precisaAreaMembros
        ? carregarAreaMembros(areas.map((a) => a.id))
        : Promise.resolve({
            membrosPorArea: new Map(),
            areasPorUsuario: new Map(),
          }),
    ])

  const totalPendentes = kpisPack?.totalPendentes ?? contagens.pendentes
  const kpis = kpisPack?.kpis ?? null
  const acessoCaravanas = acessoPlugin?.[0] ?? { podeVer: false }
  const acessoBateria = acessoPlugin?.[1] ?? { podeVer: false }

  const [slugsCampanha, canaisDisponiveis, fluxos, pendentes, projetosPack, membrosEquipe] =
    await Promise.all([
      aba === 'areas' || aba === 'projetos'
        ? carregarSlugsCampanhaAno(tenant.id, depto.id)
        : Promise.resolve(new Set<string>()),
      precisaCanais ? carregarCanaisDisponiveis(tenant.id) : Promise.resolve([]),
      aba === 'painel'
        ? resolverFluxosDepartamento({
            tenantId: tenant.id,
            departamentoId: depto.id,
            slug: depto.slug,
            panel,
            userId,
            isGestor,
            isAtuacao,
            podeAprovar: podeAprovarArea,
            podeVerFinanceiro,
            permissoesEfetivas,
            totalPendentes,
            totalPedidosArea: pedidosArea.length,
            nomeDepartamento: depto.nome,
            minhasAreas,
            meta: depto.meta,
          })
        : Promise.resolve([]),
      aba === 'fila' && podeAprovarArea ? carregarFilaPendentes(tenant.id) : Promise.resolve([]),
      aba === 'projetos'
        ? carregarProjetos({
            tenantId: tenant.id,
            departamentoId: depto.id,
            areas,
          })
        : Promise.resolve(null),
      aba === 'equipe'
        ? carregarEquipe({
            tenantId: tenant.id,
            departamentoId: depto.id,
            areasPorUsuario: areaMembros.areasPorUsuario,
          })
        : Promise.resolve([]),
    ])

  const areasResumo =
    aba === 'areas' || aba === 'projetos'
      ? montarAreasResumo(areas, areaMembros.membrosPorArea, slugsCampanha)
      : []

  const { tabId, panelId } = adminTabIds('tab', aba)
  const basePath = hrefHomeDepartamento(depto.slug)

  const tabs: AdminTabItem[] = [
    {
      id: 'painel',
      label: rotuloTabPainel(panel),
      icon: <DepartamentoIcone slug={depto.slug} className={ICONE_TAB} />,
    },
    {
      id: 'areas',
      label: 'Áreas',
      icon: <Layers className={ICONE_TAB} />,
      count: areas.filter((a) => a.ativa).length,
    },
    {
      id: 'projetos',
      label: 'Projetos',
      icon: <Target className={ICONE_TAB} />,
      count: contagens.projetos,
    },
    {
      id: 'equipe',
      label: 'Equipe',
      icon: <Users className={ICONE_TAB} />,
      count: contagens.equipe,
    },
    ...(temFila
      ? [
          {
            id: 'fila' as const,
            label: 'Fila',
            icon: <Inbox className={ICONE_TAB} />,
            count: totalPendentes,
            countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
          },
        ]
      : []),
    ...(temPedidos
      ? [
          {
            id: 'pedidos' as const,
            label: 'Pedidos',
            icon: <UserPlus className={ICONE_TAB} />,
            count: pedidosArea.length,
            countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <DepartamentoHashRedirect />
      </Suspense>

      <DepartamentoCockpitHeader
        nome={depto.nome}
        slug={depto.slug}
        cor={depto.cor}
        moduloLabel={moduloLabel}
        mission={mission}
        isGestor={isGestor}
        isAtuacao={isAtuacao}
        totalPendentes={temFila ? totalPendentes : 0}
      />

      <div className="sticky top-0 z-10 -mx-1 bg-[rgb(var(--background)_/_0.92)] px-1 py-2 backdrop-blur-sm">
        <DepartamentoCockpitTabs
          tabs={tabs}
          slug={depto.slug}
          basePath={basePath}
          activeId={aba}
        />
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {aba === 'painel' && (
          <>
            <DepartamentoProximaAcao
              fluxos={fluxos}
              isGestor={isGestor}
              departamentoId={depto.id}
              slug={depto.slug}
            />
            {isGestor ? (
              <DepartamentoFluxoPrefs
                departamentoId={depto.id}
                slug={depto.slug}
                panel={panel}
                prefs={lerFluxoPrefs(depto.meta)}
              />
            ) : null}
            <DepartamentoDominioPanel
              panel={panel}
              depto={depto}
              tenantId={tenant.id}
              isGestor={isGestor}
              moduloHref={moduloHref}
              operacaoHref={operacaoHref}
              podeVerFinanceiro={podeVerFinanceiro}
              podeVerPatrimonio={podeVerPatrimonio}
              podeVerAcervoBandeiras={podeVerAcervoBandeiras}
              podeVerCaravanas={acessoCaravanas.podeVer}
              podeVerBateria={acessoBateria.podeVer}
              podeVerPedidos={podeVerPedidos}
              podeModerar={podeModerar}
              podeGerirFinanceiro={hasPermission(permissoesEfetivas, PERMISSIONS.FINANCE_MANAGE)}
              kpis={kpis}
              totalPendentes={totalPendentes}
              carnavalProximos={carnavalProximos}
              atalhos={atalhos}
              canal={depto.canalConversa}
              canaisDisponiveis={canaisDisponiveis}
            />
          </>
        )}

        {aba === 'areas' && (
          <TabIntro
            title="Áreas de atuação"
            description="Frentes de trabalho deste departamento — cada uma organiza sua própria gente."
          >
            <DepartamentoAreasBlock
              departamentoId={depto.id}
              slug={depto.slug}
              areas={areasResumo}
              podeGerir={isGestor}
              canaisDisponiveis={canaisDisponiveis}
              focoAreaId={focoAreaId}
            />
          </TabIntro>
        )}

        {aba === 'projetos' && projetosPack && (
          <TabIntro
            title="Projetos e campanhas"
            description="O trabalho do departamento com período, meta e prestação de contas."
          >
            <DepartamentoProjetosBlock
              departamentoId={depto.id}
              slug={depto.slug}
              projetos={projetosPack.projetos}
              areas={projetosPack.areasOpcoes}
              podeGerir={isGestor}
              areasSazonaisSemCampanha={areasResumo
                .filter((a) => a.ativa && a.sazonal && !a.campanhaAnoAberta)
                .map((a) => ({ id: a.id, nome: a.nome }))}
              focoProjetoId={focoProjetoId}
            />
          </TabIntro>
        )}

        {aba === 'equipe' && (
          <DepartamentoEquipe
            departamentoId={depto.id}
            slug={depto.slug}
            nome={depto.nome}
            cor={depto.cor}
            membros={membrosEquipe}
            isGestor={isGestor}
            currentUserId={userId}
            areas={areasFiltroDe(areas)}
            focoPessoaId={focoPessoaId}
          />
        )}

        {aba === 'fila' &&
          (podeAprovarArea ? (
            <DepartamentoFilaMembros pendentes={pendentes} totalPendentes={totalPendentes} />
          ) : (
            <DepartamentoSectionCard
              icon={<Users className="h-4 w-4" />}
              title="Fila de admissão"
              description="Sócios e torcedores pendentes de aprovação nesta torcida."
              blocked
              blockedReason="A aprovação da fila é de quem gere a Diretoria."
            >
              {null}
            </DepartamentoSectionCard>
          ))}

        {aba === 'pedidos' &&
          (podeAprovarArea ? (
            <DepartamentoFilaArea nomeArea={depto.nome} pedidos={pedidosArea} />
          ) : (
            <DepartamentoSectionCard
              icon={<Users className="h-4 w-4" />}
              title="Pedidos de área"
              description="Sócios aprovados aguardando entrada numa área deste departamento."
              blocked
              blockedReason="Só quem aprova admissões decide esses pedidos. Fale com a Diretoria se algo estiver represado."
            >
              {null}
            </DepartamentoSectionCard>
          ))}
      </div>
    </div>
  )
}

function TabIntro({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">{title}</h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
      </div>
      {children}
    </div>
  )
}
