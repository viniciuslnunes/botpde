'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { detectarEscudoCircular } from '@/lib/escudo-forma'

type Props = {
  src: string
  alt: string
  /** Classes de tamanho/posicionamento (sem arredondamento — este componente decide). */
  className: string
  /** Classe de arredondamento quando NÃO é badge circular (ex.: 'rounded-lg'). Default: sem arredondamento. */
  rounded?: string
  /** Usa `fill` do next/image em vez de width/height fixos. Pai precisa de `position: relative`. */
  fill?: boolean
  size?: number
  sizes?: string
  quality?: number
  unoptimized?: boolean
  priority?: boolean
}

/**
 * Renderiza um escudo/logo aplicando a mesma detecção do onboarding
 * (`detectarEscudoCircular`): badges redondos com fundo opaco “assado”
 * (branco, preto ou cor) ganham máscara circular; PNG com alpha nos cantos
 * (fundo transparente) fica natural. Ver `EscudoClube` (onboarding).
 *
 * `size` é resolução da fonte (Next Image / attrs); o tamanho visual vem de
 * `className` (ex.: `h-7 w-7`) — não aplicar style width/height com `size`.
 */
export function LogoImage({
  src,
  alt,
  className,
  rounded = '',
  fill = false,
  size,
  sizes,
  quality,
  unoptimized,
  priority,
}: Props) {
  const [circular, setCircular] = useState(false)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let ativo = true
    setPronto(false)
    setCircular(false)
    void detectarEscudoCircular(src).then((c) => {
      if (!ativo) return
      setCircular(c)
      setPronto(true)
    })
    return () => {
      ativo = false
    }
  }, [src])

  const masked = pronto && circular
  const radiusClass = masked ? 'rounded-full overflow-hidden' : rounded
  const cls = [className, fill ? 'absolute inset-0 h-full w-full' : '', radiusClass]
    .filter(Boolean)
    .join(' ')

  if (canOptimizeImageUrl(src)) {
    return fill ? (
      <Image
        key={src}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={quality}
        unoptimized={unoptimized}
        priority={priority}
        className={cls}
      />
    ) : (
      <Image
        key={src}
        src={src}
        alt={alt}
        width={size}
        height={size}
        quality={quality}
        unoptimized={unoptimized}
        priority={priority}
        className={cls}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt={alt}
      {...(size != null ? { width: size, height: size } : {})}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={cls}
    />
  )
}
