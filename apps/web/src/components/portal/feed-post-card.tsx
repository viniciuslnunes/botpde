import { Repeat2, Pin, Megaphone } from 'lucide-react'
import { formatRelative } from '@/lib/format-datetime'
import { linkPostComunidade, linkTopicoForum } from '@/lib/comunidade-social'
import { linkTorcidaComunidadePublica } from '@/lib/canais-shared'
import { ensureSocialEmbedInMidias, stripEmbeddedSocialUrls } from '@/lib/social-embed'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { Avatar } from './avatar'
import { PostEngagement } from './post-engagement'
import { ForumFeedEngagement } from './forum-feed-engagement'
import { PostMedia } from './post-media'
import { PostLegacyImage } from './post-legacy-image'
import { FeedPostMenu } from './feed-post-menu'
import {
  PostEditProvider,
  PostEditableMidia,
  PostEditableTexto,
} from './post-edit-provider'
import { ExpandableText } from './expandable-text'
import { PostPoll } from './post-poll'
import { PostRepostEmbed } from './post-repost-embed'
import { PostComunicadoEmbed } from './post-comunicado-embed'
import { PostEventoEmbed } from './post-evento-embed'
import { ComunicadoShareButton } from './comunicado-share-button'
import type { PostSocialItem } from '@/lib/feed'
import { formatAutorCargoBadge, formatAutorUnidadeBadge } from '@/lib/autor-badges-format'
import { PracaOrigemBadge } from '@/app/portal/comunidade/_components/praca-origem-badge'
import { ForumTopicoMenu } from '@/app/portal/comunidade/_components/forum-topico-menu'
import { editarTopico } from '@/app/portal/comunidade/praca-actions'

interface FeedPostCardProps {
  post: PostSocialItem
  showTenantBadge?: boolean
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  isAuthor?: boolean
  salvo?: boolean
  podeModerarGrupo?: boolean
  /** Sócio compartilha; torcedor só curte/comenta/salva. Default true. */
  podeCompartilhar?: boolean
}

export function FeedPostCard({
  post,
  showTenantBadge = false,
  currentUser,
  isAuthor,
  salvo = false,
  podeModerarGrupo = false,
  podeCompartilhar = true,
}: FeedPostCardProps) {
  const author = isAuthor ?? post.autorId === currentUser.id
  const forum = post.forum
  const permalink = forum
    ? linkTopicoForum(post.id, forum.escopo)
    : linkPostComunidade(post.id)
  const mostrarMenu = author || (podeModerarGrupo && !!post.grupo)
  const isComunicadoOficial = post.tipo === 'INSTITUCIONAL' && Boolean(post.comunicadoOrigemId)
  const cargoBadge = isComunicadoOficial
    ? null
    : formatAutorCargoBadge(post.autor.cargoNome, post.autor.departamentoNome)
  const headerHref = isComunicadoOficial
    ? linkTorcidaComunidadePublica(post.tenantId)
    : `/portal/comunidade/perfil/${post.autor.id}`
  const headerNome = isComunicadoOficial ? post.tenant.nome : (post.autor.nome ?? 'Membro')
  const tenantBadge = showTenantBadge && !isComunicadoOficial && !forum ? post.tenant.nome : null
  // Unidade que repete a torcida (Caso B, ou Sede raiz "Sede — <Torcida>") não
  // vira badge — compara com a torcida do post mesmo quando ela não é exibida.
  const unidadeBadge = isComunicadoOficial || forum
    ? null
    : formatAutorUnidadeBadge(post.autor.sedeNome, post.tenant.nome)
  const headerAvatar = isComunicadoOficial ? post.tenant.logoUrl : post.autor.avatarUrl
  const midias = ensureSocialEmbedInMidias(post.conteudo, post.midiaUrls)
  const conteudoVisivel = stripEmbeddedSocialUrls(post.conteudo, midias)
  const mediaCaption = isComunicadoOficial
    ? (post.comunicadoOrigem?.corpo ?? post.conteudo)
    : post.conteudo
  const mediaBlock =
    midias.length > 0 ? (
      <PostMedia urls={midias} caption={mediaCaption} />
    ) : (
      post.imagemUrl && <PostLegacyImage src={post.imagemUrl} caption={mediaCaption} />
    )

  return (
    <article className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <PostEditProvider
        postId={post.id}
        conteudo={post.conteudo}
        midiaUrls={post.midiaUrls}
        podeEditar={author && !isComunicadoOficial}
        escopoMencao={forum?.escopo === 'nacional' ? 'nacional' : undefined}
        salvarFn={
          forum
            ? (id, conteudo, anexos) => editarTopico(id, conteudo, anexos, forum.escopo)
            : undefined
        }
      >
      <header className="flex items-center gap-3">
        <ComunidadePrefetchLink href={headerHref}>
          <Avatar
            nome={headerNome}
            avatarUrl={headerAvatar}
            size="md"
            fit={isComunicadoOficial ? 'contain' : 'cover'}
          />
        </ComunidadePrefetchLink>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <ComunidadePrefetchLink
              href={headerHref}
              className="text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:text-[rgb(var(--color-primary-fg))]"
            >
              {headerNome}
            </ComunidadePrefetchLink>
            {tenantBadge && (
              <span className="rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                {tenantBadge}
              </span>
            )}
            {unidadeBadge && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                {unidadeBadge}
              </span>
            )}
            {cargoBadge && (
              <span className="rounded-full bg-[rgb(var(--color-secondary)_/_0.14)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-secondary-fg))]">
                {cargoBadge}
              </span>
            )}
            {forum && <PracaOrigemBadge origem="forum" />}
            {post.fixado && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Pin className="h-3 w-3" />
                Fixado
              </span>
            )}
            {post.grupo && (
              <ComunidadePrefetchLink
                href={`/portal/comunidade/grupos/${post.grupo.id}`}
                className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
              >
                em {post.grupo.nome ?? 'grupo'}
              </ComunidadePrefetchLink>
            )}
          </div>
          {!isComunicadoOficial && post.autor.nickname && (
            <ComunidadePrefetchLink
              href={`/portal/comunidade/perfil/${post.autor.id}`}
              className="block truncate text-xs text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              @{post.autor.nickname}
            </ComunidadePrefetchLink>
          )}
          <ComunidadePrefetchLink
            href={permalink}
            className="text-xs text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
          >
            <time dateTime={new Date(post.criadoEm).toISOString()} suppressHydrationWarning>
              {formatRelative(post.criadoEm)}
            </time>
          </ComunidadePrefetchLink>
        </div>
        {mostrarMenu && forum && author && (
          <ForumTopicoMenu topicoId={post.id} escopo={forum.escopo} />
        )}
        {mostrarMenu && !forum && (
          <FeedPostMenu
            postId={post.id}
            fixado={post.fixado}
            modo={author ? 'autor' : 'moderar-grupo'}
          />
        )}
      </header>

      {post.titulo && (
        <ComunidadePrefetchLink href={permalink}>
          <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
        </ComunidadePrefetchLink>
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

      {isComunicadoOficial && post.comunicadoOrigem ? (
        <>
          {mediaBlock}
          {post.comunicadoOrigem.titulo ? (
            <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">
              {post.comunicadoOrigem.titulo}
            </h3>
          ) : null}
          <ExpandableText
            text={post.comunicadoOrigem.corpo}
            lines={8}
            className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
          />
          {post.comunicadoOrigem.autorNome ? (
            <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
              {post.comunicadoOrigem.autorNome}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <PostEditableTexto>
            {conteudoVisivel ? (
              <ExpandableText
                conteudo={conteudoVisivel}
                lines={8}
                className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
              />
            ) : null}
          </PostEditableTexto>

          {post.postOrigem && <PostRepostEmbed origem={post.postOrigem} />}

          {post.comunicadoOrigem && <PostComunicadoEmbed comunicado={post.comunicadoOrigem} />}

          {post.evento && <PostEventoEmbed evento={post.evento} />}

          {post.enquete && <PostPoll enquete={post.enquete} isAuthor={author} />}

          {midias.length > 0 ? (
            <PostEditableMidia>
              <PostMedia urls={midias} caption={mediaCaption} />
            </PostEditableMidia>
          ) : (
            <>
              {/* Anexo legado (Discord) não entra na edição — segue exibido. */}
              {post.imagemUrl && <PostLegacyImage src={post.imagemUrl} caption={mediaCaption} />}
              <PostEditableMidia>{null}</PostEditableMidia>
            </>
          )}
        </>
      )}

      {forum ? (
        <ForumFeedEngagement
          topicoId={post.id}
          escopo={forum.escopo}
          totalReacoes={post.totalReacoes}
          totalComentarios={post.totalComentarios}
          minhaReacao={post.minhaReacao === 'CURTIR' ? 'CURTIR' : null}
          currentUser={currentUser}
        />
      ) : (
        <PostEngagement
          postId={post.id}
          totalReacoes={post.totalReacoes}
          totalComentarios={post.totalComentarios}
          minhaReacao={post.minhaReacao}
          currentUser={currentUser}
          isAuthor={author}
          isRepost={!!post.postOrigemId || !!post.comunicadoOrigemId}
          salvoInicial={salvo}
          podeCompartilhar={podeCompartilhar}
        />
      )}

      {post.tipo === 'INSTITUCIONAL' && post.comunicadoOrigemId && (
        <div className="mt-1 flex justify-end">
          <ComunicadoShareButton comunicadoId={post.comunicadoOrigemId} />
        </div>
      )}
      </PostEditProvider>
    </article>
  )
}
