'use client'

import { useEffect, useState } from 'react'
import { detectarEscudoCircular } from '@/lib/escudo-forma'
import { bboxConteudoOpaco, destinoContain } from '@/lib/logo-miniatura-fit'
import './logo-miniatura.css'

/** Tamanho único da barra de canais / brand do header. */
export const LOGO_MINIATURA_PX = 32
const FIT_PADDING_PX = 2

type Props = {
  src: string
  alt: string
  /**
   * - `auto`: máscara circular só se badge com fundo opaco (header)
   * - `circle`: sempre disco — tabs (mesmo frame para clube e canais)
   */
  shape?: 'auto' | 'circle'
  rounded?: string
  className?: string
}

function carregarImagem(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('img-load'))
    img.src = src
  })
}

async function bitmapSameOrigin(src: string): Promise<HTMLImageElement> {
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
    if (!res.ok) throw new Error('fetch')
    const blob = await res.blob()
    const obj = URL.createObjectURL(blob)
    try {
      return await carregarImagem(obj)
    } finally {
      URL.revokeObjectURL(obj)
    }
  } catch {
    return carregarImagem(src, 'anonymous')
  }
}

/**
 * Recorta padding transparente e redesenha contain em `size`×`size`.
 * Null se CORS impedir leitura de pixels — o <img> original ainda cabe no box.
 */
async function normalizarMiniatura(src: string, size: number): Promise<string | null> {
  try {
    const img = await bitmapSameOrigin(src)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) return null

    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    let bbox
    try {
      bbox = bboxConteudoOpaco(ctx.getImageData(0, 0, w, h).data, w, h)
    } catch {
      return null
    }
    if (!bbox) return null

    const out = document.createElement('canvas')
    out.width = size
    out.height = size
    const octx = out.getContext('2d')
    if (!octx) return null
    const d = destinoContain(bbox.w, bbox.h, size, FIT_PADDING_PX)
    octx.clearRect(0, 0, size, size)
    octx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, d.dx, d.dy, d.dw, d.dh)

    const blob = await new Promise<Blob | null>((resolve) => {
      out.toBlob(resolve, 'image/png')
    })
    if (!blob) return null
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

/**
 * Miniatura 32×32 travada por CSS (`contain: size` + !important).
 * Tabs e header compartilham o mesmo box; o fit recorta alpha para o
 * escudo full-bleed do clube não pesar mais que logos altos (Gaviões).
 */
export function LogoMiniatura({
  src,
  alt,
  shape = 'auto',
  rounded = '',
  className,
}: Props) {
  const [fittedSrc, setFittedSrc] = useState<string | null>(null)
  const [circularDetectado, setCircularDetectado] = useState(shape === 'circle')

  useEffect(() => {
    let ativo = true
    let created: string | null = null
    setFittedSrc(null)
    void normalizarMiniatura(src, LOGO_MINIATURA_PX).then((url) => {
      if (!ativo) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      created = url
      setFittedSrc(url)
    })
    return () => {
      ativo = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [src])

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
  const boxClass = [
    'logo-miniatura',
    circular ? 'logo-miniatura--circle' : '',
    !circular && rounded ? rounded : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={boxClass} data-logo-miniatura={LOGO_MINIATURA_PX}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tamanho travado em CSS, sem next/image */}
      <img
        src={fittedSrc ?? src}
        alt={alt}
        width={LOGO_MINIATURA_PX}
        height={LOGO_MINIATURA_PX}
        decoding="async"
      />
    </span>
  )
}
