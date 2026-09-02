import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Beer, Boxes, CupSoda, ReceiptText, Store, TrendingUp } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { getTurnoAbertoBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarUnidadeLite } from '@/lib/bar'
import { AdminModuleTabBar, AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

function rotuloTipo(tipo: BarUnidadeLite['tipo']): string {
  if (tipo === 'SEDE') return 'Sede'
  if (tipo === 'SUBSEDE') return 'Subsede'
  return 'PDE'
}

const ICONE = 'h-4 w-4 shrink-0'

export default async function BarModuloLayout({ children }: { children: ReactNode }) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ]))
  } catch {
    redirect('/admin')
  }

  const permissoes = await permissoesEfetivasNoAdmin()

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const [turno, comandasDebito]: [Awaited<ReturnType<typeof getTurnoAbertoBar>>, number] =
    await Promise.all([
      getTurnoAbertoBar(tenant.id, unidade.id),
      db.barComanda.count({
        where: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          status: { in: ['FECHADA_COM_DEBITO', 'VENCIDA'] },
        },
      }),
    ])

  // Estrutura vem de ADMIN_MODULOS; aqui só ícone e contagem.
  const tabs = montarTabsModulo('bar', permissoes, {
    balcao: { icon: <Store className={ICONE} /> },
    vendas: { icon: <ReceiptText className={ICONE} /> },
    comandas: {
      icon: <ReceiptText className={ICONE} />,
      count: comandasDebito,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    produtos: { icon: <CupSoda className={ICONE} /> },
    estoque: { icon: <Boxes className={ICONE} /> },
    desempenho: { icon: <TrendingUp className={ICONE} /> },
  })

  return (
    <>
      <AdminPageHeader
        title="Bar"
        description={`${rotuloTipo(unidade.tipo)} · ${unidade.nome}`}
        icon={<Beer className="h-5 w-5" />}
        actions={
          <Link
            href="/admin/bar/pdv"
            className={[
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity',
              turno
                ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] hover:opacity-90'
                : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <Store className="h-4 w-4" />
            {turno ? 'Abrir PDV' : 'PDV (turno fechado)'}
          </Link>
        }
      >
        <AdminModuleTabBar tabs={tabs} />
      </AdminPageHeader>

      <div className="app-container space-y-6 py-6">
        <AdminModuleTabs tabs={tabs} chrome="panel">
          {children}
        </AdminModuleTabs>
      </div>
    </>
  )
}
