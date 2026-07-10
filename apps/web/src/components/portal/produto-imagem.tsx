'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { resolveProdutoImagemUrl } from '@/lib/produto-imagem'

type ProdutoImagemVariant = 'card' | 'detail' | 'thumb' | 'mini' | 'admin'

const VARIANT: Record<
  ProdutoImagemVariant,
  { wrapper: string; img: string; icon: string }
> = {
  card: {
    wrapper: 'aspect-[4/3] w-full bg-[rgb(var(--background-subtle))]',
    img: 'h-full w-full object-contain transition-transform group-hover:scale-105',
    icon: 'h-12 w-12',
  },
  admin: {
    wrapper: 'h-40 w-full bg-[rgb(var(--background-subtle))]',
    img: 'h-full w-full object-contain',
    icon: 'h-10 w-10',
  },
  detail: {
    wrapper: 'aspect-square w-full bg-[rgb(var(--background-subtle))] lg:aspect-auto lg:min-h-[24rem]',
    img: 'h-full w-full object-contain',
    icon: 'h-16 w-16',
  },
  thumb: {
    wrapper: 'h-16 w-16 shrink-0 rounded-xl bg-[rgb(var(--background-subtle))]',
    img: 'h-full w-full rounded-xl object-cover',
    icon: 'h-7 w-7',
  },
  mini: {
    wrapper: 'h-8 w-8 shrink-0 rounded-lg bg-[rgb(var(--background-subtle))]',
    img: 'h-full w-full rounded-lg object-cover',
    icon: 'h-4 w-4',
  },
}

interface ProdutoImagemProps {
  src: string | null | undefined
  alt: string
  variant?: ProdutoImagemVariant
  className?: string
}

export function ProdutoImagem({ src, alt, variant = 'card', className }: ProdutoImagemProps) {
  const resolved = resolveProdutoImagemUrl(src)
  const [failed, setFailed] = useState(false)
  const styles = VARIANT[variant]
  const showPlaceholder = !resolved || failed

  useEffect(() => {
    setFailed(false)
  }, [resolved])

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {showPlaceholder ? (
        <div className="flex h-full w-full items-center justify-center">
          <ShoppingBag className={[styles.icon, 'text-[rgb(var(--foreground-muted))]'].join(' ')} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={resolved}
          src={resolved}
          alt={alt}
          className={styles.img}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
