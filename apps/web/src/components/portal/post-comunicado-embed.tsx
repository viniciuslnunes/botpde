import { Megaphone } from 'lucide-react'
import { Badge } from '@torcida/ui'
import type { ComunicadoOrigemEmbed } from '@/lib/feed'

const PRIORIDADE_VARIANT: Record<string, 'neutral' | 'warning' | 'danger'> = {
  NORMAL: 'neutral',
  IMPORTANTE: 'warning',
  URGENTE: 'danger',
}

interface PostComunicadoEmbedProps {
  comunicado: ComunicadoOrigemEmbed
}

export function PostComunicadoEmbed({ comunicado }: PostComunicadoEmbedProps) {
  return (
    <div className="mt-3 rounded-xl border border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.05)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Megaphone className="h-3.5 w-3.5 text-[rgb(var(--color-primary-fg))]" />
        <span className="text-xs font-semibold text-[rgb(var(--color-primary-fg))]">Comunicado oficial</span>
        <Badge variant={PRIORIDADE_VARIANT[comunicado.prioridade]}>
          {comunicado.prioridade === 'URGENTE'
            ? 'Urgente'
            : comunicado.prioridade === 'IMPORTANTE'
              ? 'Importante'
              : 'Normal'}
        </Badge>
        <Badge variant="primary">{comunicado.tenantNome}</Badge>
      </div>
      <h4 className="text-sm font-semibold text-[rgb(var(--foreground))]">{comunicado.titulo}</h4>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-[rgb(var(--foreground-muted))]">
        {comunicado.corpo}
      </p>
      {comunicado.autorNome && (
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">{comunicado.autorNome}</p>
      )}
    </div>
  )
}
