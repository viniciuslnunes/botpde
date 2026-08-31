import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Compass, CreditCard, ListChecks, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

export default async function FinanceiroModuloLayout({ children }: { children: ReactNode }) {
  let tenant: Awaited<ReturnType<typeof assertManageOrOversightView>>['tenant']
  try {
    ;({ tenant } = await assertManageOrOversightView(
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
    ))
  } catch {
    redirect('/admin')
  }

  const permissoes = await permissoesEfetivasNoAdmin()
  const somenteLeitura = !hasPermission(permissoes, PERMISSIONS.FINANCE_MANAGE)
  const cobrancasVencidas: number = await db.cobrancaAssociacao.count({
    where: { tenantId: tenant.id, status: 'VENCIDA' },
  })

  const tabs = montarTabsModulo('financeiro', permissoes, {
    direcao: { icon: <Compass className={ICONE} /> },
    lancamentos: { icon: <ListChecks className={ICONE} /> },
    evolucao: { icon: <TrendingUp className={ICONE} /> },
    cobrancas: {
      icon: <Receipt className={ICONE} />,
      count: cobrancasVencidas,
      countClass: 'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]',
    },
    planos: { icon: <CreditCard className={ICONE} /> },
  })

  return (
    <>
      <AdminPageHeader
        title="Financeiro"
        description={
          somenteLeitura
            ? 'Somente leitura — direção do caixa, lançamentos, cobranças e planos.'
            : 'Direção do caixa, livro-caixa, cobranças de associação e planos de sócio.'
        }
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <Link
            href="/portal/financeiro"
            className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Ver no portal
          </Link>
        }
      />

      <div className="app-container space-y-6 py-6">
        <AdminModuleTabs tabs={tabs}>{children}</AdminModuleTabs>
      </div>
    </>
  )
}
