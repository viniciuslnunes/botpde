'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { detectarEscudoCircular } from '@/lib/escudo-forma'

export const LOGO_MINIATURA_PX = 32

type Props = {
  src: string
  alt: string
  /**
   * - `auto` (default): máscara circular só se `detectarEscudoCircular` (badge com fundo opaco)
   * - `circle`: sempre círculo 32×32 — barra de tabs (mesmo tamanho visual para clube e torcidas)
   */
  shape?: 'auto' | 'circle'
  /** Arredondamento quando shape=auto e NÃO é circular (ex.: header `rounded-lg`). */
  rounded?: string
  className?: string
}

/**
 * Miniatura 32×32 travada por style inline (não usa next/image).
 * Tabs: `shape="circle"` — todos no mesmo círculo.
 * Header: `shape="auto"` — máscara só em badge com fundo assado.
 */
export function LogoMiniatura({
  src,
  alt,
  shape = 'auto',
  rounded = '',
  className,
}: Props) {
  const [circularDetectado, setCircularDetectado] = useState(shape === 'circle')

  useEffect(() => {
    if (shape === 'circle') {
      setCircularDetectado(true)
      return
    }
    let ativo = true
    setCircularDetectado(false)
    void detectarEscudoCircular(src).then((c) => {
      if (ativo) setCircularDetectado(c)
    })
    return () => {
      ativo = false
    }
  }, [src, shape])

  const circular = shape === 'circle' || circularDetectado

  const boxStyle: CSSProperties = {
    width: LOGO_MINIATURA_PX,
    height: LOGO_MINIATURA_PX,
    minWidth: LOGO_MINIATURA_PX,
    minHeight: LOGO_MINIATURA_PX,
    maxWidth: LOGO_MINIATURA_PX,
    maxHeight: LOGO_MINIATURA_PX,
    position: 'relative',
    display: 'block',
    overflow: 'hidden',
    flexShrink: 0,
    boxSizing: 'border-box',
    lineHeight: 0,
    fontSize: 0,
    borderRadius: circular ? '50%' : undefined,
  }

  const imgStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LOGO_MINIATURA_PX,
    height: LOGO_MINIATURA_PX,
    maxWidth: LOGO_MINIATURA_PX,
    maxHeight: LOGO_MINIATURA_PX,
    // contain: cabe no disco sem cortar o escudo; o círculo 32×32 iguala o tamanho.
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
      {/* eslint-disable-next-line @next/next/no-img-element -- tamanho fixo por style */}
      <img
        src={src}
        alt={alt}
        width={LOGO_MINIATURA_PX}
        height={LOGO_MINIATURA_PX}
        decoding="async"
        style={imgStyle}
      />
    </span>
  )
}
