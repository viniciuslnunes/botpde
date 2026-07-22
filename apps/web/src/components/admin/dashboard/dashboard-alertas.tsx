'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface DashboardAlerta {
  href: string
  label: string
  variant: 'yellow' | 'red' | 'orange'
}

const ALERTA_CLASS: Record<DashboardAlerta['variant'], string> = {
  yellow:
    'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  orange:
    'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200',
}

/** Alertas operacionais do topo do dashboard (pendências, carteirinhas). */
export function DashboardAlertas({ alertas }: { alertas: DashboardAlerta[] }) {
  if (alertas.length === 0) return null

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
      {alertas.map((a) => (
        <m.div key={a.label} variants={staggerItem} whileTap={{ scale: 0.99 }} transition={springSnappy}>
          <Link
            href={a.href}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm hover:brightness-95 ${ALERTA_CLASS[a.variant]}`}
          >
            <span className="flex items-center gap-2 font-medium">{a.label}</span>
            <ArrowRight className="h-4 w-4 opacity-70" aria-hidden />
          </Link>
        </m.div>
      ))}
    </m.div>
  )
}
