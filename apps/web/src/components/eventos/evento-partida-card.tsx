import { MANDO_JOGO_LABEL } from '@torcida/types'
import { Calendar, MapPin, Trophy } from 'lucide-react'

export type EventoPartidaCardData = {
  adversario: string
  competicao: string | null
  dataHora: Date | string
  local: string | null
  mando: 'CASA' | 'FORA'
  status: string
  placarCasa?: number | null
  placarFora?: number | null
}

export function EventoPartidaCard({ partida }: { partida: EventoPartidaCardData }) {
  const dataLabel = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(partida.dataHora))
  const mando = MANDO_JOGO_LABEL[partida.mando] ?? partida.mando
  const temPlacar = partida.placarCasa != null && partida.placarFora != null

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Partida vinculada
      </p>
      <p className="mt-1 text-base font-semibold text-[rgb(var(--foreground))]">
        {mando} vs {partida.adversario}
        {temPlacar && (
          <span className="ml-2 tabular-nums text-[rgb(var(--color-primary-fg))]">
            {partida.placarCasa} × {partida.placarFora}
          </span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {dataLabel}
        </span>
        {partida.competicao && (
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" />
            {partida.competicao}
          </span>
        )}
        {partida.local && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {partida.local}
          </span>
        )}
      </div>
    </div>
  )
}
