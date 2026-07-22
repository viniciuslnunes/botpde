import { Repeat2, Pin, Megaphone } from 'lucide-react'
import { formatRelative } from '@/lib/format-datetime'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { stripEmbeddedSocialUrls } from '@/lib/social-embed'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { Avatar } from './avatar'
import { PostEngagement } from './post-engagement'
import { PostMedia } from './post-media'
import { PostLegacyImage } from './post-legacy-image'
import { FeedPostMenu } from './feed-post-menu'
import { PostConteudoRich } from './post-conteudo-rich'
import { PostPoll } from './post-poll'
import { PostRepostEmbed } from './post-repost-embed'
import { PostComunicadoEmbed } from './post-comunicado-embed'
import { PostEventoEmbed } from './post-evento-embed'
import { ComunicadoShareButton } from './comunicado-share-button'
import type { PostSocialItem } from '@/lib/feed'
import { formatAutorCargoBadge } from '@/lib/autor-badges-format'

interface FeedPostCardProps {
  post: PostSocialItem
  showTenantBadge?: boolean
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  isAuthor?: boolean
  salvo?: boolean
  podeModerarGrupo?: boolean
}

export function FeedPostCard({
  post,
  showTenantBadge = false,
  currentUser,
  isAuthor,
  salvo = false,
  podeModerarGrupo = false,
}: FeedPostCardProps) {
  const author = isAuthor ?? post.autorId === currentUser.id
  const mostrarMenu = author || (podeModerarGrupo && !!post.grupo)
  const cargoBadge = formatAutorCargoBadge(post.autor.cargoNome, post.autor.departamentoNome)
  const conteudoVisivel = stripEmbeddedSocialUrls(post.conteudo, post.midiaUrls)
  return (
    <article className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <header className="flex items-center gap-3">
        <ComunidadePrefetchLink href={`/portal/comunidade/perfil/${post.autor.id}`}>
          <Avatar nome={post.autor.nome} avatarUrl={post.autor.avatarUrl} size="md" />
        </ComunidadePrefetchLink>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <ComunidadePrefetchLink
              href={`/portal/comunidade/perfil/${post.autor.id}`}
              className="text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
            >
              {post.autor.nome ?? 'Membro'}
            </ComunidadePrefetchLink>
            {showTenantBadge && (
              <span className="rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                {post.tenant.nome}
              </span>
            )}
            {post.autor.sedeNome && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                {post.autor.sedeNome}
              </span>
            )}
            {cargoBadge && (
              <span className="rounded-full bg-[rgb(var(--color-secondary)_/_0.14)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-secondary-fg))]">
                {cargoBadge}
              </span>
            )}
            {post.fixado && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Pin className="h-3 w-3" />
                Fixado
              </span>
            )}
            {post.grupo && (
              <ComunidadePrefetchLink
                href={`/portal/comunidade/grupos/${post.grupo.id}`}
                className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:underline"
              >
                em {post.grupo.nome ?? 'grupo'}
              </ComunidadePrefetchLink>
            )}
          </div>
          {post.autor.nickname && (
            <ComunidadePrefetchLink
              href={`/portal/comunidade/perfil/${post.autor.id}`}
              className="block truncate text-xs text-[rgb(var(--foreground-muted))] hover:underline"
            >
              @{post.autor.nickname}
            </ComunidadePrefetchLink>
          )}
          <ComunidadePrefetchLink
            href={linkPostComunidade(post.id)}
            className="text-xs text-[rgb(var(--foreground-muted))] hover:underline"
          >
            {formatRelative(post.criadoEm)}
          </ComunidadePrefetchLink>
        </div>
        {mostrarMenu && (
          <FeedPostMenu
            postId={post.id}
            conteudoInicial={post.conteudo}
            fixado={post.fixado}
            modo={author ? 'autor' : 'moderar-grupo'}
          />
        )}
      </header>

      {post.titulo && (
        <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
      )}

      {post.postOrigemId && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <Repeat2 className="h-3.5 w-3.5" />
          Compartilhou uma publicação
        </p>
      )}

      {post.comunicadoOrigemId && !post.postOrigemId && post.tipo === 'MEMBRO' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <Megaphone className="h-3.5 w-3.5" />
          Compartilhou um comunicado oficial
        </p>
      )}

      {conteudoVisivel ? (
        <PostConteudoRich conteudo={conteudoVisivel} className="mt-2" />
      ) : null}

      {post.postOrigem && <PostRepostEmbed origem={post.postOrigem} />}

      {post.comunicadoOrigem && <PostComunicadoEmbed comunicado={post.comunicadoOrigem} />}

      {post.evento && <PostEventoEmbed evento={post.evento} />}

      {post.enquete && <PostPoll enquete={post.enquete} isAuthor={author} />}

      {post.midiaUrls.length > 0 ? (
        <PostMedia urls={post.midiaUrls} caption={post.conteudo} />
      ) : (
        post.imagemUrl && <PostLegacyImage src={post.imagemUrl} caption={post.conteudo} />
      )}

      <PostEngagement
        postId={post.id}
        totalReacoes={post.totalReacoes}
        totalComentarios={post.totalComentarios}
        minhaReacao={post.minhaReacao}
        currentUser={currentUser}
        isAuthor={author}
        isRepost={!!post.postOrigemId || !!post.comunicadoOrigemId}
        salvoInicial={salvo}
      />

      {post.tipo === 'INSTITUCIONAL' && post.comunicadoOrigemId && (
        <div className="mt-1 flex justify-end">
          <ComunicadoShareButton comunicadoId={post.comunicadoOrigemId} />
        </div>
      )}
    </article>
  )
}
