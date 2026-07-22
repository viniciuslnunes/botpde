'use client'

import { useCallback, useRef, type ComponentProps } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type PrefetchLinkProps = ComponentProps<typeof Link>

/** Link com prefetch no hover/focus — padrão da navbar do portal. */
export function ComunidadePrefetchLink({ href, onMouseEnter, onFocus, ...rest }: PrefetchLinkProps) {
  const router = useRouter()
  const prefetched = useRef(false)

  const prefetchOnIntent = useCallback(() => {
    if (prefetched.current) return
    prefetched.current = true
    const path = typeof href === 'string' ? href : href.pathname ?? ''
    if (path) void router.prefetch(path)
  }, [href, router])

  const { className, ...linkProps } = rest

  return (
    <Link
      href={href}
      prefetch={false}
      data-cursor-action=""
      onMouseEnter={(e) => {
        prefetchOnIntent()
        onMouseEnter?.(e)
      }}
      onFocus={(e) => {
        prefetchOnIntent()
        onFocus?.(e)
      }}
      className={['cursor-pointer', className].filter(Boolean).join(' ')}
      {...linkProps}
    />
  )
}
