'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { FORUM_CORPO_MAX } from '@torcida/types/portal-noticias-forum'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { ForumRespostaItem } from '@/lib/praca'
import { editarRespostaForum, excluirRespostaForum } from '../praca-actions'
import {
  achatarRespostasDaArvore,
  contarRespostasNaArvore,
  montarArvoreComentarios,
  type NoComentario,
} from '@/lib/comentario-thread'
import { formatRelative } from '@/lib/format-datetime'
import { AppButton } from '@/components/ui/button'
import { ComentarioMenu } from '@/components/portal/comentario-menu'
import {
  ComentarioRespostasBloco,
  comentarioEstaNaThread,
} from '@/components/portal/comentario-respostas-bloco'
import { PracaDenunciarBotao } from './praca-denuncia-modal'
import { ModerarRespostaBotao } from './praca-moderar'
import { ResponderTopicoForm } from './praca-forms'

const btnAcaoResposta =
  'app-touch-line inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50'

function CorpoRespostaTopico({
  r,
  escopo,
  viewerId,
  podeModerar,
  compacto = false,
  onResponder,
}: {
  r: ForumRespostaItem
  escopo: EscopoComunidade
  viewerId: string
  podeModerar: boolean
  compacto?: boolean
  onResponder?: () => void
}) {
  const router = useRouter()
  const proprio = r.autorId === viewerId
  const cabecalho = (
    <>
      {proprio ? 'Você' : (r.autorNome ?? 'Alguém')}{' '}
      <span className="font-normal text-[rgb(var(--foreground-muted))]">
        · {formatRelative(r.criadoEm)}
        {r.oculto ? ' · recusada' : ''}
      </span>
    </>
  )
  const corpo = (
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
  )

  return (
    <div className={compacto ? 'py-2.5 pr-3' : undefined}>
      <div
        className={[
          compacto ? '' : 'rounded-xl border p-3',
          compacto
            ? ''
            : r.oculto
              ? 'border-red-500/25 bg-red-500/5'
              : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {proprio && !r.oculto ? (
          <ComentarioMenu
            comentarioId={r.id}
            conteudoInicial={r.conteudo}
            autorLabel={cabecalho}
            variant="bare"
            comMencoes={false}
            maxLength={FORUM_CORPO_MAX}
            editarAction={async (id, next) => {
              const res = await editarRespostaForum(id, next, escopo)
              if ('error' in res) throw new Error(res.error)
              return res.conteudo
            }}
            excluirAction={async (id) => {
              const res = await excluirRespostaForum(id, escopo)
              if ('error' in res) throw new Error(res.error)
            }}
            onEditado={() => router.refresh()}
            onExcluido={() => router.refresh()}
          >
            {corpo}
          </ComentarioMenu>
        ) : (
          <>
            <p className="text-xs font-medium text-[rgb(var(--foreground))]">{cabecalho}</p>
            {corpo}
          </>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          {onResponder && !r.oculto ? (
            <AppButton
              variant="none"
              icon={MessageSquare}
              type="button"
              onClick={onResponder}
              className={btnAcaoResposta}
            >
              Responder
            </AppButton>
          ) : null}
          {r.autorId !== viewerId ? (
            <PracaDenunciarBotao escopo={escopo} alvoTipo="FORUM_RESPOSTA" alvoId={r.id} />
          ) : null}
          {podeModerar ? (
            <ModerarRespostaBotao escopo={escopo} respostaId={r.id} oculto={r.oculto} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function LinhaRespostaTopico({
  no,
  escopo,
  topicoId,
  viewerId,
  podeModerar,
  respondendoId,
  onResponder,
}: {
  no: NoComentario<ForumRespostaItem>
  escopo: EscopoComunidade
  topicoId: string
  viewerId: string
  podeModerar: boolean
  respondendoId: string | null
  onResponder: (id: string | null) => void
}) {
  const totalRespostas = contarRespostasNaArvore(no)
  const respostas = achatarRespostasDaArvore(no)
  const naThread = comentarioEstaNaThread(
    no.comentario.id,
    respostas.map((r) => r.id),
    respondendoId,
  )
  const alvo =
    respondendoId === null
      ? null
      : respondendoId === no.comentario.id
        ? no.comentario
        : (respostas.find((r) => r.id === respondendoId) ?? null)

  return (
    <li>
      <CorpoRespostaTopico
        r={no.comentario}
        escopo={escopo}
        viewerId={viewerId}
        podeModerar={podeModerar}
      />
      <div className="px-1">
        <ComentarioRespostasBloco
          total={totalRespostas}
          forcarAberto={naThread}
          acaoResponder={
            no.comentario.oculto ? null : (
              <AppButton
                variant="none"
                icon={MessageSquare}
                type="button"
                onClick={() => onResponder(no.comentario.id)}
                className={btnAcaoResposta}
              >
                Responder
              </AppButton>
            )
          }
          composer={
            alvo && !alvo.oculto ? (
              <ResponderTopicoForm
                escopo={escopo}
                topicoId={topicoId}
                parentId={alvo.id}
                placeholder={`Resposta a ${alvo.autorNome ?? 'esta mensagem'}…`}
                compacto
                onEnviado={() => onResponder(null)}
                onCancelar={() => onResponder(null)}
              />
            ) : null
          }
        >
          {respostas.map((r) => (
            <CorpoRespostaTopico
              key={r.id}
              r={r}
              escopo={escopo}
              viewerId={viewerId}
              podeModerar={podeModerar}
              compacto
              onResponder={r.oculto ? undefined : () => onResponder(r.id)}
            />
          ))}
        </ComentarioRespostasBloco>
      </div>
    </li>
  )
}

export function ForumRespostasSection({
  escopo,
  topicoId,
  respostas,
  viewerId,
  podeModerar,
}: {
  escopo: EscopoComunidade
  topicoId: string
  respostas: ForumRespostaItem[]
  viewerId: string
  podeModerar: boolean
}) {
  const [respondendoId, setRespondendoId] = useState<string | null>(null)
  const arvore = montarArvoreComentarios(respostas)

  return (
    <section className="space-y-3">
      <h2 className="portal-display text-lg text-[rgb(var(--foreground))]">Respostas</h2>
      {arvore.length === 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhuma resposta ainda.</p>
      ) : (
        <ul className="space-y-2">
          {arvore.map((no) => (
            <LinhaRespostaTopico
              key={no.comentario.id}
              no={no}
              escopo={escopo}
              topicoId={topicoId}
              viewerId={viewerId}
              podeModerar={podeModerar}
              respondendoId={respondendoId}
              onResponder={setRespondendoId}
            />
          ))}
        </ul>
      )}
      {!respondendoId ? (
        <ResponderTopicoForm escopo={escopo} topicoId={topicoId} />
      ) : null}
    </section>
  )
}
