'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ShoppingBag } from 'lucide-react'
import { resolveProdutoImagens } from '@/lib/produto-imagem'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

const CARD_IMG_CLASS =
  'object-cover object-[center_18%] transition-opacity duration-300'

interface ProdutoCardImagemProps {
  imagensUrl: string[]
  alt: string
  className?: string
}

function ProdutoImg({
  src,
  alt,
  visible,
  onError,
  onLoad,
}: {
  src: string
  alt: string
  visible: boolean
  onError: () => void
  onLoad: () => void
}) {
  if (canOptimizeImageUrl(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 50vw, 33vw"
        className={[CARD_IMG_CLASS, visible ? 'opacity-100' : 'opacity-0'].join(' ')}
        referrerPolicy="no-referrer"
        onError={onError}
        onLoad={onLoad}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={['absolute inset-0 h-full w-full', CARD_IMG_CLASS, visible ? 'opacity-100' : 'opacity-0'].join(' ')}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={onError}
      onLoad={onLoad}
    />
  )
}

export function ProdutoCardImagem({ imagensUrl, alt, className }: ProdutoCardImagemProps) {
  const imagens = resolveProdutoImagens(imagensUrl)
  const [hover, setHover] = useState(false)
  const [failed, setFailed] = useState<Set<number>>(() => new Set())
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set())

  const frente = imagens[0]
  const verso = imagens[1]
  const showVerso = hover && verso && !failed.has(1)
  const frenteReady = loaded.has(0) || failed.has(0)
  const showPlaceholder = frente && !frenteReady && !failed.has(0)

  if (!frente || failed.has(0)) {
    return (
      <div
        className={[
          'relative aspect-square w-full overflow-hidden bg-[rgb(var(--background-subtle))]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex h-full w-full items-center justify-center">
          <ShoppingBag className="h-12 w-12 text-[rgb(var(--foreground-muted))]" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        'relative aspect-square w-full overflow-hidden bg-[rgb(var(--background-subtle))]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {showPlaceholder && (
        <div
          className="absolute inset-0 animate-pulse bg-[rgb(var(--border)_/_0.45)]"
          aria-hidden
        />
      )}
      <ProdutoImg
        src={frente}
        alt={alt}
        visible={!showVerso}
        onError={() => setFailed((s) => new Set(s).add(0))}
        onLoad={() => setLoaded((s) => new Set(s).add(0))}
      />
      {verso && (
        <ProdutoImg
          src={verso}
          alt={`${alt} — verso`}
          visible={!!showVerso}
          onError={() => setFailed((s) => new Set(s).add(1))}
          onLoad={() => setLoaded((s) => new Set(s).add(1))}
        />
      )}
      {verso && !failed.has(1) && (
        <span
          className={[
            'pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white transition-opacity',
            hover ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          Verso
        </span>
      )}
    </div>
  )
}
