'use client'

import { useState } from 'react'

interface PostLegacyImageProps {
  src: string
}

export function PostLegacyImage({ src }: PostLegacyImageProps) {
  const [broken, setBroken] = useState(false)
  if (broken) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="mt-3 max-h-[28rem] w-full rounded-xl border border-[rgb(var(--border))] object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  )
}
