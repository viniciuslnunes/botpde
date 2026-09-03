import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { CalendarRange, Flag, History, ShieldAlert, Timer, Wrench } from 'lucide-react'
import { PERMISSIONS, resolverEscopoPatrimonio } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { carregarDirecaoBandeiras } from '@/lib/bandeiras'
import { listarCandidatosResponsavelPatrimonio, listarEmprestimosPatrimonio } from '@/lib/patrimonio'
import { parseAcervoTab } from '@/lib/acervo-tab'
import { listarAuditoriaInventario } from '@/lib/patrimonio-auditoria'
import { BandeirasAcervoLista } from '@/components/patrimonio/bandeiras-acervo-lista'
import { PatrimonioAuditoriaTimeline } from '@/components/patrimonio/patrimonio-auditoria-timeline'
import { MarcarDanoEmprestimoForm } from '@/components/patrimonio/marcar-dano-emprestimo-form'
import {
  AdminInboxList,
  AdminPageHeader,
  AdminHeaderActionLink,
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

export const metadata: Metadata = { title: 'Bandeiras — Admin' }

async function BandeirasKpis({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoBandeiras(tenantId)
  const semLiberacao = ops.semVistoria + ops.vistoriaVencendo
  return (
    <KpiGrid cols={4}>
      <StatCard
        label="No acervo"
        value={ops.resumo.totalAtivos}
        icon={<Flag className="h-5 w-5" />}
        href="/admin/bandeiras?tab=acervo"
      />
      <StatCard
        label="Fora agora"
        value={ops.emprestimosAbertos}
        tone={ops.atrasados > 0 ? 'warning' : 'default'}
        icon={<Timer className="h-5 w-5" />}
        href="/admin/bandeiras?tab=fora"
      />
      <StatCard
        label="Sem liberação em dia"
        value={semLiberacao}
        tone={semLiberacao > 0 ? 'warning' : 'default'}
        icon={<ShieldAlert className="h-5 w-5" />}
        href="/admin/bandeiras?tab=acervo"
      />
      <StatCard
        label="Jogos em 14 dias"
        value={ops.jogosProximos}
        icon={<CalendarRange className="h-5 w-5" />}
        href="/admin/eventos?vista=semana"
      />
    </KpiGrid>
  )
}

const BANDEIRAS_TABS = ['acervo', 'fora', 'pendencias', 'historico'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

async function BandeirasTabs({
  tenantId,
  tab,
}: {
  tenantId: string
  tab: (typeof BANDEIRAS_TABS)[number]
}) {
  const [ops, emprestimos, auditoria] = await Promise.all([
    carregarDirecaoBandeiras(tenantId),
    listarEmprestimosPatrimonio(tenantId, {
      status: 'ABERTO',
      limite: 24,
      escopoCategoria: 'BANDEIRA',
    }),
    listarAuditoriaInventario(tenantId, 'BANDEIRA'),
  ])

  const tabs: AdminTabItem[] = [
    {
      id: 'acervo',
      label: 'Acervo',
      icon: <Flag className={ICONE_TAB} />,
      count: ops.itens.length,
    },
    {
      id: 'fora',
      label: 'Fora agora',
      icon: <Timer className={ICONE_TAB} />,
      count: emprestimos.length,
      countClass:
        ops.atrasados > 0 ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400' : undefined,
    },
    {
      id: 'pendencias',
      label: 'Precisa de você',
      icon: <ShieldAlert className={ICONE_TAB} />,
      count: ops.pendencias.length,
      countClass:
        ops.pendencias.length > 0
          ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400'
          : undefined,
    },
    {
      id: 'historico',
      label: 'Histórico',
      icon: <History className={ICONE_TAB} />,
      count: auditoria.length,
    },
  ]

  return (
    <AdminPendingTabs tabs={tabs} basePath="/admin/bandeiras" activeId={tab} paramKey="tab" />
  )
}

async function BandeirasCorpo({
  tenantId,
  podeGerir,
  tab,
}: {
  tenantId: string
  podeGerir: boolean
  tab: (typeof BANDEIRAS_TABS)[number]
}) {
  const [ops, emprestimos, candidatos, auditoria] = await Promise.all([
    carregarDirecaoBandeiras(tenantId),
    listarEmprestimosPatrimonio(tenantId, {
      status: 'ABERTO',
      limite: 24,
      escopoCategoria: 'BANDEIRA',
    }),
    podeGerir ? listarCandidatosResponsavelPatrimonio(tenantId) : Promise.resolve([]),
    listarAuditoriaInventario(tenantId, 'BANDEIRA'),
  ])

  const { tabId, panelId } = adminTabIds('tab', tab)

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-3">
        {tab === 'acervo' ? (
          <>
            <BandeirasKpis tenantId={tenantId} />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              A foto diferencia bandeirões, faixas e mastros parecidos.
            </p>
            <BandeirasAcervoLista
              itens={ops.itens}
              podeGerir={podeGerir}
              candidatos={candidatos}
              tenantId={tenantId}
            />
          </>
        ) : null}

        {tab === 'fora' ? (
          emprestimos.length > 0 ? (
            <ul className="space-y-2">
              {emprestimos.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                        {e.item.nome}
                      </p>
                      <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                        Com {e.user.nome ?? 'membro'} · desde{' '}
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(e.abertoEm)}
                      </p>
                    </div>
                    <a
                      href={e.fotoSaidaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                    >
                      Ver foto saída
                    </a>
                  </div>
                  {podeGerir ? <MarcarDanoEmprestimoForm emprestimoId={e.id} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma bandeira fora agora.
            </p>
          )
        ) : null}

        {tab === 'pendencias' ? (
          <AdminInboxList
            itens={ops.pendencias}
            podeAgir={false}
            emptyTitle="Nada represado no trapo."
            emptyDescription="Acervo guardado, liberações em dia."
          />
        ) : null}

        {tab === 'historico' ? (
          <PatrimonioAuditoriaTimeline
            entradas={auditoria}
            emptyDescription="Baixas e exclusões de bandeiras, faixas e mastros — quem fez e quando."
          />
        ) : null}
      </div>
  )
}

export default async function AdminBandeirasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.FLAGS_MANAGE,
      PERMISSIONS.PATRIMONY_MANAGE,
    ])
    tenant = authz.tenant
    const escopo = resolverEscopoPatrimonio(authz.permissoesEfetivas ?? [], {
      isSuperAdmin: Boolean(authz.isSuperAdmin),
    })
    podeGerir = escopo.podeGerirBandeiras
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const tab = parseAcervoTab(sp.tab, BANDEIRAS_TABS, 'acervo')

  return (
    <>
      <AdminPageHeader
        title="Bandeiras"
        description="O trapo da torcida — acervo, liberação de entrada e escala de jogo."
        icon={<Flag className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminHeaderActionLink href="/admin/eventos?vista=semana" icon={CalendarRange}>
              Escala da semana
            </AdminHeaderActionLink>
            <AdminHeaderActionLink
              href="/portal/patrimonio?categoria=BANDEIRA&status=MANUTENCAO"
              icon={Wrench}
              variant="ghost"
            >
              Em conserto
            </AdminHeaderActionLink>
          </div>
        }
      >
        <Suspense fallback={<div className="h-9 w-full max-w-lg animate-pulse rounded-lg bg-[rgb(var(--border)_/_0.45)]" />}>
          <BandeirasTabs tenantId={tenant.id} tab={tab} />
        </Suspense>
      </AdminPageHeader>

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
          <BandeirasCorpo tenantId={tenant.id} podeGerir={podeGerir} tab={tab} />
        </Suspense>
      </div>
    </>
  )
}
