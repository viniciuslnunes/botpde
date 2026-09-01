import { Suspense } from 'react'
import Link from 'next/link'
import { MessagesSquare, Plus } from 'lucide-react'
import {
  LIMIAR_RANKING_PRACA,
  parseForumAba,
  parseJanelaRanking,
  parseOrdemTopico,
} from '@torcida/types'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import { ComunidadeForumComposerSection } from '../_components/comunidade-forum-composer-section'
import { ForumAbas } from '../_components/forum-abas'
import { ForumTopicoRow } from '../_components/forum-topico-row'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { PracaPills } from '../_components/praca-pills'
import { exigirContextoPraca } from '../_lib/praca-page'
import {
  listarRankingPraca,
  listarTopicos,
  podeAprovarPracaNaHora,
  podeModerarPraca,
  scorePracaDoUsuario,
  tenantModeracaoPraca,
  type ForumTopicoItem,
  type RankingPracaItem,
} from '@/lib/praca'
import { Avatar } from '@/components/portal/avatar'
import { FeedComposerSkeleton } from '@/components/portal/feed-skeletons'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fórum — Comunidade' }

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string; ordem?: string; janela?: string; aba?: string; compose?: string }>
}) {
  const params = await searchParams
  const { session, ctx, escopo, ancora, sufixo } = await exigirContextoPraca(params.escopo)
  const aba = parseForumAba(params.aba, params.compose)
  const ordem = parseOrdemTopico(params.ordem)
  const janela = parseJanelaRanking(params.janela)
  const tenantMod = tenantModeracaoPraca(ancora, ctx)

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ escopo })
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v)
    }
    return `?${p.toString()}`
  }

  const hrefListagem = `/portal/comunidade/forum${qs({ aba: 'topicos', ordem, janela })}`
  const hrefNovo = `/portal/comunidade/forum${qs({ aba: 'novo', ordem, janela })}`
  const hrefRanking = `/portal/comunidade/forum${qs({ aba: 'ranking', ordem, janela })}`

  const [podeModerar, aprovaNaHora] = await Promise.all([
    aba === 'topicos' ? podeModerarPraca(session.user.id, tenantMod) : Promise.resolve(false),
    aba === 'novo' ? podeAprovarPracaNaHora(session.user.id, tenantMod) : Promise.resolve(false),
  ])

  const vazioTopicos: ForumTopicoItem[] = []
  const vazioRanking: RankingPracaItem[] = []

  const [topicos, ranking, meuScore, avatarUrl] = await Promise.all([
    aba === 'topicos'
      ? listarTopicos(escopo, ancora, ordem, { userId: session.user.id, podeModerar })
      : Promise.resolve(vazioTopicos),
    aba === 'ranking' ? listarRankingPraca(ancora, janela) : Promise.resolve(vazioRanking),
    aba === 'ranking' ? scorePracaDoUsuario(session.user.id, ancora) : Promise.resolve(null),
    aba === 'novo' ? getAvatarAtualDoUsuario(session.user.id) : Promise.resolve(null),
  ])

  const composerTenantId =
    escopo === 'nacional'
      ? (ctx.tenantSintetico?.id ?? ctx.torcidaReal?.id ?? '')
      : (ancora.tenantId ?? '')
  const composerNome =
    escopo === 'nacional'
      ? (ctx.afiliacao?.apelido || ctx.afiliacao?.nome || 'Comunidade Nacional')
      : ctx.modo === 'torcida'
        ? ctx.tenant.nome
        : (ctx.unidade?.nome ?? ctx.torcidaReal?.nome ?? '')
  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)
  const fila = topicos.filter((t) => t.status === 'PENDENTE')

  const subtitulo =
    aba === 'novo'
      ? 'Escreva à esquerda; a prévia aparece ao lado'
      : aba === 'ranking'
        ? 'Pontos de participação — não concedem cargo'
        : escopo === 'nacional'
          ? 'Tópicos do clube — os mais reagidos sobem'
          : 'Os mais engajados deste canal sobem primeiro'

  return (
    <div className="space-y-6">
      <ComunidadePageHeader
        icon={MessagesSquare}
        titulo="Fórum"
        subtitulo={subtitulo}
        voltarHref={`/portal/comunidade${sufixo}`}
      />

      <ForumAbas
        ativa={aba}
        items={[
          { id: 'topicos', label: 'Tópicos', href: hrefListagem },
          { id: 'novo', label: 'Novo tópico', href: hrefNovo },
          { id: 'ranking', label: 'Ranking', href: hrefRanking },
        ]}
      />

      {aba === 'novo' ? (
        composerTenantId ? (
          <Suspense fallback={<FeedComposerSkeleton />}>
            <ComunidadeForumComposerSection
              escopo={escopo}
              tenantId={composerTenantId}
              tenantNome={composerNome}
              userId={session.user.id}
              userName={session.user.name ?? null}
              userAvatar={avatarUrl}
              torcidaReal={torcidaReal}
              filaAprovacao={!aprovaNaHora}
            />
          </Suspense>
        ) : (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Sem canal para publicar neste escopo.
          </p>
        )
      ) : null}

      {aba === 'topicos' ? (
        <div className="space-y-4">
          {podeModerar && fila.length > 0 ? (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {fila.length === 1
                ? '1 tópico aguardando aprovação — aparece no topo da lista.'
                : `${fila.length} tópicos aguardando aprovação — aparecem no topo da lista.`}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <PracaPills
              ativo={ordem}
              items={[
                {
                  id: 'em_alta',
                  label: 'Em alta',
                  href: `/portal/comunidade/forum${qs({ aba: 'topicos', ordem: 'em_alta', janela })}`,
                },
                {
                  id: 'recentes',
                  label: 'Recentes',
                  href: `/portal/comunidade/forum${qs({ aba: 'topicos', ordem: 'recentes', janela })}`,
                },
                {
                  id: 'acessados',
                  label: 'Mais vistos',
                  href: `/portal/comunidade/forum${qs({ aba: 'topicos', ordem: 'acessados', janela })}`,
                },
              ]}
            />
            <Link
              href={hrefNovo}
              className="app-action inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--primary))] px-3 text-sm font-semibold text-primary-on"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Novo tópico
            </Link>
          </div>

          {topicos.length === 0 ? (
            <MotionEmptyState
              icon={<MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
              title="Nenhum tópico ainda"
              description="Abra o primeiro assunto deste canal — foto ou vídeo ajudam o tópico a subir."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {topicos.map((t, i) => (
                <li key={t.id} className="min-w-0">
                  <ForumTopicoRow
                    topico={t}
                    href={`/portal/comunidade/forum/${t.id}${sufixo}`}
                    posicao={ordem === 'em_alta' && t.status === 'VISIVEL' ? i + 1 - fila.length : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {aba === 'ranking' ? (
        <section>
          <div className="mt-1">
            <PracaPills
              ativo={janela}
              items={[
                {
                  id: 'geral',
                  label: 'Geral',
                  href: `/portal/comunidade/forum${qs({ aba: 'ranking', ordem, janela: 'geral' })}`,
                },
                {
                  id: 'semana',
                  label: '7 dias',
                  href: `/portal/comunidade/forum${qs({ aba: 'ranking', ordem, janela: 'semana' })}`,
                },
              ]}
            />
          </div>
          {ranking.length === 0 ? (
            <p className="mt-4 text-sm text-[rgb(var(--foreground-muted))]">
              {janela === 'semana'
                ? 'Ninguém pontuou nesta janela ainda.'
                : `O ranking aparece a partir de ${LIMIAR_RANKING_PRACA} pontos.`}
            </p>
          ) : (
            <ol className="mt-4 space-y-2">
              {ranking.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-3">
                  <span className="w-5 text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                    {i + 1}
                  </span>
                  <Avatar avatarUrl={r.avatarUrl} nome={r.nome} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                      {r.nome ?? 'Alguém'}
                    </p>
                    <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                      {janela === 'geral'
                        ? `${r.topicos} tópicos · ${r.respostas} respostas${r.pctAprovacao !== null ? ` · ${r.pctAprovacao}% positivo` : ''}`
                        : 'Pontos nos últimos 7 dias'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
                    {r.score}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {janela === 'geral' && (meuScore === null || meuScore < LIMIAR_RANKING_PRACA) && (
            <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
              {meuScore === null
                ? `Participe do fórum para entrar no ranking (mínimo ${LIMIAR_RANKING_PRACA} pontos).`
                : `Faltam ${LIMIAR_RANKING_PRACA - meuScore} pontos para aparecer no ranking.`}
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}
