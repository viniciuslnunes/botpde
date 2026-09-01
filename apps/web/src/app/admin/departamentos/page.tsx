import Link from 'next/link'
import { db } from '@torcida/db'
import {
  PERMISSIONS,
  STATUS_PROJETO_ABERTOS,
  hrefHomeDepartamento,
  hrefOperacaoAdmin,
  isDepartamentoLegado,
  resolverModuloPortalDepartamento,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { parseAcervoTab } from '@/lib/acervo-tab'
import { comCorDepartamento } from '@/lib/cor-departamento'
import { AdminTabs, adminTabIds, KpiGrid, StatCard, type AdminTabItem } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  KeyRound,
  Layers,
  ShieldCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Departamentos · Visão' }

const BASE_PATH = '/admin/departamentos'
const PARAM_TAB = 'tab'
const VISAO_TABS = ['departamentos', 'distribuicao', 'pendencias'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

type DeptoRow = {
  id: string
  nome: string
  slug: string
  cor: string
  moduloPortal: string | null
}

/** Pendência acionável do módulo: o que está organizacionalmente incompleto. */
type Pendencia = {
  id: string
  titulo: string
  detalhe: string
  href: string
}

export default async function DepartamentosVisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const sp = await searchParams
  const tab = parseAcervoTab(sp.tab, VISAO_TABS, 'departamentos')
  const { tabId, panelId } = adminTabIds(PARAM_TAB, tab)

  type AreaRow = {
    id: string
    nome: string
    ativa: boolean
    departamentoId: string
  }
  type VinculoRow = { areaId: string; userId: string; papel: string }

  const [deptosRaw, areas, vinculos, equipeAgg, gestores, projetosAgg]: [
    DeptoRow[],
    AreaRow[],
    VinculoRow[],
    Array<{ departamentoId: string; _count: number }>,
    Array<{ departamentoId: string }>,
    Array<{ departamentoId: string; _count: number }>,
  ] = await Promise.all([
    db.departamento.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, slug: true, cor: true, moduloPortal: true },
    }),
    db.departamentoArea.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, nome: true, ativa: true, departamentoId: true },
    }),
    db.departamentoAreaMembro.findMany({
      where: { area: { tenantId: tenant.id } },
      select: { areaId: true, userId: true, papel: true },
    }),
    db.userDepartamento.groupBy({
      by: ['departamentoId'],
      where: { tenantId: tenant.id },
      _count: true,
    }),
    db.departamentoGestor.findMany({
      where: { departamento: { tenantId: tenant.id } },
      select: { departamentoId: true },
    }),
    db.projeto.groupBy({
      by: ['departamentoId'],
      where: { tenantId: tenant.id, status: { in: [...STATUS_PROJETO_ABERTOS] } },
      _count: true,
    }),
  ])

  const deptos = (await comCorDepartamento(deptosRaw, tenant)).filter(
    (d) => !isDepartamentoLegado(d),
  )
  const deptoPorId = new Map(deptos.map((d) => [d.id, d]))
  const areasDoTenant = areas.filter((a) => deptoPorId.has(a.departamentoId))
  const areasAtivas = areasDoTenant.filter((a) => a.ativa)

  const equipePorDepto = new Map(equipeAgg.map((r) => [r.departamentoId, r._count]))
  const projetosPorDepto = new Map(projetosAgg.map((r) => [r.departamentoId, r._count]))
  const gestorPorDepto = new Set(gestores.map((g) => g.departamentoId))

  const responsaveisPorArea = new Set(
    vinculos.filter((v) => v.papel === 'RESPONSAVEL').map((v) => v.areaId),
  )
  const usuariosComArea = new Set(vinculos.map((v) => v.userId))

  const pessoasAlocadas = [...equipePorDepto.values()].reduce((a, b) => a + b, 0)

  // Pessoas no departamento que não entraram em nenhuma área dele.
  const membrosPorDepto: Array<{ departamentoId: string; userId: string }> =
    await db.userDepartamento.findMany({
      where: { tenantId: tenant.id },
      select: { departamentoId: true, userId: true },
    })
  const semArea = membrosPorDepto.filter(
    (m) => deptoPorId.has(m.departamentoId) && !usuariosComArea.has(m.userId),
  )

  const areasSemResponsavel = areasAtivas.filter((a) => !responsaveisPorArea.has(a.id))
  const deptosSemGestor = deptos.filter((d) => !gestorPorDepto.has(d.id))
  const deptosSemArea = deptos.filter(
    (d) => !areasAtivas.some((a) => a.departamentoId === d.id),
  )

  const pendencias: Pendencia[] = []
  for (const a of areasSemResponsavel) {
    const depto = deptoPorId.get(a.departamentoId)
    pendencias.push({
      id: `area-${a.id}`,
      titulo: `${a.nome} está sem responsável`,
      detalhe: `Área ativa em ${depto?.nome ?? 'departamento'} — nomeie quem responde por ela na lista.`,
      href: `/admin/departamentos/areas?q=${encodeURIComponent(a.nome)}`,
    })
  }
  for (const d of deptosSemGestor) {
    pendencias.push({
      id: `gestor-${d.id}`,
      titulo: `${d.nome} está sem gestor`,
      detalhe: 'Sem gestor, ninguém organiza áreas nem equipe pelo portal.',
      href: '/admin/acessos?secao=pessoas',
    })
  }
  for (const d of deptosSemArea) {
    pendencias.push({
      id: `sem-area-${d.id}`,
      titulo: `${d.nome} não tem áreas de atuação`,
      detalhe: 'Rode o seed de áreas canônicas ou crie as frentes de trabalho no portal.',
      href: hrefHomeDepartamento(d.slug, 'areas'),
    })
  }

  const visaoTabs: AdminTabItem[] = [
    {
      id: 'departamentos',
      label: 'Departamentos',
      icon: <Building2 className={ICONE_TAB} />,
    },
    {
      id: 'distribuicao',
      label: 'Distribuição',
      icon: <BarChart3 className={ICONE_TAB} />,
    },
    {
      id: 'pendencias',
      label: 'Pendências',
      icon: <AlertTriangle className={ICONE_TAB} />,
      count: pendencias.length,
      countClass:
        pendencias.length > 0
          ? 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]'
          : undefined,
    },
  ]

  const grafico = deptos
    .map((d) => ({
      rotulo: d.nome,
      valor: equipePorDepto.get(d.id) ?? 0,
      valorSecundario: areasAtivas.filter((a) => a.departamentoId === d.id).length,
      cor: d.cor,
    }))
    .filter((r) => r.valor > 0 || r.valorSecundario > 0)

  const cards = deptos.map((d) => {
    const ativas = areasAtivas.filter((a) => a.departamentoId === d.id)
    const moduloKey = resolverModuloPortalDepartamento(d.slug, d.moduloPortal)
    return {
      id: d.id,
      nome: d.nome,
      slug: d.slug,
      cor: d.cor,
      areasAtivas: ativas.length,
      semResponsavel: ativas.filter((a) => !responsaveisPorArea.has(a.id)).length,
      pessoas: equipePorDepto.get(d.id) ?? 0,
      projetosAbertos: projetosPorDepto.get(d.id) ?? 0,
      temGestor: gestorPorDepto.has(d.id),
      homeHref: hrefHomeDepartamento(d.slug),
      areasHref: hrefHomeDepartamento(d.slug, 'areas'),
      equipeHref: hrefHomeDepartamento(d.slug, 'equipe'),
      projetosHref: hrefHomeDepartamento(d.slug, 'projetos'),
      operacaoHref: hrefOperacaoAdmin(moduloKey),
    }
  })

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <StatCard
          label="Departamentos"
          value={deptos.length}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Pessoas alocadas"
          value={pessoasAlocadas}
          icon={<Users className="h-5 w-5" />}
          href="/admin/departamentos/equipes"
        />
        <StatCard
          label="Áreas ativas"
          value={areasAtivas.length}
          icon={<Layers className="h-5 w-5" />}
          href="/admin/departamentos/areas"
        />
        <StatCard
          label="Áreas sem responsável"
          value={areasSemResponsavel.length}
          tone={areasSemResponsavel.length > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-5 w-5" />}
          href={`${BASE_PATH}?${PARAM_TAB}=pendencias`}
        />
      </KpiGrid>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
        <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
        Aqui é a organização das áreas e equipes. O <strong>pacote de permissão</strong> de cada
        departamento continua em
        <Link
          href="/admin/acessos?secao=departamentos"
          className="font-medium text-[rgb(var(--foreground))] underline"
        >
          Acessos · Departamentos
        </Link>
        — área organiza gente, departamento autoriza.
      </p>

      <AdminTabs
        tabs={visaoTabs}
        basePath={BASE_PATH}
        activeId={tab}
        paramKey={PARAM_TAB}
      />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-3">
        {tab === 'departamentos' ? (
          <>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Unidade de trabalho. Abra o departamento para gerir áreas, equipe e projetos.
            </p>
            {cards.length === 0 ? (
              <p className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum departamento nesta torcida.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((d) => (
                  <li key={d.id} className="min-w-0">
                    <DeptoResumoCard depto={d} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {tab === 'distribuicao' ? (
          <>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Pessoas na equipe de cada departamento e quantas áreas de atuação ele mantém ativas.
            </p>
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
              {grafico.length > 0 ? (
                <MiniBarChart
                  data={grafico}
                  formato="unidades"
                  legenda={{ principal: 'Pessoas', secundaria: 'Áreas ativas' }}
                />
              ) : (
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  Nenhum departamento tem equipe ainda. Inclua pessoas em{' '}
                  <Link href="/admin/acessos?secao=pessoas" className="underline">
                    Acessos · Pessoas
                  </Link>
                  .
                </p>
              )}
            </div>
          </>
        ) : null}

        {tab === 'pendencias' ? (
          <>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              O que está incompleto na estrutura — clique para resolver no departamento.
            </p>
            {pendencias.length === 0 ? (
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center">
                <ShieldCheck
                  className="mx-auto h-8 w-8 text-[rgb(var(--color-success-fg))]"
                  aria-hidden
                />
                <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">
                  Estrutura completa.
                </p>
                <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                  Todo departamento tem gestor e toda área ativa tem responsável.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {pendencias.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={p.href}
                      className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--primary)_/_0.45)]"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-warning-fg))]"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                          {p.titulo}
                        </span>
                        <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                          {p.detalhe}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {semArea.length > 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
                <UserMinus className="h-4 w-4 shrink-0" aria-hidden />
                {semArea.length} {semArea.length === 1 ? 'pessoa está' : 'pessoas estão'} em um
                departamento sem participar de nenhuma área dele.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

type DeptoResumo = {
  nome: string
  cor: string
  areasAtivas: number
  semResponsavel: number
  pessoas: number
  projetosAbertos: number
  temGestor: boolean
  homeHref: string
  areasHref: string
  equipeHref: string
  projetosHref: string
  operacaoHref: string | null
}

function DeptoResumoCard({ depto }: { depto: DeptoResumo }) {
  const resumo = [
    `${depto.areasAtivas} ${depto.areasAtivas === 1 ? 'área' : 'áreas'}`,
    depto.semResponsavel > 0 ? `${depto.semResponsavel} sem responsável` : null,
    `${depto.pessoas} ${depto.pessoas === 1 ? 'pessoa' : 'pessoas'}`,
    `${depto.projetosAbertos} ${depto.projetosAbertos === 1 ? 'projeto' : 'projetos'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: depto.cor }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
            {depto.nome}
          </h3>
          {!depto.temGestor && (
            <span className="mt-1 inline-block rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-warning-fg))]">
              Sem gestor
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-[rgb(var(--foreground-muted))]">{resumo}</p>

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href={depto.homeHref}
          className="app-action btn-primary inline-flex items-center gap-1 rounded-lg px-3 text-sm font-medium"
        >
          Abrir
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link
          href={depto.areasHref}
          className="inline-flex items-center text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:underline"
        >
          Áreas
        </Link>
        <Link
          href={depto.equipeHref}
          className="inline-flex items-center text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:underline"
        >
          Equipe
        </Link>
        <Link
          href={depto.projetosHref}
          className="inline-flex items-center text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:underline"
        >
          Projetos
        </Link>
        {depto.operacaoHref ? (
          <Link
            href={depto.operacaoHref}
            className="inline-flex items-center text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:underline"
          >
            Operação
          </Link>
        ) : null}
      </div>
    </article>
  )
}
