import { notFound } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { faixaEngajamentoTopico, pctAprovacaoPraca } from '@torcida/types'
import { ComunidadePageHeader } from '../../_components/comunidade-page-header'
import { PracaOrigemBadge } from '../../_components/praca-origem-badge'
import { ForumTopicoCard } from '../../_components/forum-topico-card'
import { ResponderTopicoForm, VotarPracaBotoes } from '../../_components/praca-forms'
import { ModerarRespostaBotao, ModerarTopicoBotoes } from '../../_components/praca-moderar'
import { PracaDenunciarBotao } from '../../_components/praca-denuncia-modal'
import { RegistrarVisitaTopico } from '../../_components/registrar-visita-topico'
import { exigirContextoPraca } from '../../_lib/praca-page'
import { getTopicoDetalhe, podeModerarPraca, tenantModeracaoPraca } from '@/lib/praca'
import { formatRelative } from '@/lib/format-datetime'
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

      <ForumTopicoCard topico={topico} escopo={escopo} isAuthor={isAuthor} />

      {publico ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
          <VotarPracaBotoes
            escopo={escopo}
            alvoTipo="TOPICO"
            alvoId={topico.id}
            gostei={topico.gostei}
            naoGostei={topico.naoGostei}
          />
          {pct !== null && (
            <span className="text-xs text-[rgb(var(--foreground-muted))]">{pct}% positivo</span>
          )}
        </div>
      ) : null}
      {podeModerar && (
        <ModerarTopicoBotoes
          escopo={escopo}
          topicoId={topico.id}
          fixado={topico.fixado}
          status={topico.status}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Respostas</h2>
        {!publico ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            A thread abre depois que o tópico for aprovado.
          </p>
        ) : topico.respostas.length === 0 ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhuma resposta ainda.</p>
        ) : (
          <ul className="space-y-2">
            {topico.respostas.map((r) => (
              <li
                key={r.id}
                className={[
                  'rounded-xl border p-3',
                  r.oculto
                    ? 'border-red-500/25 bg-red-500/5'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                <p className="text-xs font-medium text-[rgb(var(--foreground))]">
                  {r.autorNome ?? 'Alguém'}{' '}
                  <span className="font-normal text-[rgb(var(--foreground-muted))]">
                    · {formatRelative(r.criadoEm)}
                    {r.oculto ? ' · recusada' : ''}
                  </span>
                </p>
                <p
                  className={[
                    'mt-1 max-w-[70ch] whitespace-pre-wrap text-sm [text-wrap:pretty]',
                    r.oculto
                      ? 'text-[rgb(var(--foreground-muted))] line-through'
                      : 'text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  {r.conteudo}
                </p>
                {r.autorId !== session.user.id ? (
                  <div className="mt-2">
                    <PracaDenunciarBotao escopo={escopo} alvoTipo="FORUM_RESPOSTA" alvoId={r.id} />
                  </div>
                ) : null}
                {podeModerar ? (
                  <ModerarRespostaBotao escopo={escopo} respostaId={r.id} oculto={r.oculto} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {publico ? <ResponderTopicoForm escopo={escopo} topicoId={topico.id} /> : null}
      </section>
    </div>
  )
}
