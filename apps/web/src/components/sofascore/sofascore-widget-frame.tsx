// Only official Sofascore iframe embeds — nunca scraping nem endpoint não documentado.
'use client'

import { CalendarDays, ListOrdered, Trophy, User, Network } from 'lucide-react'
import { isEmbedConfigured, SOFASCORE_ALTURA_PADRAO_PX, type SofascoreWidgetTipo } from '@/lib/sofascore'

const ICONE_POR_TIPO: Record<SofascoreWidgetTipo, typeof CalendarDays> = {
  fixtures: CalendarDays,
  standings: ListOrdered,
  topPlayers: Trophy,
  powerRankings: Trophy,
  player: User,
  cupTree: Network,
}

interface SofascoreWidgetFrameProps {
  tipo: SofascoreWidgetTipo
  titulo: string
  embedSrc: string
  /** Altura do iframe em px — usar o valor do snippet oficial (varia por widget/torneio). */
  alturaPx?: number
  /** Link de atribuição do embed oficial (obrigatório manter quando presente). */
  creditoUrl?: string
  /** Texto de atribuição do embed oficial, ex. "Classificação fornecida por". */
  creditoTexto?: string
}

export function SofascoreWidgetFrame({
  tipo,
  titulo,
  embedSrc,
  alturaPx,
  creditoUrl,
  creditoTexto,
}: SofascoreWidgetFrameProps) {
  if (!isEmbedConfigured(embedSrc)) return null
  const Icon = ICONE_POR_TIPO[tipo] ?? Trophy

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
        {titulo}
      </h2>
      <div className="mt-3">
        <iframe
          src={embedSrc}
          title={titulo}
          loading="lazy"
          className="w-full rounded-xl border-0"
          style={{ height: alturaPx ?? SOFASCORE_ALTURA_PADRAO_PX, maxWidth: 768 }}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      {creditoUrl && (
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          {creditoTexto ?? 'Dados fornecidos por'}{' '}
          <a
            href={creditoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[rgb(var(--foreground))]"
          >
            Sofascore
          </a>
        </p>
      )}
    </div>
  )
}
