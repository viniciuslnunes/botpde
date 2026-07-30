'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { SalaAtivaClient } from '@/components/portal/sala-ativa-client'
import { SalaAtivaSkeleton } from '@/components/portal/sala-ativa-skeleton'

const SalaAtivaClientLazy = dynamic(
  () => import('@/components/portal/sala-ativa-client').then((mod) => mod.SalaAtivaClient),
  {
    ssr: false,
    loading: () => <SalaAtivaSkeleton />,
  },
)

export function SalaAtivaShell(props: ComponentProps<typeof SalaAtivaClient>) {
  return <SalaAtivaClientLazy {...props} />
}
