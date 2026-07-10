import { ComunidadeSalasPanel } from '@/components/portal/comunidade-salas-panel'
import { listSalasAtivas } from '@/lib/salas'

interface ComunidadeSalasAsideProps {
  tenantId: string
}

export async function ComunidadeSalasAside({ tenantId }: ComunidadeSalasAsideProps) {
  const salas = await listSalasAtivas(tenantId)
  return <ComunidadeSalasPanel salas={salas} />
}
