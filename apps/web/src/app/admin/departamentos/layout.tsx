import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Building2, Layers, Target, Users } from 'lucide-react'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

export default async function DepartamentosModuloLayout({ children }: { children: ReactNode }) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE))
  } catch {
    redirect('/admin')
  }

  const permissoes = await permissoesEfetivasNoAdmin()

  // Pendência acionável do módulo: áreas ativas sem responsável. Vai na Visão
  // (índice da organização), não na aba Áreas — senão o número parece total.
  const [areasAtivas, areasComResponsavel]: [number, Array<{ areaId: string }>] = await Promise.all([
    db.departamentoArea.count({ where: { tenantId: tenant.id, ativa: true } }),
    db.departamentoAreaMembro.findMany({
      where: { papel: 'RESPONSAVEL', area: { tenantId: tenant.id, ativa: true } },
      select: { areaId: true },
      distinct: ['areaId'],
    }),
  ])
  const areasSemResponsavel = Math.max(0, areasAtivas - areasComResponsavel.length)

  // Estrutura vem de ADMIN_MODULOS; aqui só ícone e contagem.
  const tabs = montarTabsModulo('departamentos', permissoes, {
    visao: {
      icon: <Building2 className={ICONE} />,
      count: areasSemResponsavel,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    areas: { icon: <Layers className={ICONE} /> },
    equipes: { icon: <Users className={ICONE} /> },
    projetos: { icon: <Target className={ICONE} /> },
  })

  if (tabs.length === 0) redirect('/admin')

  return (
    <>
      <AdminPageHeader
        title="Departamentos"
        description="Visão da torcida: abra um departamento para gerir áreas, equipe e projetos."
        icon={<Building2 className="h-5 w-5" />}
      />

      <div className="app-container space-y-6 py-6">
        <AdminModuleTabs tabs={tabs}>{children}</AdminModuleTabs>
      </div>
    </>
  )
}
