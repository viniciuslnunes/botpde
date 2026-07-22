'use client'

import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadeSalasPanel } from '@/components/portal/comunidade-salas-panel'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasLiveWidgetProps {
  salas: SalaAtivaListItem[]
  limite?: number
}

export function ComunidadeSalasLiveWidget({ salas, limite = 4 }: ComunidadeSalasLiveWidgetProps) {
  if (salas.length === 0) return null

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSnappy}
    >
      <ComunidadeSalasPanel
        salas={salas}
        titulo="Ao vivo agora"
        limite={limite}
        mostrarQuandoVazio={false}
      />
    </m.div>
  )
}
