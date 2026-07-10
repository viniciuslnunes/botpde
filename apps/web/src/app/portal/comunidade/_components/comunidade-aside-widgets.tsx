import Link from 'next/link'
import { Newspaper, Users } from 'lucide-react'
import { getNoticiasAprovadas } from '@/lib/noticias'
import { getSugestoesAutoresParaAside } from '@/lib/feed'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'

interface ComunidadeAsideWidgetsProps {
  tenantId: string
  afiliacaoId: string | null
  currentUserId?: string
}

export async function ComunidadeAsideWidgets({
  tenantId,
  afiliacaoId,
  currentUserId,
}: ComunidadeAsideWidgetsProps) {
  const [noticias, sugestoes] = await Promise.all([
    afiliacaoId ? getNoticiasAprovadas(afiliacaoId) : Promise.resolve([]),
    currentUserId
      ? getSugestoesAutoresParaAside(tenantId, currentUserId)
      : Promise.resolve([] as Array<{ id: string; nome: string | null; avatarUrl: string | null }>),
  ])

  return (
    <>
      {noticias.length > 0 && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Newspaper className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            Do seu time
          </h2>
          <div className="mt-3 space-y-2.5">
            {noticias.slice(0, 4).map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <p className="line-clamp-2 text-xs font-medium text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))]">
                  {n.titulo}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                  {n.fonte}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {sugestoes.length > 0 && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Users className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            Para seguir
          </h2>
          <div className="mt-3 space-y-3">
            {sugestoes.map((autor) => (
              <div key={autor.id} className="flex items-center gap-2">
                <Link href={`/portal/comunidade/perfil/${autor.id}`}>
                  <Avatar nome={autor.nome} avatarUrl={autor.avatarUrl} size="sm" />
                </Link>
                <Link
                  href={`/portal/comunidade/perfil/${autor.id}`}
                  className="min-w-0 flex-1 truncate text-xs font-medium text-[rgb(var(--foreground))] hover:underline"
                >
                  {autor.nome ?? 'Membro'}
                </Link>
                <SeguimentoButtons
                  mode="follow"
                  userId={autor.id}
                  status={null}
                  isSelf={autor.id === currentUserId}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
