import { listSalasAtivas } from '@/lib/salas'
import { ComunidadeSalasLiveWidget } from '@/components/portal/comunidade-salas-live-widget'

interface ComunidadeSalasMobileProps {
  tenantId: string
}

export async function ComunidadeSalasMobile({ tenantId }: ComunidadeSalasMobileProps) {
  const salas = await listSalasAtivas(tenantId)
  if (salas.length === 0) return null
  return (
    <div className="lg:hidden">
      <ComunidadeSalasLiveWidget salas={salas} />
    </div>
  )
}
