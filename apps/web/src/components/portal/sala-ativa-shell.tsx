'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import { Loader2 } from 'lucide-react'
import type { SalaAtivaClient } from '@/components/portal/sala-ativa-client'

const SalaAtivaClientLazy = dynamic(
  () => import('@/components/portal/sala-ativa-client').then((mod) => mod.SalaAtivaClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--foreground-muted))]" />
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Carregando sala…</p>
      </div>
    ),
  },
)

export function SalaAtivaShell(props: ComponentProps<typeof SalaAtivaClient>) {
  return <SalaAtivaClientLazy {...props} />
}
