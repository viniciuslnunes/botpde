'use client'

import Image from 'next/image'
import { Newspaper } from 'lucide-react'
import { canOptimizeImageUrl, isDurableRemoteImageUrl } from '@/lib/optimizable-image'

type NoticiasCapaThumbProps = {
  url: string | null
  alt: string
  className?: string
  sizes?: string
  /** Quando true, o pai precisa `position: relative` e altura definida. */
  fill?: boolean
}

export function NoticiasCapaThumb({
  url,
  alt,
  className = '',
  sizes = '(max-width: 768px) 40vw, 200px',
  fill = false,
}: NoticiasCapaThumbProps) {
  const placeholder = (
    <div
      className={[
        'flex items-center justify-center bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
        fill ? 'absolute inset-0' : 'h-full w-full',
        className,
      ].join(' ')}
      aria-hidden={!alt}
    >
      <Newspaper className="h-8 w-8 opacity-40" />
    </div>
  )

  if (!url || !isDurableRemoteImageUrl(url)) {
    return placeholder
  }

  if (canOptimizeImageUrl(url)) {
    return (
      <Image
        src={url}
        alt={alt}
        fill={fill}
        width={fill ? undefined : 320}
        height={fill ? undefined : 200}
        sizes={sizes}
        className={['object-cover', className].filter(Boolean).join(' ')}
      />
    )
  }

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- host fora do remotePatterns
      <img src={url} alt={alt} className={['h-full w-full object-cover', className].join(' ')} />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- host fora do remotePatterns
    <img
      src={url}
      alt={alt}
      className={['h-full w-full object-cover', className].join(' ')}
      loading="lazy"
    />
  )
}
