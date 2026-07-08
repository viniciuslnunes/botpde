const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const

export type AvatarSize = keyof typeof SIZES

interface AvatarProps {
  nome: string | null
  avatarUrl?: string | null
  size?: AvatarSize
  className?: string
}

function inicial(nome: string | null): string {
  return (nome?.trim()?.charAt(0) ?? 'M').toUpperCase()
}

/**
 * Avatar circular consistente da comunidade: foto quando existe, senão a inicial
 * sobre a cor primária do tenant. Sem hooks — usável em Server e Client Components.
 */
export function Avatar({ nome, avatarUrl, size = 'md', className }: AvatarProps) {
  const base = `inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]}`
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={nome ?? 'Membro'}
        className={[base, 'object-cover', className ?? ''].join(' ')}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={[
        base,
        'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]',
        className ?? '',
      ].join(' ')}
    >
      {inicial(nome)}
    </span>
  )
}
