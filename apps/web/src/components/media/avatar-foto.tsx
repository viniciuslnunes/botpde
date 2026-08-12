import type { CSSProperties } from 'react'
import Image from 'next/image'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

interface AvatarFotoProps {
  src: string
  /** Lado do quadrado em px — só dimensiona o `next/image`; o tamanho visual sai do `className`. */
  px: number
  className: string
  alt?: string
  /** Para tamanho calculado em runtime, que não cabe em classe utilitária. */
  style?: CSSProperties
  /** Avatares de provedor externo (OAuth) que recusam Referer. */
  referrerPolicy?: 'no-referrer'
}

/**
 * Foto de avatar já existente, otimizada quando dá.
 *
 * Só a **foto**: quem chama continua dono do fallback (inicial, cor de accent,
 * ring), que varia demais entre as telas para caber no `<Avatar>` de
 * `components/portal/avatar.tsx` — use aquele quando o fallback padrão servir.
 *
 * URL de host fora de `remotePatterns` (avatar de provedor OAuth) não passa pelo
 * `next/image`: cai no `<img>`, que é o motivo do disable aqui e não espalhado
 * por cada tela.
 */
export function AvatarFoto({
  src,
  px,
  className,
  alt = '',
  style,
  referrerPolicy,
}: AvatarFotoProps) {
  if (canOptimizeImageUrl(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        width={px}
        height={px}
        referrerPolicy={referrerPolicy}
        className={className}
        style={style}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- host não otimizável
    <img
      src={src}
      alt={alt}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      referrerPolicy={referrerPolicy}
      className={className}
      style={style}
    />
  )
}
