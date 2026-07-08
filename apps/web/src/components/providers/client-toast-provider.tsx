'use client'

import dynamic from 'next/dynamic'

export const ClientToastProvider = dynamic(
  () => import('@torcida/ui').then((mod) => mod.ToastProvider),
  { ssr: false },
)
