import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { Network, Users, CreditCard, MapPin, Lock } from 'lucide-react'
import { assertPermission } from '@/lib/authz'
import { getTenantHierarquia, type TenantHierarquiaNode } from '@/lib/hierarquia'
import { PERMISSIONS } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Hierarquia — Admin' }

const TIPO_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de encontro',
}

interface Metricas {
  membros: number
  socios: number
}

function NodeCard({
  node,
  metricas,
}: {
  node: TenantHierarquiaNode
  metricas?: Metricas
}) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[rgb(var(--foreground))]">{node.nome}</p>
            <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              {TIPO_LABEL[node.tipo] ?? node.tipo}
            </span>
            {!node.ativa && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                Inativo
              </span>
            )}
          </div>
          {node.cidade && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
              <MapPin className="h-3 w-3" />
              {node.cidade}
            </p>
          )}
        </div>
      </div>

      {metricas ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2">
            <Users className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{metricas.membros}</p>
              <p className="text-[10px] text-[rgb(var(--foreground-muted))]">Membros ativos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2">
            <CreditCard className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{metricas.socios}</p>
              <p className="text-[10px] text-[rgb(var(--foreground-muted))]">Sócios</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
          <Lock className="h-3 w-3" />
          Dados restritos — visíveis apenas para a sede-mãe
        </p>
      )}
    </div>
  )
}

export default async function HierarquiaPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE))
  } catch {
    redirect('/admin')
  }

  const { ancestral, descendentes } = await getTenantHierarquia(tenant.id)

  // Métricas restritas — só calculadas para descendentes, porque é a única
  // direção em que a regra de visibilidade permite ver dado restrito
  // (sede vê tudo da subsede/PDE; subsede/PDE não vê restrito da sede-mãe).
  // Uma consulta por descendente, todas em paralelo (não uma de cada vez).
  const metricasPorTenant = new Map<string, Metricas>()
  await Promise.all(
    descendentes.map(async (d) => {
      const [membros, socios] = await Promise.all([
        db.saasMembro.count({ where: { tenantId: d.tenantId, status: 'APROVADO' } }),
        db.saasSocio.count({ where: { tenantId: d.tenantId } }),
      ])
      metricasPorTenant.set(d.tenantId, { membros, socios })
    }),
  )

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <Network className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Hierarquia</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Sede, subsedes e pontos de encontro relacionados a {tenant.nome}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container space-y-6">
          {!ancestral && descendentes.length === 0 && (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {tenant.nome} ainda não está vinculado a nenhuma sede ou subsede na plataforma.
              Vincule pelo cadastro de Sedes para ver a hierarquia aqui.
            </p>
          )}

          {ancestral && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Sede-mãe
              </h2>
              <NodeCard node={ancestral} />
            </div>
          )}

          {descendentes.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Subsedes e pontos de encontro ({descendentes.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {descendentes.map((d) => (
                  <NodeCard key={d.tenantId} node={d} metricas={metricasPorTenant.get(d.tenantId)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
