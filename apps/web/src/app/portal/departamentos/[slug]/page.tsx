import { Suspense } from 'react'
import { permanentRedirect } from 'next/navigation'
import { db } from '@torcida/db'
import {
  hasPermission,
  hrefHomeDepartamento,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  lerFluxoPrefs,
  PERMISSIONS,
  resolverEscopoPatrimonio,
  resolverModuloPortalDepartamento,
  subareasDepartamento,
} from '@torcida/types'
import { DepartamentoEquipe } from '../_components/departamento-equipe'
import { DepartamentoFilaMembros } from '../_components/departamento-fila-membros'
import { DepartamentoFilaArea } from '../_components/departamento-fila-area'
import { DepartamentoProximaAcao } from '../_components/departamento-proxima-acao'
import { DepartamentoFluxoPrefs } from '../_components/departamento-fluxo-prefs'
import { resolverFluxosDepartamento } from '../_components/departamento-proxima-acao-data'
import { DepartamentoDominioPanel } from './_components/departamento-dominio-panel'
import { DepartamentoHashRedirect } from './_components/departamento-hash-redirect'
import { LojaTicketKanbanSection } from '@/components/loja/loja-ticket-kanban-section'
import { LojaTicketKanbanSkeleton } from '@/components/loja/loja-ticket-kanban'
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
} from './_lib/carregar-cockpit'
import {
  parseAcervoPage,
  parseDepartamentoTab,
  primeiroSearchParam,
  tabSugeridaPeloFoco,
} from './_lib/tabs'
import { adminTabIds } from '@/components/admin/ui'
import type { Metadata } from 'next'

type Params = { slug: string }

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
  const escopoPatrimonio = resolverEscopoPatrimonio(permissoesEfetivas, { isSuperAdmin })
  const podeGerirAcervoBandeiras = escopoPatrimonio.podeGerirBandeiras
  const podeGerirPatrimonio = escopoPatrimonio.podeGerirTudo
  const podeVerPedidos =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.STORE_VIEW_ORDERS)
  const podeGerirPedidos =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.STORE_MANAGE)
  const panel = capability?.portalPanel ?? 'generico'
  const temFila = panel === 'diretoria' && podeAprovarArea
  const temPedidos = isGestor && podeAprovarArea
  const temAtendimentoLoja = depto.slug === 'materiais-loja' && podeVerPedidos
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
    { temFila, temPedidos, temAtendimentoLoja },
  )
  const acervoPage = parseAcervoPage(primeiroSearchParam(sp.page))

  if (aba === 'areas' || focoAreaId) {
    permanentRedirect(hrefHomeDepartamento(depto.slug, 'areas', { area: focoAreaId }))
  }
  if (aba === 'projetos' || focoProjetoId) {
    permanentRedirect(hrefHomeDepartamento(depto.slug, 'projetos', { projeto: focoProjetoId }))
  }

  const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
  const moduloHref = hrefModuloPortal(moduloKey)
  const operacaoHref = isGestor ? hrefOperacaoAdmin(moduloKey) : null
  const atalhos = subareasDepartamento(depto.slug)
    .filter((s): s is typeof s & { href: string } => {
      if (!s.href?.startsWith('/')) return false
      if (s.href.startsWith('/admin') && !isGestor) return false
      if (s.href === '/portal/financeiro' && !podeVerFinanceiro) return false
      return true
    })
    .map((s) => ({ id: s.id, label: s.label, href: s.href }))

  const precisaAreaMembros = aba === 'equipe'
  const precisaCanais = isGestor && aba === 'painel'
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

  const [canaisDisponiveis, fluxos, pendentes, membrosEquipe] = await Promise.all([
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
    aba === 'equipe'
      ? carregarEquipe({
          tenantId: tenant.id,
          departamentoId: depto.id,
          areasPorUsuario: areaMembros.areasPorUsuario,
        })
      : Promise.resolve([]),
  ])

  const { tabId, panelId } = adminTabIds('tab', aba)

  return (
    <>
      <Suspense fallback={null}>
        <DepartamentoHashRedirect />
      </Suspense>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {aba === 'painel' && (
          <>
            {temAtendimentoLoja ? (
              <Suspense
                fallback={
                  <LojaTicketKanbanSkeleton compacto somenteAtivos mostrarCabecalho />
                }
              >
                <LojaTicketKanbanSection
                  tenantId={tenant.id}
                  podeGerir={podeGerirPedidos}
                  compacto
                  somenteAtivos
                  sectionId="atendimento"
                  mostrarCabecalho
                  arquivoHref={hrefHomeDepartamento(depto.slug, 'atendimento')}
                  arquivoRotulo="Ver fila completa"
                />
              </Suspense>
            ) : null}
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
              podeGerirAcervoBandeiras={podeGerirAcervoBandeiras}
              podeGerirPatrimonio={podeGerirPatrimonio}
              podeVerCaravanas={acessoCaravanas.podeVer}
              podeVerBateria={acessoBateria.podeVer}
              podeVerPedidos={podeVerPedidos}
              podeModerar={podeModerar}
              podeGerirFinanceiro={hasPermission(permissoesEfetivas, PERMISSIONS.FINANCE_MANAGE)}
              kpis={kpis}
              temFila={temFila}
              totalPendentes={totalPendentes}
              carnavalProximos={carnavalProximos}
              atalhos={atalhos}
              canal={depto.canalConversa}
              canaisDisponiveis={canaisDisponiveis}
              acervoPage={acervoPage}
            />
          </>
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

        {aba === 'fila' && (
          <DepartamentoFilaMembros pendentes={pendentes} totalPendentes={totalPendentes} />
        )}

        {aba === 'pedidos' && (
          <DepartamentoFilaArea nomeArea={depto.nome} pedidos={pedidosArea} />
        )}

        {aba === 'atendimento' && temAtendimentoLoja && (
          <Suspense fallback={<LojaTicketKanbanSkeleton mostrarCabecalho={false} />}>
            <LojaTicketKanbanSection
              tenantId={tenant.id}
              podeGerir={podeGerirPedidos}
              mostrarCabecalho={false}
              arquivoHref="/admin/loja/atendimento?v=arquivo"
            />
          </Suspense>
        )}
      </div>
    </>
  )
}
