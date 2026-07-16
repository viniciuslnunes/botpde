import { ComunidadeSalasLiveWidget } from '@/components/portal/comunidade-salas-live-widget'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasMobileProps {
  salas: SalaAtivaListItem[]
}

export function ComunidadeSalasMobile({ salas }: ComunidadeSalasMobileProps) {
  if (salas.length === 0) return null
  return (
    <div className="lg:hidden">
      <ComunidadeSalasLiveWidget salas={salas} />
    </div>
  )
}
