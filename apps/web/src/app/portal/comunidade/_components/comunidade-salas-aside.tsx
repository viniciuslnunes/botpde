import { ComunidadeSalasPanel } from '@/components/portal/comunidade-salas-panel'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasAsideProps {
  salas: SalaAtivaListItem[]
}

export function ComunidadeSalasAside({ salas }: ComunidadeSalasAsideProps) {
  return <ComunidadeSalasPanel salas={salas} />
}
