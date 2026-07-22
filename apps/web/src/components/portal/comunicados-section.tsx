'use client'

import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import { Megaphone, Pin } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { marcarComunicadosLidosAction } from '@/app/portal/comunidade/actions'
import { ComunicadoShareButton } from '@/components/portal/comunicado-share-button'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'

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

interface ComunicadosSectionProps {
  announcements: ComunicadoSectionItem[]
  tenantId: string
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function ComunicadosSection({ announcements, tenantId }: ComunicadosSectionProps) {
  const marcouLidosRef = useRef(false)

  useEffect(() => {
    if (marcouLidosRef.current) return
    const naoLidos = announcements.filter((a) => a.lido === false).map((a) => a.id)
    if (naoLidos.length === 0) return
    marcouLidosRef.current = true
    void marcarComunicadosLidosAction(naoLidos)
  }, [announcements])

  if (announcements.length === 0) return null

  const novos = announcements.filter((a) => a.lido === false).length

  return (
    <section className="space-y-3">
      <div className="flex w-full items-center gap-2 px-1 py-0.5">
        <Megaphone className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
        <span className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Comunicados oficiais
        </span>
        {novos > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {novos} {novos === 1 ? 'novo' : 'novos'}
          </span>
        )}
      </div>

      <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
        {announcements.map((a) => {
          const herdado = a.tenantId !== tenantId
          const urgente = a.prioridade === 'URGENTE'
          return (
            <m.article
              key={a.id}
              variants={staggerItem}
              className={[
                'rounded-2xl border p-4',
                urgente
                  ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                  : 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.05)]',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.fixado && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                  <span>{a.autorNome ?? 'Administração'}</span>
                  <span>·</span>
                  <span>{formatarData(a.publicadoEm)}</span>
                </div>
                <ComunicadoShareButton comunicadoId={a.id} />
              </div>
            </m.article>
          )
        })}
      </m.div>
    </section>
  )
}
