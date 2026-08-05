'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { detectarEscudoCircular } from '@/lib/escudo-forma'

/** Tamanho único da barra de canais / brand do header. */
export const LOGO_MINIATURA_PX = 28

type Props = {
  src: string
  alt: string
  /**
   * - `auto`: máscara circular só se badge com fundo opaco (header)
   * - `circle`: sempre disco preenchido — tabs (mesmo tamanho visual para todos)
   */
  shape?: 'auto' | 'circle'
  rounded?: string
  className?: string
}

/**
 * Miniatura de logo com tamanho fixo.
 *
 * Tabs (`shape="circle"`): usa `background-size: cover` num disco — o escudo
 * do clube e o da torcida ocupam exatamente o mesmo círculo (contain fazia o
 * escudo “cheio” parecer maior que logos altos como Gaviões).
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

  // Tabs: background cover — sem <img>, sem tamanho intrínseco, sem overflow.
  if (shape === 'circle') {
    const safeUrl = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const disco: CSSProperties = {
      width: LOGO_MINIATURA_PX,
      height: LOGO_MINIATURA_PX,
      minWidth: LOGO_MINIATURA_PX,
      minHeight: LOGO_MINIATURA_PX,
      maxWidth: LOGO_MINIATURA_PX,
      maxHeight: LOGO_MINIATURA_PX,
      display: 'block',
      flexShrink: 0,
      boxSizing: 'border-box',
      borderRadius: '50%',
      overflow: 'hidden',
      backgroundImage: `url("${safeUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
    return (
      <span
        role="img"
        aria-label={alt || undefined}
        className={className}
        style={disco}
        title={alt || undefined}
      />
    )
  }

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
    inset: 0,
    width: '100%',
    height: '100%',
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
      {/* eslint-disable-next-line @next/next/no-img-element -- header / auto */}
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
