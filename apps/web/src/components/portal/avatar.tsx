import Image from 'next/image'
import { canOptimizeImageUrl, durableImageUrl } from '@/lib/optimizable-image'

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-xl sm:h-24 sm:w-24',
} as const

const PIXELS = {
  xs: 28,
  sm: 36,
  md: 40,
  lg: 48,
  xl: 96,
} as const

export type AvatarSize = keyof typeof SIZES

interface AvatarProps {
  nome: string | null
  avatarUrl?: string | null
  size?: AvatarSize
  className?: string
  /** cover (padrão) para fotos; contain para logos de grupo/torcida. */
  fit?: 'cover' | 'contain'
}

function inicial(nome: string | null): string {
  return (nome?.trim()?.charAt(0) ?? 'M').toUpperCase()
}

/**
 * Avatar circular consistente da comunidade: foto quando existe, senão a inicial
 * sobre a cor primária do tenant. Sem hooks — usável em Server e Client Components.
 */
export function Avatar({ nome, avatarUrl, size = 'md', className, fit = 'cover' }: AvatarProps) {
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${SIZES[size]}`
  const px = PIXELS[size]
  const objectFit = fit === 'contain' ? 'object-contain bg-[rgb(var(--background-subtle))]' : 'object-cover'
  // Não pedir anexo Discord expirado — cai na inicial sem 404 no console.
  const src = durableImageUrl(avatarUrl)

  if (src && canOptimizeImageUrl(src)) {
    return (
      <Image
        src={src}
        alt={nome ?? 'Membro'}
        width={px}
        height={px}
        quality={90}
        className={[base, objectFit, className ?? ''].join(' ')}
      />
    )
  }

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={nome ?? 'Membro'}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={[base, objectFit, className ?? ''].join(' ')}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={[
        base,
        'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
        className ?? '',
      ].join(' ')}
    >
      {inicial(nome)}
    </span>
  )
}
