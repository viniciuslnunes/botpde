import { notFound } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { faixaEngajamentoTopico, pctAprovacaoPraca } from '@torcida/types'
import { ComunidadePageHeader } from '../../_components/comunidade-page-header'
import { PracaOrigemBadge } from '../../_components/praca-origem-badge'
import { ForumTopicoCard } from '../../_components/forum-topico-card'
import { VotarPracaBotoes } from '../../_components/praca-forms'
import { ForumRespostasSection } from '../../_components/forum-respostas-section'
import { ModerarTopicoBotoes } from '../../_components/praca-moderar'
import { RegistrarVisitaTopico } from '../../_components/registrar-visita-topico'
import { exigirContextoPraca } from '../../_lib/praca-page'
import { getTopicoDetalhe, podeModerarPraca, tenantModeracaoPraca } from '@/lib/praca'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tópico — Comunidade' }

export default async function ForumTopicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ escopo?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { session, ctx, escopo, ancora, sufixo } = await exigirContextoPraca(sp.escopo)
  const podeModerar = await podeModerarPraca(session.user.id, tenantModeracaoPraca(ancora, ctx))
  const topico = await getTopicoDetalhe(id, escopo, ancora, {
    userId: session.user.id,
    podeModerar,
  })
  if (!topico) notFound()

  const faixa = faixaEngajamentoTopico(topico)
  const pct = pctAprovacaoPraca(topico.gostei, topico.naoGostei)
  const isAuthor = topico.autorId === session.user.id
  const publico = topico.status === 'VISIVEL'

  return (
    <div className="space-y-5">
      {publico ? <RegistrarVisitaTopico topicoId={topico.id} escopo={escopo} /> : null}
      <ComunidadePageHeader
        icon={MessagesSquare}
        titulo="Tópico"
        subtitulo={
          publico
            ? `${topico.respostasCount} respostas · ${topico.visitas} visitas`
            : topico.status === 'PENDENTE'
              ? 'Aguardando aprovação'
              : 'Tópico recusado'
        }
        voltarHref={`/portal/comunidade/forum${sufixo}`}
      />

      {topico.status === 'PENDENTE' ? (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))]">
          {podeModerar
            ? 'Este tópico está na fila. Aprove para ele entrar no ranking, ou recuse com um motivo.'
            : 'Seu tópico está na fila de aprovação deste canal. Você pode editar enquanto espera.'}
        </p>
      ) : null}
      {topico.status === 'REJEITADO' ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2 text-sm text-[rgb(var(--foreground))]">
          Tópico recusado
          {topico.rejeitadoMotivo ? `: ${topico.rejeitadoMotivo}` : '.'}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <PracaOrigemBadge origem="forum" />
        {topico.fixado && (
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
      </div>

      <ForumTopicoCard
        topico={topico}
        escopo={escopo}
        isAuthor={isAuthor}
        rodape={
          publico || podeModerar ? (
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {publico ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <VotarPracaBotoes
                    escopo={escopo}
                    alvoTipo="TOPICO"
                    alvoId={topico.id}
                    gostei={topico.gostei}
                    naoGostei={topico.naoGostei}
                    meuVoto={topico.meuVoto}
                  />
                  {pct !== null ? (
                    <span className="text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                      {pct}% positivo
                    </span>
                  ) : null}
                </div>
              ) : null}
              {podeModerar ? (
                <ModerarTopicoBotoes
                  escopo={escopo}
                  topicoId={topico.id}
                  fixado={topico.fixado}
                  status={topico.status}
                />
              ) : null}
            </div>
          ) : null
        }
      />

      {!publico ? (
        <section className="space-y-3">
          <h2 className="portal-display text-lg text-[rgb(var(--foreground))]">Respostas</h2>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            A thread abre depois que o tópico for aprovado.
          </p>
        </section>
      ) : (
        <ForumRespostasSection
          escopo={escopo}
          topicoId={topico.id}
          respostas={topico.respostas}
          viewerId={session.user.id}
          podeModerar={podeModerar}
        />
      )}
    </div>
  )
}
