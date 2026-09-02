import { Repeat2, Megaphone } from 'lucide-react'
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
import { CARGO_TORCEDOR, formatAutorCargoBadge, formatAutorUnidadeBadge, formatTorcidaNoFeed } from '@/lib/autor-badges-format'
import { PracaModuloBadge, FixadoBadge } from '@/app/portal/comunidade/_components/praca-origem-badge'
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
  /** Comunidade já aberta (clube na CN, torcida no mural). Não repetir o nome. */
  contextoComunidadeNome?: string | null
}

export function FeedPostCard({
  post,
  showTenantBadge = false,
  currentUser,
  isAuthor,
  salvo = false,
  podeModerarGrupo = false,
  podeCompartilhar = true,
  contextoComunidadeNome = null,
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
  const torcidaLinha =
    showTenantBadge && !isComunicadoOficial
      ? formatTorcidaNoFeed(post.tenant.nome, contextoComunidadeNome)
      : null
  // Unidade extra (subsede/PDE) ao lado do nome; cadastrado na torcida vira "Sede".
  const unidadeBadge =
    isComunicadoOficial || post.autor.cargoNome === CARGO_TORCEDOR
      ? null
      : formatAutorUnidadeBadge(post.autor.sedeNome, post.tenant.nome, {
          tipo: post.autor.sedeTipo,
        })
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
    <article className="@container card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4">
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
      <header className="flex items-start gap-2.5">
        <ComunidadePrefetchLink href={headerHref} className="shrink-0">
          <Avatar
            nome={headerNome}
            avatarUrl={headerAvatar}
            size="md"
            fit={isComunicadoOficial ? 'contain' : 'cover'}
          />
        </ComunidadePrefetchLink>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 w-full flex-col leading-tight">
            <ComunidadePrefetchLink
              href={headerHref}
              className="app-sem-piso-toque block truncate text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:text-[rgb(var(--color-primary-fg))]"
            >
              {headerNome}
              {unidadeBadge ? (
                <span className="font-medium text-[rgb(var(--foreground-muted))]">
                  {' '}
                  - {unidadeBadge}
                </span>
              ) : null}
            </ComunidadePrefetchLink>
            {torcidaLinha ? (
              <span className="block truncate text-xs text-[rgb(var(--foreground-muted))]">
                {torcidaLinha}
              </span>
            ) : null}
            {cargoBadge && (
              <span className="text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                {cargoBadge}
              </span>
            )}
            {!isComunicadoOficial && post.autor.nickname && (
              <ComunidadePrefetchLink
                href={`/portal/comunidade/perfil/${post.autor.id}`}
                className="app-sem-piso-toque block truncate text-xs text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
              >
                @{post.autor.nickname}
              </ComunidadePrefetchLink>
            )}
            <ComunidadePrefetchLink
              href={permalink}
              className="app-sem-piso-toque block text-xs text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              <time dateTime={new Date(post.criadoEm).toISOString()} suppressHydrationWarning>
                {formatRelative(post.criadoEm)}
              </time>
            </ComunidadePrefetchLink>
            {post.grupo && (
              <ComunidadePrefetchLink
                href={`/portal/comunidade/grupos/${post.grupo.id}`}
                className="app-sem-piso-toque block truncate text-xs text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
              >
                em {post.grupo.nome ?? 'grupo'}
              </ComunidadePrefetchLink>
            )}
          </div>
        </div>
        {(forum || post.fixado || mostrarMenu) && (
          <div className="flex shrink-0 items-center gap-1.5 self-start">
            {post.fixado ? <FixadoBadge /> : null}
            {forum ? <PracaModuloBadge modulo="forum" /> : null}
            {forum && (mostrarMenu || !author) ? (
              <ForumTopicoMenu topicoId={post.id} escopo={forum.escopo} isAutor={author} />
            ) : null}
            {mostrarMenu && !forum ? (
              <FeedPostMenu
                postId={post.id}
                fixado={post.fixado}
                modo={author ? 'autor' : 'moderar-grupo'}
              />
            ) : null}
          </div>
        )}
      </header>

      <div className="mt-5 space-y-2.5">
      {post.titulo && (
        <ComunidadePrefetchLink href={permalink}>
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
        </ComunidadePrefetchLink>
      )}

      {post.postOrigemId && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <Repeat2 className="h-3.5 w-3.5" />
          Compartilhou uma publicação
        </p>
      )}

      {post.comunicadoOrigemId && !post.postOrigemId && post.tipo === 'MEMBRO' && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <Megaphone className="h-3.5 w-3.5" />
          Compartilhou um comunicado oficial
        </p>
      )}

      {isComunicadoOficial && post.comunicadoOrigem ? (
        <>
          {mediaBlock}
          {post.comunicadoOrigem.titulo ? (
            <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              {post.comunicadoOrigem.titulo}
            </h3>
          ) : null}
          <ExpandableText
            text={post.comunicadoOrigem.corpo}
            lines={8}
            className="whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
          />
          {post.comunicadoOrigem.autorNome ? (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
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
                className="whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
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
      </div>

      {forum ? (
        <ForumFeedEngagement
          topicoId={post.id}
          escopo={forum.escopo}
          gostei={forum.gostei}
          naoGostei={forum.naoGostei}
          meuVoto={forum.meuVoto}
          totalRespostas={post.totalComentarios}
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
