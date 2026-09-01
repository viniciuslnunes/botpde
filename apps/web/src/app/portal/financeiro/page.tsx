import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import {
  calculateEffectivePermissions,
  formatDataCompetenciaInput,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  listarLancamentosFinanceiro,
  resumirFinanceiro,
} from '@/lib/financeiro'
import {
  parseFiltroFinanceiro,
  type FinanceiroSearchParams,
} from '@/lib/financeiro-filtros'
import { FinanceiroLancamentoForm } from '@/components/financeiro/financeiro-lancamento-form'
import {
  FinanceiroLancamentosLista,
  type LancamentoRow,
} from '@/components/financeiro/financeiro-lancamentos-lista'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { FinanceiroFiltros } from '@/components/financeiro/financeiro-filtros'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Financeiro' }

type Props = { searchParams: Promise<FinanceiroSearchParams> }

export default async function PortalFinanceiroPage({ searchParams }: Props) {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.FINANCE_VIEW))
  } catch {
    redirect('/portal/departamentos')
  }

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  let podeGerir = isSuperAdmin
  if (!podeGerir && session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeGerir = hasPermission(effective, PERMISSIONS.FINANCE_MANAGE)
  }

  const sp = await searchParams
  const { filtro, values } = parseFiltroFinanceiro(sp)
  const filtroResumo = { ...filtro }
  delete filtroResumo.page

  const [resumo, lista] = await Promise.all([
    resumirFinanceiro(tenant.id, filtroResumo),
    listarLancamentosFinanceiro(tenant.id, { filtro }),
  ])

  const itens: LancamentoRow[] = lista.itens.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    categoria: l.categoria,
    valor: Number(l.valor),
    descricao: l.descricao,
    data: formatDataCompetenciaInput(l.data),
    observacao: l.observacao,
    criadoPorNome: l.criadoPor.nome,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-success)_/_0.15)] text-[rgb(var(--color-success-fg))]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Financeiro</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Livro-caixa e prestação de contas
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tenant.balancoFinanceiroVisivel && (
              <Link
                href="/portal/balanco"
                className="text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Balanço público
              </Link>
            )}
            <Link
              href="/portal/departamentos/financeiro"
              className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Ver departamento
            </Link>
          </div>
        </div>
      </MotionReveal>

      <FinanceiroResumoCards
        totalReceitas={resumo.totalReceitas}
        totalDespesas={resumo.totalDespesas}
        saldo={resumo.saldo}
      />

      <FinanceiroFiltros basePath="/portal/financeiro" values={values} />

      {podeGerir && <FinanceiroLancamentoForm />}
      <FinanceiroLancamentosLista
        itens={itens}
        podeGerir={podeGerir}
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath="/portal/financeiro"
        query={values}
      />
    </div>
  )
}
