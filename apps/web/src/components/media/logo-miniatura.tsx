'use client'

import type { CSSProperties } from 'react'

export const LOGO_MINIATURA_PX = 32

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
}

const imgStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: LOGO_MINIATURA_PX,
  height: LOGO_MINIATURA_PX,
  maxWidth: LOGO_MINIATURA_PX,
  maxHeight: LOGO_MINIATURA_PX,
  objectFit: 'contain',
  objectPosition: 'center',
  pointerEvents: 'none',
}

type Props = {
  src: string
  alt: string
  /** Classes extras no box (ex.: rounded-lg no header). */
  className?: string
}

/**
 * Logo 32×32 travado por style inline.
 * Não usa next/image nem detecção de forma — evita escudo de clube
 * estourar o tamanho na barra de tabs / header.
 */
export function LogoMiniatura({ src, alt, className }: Props) {
  return (
    <span className={className} style={boxStyle}>
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
