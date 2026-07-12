'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { AlertCircle, Building2, ChevronRight, Clock, MapPin, Phone, Users } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface SedeCardItem {
  id: string
  nome: string
  tipoLabel: string
  tipoClass: string
  enderecoLinha: string | null
  responsavel: string | null
  telefone: string | null
  capacidade: number | null
  horarios: string | null
}

export interface SedesGrupo {
  tipo: string
  tipoLabel: string
  sedes: SedeCardItem[]
}

export function SedesListAnimated({ grupos }: { grupos: SedesGrupo[] }) {
  const total = grupos.reduce((acc, g) => acc + g.sedes.length, 0)

  if (total === 0) {
    return (
      <MotionEmptyState
        icon={<AlertCircle className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhuma sede cadastrada"
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <div className="space-y-8">
      {grupos.map((grupo) => (
        <section key={grupo.tipo}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {grupo.tipoLabel} ({grupo.sedes.length})
          </h2>
          <m.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
            {grupo.sedes.map((sede) => (
              <m.div key={sede.id} variants={staggerItem} whileTap={{ scale: 0.98 }} transition={springSnappy}>
                <Link
                  href={`/portal/sedes/${sede.id}`}
                  className="group flex flex-col gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sede.tipoClass}`}>
                          {sede.tipoLabel}
                        </span>
                        <h3 className="font-semibold text-[rgb(var(--foreground))]">{sede.nome}</h3>
                      </div>
                      {sede.enderecoLinha && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{sede.enderecoLinha}</span>
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
              </m.div>
            ))}
          </m.div>
        </section>
      ))}
    </div>
  )
}
