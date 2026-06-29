import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import Link from 'next/link'
import { MapPin, Building2, Phone, Clock, Users, ChevronRight, AlertCircle } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes' }

const tipoLabel: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de Encontro',
}

const tipoCor: Record<string, string> = {
  SEDE: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  SUBSEDE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  PONTO_ENCONTRO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
}

export default async function SedesPage() {
  const tenant = await getTenantFromHost()

  const sedes = tenant
    ? await db.sede.findMany({
        where: { tenantId: tenant.id, ativa: true },
        orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      })
    : []

  type Sede = (typeof sedes)[number]

  const sedes_por_tipo = {
    SEDE: sedes.filter((s: Sede) => s.tipo === 'SEDE'),
    SUBSEDE: sedes.filter((s: Sede) => s.tipo === 'SUBSEDE'),
    PONTO_ENCONTRO: sedes.filter((s: Sede) => s.tipo === 'PONTO_ENCONTRO'),
  }

  function SedeCard({ sede }: { sede: Sede }) {
    return (
      <Link
        href={`/portal/sedes/${sede.id}`}
        className="group flex flex-col gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tipoCor[sede.tipo]}`}>
                {tipoLabel[sede.tipo]}
              </span>
              <h3 className="font-semibold text-[rgb(var(--foreground))]">{sede.nome}</h3>
            </div>

            {(sede.cidade || sede.endereco) && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {sede.endereco ? `${sede.endereco}${sede.cidade ? `, ${sede.cidade}` : ''}` : sede.cidade}
                  {sede.estado ? ` — ${sede.estado}` : ''}
                </span>
              </div>
            )}

            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
              {sede.responsavel && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {sede.responsavel}
                </span>
              )}
              {sede.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {sede.telefone}
                </span>
              )}
              {sede.capacidade && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Cap. {sede.capacidade}
                </span>
              )}
              {sede.horarios && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {sede.horarios}
                </span>
              )}
            </div>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    )
  }

  if (sedes.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Sedes</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-16 text-center">
          <AlertCircle className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
            Nenhuma sede cadastrada
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Sedes</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Locais da torcida — sedes, subsedes e pontos de encontro
        </p>
      </div>

      {(Object.entries(sedes_por_tipo) as [string, Sede[]][])
        .filter(([, list]) => list.length > 0)
        .map(([tipo, list]) => (
          <div key={tipo}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              {tipoLabel[tipo]} ({list.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((s: Sede) => (
                <SedeCard key={s.id} sede={s} />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
