import { Suspense } from 'react'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import {
  faixaEngajamentoTopico,
  LIMIAR_RANKING_PRACA,
  parseJanelaRanking,
  parseOrdemTopico,
  pctAprovacaoPraca,
} from '@torcida/types'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import { ComunidadeForumComposerSection } from '../_components/comunidade-forum-composer-section'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { PracaOrigemBadge, PracaOrigemBarra } from '../_components/praca-origem-badge'
import { PracaPills } from '../_components/praca-pills'
import { exigirContextoPraca } from '../_lib/praca-page'
import {
  listarRankingPraca,
  listarTopicos,
  scorePracaDoUsuario,
} from '@/lib/praca'
import { formatRelative } from '@/lib/format-datetime'
import { Avatar } from '@/components/portal/avatar'
import { FeedComposerSkeleton } from '@/components/portal/feed-skeletons'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fórum — Comunidade' }

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string; ordem?: string; janela?: string }>
}) {
  const params = await searchParams
  const { session, ctx, escopo, ancora, sufixo } = await exigirContextoPraca(params.escopo)
  const ordem = parseOrdemTopico(params.ordem)
  const janela = parseJanelaRanking(params.janela)
  const [topicos, ranking, meuScore, avatarUrl] = await Promise.all([
    listarTopicos(escopo, ancora, ordem),
    listarRankingPraca(ancora, janela),
    scorePracaDoUsuario(session.user.id, ancora),
    getAvatarAtualDoUsuario(session.user.id),
  ])

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ escopo, ...extra })
    return `?${p.toString()}`
  }

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

  return (
    <div className="space-y-6">
      <ComunidadePageHeader
        icon={MessagesSquare}
        titulo="Fórum"
        subtitulo={
          escopo === 'nacional'
            ? 'Tópicos do clube — separado do feed social'
            : 'Tópicos só deste canal'
        }
        voltarHref={`/portal/comunidade${sufixo}`}
        acao={
          <Link
            href={`/portal/comunidade/forum${qs({ ordem, janela, compose: '1' })}#feed-composer`}
            className="app-action inline-flex items-center rounded-xl bg-[rgb(var(--primary))] px-3 text-sm font-semibold text-white"
          >
            Novo tópico
          </Link>
        }
      />

      {composerTenantId ? (
        <Suspense fallback={<FeedComposerSkeleton />}>
          <ComunidadeForumComposerSection
            escopo={escopo}
            tenantId={composerTenantId}
            tenantNome={composerNome}
            userId={session.user.id}
            userName={session.user.name ?? null}
            userAvatar={avatarUrl}
            torcidaReal={torcidaReal}
          />
        </Suspense>
      ) : null}

      <PracaPills
        ativo={ordem}
        items={[
          { id: 'recentes', label: 'Recentes', href: `/portal/comunidade/forum${qs({ ordem: 'recentes', janela })}` },
          { id: 'populares', label: 'Populares', href: `/portal/comunidade/forum${qs({ ordem: 'populares', janela })}` },
          { id: 'acessados', label: 'Mais vistos', href: `/portal/comunidade/forum${qs({ ordem: 'acessados', janela })}` },
        ]}
      />

      {topicos.length === 0 ? (
        <MotionEmptyState
          icon={<MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhum tópico ainda"
          description="Abra o primeiro assunto deste canal."
        />
      ) : (
        <ul className="space-y-2">
          {topicos.map((t) => {
            const faixa = faixaEngajamentoTopico(t)
            const pct = pctAprovacaoPraca(t.gostei, t.naoGostei)
            return (
              <li key={t.id}>
                <Link
                  href={`/portal/comunidade/forum/${t.id}${sufixo}`}
                  className="relative block overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 pl-5 hover:border-[rgb(var(--primary)_/_0.4)]"
                >
                  <PracaOrigemBarra origem="forum" />
                  <div className="flex flex-wrap items-center gap-2">
                    <PracaOrigemBadge origem="forum" />
                    {t.fixado && (
                      <span className="text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
                        Fixado
                      </span>
                    )}
                    {faixa === 'epico' && (
                      <span className="text-[10px] font-semibold uppercase text-[rgb(var(--foreground-muted))]">
                        Épico
                      </span>
                    )}
                    {faixa === 'lendario' && (
                      <span className="text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
                        Lendário
                      </span>
                    )}
                    <span className="text-[11px] text-[rgb(var(--foreground-muted))]">
                      {formatRelative(t.atualizadoEm)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[rgb(var(--foreground))]">{t.titulo}</p>
                  <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                    {t.respostasCount} respostas · {t.visitas} visitas
                    {pct !== null ? ` · ${pct}% positivo` : ''}
                    {t.autorNome ? ` · ${t.autorNome}` : ''}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Ranking deste canal</h2>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Pontos de participação — não concedem cargo nem permissão.
        </p>
        <div className="mt-3">
          <PracaPills
            ativo={janela}
            items={[
              { id: 'geral', label: 'Geral', href: `/portal/comunidade/forum${qs({ ordem, janela: 'geral' })}` },
              { id: 'semana', label: '7 dias', href: `/portal/comunidade/forum${qs({ ordem, janela: 'semana' })}` },
            ]}
          />
        </div>
        {ranking.length === 0 ? (
          <p className="mt-4 text-xs text-[rgb(var(--foreground-muted))]">
            {janela === 'semana'
              ? 'Ninguém pontuou nesta janela ainda.'
              : `O ranking aparece a partir de ${LIMIAR_RANKING_PRACA} pontos.`}
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
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
    </div>
  )
}
