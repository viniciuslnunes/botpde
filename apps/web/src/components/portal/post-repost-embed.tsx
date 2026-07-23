import Link from 'next/link'
import { Avatar } from './avatar'
import { ExpandableText } from './expandable-text'
import { PostMedia } from './post-media'
import {
  ensureSocialEmbedInMidias,
  stripEmbeddedSocialUrls,
} from '@/lib/social-embed'
import type { PostOrigemEmbed } from '@/lib/feed'

interface PostRepostEmbedProps {
  origem: PostOrigemEmbed
}

export function PostRepostEmbed({ origem }: PostRepostEmbedProps) {
  if (origem.oculto) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-4 text-sm text-[rgb(var(--foreground-muted))]">
        Publicação original indisponível.
      </div>
    )
  }

  // Espelha FeedPostCard: midias (incl. social no texto) + strip para não duplicar URL.
  const midias = ensureSocialEmbedInMidias(origem.conteudo, origem.midiaUrls)
  const conteudoVisivel = stripEmbeddedSocialUrls(origem.conteudo, midias)

  return (
    <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <Avatar nome={origem.autor.nome} avatarUrl={origem.autor.avatarUrl} size="xs" />
        <div className="min-w-0">
          <Link
            href={`/portal/comunidade/perfil/${origem.autor.id}`}
            className="block truncate text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:text-[rgb(var(--color-primary-fg))]"
          >
            {origem.autor.nome ?? 'Membro'}
          </Link>
          {origem.autor.nickname && (
            <Link
              href={`/portal/comunidade/perfil/${origem.autor.id}`}
              className="block truncate text-[11px] text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              @{origem.autor.nickname}
            </Link>
          )}
        </div>
      </div>
      {conteudoVisivel ? (
        <ExpandableText
          conteudo={conteudoVisivel}
          lines={4}
          className="whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--foreground))]"
        />
      ) : null}
      {midias.length > 0 ? (
        <PostMedia urls={midias} caption={origem.conteudo} />
      ) : null}
    </div>
  )
}
