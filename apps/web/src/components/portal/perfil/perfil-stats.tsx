import Link from 'next/link'

interface PerfilStatsProps {
  userId: string
  publicacoes: number
  seguidores: number
  seguindo: number
  podeVerRede: boolean
}

function formatarNumero(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`
  }
  return String(n)
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
        <span className="text-lg font-bold text-[rgb(var(--foreground))] tabular-nums">
          {formatarNumero(valor)}
        </span>
        <span className="text-xs text-[rgb(var(--foreground-muted))]">{label}</span>
      </>
    )
    const base = 'flex flex-1 flex-col items-center gap-0.5 py-1'
    if (href && podeVerRede) {
      return (
        <Link href={href} className={`${base} rounded-lg transition-colors hover:bg-[rgb(var(--background-subtle))]`}>
          {inner}
        </Link>
      )
    }
    return <div className={base}>{inner}</div>
  }

  return (
    <div className="card-soft flex items-stretch divide-x divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-3">
      {stat(publicacoes, publicacoes === 1 ? 'publicação' : 'publicações')}
      {stat(seguidores, seguidores === 1 ? 'seguidor' : 'seguidores', `/portal/comunidade/perfil/${userId}/seguidores`)}
      {stat(seguindo, 'seguindo', `/portal/comunidade/perfil/${userId}/seguindo`)}
    </div>
  )
}
