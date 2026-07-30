import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarCobrancasTenant } from '@/lib/cobrancas'
import { resumirInadimplencia, type InadimplenciaResumo } from '@/lib/cobrancas-insights'
import { getPixProvider } from '@/lib/pix-gateway'
import { MotionReveal } from '@/components/motion/motion-reveal'
import {
  AdminCreateDisclosure,
  AdminTabs,
  adminTabIds,
  InsightSection,
  StatCard,
  StatusBadge,
  TableShell,
} from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import { db } from '@torcida/db'
import type { StatusCobrancaAssociacao } from '@torcida/db'
import { AdminCriarCobrancaForm } from './admin-criar-cobranca-form'
import { AdminCobrancaAcoes, DispararLembretesButton } from './admin-cobrancas-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cobranças — Admin' }

function formatarTaxaPct(taxa: number | null): string | undefined {
  if (taxa === null) return undefined
  return `${(taxa * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do exigível em 90d`
}

async function CobrancasInsights({ tenantId }: { tenantId: string }) {
  const resumo: InadimplenciaResumo = await resumirInadimplencia(tenantId)

  const semBase =
    resumo.quantidadeEmAtraso === 0 && resumo.mrrAtual === 0 && resumo.mrrAnterior === 0
  if (semBase) return null

  return (
    <InsightSection
      title="Saúde da associação"
      description="Mensalidades pagas no mês vs anterior · aging do valor em atraso."
    >
      <StatCard
        label="Mensalidades no mês (MRR)"
        value={formatarMoedaBRL(resumo.mrrAtual)}
        tone="success"
        delta={{ atual: resumo.mrrAtual, anterior: resumo.mrrAnterior }}
      />
      <StatCard
        label="Valor em atraso"
        value={formatarMoedaBRL(resumo.valorEmAtraso)}
        tone={resumo.valorEmAtraso > 0 ? 'danger' : 'success'}
        badge={formatarTaxaPct(resumo.taxaInadimplencia)}
        badgeTone="danger"
      />
      <StatCard
        label="Cobranças em atraso"
        value={resumo.quantidadeEmAtraso}
        tone={resumo.quantidadeEmAtraso > 0 ? 'warning' : 'default'}
      />

      {resumo.valorEmAtraso > 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 lg:col-span-3 sm:p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Aging do atraso
          </h3>
          <MiniBarChart
            data={resumo.aging.map((b) => ({
              rotulo: b.faixa,
              valor: b.valor,
              cor: 'rgb(var(--color-danger) / 0.7)',
            }))}
            formato="moeda"
          />
        </div>
      ) : null}
    </InsightSection>
  )
}

type Props = { searchParams: Promise<{ status?: string }> }

const STATUS_FILTROS: Array<{ value: 'TODAS' | StatusCobrancaAssociacao; label: string }> = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'VENCIDA', label: 'Vencidas' },
  { value: 'PAGA', label: 'Pagas' },
  { value: 'CANCELADA', label: 'Canceladas' },
]

export default async function CobrancasAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const statusFiltro: StatusCobrancaAssociacao | undefined = STATUS_FILTROS.some(
    (f) => f.value !== 'TODAS' && f.value === sp.status,
  )
    ? (sp.status as StatusCobrancaAssociacao)
    : undefined

  const [cobrancas, membrosRaw, planosRaw, contagens] = await Promise.all([
    listarCobrancasTenant(tenant.id, {
      status: statusFiltro,
      limite: 80,
    }),
    db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO', desligadoEm: null },
      orderBy: { nome: 'asc' },
      select: { userId: true, nome: true },
      take: 500,
    }),
    db.planoAssociacao.findMany({
      where: { tenantId: tenant.id, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, valor: true },
    }),
    db.cobrancaAssociacao.groupBy({
      by: ['status'],
      where: { tenantId: tenant.id },
      _count: { id: true },
    }),
  ])

  const contagemPorStatus = new Map<StatusCobrancaAssociacao, number>(
    contagens.map((c: { status: StatusCobrancaAssociacao; _count: { id: number } }) => [
      c.status,
      c._count.id,
    ]),
  )
  const totalCobrancas = [...contagemPorStatus.values()].reduce((acc, n) => acc + n, 0)

  const abaAtiva = statusFiltro ?? 'TODAS'
  const { tabId, panelId } = adminTabIds('status', abaAtiva)

  const provider = getPixProvider()

  return (
    <div className="space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Mensalidades e taxas — gateway Pix:{' '}
            <span className="font-medium">{provider === 'mock' ? 'Mock (dev)' : 'Mercado Pago'}</span>
          </p>
          <DispararLembretesButton />
        </div>
      </MotionReveal>

      <AdminCreateDisclosure label="Nova cobrança">
        <AdminCriarCobrancaForm
          membros={membrosRaw.map((m: (typeof membrosRaw)[number]) => ({
            userId: m.userId,
            label: m.nome,
          }))}
          planos={planosRaw.map((p: (typeof planosRaw)[number]) => ({
            id: p.id,
            nome: p.nome,
            valor: Number(p.valor),
          }))}
        />
      </AdminCreateDisclosure>

      <AdminTabs
        tabs={STATUS_FILTROS.map((f) => ({
          id: f.value,
          label: f.label,
          count: f.value === 'TODAS' ? totalCobrancas : (contagemPorStatus.get(f.value) ?? 0),
          countClass:
            f.value === 'VENCIDA'
              ? 'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'
              : undefined,
        }))}
        basePath="/admin/financeiro/cobrancas"
        activeId={abaAtiva}
        paramKey="status"
      />

      <Suspense
        fallback={
          <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
            ))}
          </div>
        }
      >
        <CobrancasInsights tenantId={tenant.id} />
      </Suspense>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId}>
        <TableShell
          isEmpty={cobrancas.length === 0}
          empty={{
            icon: <Receipt className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />,
            title: 'Nenhuma cobrança encontrada',
            description: 'Troque de aba ou use Nova cobrança para criar a primeira.',
          }}
        >
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Associado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Descrição
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Vencimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {cobrancas.map((c) => {
                return (
                  <tr key={c.id} className="hover:bg-[rgb(var(--background-subtle)_/_0.5)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.user.nome ?? '—'}</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">{c.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{c.descricao}</p>
                      <p className="font-mono text-xs text-[rgb(var(--foreground-muted))]">
                        {formatarMoedaBRL(Number(c.valor))}
                        {c.planoAssociacao ? ` · ${c.planoAssociacao.nome}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {formatDataCompetenciaInput(c.vencimento)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge dominio="cobranca" status={c.status} />
                      {c.pixCopiaCola && c.status !== 'PAGA' && (
                        <p className="mt-0.5 text-[10px] text-[rgb(var(--foreground-muted))]">Pix gerado</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AdminCobrancaAcoes cobrancaId={c.id} status={c.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
        </TableShell>
      </div>
    </div>
  )
}
