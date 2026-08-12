import { ComunidadeSalasPanel } from '@/components/portal/comunidade-salas-panel'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasAsideProps {
  salas: SalaAtivaListItem[]
  /** Sufixo `?escopo=` do chrome — sem ele "Ver salas" cai no escopo default. */
  sufixoEscopo?: string
}

export function ComunidadeSalasAside({ salas, sufixoEscopo = '' }: ComunidadeSalasAsideProps) {
  return <ComunidadeSalasPanel salas={salas} footerHref={`/portal/comunidade/salas${sufixoEscopo}`} />
}
