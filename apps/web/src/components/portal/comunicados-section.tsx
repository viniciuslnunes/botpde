'use client'

import { useState } from 'react'
import { ChevronDown, Megaphone, Pin } from 'lucide-react'
import { Badge } from '@torcida/ui'

export interface ComunicadoSectionItem {
  id: string
  tenantId: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  fixado: boolean
  publicadoEm: string
  tenantNome: string
  autorNome: string | null
  lido?: boolean
}

const PRIORIDADE_LABEL: Record<string, string> = {
  NORMAL: 'Normal',
  IMPORTANTE: 'Importante',
  URGENTE: 'Urgente',
}

const PRIORIDADE_VARIANT: Record<string, 'neutral' | 'warning' | 'danger'> = {
  NORMAL: 'neutral',
  IMPORTANTE: 'warning',
  URGENTE: 'danger',
}

const PESO_PRIORIDADE: Record<ComunicadoSectionItem['prioridade'], number> = {
  URGENTE: 2,
  IMPORTANTE: 1,
  NORMAL: 0,
}

interface ComunicadosSectionProps {
  announcements: ComunicadoSectionItem[]
  tenantId: string
  defaultExpanded: boolean
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

function previewTitulo(announcements: ComunicadoSectionItem[]) {
  const sorted = [...announcements].sort((a, b) => {
    const pa = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
    if (pa !== 0) return -pa
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1
    return new Date(b.publicadoEm).getTime() - new Date(a.publicadoEm).getTime()
  })
  return sorted[0]?.titulo ?? ''
}

export function ComunicadosSection({
  announcements,
  tenantId,
  defaultExpanded,
}: ComunicadosSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (announcements.length === 0) return null

  const novos = announcements.filter((a) => a.lido === false).length
  const preview = previewTitulo(announcements)

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-[rgb(var(--background-subtle))]"
        aria-expanded={expanded}
      >
        <Megaphone className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
        <span className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Comunicados oficiais
        </span>
        {novos > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {novos} {novos === 1 ? 'novo' : 'novos'}
          </span>
        )}
        {!expanded && preview && (
          <span className="min-w-0 flex-1 truncate text-xs text-[rgb(var(--foreground-muted))]">
            {preview}
          </span>
        )}
        <ChevronDown
          className={[
            'ml-auto h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
            expanded ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {expanded &&
        announcements.map((a) => {
          const herdado = a.tenantId !== tenantId
          const urgente = a.prioridade === 'URGENTE'
          return (
            <article
              key={a.id}
              className={[
                'rounded-2xl border p-4',
                urgente
                  ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                  : 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.05)]',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.fixado && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--primary))]">
                    <Pin className="h-3.5 w-3.5" /> Fixado
                  </span>
                )}
                <Badge variant={PRIORIDADE_VARIANT[a.prioridade]}>
                  {PRIORIDADE_LABEL[a.prioridade]}
                </Badge>
                {herdado && <Badge variant="primary">{a.tenantNome}</Badge>}
                {a.lido === false && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Novo
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-semibold text-[rgb(var(--foreground))]">{a.titulo}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                {a.corpo}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <span>{a.autorNome ?? 'Administração'}</span>
                <span>·</span>
                <span>{formatarData(a.publicadoEm)}</span>
              </div>
            </article>
          )
        })}
    </section>
  )
}
