'use client'

import { useState } from 'react'
import { MediaLightbox } from '@/components/portal/media-lightbox'
import { isDurableRemoteImageUrl } from '@/lib/optimizable-image'

interface PostLegacyImageProps {
  src: string
  caption?: string | null
}

export function PostLegacyImage({ src, caption }: PostLegacyImageProps) {
  const [broken, setBroken] = useState(false)
  const [open, setOpen] = useState(false)
  // Anexo Discord efêmero/expirado — não dispara GET 404.
  if (!isDurableRemoteImageUrl(src) || broken) return null

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="mt-2 max-h-[28rem] w-full cursor-zoom-in rounded-xl border border-[rgb(var(--border))] object-cover"
        loading="lazy"
        decoding="async"
        onClick={() => setOpen(true)}
        onError={() => setBroken(true)}
      />
      {open && (
        <MediaLightbox
          urls={[src]}
          index={0}
          caption={caption}
          onClose={() => setOpen(false)}
          onIndexChange={() => undefined}
        />
      )}
    </>
  )
}
