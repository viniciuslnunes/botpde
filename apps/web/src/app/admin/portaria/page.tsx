import { redirect } from 'next/navigation'
import { DoorOpen } from 'lucide-react'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { AdminPageHeader } from '@/components/admin/ui'
import { PortariaScanner, PortariaVisitanteManual } from '@/components/admin/portaria-console'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Portaria — Admin' }

function formatarHora(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

export default async function AdminPortariaPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)

  type EntradaRow = {
    id: string
    metodo: string
    visitanteNome: string | null
    criadoEm: Date
    user: { nome: string | null; email: string | null } | null
    sede: { nome: string } | null
    registradoPor: { nome: string | null }
  }

  const [entradas, sedes, totalHoje]: [EntradaRow[], Array<{ id: string; nome: string }>, number] =
    await Promise.all([
      db.portariaEntrada.findMany({
        where: { tenantId: tenant.id },
        orderBy: { criadoEm: 'desc' },
        take: 40,
        select: {
          id: true,
          metodo: true,
          visitanteNome: true,
          criadoEm: true,
          user: { select: { nome: true, email: true } },
          sede: { select: { nome: true } },
          registradoPor: { select: { nome: true } },
        },
      }),
      db.sede.findMany({
        where: { tenantId: tenant.id, ativa: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true },
        take: 20,
      }),
      db.portariaEntrada.count({
        where: { tenantId: tenant.id, criadoEm: { gte: inicioHoje } },
      }),
    ])

  return (
    <>
      <AdminPageHeader
        title="Portaria"
        description={`Registro de entrada na sede — ${totalHoje} hoje.`}
        icon={<DoorOpen className="h-5 w-5" />}
      />

      <div className="app-container space-y-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <PortariaScanner />
          <PortariaVisitanteManual sedes={sedes} />
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Últimas entradas</h2>
          {entradas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma entrada registrada ainda.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    <th className="px-4 py-2.5">Quem</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">Como</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">Unidade</th>
                    <th className="px-4 py-2.5">Quando</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {entradas.map((e) => {
                    const nome =
                      e.user?.nome?.trim() ||
                      e.user?.email ||
                      e.visitanteNome ||
                      '—'
                    const como =
                      e.metodo === 'QR_CARTEIRINHA' ? 'Carteirinha' : 'Visitante avulso'
                    return (
                      <tr key={e.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[rgb(var(--foreground))]">{nome}</p>
                          <p className="text-xs text-[rgb(var(--foreground-muted))] sm:hidden">
                            {como}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3 text-[rgb(var(--foreground-muted))] sm:table-cell">
                          {como}
                        </td>
                        <td className="hidden px-4 py-3 text-[rgb(var(--foreground-muted))] md:table-cell">
                          {e.sede?.nome ?? 'Sede principal'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
                          {formatarHora(e.criadoEm)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
