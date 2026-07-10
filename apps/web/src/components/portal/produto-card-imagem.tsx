'use client'

import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { resolveProdutoImagens } from '@/lib/produto-imagem'

/** Fundo claro — combina com fotos oficiais da loja Gaviões (fundo bege/branco). */
const CARD_IMG_SURFACE = 'bg-[#ececec]'

const CARD_IMG_CLASS =
  'absolute inset-0 h-full w-full object-cover object-[center_18%] transition-opacity duration-300'

interface ProdutoCardImagemProps {
  imagensUrl: string[]
  alt: string
  className?: string
}

export function ProdutoCardImagem({ imagensUrl, alt, className }: ProdutoCardImagemProps) {
  const imagens = resolveProdutoImagens(imagensUrl)
  const [hover, setHover] = useState(false)
  const [failed, setFailed] = useState<Set<number>>(() => new Set())

  const frente = imagens[0]
  const verso = imagens[1]
  const showVerso = hover && verso && !failed.has(1)

  if (!frente || failed.has(0)) {
    return (
      <div
        className={[
          'relative aspect-square w-full overflow-hidden',
          CARD_IMG_SURFACE,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--background-subtle))]">
          <ShoppingBag className="h-12 w-12 text-[rgb(var(--foreground-muted))]" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        'relative aspect-square w-full overflow-hidden',
        CARD_IMG_SURFACE,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frente}
        alt={alt}
        className={[CARD_IMG_CLASS, showVerso ? 'opacity-0' : 'opacity-100'].join(' ')}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed((s) => new Set(s).add(0))}
      />
      {verso && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={verso}
          alt={`${alt} — verso`}
          className={[CARD_IMG_CLASS, showVerso ? 'opacity-100' : 'opacity-0'].join(' ')}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed((s) => new Set(s).add(1))}
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
