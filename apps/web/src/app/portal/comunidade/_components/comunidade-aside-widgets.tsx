import Link from 'next/link'
import { Newspaper, Users, Hash, Calendar } from 'lucide-react'
import { getNoticiasAprovadas } from '@/lib/noticias'
import { getProximoEvento } from '@/lib/eventos'
import { getSugestoesAutoresParaAside, getHashtagsEmAlta, type SugestaoAutorAside } from '@/lib/feed'
import type { SalaAtivaListItem } from '@/lib/salas'
import { formatRelative } from '@/lib/format-datetime'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { ComunidadeSalasLiveWidget } from '@/components/portal/comunidade-salas-live-widget'
import { MotionReveal } from '@/components/motion/motion-reveal'

interface ComunidadeAsideWidgetsProps {
  tenantId: string
  afiliacaoId: string | null
  currentUserId?: string
  salasAoVivo?: SalaAtivaListItem[]
}

export async function ComunidadeAsideWidgets({
  tenantId,
  afiliacaoId,
  currentUserId,
  salasAoVivo = [],
}: ComunidadeAsideWidgetsProps) {
  const [noticias, sugestoes, hashtags, proximoEvento] = await Promise.all([
    afiliacaoId ? getNoticiasAprovadas(afiliacaoId) : Promise.resolve([]),
    currentUserId
      ? getSugestoesAutoresParaAside(tenantId, currentUserId)
      : Promise.resolve([] as SugestaoAutorAside[]),
    getHashtagsEmAlta(tenantId, 5),
    getProximoEvento(tenantId, currentUserId),
  ])

  let widgetIndex = 0

  return (
    <>
      {salasAoVivo.length > 0 && (
        <MotionReveal index={widgetIndex++}>
          <ComunidadeSalasLiveWidget salas={salasAoVivo} />
        </MotionReveal>
      )}
      {proximoEvento && (
        <MotionReveal index={widgetIndex++}>
          <Link
            href={`/portal/eventos/${proximoEvento.id}`}
            className="block rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
              <Calendar className="h-4 w-4 text-[rgb(var(--primary))]" />
              Próximo evento
            </h2>
            <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">
              {proximoEvento.titulo}
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              {formatRelative(proximoEvento.data)}
              {proximoEvento.local && ` · ${proximoEvento.local}`}
            </p>
          </Link>
        </MotionReveal>
      )}

      {noticias.length > 0 && (
        <MotionReveal index={widgetIndex++}>
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
        </MotionReveal>
      )}

      {hashtags.length > 0 && (
        <MotionReveal index={widgetIndex++}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
              <Hash className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              Hashtags em alta
            </h2>
            <p className="mt-0.5 text-[10px] text-[rgb(var(--foreground-muted))]">Últimos 7 dias</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hashtags.map((h) => (
                <Link
                  key={h.tag}
                  href={`/portal/comunidade/hashtag/${encodeURIComponent(h.tag)}`}
                  className="rounded-full bg-[rgb(var(--primary)_/_0.08)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)_/_0.15)]"
                >
                  #{h.tag}
                  <span className="ml-1 text-[10px] opacity-70">{h.total}</span>
                </Link>
              ))}
            </div>
          </div>
        </MotionReveal>
      )}

      {sugestoes.length > 0 && (
        <MotionReveal index={widgetIndex++}>
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
                  {'seguidores' in autor && autor.seguidores > 0 && (
                    <span className="text-[10px] text-[rgb(var(--foreground-muted))]">
                      {autor.seguidores} seg.
                    </span>
                  )}
                  <SeguimentoButtons
                    userId={autor.id}
                    status={null}
                    isSelf={autor.id === currentUserId}
                  />
                </div>
              ))}
            </div>
          </div>
        </MotionReveal>
      )}
    </>
  )
}
