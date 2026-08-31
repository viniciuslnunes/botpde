'use client'

import Image from 'next/image'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

export function MemoriaFoto({
  src,
  alt,
  className,
  sizes = '(max-width: 640px) 33vw, 160px',
}: {
  src: string
  alt: string
  className?: string
  sizes?: string
}) {
  const fit = className ?? 'object-cover'
  if (canOptimizeImageUrl(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} className={fit} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`absolute inset-0 h-full w-full ${fit}`} />
}
