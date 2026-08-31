import { notFound } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { faixaEngajamentoTopico, pctAprovacaoPraca } from '@torcida/types'
import { ComunidadePageHeader } from '../../_components/comunidade-page-header'
import { PracaOrigemBadge } from '../../_components/praca-origem-badge'
import { ForumTopicoCard } from '../../_components/forum-topico-card'
import { ResponderTopicoForm, VotarPracaBotoes } from '../../_components/praca-forms'
import { ModerarTopicoBotoes } from '../../_components/praca-moderar'
import { RegistrarVisitaTopico } from '../../_components/registrar-visita-topico'
import { exigirContextoPraca } from '../../_lib/praca-page'
import { getTopicoDetalhe, podeModerarPraca } from '@/lib/praca'
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
  const { session, escopo, ancora, sufixo } = await exigirContextoPraca(sp.escopo)
  const topico = await getTopicoDetalhe(id, escopo, ancora)
  if (!topico) notFound()

  const podeModerar = await podeModerarPraca(session.user.id, ancora.tenantId)
  const faixa = faixaEngajamentoTopico(topico)
  const pct = pctAprovacaoPraca(topico.gostei, topico.naoGostei)
  const isAuthor = topico.autorId === session.user.id

  return (
    <div className="space-y-5">
      <RegistrarVisitaTopico topicoId={topico.id} escopo={escopo} />
      <ComunidadePageHeader
        icon={MessagesSquare}
        titulo="Tópico"
        subtitulo={`${topico.respostasCount} respostas · ${topico.visitas} visitas`}
        voltarHref={`/portal/comunidade/forum${sufixo}`}
      />

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
      {podeModerar && (
        <ModerarTopicoBotoes escopo={escopo} topicoId={topico.id} fixado={topico.fixado} />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Respostas</h2>
        {topico.respostas.length === 0 ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhuma resposta ainda.</p>
        ) : (
          <ul className="space-y-2">
            {topico.respostas.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
              >
                <p className="text-xs font-medium text-[rgb(var(--foreground))]">
                  {r.autorNome ?? 'Alguém'}{' '}
                  <span className="font-normal text-[rgb(var(--foreground-muted))]">
                    · {formatRelative(r.criadoEm)}
                  </span>
                </p>
                <p className="mt-1 max-w-[70ch] whitespace-pre-wrap text-sm text-[rgb(var(--foreground))] [text-wrap:pretty]">
                  {r.conteudo}
                </p>
              </li>
            ))}
          </ul>
        )}
        <ResponderTopicoForm escopo={escopo} topicoId={topico.id} />
      </section>
    </div>
  )
}
