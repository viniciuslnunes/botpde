'use client'

import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { detectarEscudoCircular, lerCacheEscudoCircular } from '@/lib/escudo-forma'

/** Tamanho único da barra de canais / brand do header. */
export const LOGO_MINIATURA_PX = 32

type Props = {
  src: string
  alt: string
  /**
   * - `auto` (default): máscara circular só se badge com fundo opaco
   *   (Camisa 12, etc.). PNG com alpha (Gaviões, escudo do clube) fica natural.
   * - `circle`: força disco — só quando o caller já sabe que é badge redondo.
   */
  shape?: 'auto' | 'circle'
  rounded?: string
  className?: string
}

/**
 * Miniatura 32×32 com a imagem original (`object-fit: contain`).
 * Só revela o <img> depois da detecção (ou cache). Skeleton no intervalo.
 */
export function LogoMiniatura({
  src,
  alt,
  shape = 'auto',
  rounded = '',
  className,
}: Props) {
  const [circular, setCircular] = useState(shape === 'circle')
  const [pronto, setPronto] = useState(shape === 'circle')

  useLayoutEffect(() => {
    if (shape === 'circle') {
      setCircular(true)
      setPronto(true)
      return
    }
    const hit = lerCacheEscudoCircular(src)
    if (hit !== null) {
      setCircular(hit)
      setPronto(true)
      return
    }
    let ativo = true
    setPronto(false)
    void detectarEscudoCircular(src).then((c) => {
      if (!ativo) return
      setCircular(c)
      setPronto(true)
    })
    return () => {
      ativo = false
    }
  }, [src, shape])

  const boxStyle: CSSProperties = {
    width: LOGO_MINIATURA_PX,
    height: LOGO_MINIATURA_PX,
    minWidth: LOGO_MINIATURA_PX,
    minHeight: LOGO_MINIATURA_PX,
    maxWidth: LOGO_MINIATURA_PX,
    maxHeight: LOGO_MINIATURA_PX,
    position: 'relative',
    display: 'block',
    overflow: circular ? 'hidden' : 'visible',
    flexShrink: 0,
    boxSizing: 'border-box',
    lineHeight: 0,
    fontSize: 0,
    contain: 'size',
    borderRadius: circular ? '50%' : undefined,
  }

  const imgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
    pointerEvents: 'none',
    display: 'block',
  }

  return (
    <span
      className={[className, !circular && rounded ? rounded : ''].filter(Boolean).join(' ')}
      style={boxStyle}
    >
      {pronto ? (
        // eslint-disable-next-line @next/next/no-img-element -- tamanho fixo por style, sem next/image
        <img
          src={src}
          alt={alt}
          width={LOGO_MINIATURA_PX}
          height={LOGO_MINIATURA_PX}
          decoding="async"
          style={imgStyle}
        />
      ) : (
        <span
          aria-hidden
          className="skeleton-track absolute inset-0 animate-pulse rounded-full"
        />
      )}
    </span>
  )
}
