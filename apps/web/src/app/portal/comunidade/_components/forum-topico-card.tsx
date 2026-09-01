'use client'

import { ensureSocialEmbedInMidias, stripEmbeddedSocialUrls } from '@/lib/social-embed'
import { formatRelative } from '@/lib/format-datetime'
import { editarTopico } from '../praca-actions'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { Avatar } from '@/components/portal/avatar'
import { PostMedia } from '@/components/portal/post-media'
import {
  PostEditProvider,
  PostEditableMidia,
  PostEditableTexto,
} from '@/components/portal/post-edit-provider'
import { ExpandableText } from '@/components/portal/expandable-text'
import { ForumTopicoMenu } from './forum-topico-menu'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

export function ForumTopicoCard({
  topico,
  escopo,
  isAuthor,
}: {
  topico: {
    id: string
    titulo: string
    corpo: string
    midiaUrls: string[]
    criadoEm: Date
    autorId: string
    autorNome: string | null
    autorNickname: string | null
    autorAvatarUrl: string | null
  }
  escopo: EscopoComunidade
  isAuthor: boolean
}) {
  const midias = ensureSocialEmbedInMidias(topico.corpo, topico.midiaUrls)
  const conteudoVisivel = stripEmbeddedSocialUrls(topico.corpo, midias)
  const perfilHref = `/portal/comunidade/perfil/${topico.autorId}`

  return (
    <article className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <PostEditProvider
        postId={topico.id}
        conteudo={topico.corpo}
        midiaUrls={topico.midiaUrls}
        podeEditar={isAuthor}
        escopoMencao={escopo === 'nacional' ? 'nacional' : undefined}
        salvarFn={(id, conteudo, anexos) => editarTopico(id, conteudo, anexos, escopo)}
      >
        <header className="flex items-center gap-3">
          <ComunidadePrefetchLink href={perfilHref}>
            <Avatar nome={topico.autorNome} avatarUrl={topico.autorAvatarUrl} size="md" />
          </ComunidadePrefetchLink>
          <div className="min-w-0 flex-1">
            <ComunidadePrefetchLink
              href={perfilHref}
              className="text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:text-[rgb(var(--color-primary-fg))]"
            >
              {topico.autorNome ?? 'Alguém'}
            </ComunidadePrefetchLink>
            {topico.autorNickname && (
              <ComunidadePrefetchLink
                href={perfilHref}
                className="block truncate text-xs text-[rgb(var(--foreground-muted))]"
              >
                @{topico.autorNickname}
              </ComunidadePrefetchLink>
            )}
            <time
              dateTime={new Date(topico.criadoEm).toISOString()}
              className="text-xs text-[rgb(var(--foreground-muted))]"
              suppressHydrationWarning
            >
              {formatRelative(topico.criadoEm)}
            </time>
          </div>
          <ForumTopicoMenu topicoId={topico.id} escopo={escopo} isAutor={isAuthor} />
        </header>

        {topico.titulo ? (
          <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">{topico.titulo}</h3>
        ) : null}

        <PostEditableTexto>
          {conteudoVisivel ? (
            <ExpandableText
              conteudo={conteudoVisivel}
              lines={8}
              className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
            />
          ) : null}
        </PostEditableTexto>

        {midias.length > 0 ? (
          <PostEditableMidia>
            <PostMedia urls={midias} caption={conteudoVisivel} />
          </PostEditableMidia>
        ) : (
          <PostEditableMidia>{null}</PostEditableMidia>
        )}
      </PostEditProvider>
    </article>
  )
}
