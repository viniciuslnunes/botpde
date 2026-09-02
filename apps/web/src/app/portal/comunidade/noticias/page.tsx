import { Suspense } from 'react'
import Link from 'next/link'
import { Newspaper, Plus } from 'lucide-react'
import { parseOrdemNoticia } from '@torcida/types'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import { ComunidadeNoticiasComposerSection } from '../_components/comunidade-noticias-composer-section'
import { NoticiasFeedShell } from '../_components/noticias-feed'
import { carregarJogosNoticiasFeed } from '@/lib/noticias-jogos-feed'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { PracaPills } from '../_components/praca-pills'
import { exigirContextoPraca } from '../_lib/praca-page'
import {
  listarNoticiasDaPraca,
  podePublicarNoticiaNoTenant,
} from '@/lib/praca'
import { FeedComposerSkeleton } from '@/components/portal/feed-skeletons'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notícias — Comunidade' }

export default async function NoticiasPracaPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string; ordem?: string; criar?: string; foco?: string }>
}) {
  const params = await searchParams
  const { session, ctx, escopo, ancora, sufixo } = await exigirContextoPraca(params.escopo)
  const ordem = parseOrdemNoticia(params.ordem)
  const querCriar = params.criar === '1' || params.criar === 'true'
  const focoVideo = params.foco === 'video'

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ escopo })
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v)
    }
    return `?${p.toString()}`
  }

  const tenantId =
    escopo === 'nacional' ? null : (ancora.tenantId ?? null)

  const publicacao =
    tenantId
      ? await podePublicarNoticiaNoTenant(session.user.id, tenantId)
      : { pode: false, canal: null, oficial: false, podePessoa: false }

  const criando = querCriar && publicacao.pode && Boolean(tenantId)
  const hrefMural = `/portal/comunidade/noticias${qs({ ordem })}`
  const hrefCriar = `/portal/comunidade/noticias${qs({ ordem, criar: '1' })}`
  const hrefEnviarVideo = `/portal/comunidade/noticias${qs({ ordem, criar: '1', foco: 'video' })}`

  const [itens, avatarUrl, jogos] = await Promise.all([
    criando ? Promise.resolve([]) : listarNoticiasDaPraca(escopo, ancora, ordem),
    criando ? getAvatarAtualDoUsuario(session.user.id) : Promise.resolve(null),
    criando
      ? Promise.resolve({ proximos: [], recentes: [] })
      : carregarJogosNoticiasFeed(ancora.afiliacaoId, ctx.afiliacao?.nome ?? null),
  ])

  const composerNome =
    ctx.modo === 'torcida'
      ? ctx.tenant.nome
      : (ctx.unidade?.nome ?? ctx.torcidaReal?.nome ?? '')
  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)

  const subtitulo = criando
    ? 'Monte a história em blocos: texto, foto, vídeo e embed'
    : escopo === 'nacional'
      ? 'Imprensa do clube — o texto completo está no veículo'
      : 'Artigos oficiais deste canal — as mais vistas sobem primeiro'

  return (
    <div className="space-y-6">
      <ComunidadePageHeader
        icon={Newspaper}
        titulo="Notícias"
        subtitulo={subtitulo}
        voltarHref={criando ? hrefMural : `/portal/comunidade${sufixo}`}
        acao={
          publicacao.pode && tenantId && !criando ? (
            <Link
              href={hrefCriar}
              aria-label="Criar notícia"
              className="app-action inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[rgb(var(--color-primary))] px-3 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span>Criar notícia</span>
            </Link>
          ) : null
        }
      />

      {criando && tenantId ? (
        <Suspense fallback={<FeedComposerSkeleton />}>
          <ComunidadeNoticiasComposerSection
            escopo={escopo}
            tenantId={tenantId}
            tenantNome={composerNome}
            userId={session.user.id}
            userName={session.user.name ?? null}
            userAvatar={avatarUrl}
            torcidaReal={torcidaReal}
            fecharHref={hrefMural}
            focoVideo={focoVideo}
          />
        </Suspense>
      ) : null}

      {!criando && escopo !== 'nacional' && publicacao.podePessoa && !publicacao.canal ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Para publicar notícia o canal precisa ser o oficial da torcida, da unidade
          ou um portal de notícias verificado.
        </p>
      ) : null}

      {criando ? null : (
        <div className="space-y-4">
          {itens.length === 0 ? (
            <MotionEmptyState
              icon={<Newspaper className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
              title="Nada publicado ainda"
              description={
                escopo === 'nacional'
                  ? 'Quando a curadoria aprovar uma notícia de imprensa, ela aparece aqui com fonte e link.'
                  : publicacao.pode
                    ? 'Publique a primeira notícia deste canal — foto ou vídeo ajudam a matéria a subir.'
                    : 'Comunicação e liderança publicam notícias neste canal.'
              }
            />
          ) : (
            <NoticiasFeedShell
              itens={itens}
              sufixo={sufixo}
              escopo={escopo}
              podeGerir={publicacao.oficial}
              userId={session.user.id}
              ordem={ordem}
              jogos={jogos}
              podeEnviarVideo={publicacao.pode}
              hrefEnviarVideo={publicacao.pode ? hrefEnviarVideo : undefined}
            >
              <PracaPills
                ativo={ordem}
                items={[
                  {
                    id: 'acessados',
                    label: 'Mais vistas',
                    href: `/portal/comunidade/noticias${qs({ ordem: 'acessados' })}`,
                  },
                  {
                    id: 'em_alta',
                    label: 'Em alta',
                    href: `/portal/comunidade/noticias${qs({ ordem: 'em_alta' })}`,
                  },
                  {
                    id: 'recentes',
                    label: 'Recentes',
                    href: `/portal/comunidade/noticias${qs({ ordem: 'recentes' })}`,
                  },
                ]}
              />
            </NoticiasFeedShell>
          )}
        </div>
      )}
    </div>
  )
}
