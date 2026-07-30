import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreditCard, ListChecks, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

export default async function FinanceiroModuloLayout({ children }: { children: ReactNode }) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const permissoes = await permissoesEfetivasNoAdmin()

  const cobrancasVencidas: number = await db.cobrancaAssociacao.count({
    where: { tenantId: tenant.id, status: 'VENCIDA' },
  })

  const tabs = montarTabsModulo('financeiro', permissoes, {
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
        description="Livro-caixa, evolução, cobranças de associação e planos de sócio."
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <Link
            href="/portal/financeiro"
            className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
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
