'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import { Loader2 } from 'lucide-react'
import type { SalaPopoutClient } from '@/components/portal/sala-popout-client'

const SalaPopoutClientLazy = dynamic(
  () => import('@/components/portal/sala-popout-client').then((mod) => mod.SalaPopoutClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    ),
  },
)

export function SalaPopoutShell(props: ComponentProps<typeof SalaPopoutClient>) {
  return <SalaPopoutClientLazy {...props} />
}
