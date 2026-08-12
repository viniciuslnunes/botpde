import { ComunidadeSalasPanel } from '@/components/portal/comunidade-salas-panel'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasMobileProps {
  salas: SalaAtivaListItem[]
  /** Sufixo `?escopo=` do chrome — sem ele "Ver salas" cai no escopo default. */
  sufixoEscopo?: string
}

/** Salas no feed abaixo de xl — o rail direito ("Salas ao vivo") só aparece em xl+. */
export function ComunidadeSalasMobile({ salas, sufixoEscopo = '' }: ComunidadeSalasMobileProps) {
  if (salas.length === 0) return null
  return (
    <div className="xl:hidden">
      <ComunidadeSalasPanel
        salas={salas}
        mostrarQuandoVazio={false}
        footerHref={`/portal/comunidade/salas${sufixoEscopo}`}
      />
    </div>
  )
}
