import { Globe, Users } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { formatNomeAfiliacao } from '@torcida/types'

type Props = {
  nome: string
  apelido: string | null
  escudoUrl: string | null
  /** Torcidas organizadas do clube na plataforma (opcional). */
  torcidasCount?: number | null
}

/**
 * Banner da Comunidade Nacional — mesmo cromo do mural de Sede/unidade
 * (escudo + nome + badge + metadados), sem Chat (a CN não é um canal).
 */
export function ComunidadeNacionalBanner({
  nome,
  apelido,
  escudoUrl,
  torcidasCount = null,
}: Props) {
  const titulo = formatNomeAfiliacao(apelido || nome)

  return (
    <header className="card-soft flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <Avatar nome={titulo} avatarUrl={escudoUrl} size="sm" fit="contain" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h1 className="truncate text-sm font-bold text-[rgb(var(--foreground))]">{titulo}</h1>
          <span className="inline-flex shrink-0 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
            Nacional
          </span>
        </div>
        <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
          {typeof torcidasCount === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {torcidasCount} torcida{torcidasCount === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" />
              Comunidade do clube
            </span>
          )}
          {' · '}
          Publicações públicas das torcidas na plataforma
        </p>
      </div>
    </header>
  )
}
