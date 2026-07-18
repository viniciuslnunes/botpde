import { TIPO_EVENTO_LABEL } from '@torcida/types'
import type { TipoEvento } from '@torcida/db'

const BADGE_CLASS: Record<TipoEvento, string> = {
  GERAL: 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]',
  CARAVANA: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ENSAIO: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
}

export function EventoTipoBadge({ tipo }: { tipo: TipoEvento | string }) {
  const key = (tipo in BADGE_CLASS ? tipo : 'GERAL') as TipoEvento
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        BADGE_CLASS[key],
      ].join(' ')}
    >
      {TIPO_EVENTO_LABEL[key] ?? tipo}
    </span>
  )
}
