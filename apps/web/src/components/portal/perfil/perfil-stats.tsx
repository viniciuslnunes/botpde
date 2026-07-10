import Link from 'next/link'

interface PerfilStatsProps {
  userId: string
  publicacoes: number
  seguidores: number
  seguindo: number
  podeVerRede: boolean
}

export function PerfilStats({
  userId,
  publicacoes,
  seguidores,
  seguindo,
  podeVerRede,
}: PerfilStatsProps) {
  const stat = (valor: number, label: string, href?: string) => {
    const inner = (
      <>
        <span className="font-bold text-[rgb(var(--foreground))]">{valor}</span>
        <span className="text-[rgb(var(--foreground-muted))]">{label}</span>
      </>
    )
    if (href && podeVerRede) {
      return (
        <Link href={href} className="flex items-center gap-1 text-sm transition-colors hover:text-[rgb(var(--primary))]">
          {inner}
        </Link>
      )
    }
    return <div className="flex items-center gap-1 text-sm">{inner}</div>
  }

  return (
    <div className="flex flex-wrap gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      {stat(publicacoes, publicacoes === 1 ? 'publicação' : 'publicações')}
      {stat(seguidores, 'seguidores', `/portal/comunidade/perfil/${userId}/seguidores`)}
      {stat(seguindo, 'seguindo', `/portal/comunidade/perfil/${userId}/seguindo`)}
    </div>
  )
}
