'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, MessageSquare, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  aplicarVotoPracaLocal,
  contagemExibidaVotoPraca,
  proximoVotoPraca,
  rankComentariosPraca,
  PRACA_COMENTARIO_MAX,
} from '@torcida/types/portal-noticias-forum'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { PracaComentarioItem } from '@/lib/praca'
import {
  comentarPracaAction,
  editarComentarioPraca,
  excluirComentarioPraca,
  votarPracaAction,
} from '../praca-actions'
import { PracaDenunciarBotao } from './praca-denuncia-modal'
import { Avatar } from '@/components/portal/avatar'
import { ComentarioMenu } from '@/components/portal/comentario-menu'
import { formatRelative } from '@/lib/format-datetime'
import { AppButton } from '@/components/ui/button'
import {
  ComentarioRespostasBloco,
  comentarioEstaNaThread,
} from '@/components/portal/comentario-respostas-bloco'
import {
  achatarRespostasDaArvore,
  contarRespostasNaArvore,
  montarArvoreComentarios,
  type NoComentario,
} from '@/lib/comentario-thread'

const btnResponderClass =
  'app-touch-line inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]'

function campoClass() {
  return 'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]'
}

function VotarComentario({
  escopo,
  comentarioId,
  gostei,
  naoGostei,
  meuVoto,
}: {
  escopo: EscopoComunidade
  comentarioId: string
  gostei: number
  naoGostei: number
  meuVoto: 1 | -1 | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [voto, setVoto] = useState<1 | -1 | null>(meuVoto)
  const [totalGostei, setTotalGostei] = useState(gostei)
  const [totalNao, setTotalNao] = useState(naoGostei)
  const apoios = contagemExibidaVotoPraca(totalGostei, totalNao)

  function votar(clicado: 1 | -1) {
    const anterior = voto
    const novo = proximoVotoPraca(anterior, clicado)
    const snapshot = { voto: anterior, gostei: totalGostei, nao: totalNao }
    const local = aplicarVotoPracaLocal(totalGostei, totalNao, anterior, novo)
    setVoto(novo === 0 ? null : novo)
    setTotalGostei(local.gostei)
    setTotalNao(local.naoGostei)
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('alvoTipo', 'COMENTARIO')
    fd.set('alvoId', comentarioId)
    fd.set('valor', String(novo))
    start(async () => {
      const r = await votarPracaAction(fd)
      if ('error' in r) {
        setVoto(snapshot.voto)
        setTotalGostei(snapshot.gostei)
        setTotalNao(snapshot.nao)
        toast.error(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => votar(1)}
        aria-pressed={voto === 1}
        aria-label={voto === 1 ? 'Remover concordância' : 'Concordo'}
        className={[
          'app-touch-target inline-flex items-center gap-0.5 rounded-lg px-2 text-xs font-medium disabled:opacity-50',
          voto === 1
            ? 'text-[rgb(var(--color-primary-fg))]'
            : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        <ChevronUp className={['h-3.5 w-3.5', voto === 1 ? 'stroke-[2.5]' : ''].join(' ')} />
      </button>
      <span className="min-w-6 text-center text-xs font-semibold tabular-nums text-[rgb(var(--foreground))]">
        {apoios}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => votar(-1)}
        aria-pressed={voto === -1}
        aria-label={voto === -1 ? 'Remover discordância' : 'Discordo'}
        className={[
          'app-touch-target inline-flex items-center gap-0.5 rounded-lg px-2 text-xs font-medium disabled:opacity-50',
          voto === -1
            ? 'text-[rgb(var(--foreground))]'
            : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        <ChevronDown className={['h-3.5 w-3.5', voto === -1 ? 'stroke-[2.5]' : ''].join(' ')} />
      </button>
    </div>
  )
}

function FormularioComentario({
  escopo,
  alvoTipo,
  alvoId,
  parentId,
  placeholder,
  compacto = false,
  onEnviado,
  onCancelar,
}: {
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
  parentId?: string
  placeholder: string
  compacto?: boolean
  onEnviado?: () => void
  onCancelar?: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <form
      ref={formRef}
      className={[
        'space-y-2',
        parentId
          ? 'rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-2.5'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      action={(fd) => {
        fd.set('escopo', escopo)
        fd.set('alvoTipo', alvoTipo)
        fd.set('alvoId', alvoId)
        if (parentId) fd.set('parentId', parentId)
        start(async () => {
          const r = await comentarPracaAction(fd)
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          formRef.current?.reset()
          onEnviado?.()
          router.refresh()
        })
      }}
    >
      {parentId && onCancelar ? (
        <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          <span>Respondendo na thread</span>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cancelar resposta"
            className="app-touch-target inline-flex rounded-lg p-1 hover:bg-[rgb(var(--surface))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <textarea
        name="conteudo"
        required
        rows={compacto ? 2 : 3}
        maxLength={2000}
        placeholder={placeholder}
        className={campoClass()}
        autoFocus={Boolean(parentId)}
      />
      <button
        type="submit"
        disabled={pending}
        className="app-action rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on disabled:opacity-50"
      >
        {pending ? 'Enviando…' : parentId ? 'Responder' : 'Comentar'}
      </button>
    </form>
  )
}

function CorpoComentarioPraca({
  comentario,
  escopo,
  viewerId,
  compacto = false,
  onResponder,
}: {
  comentario: PracaComentarioItem
  escopo: EscopoComunidade
  viewerId: string
  compacto?: boolean
  onResponder?: () => void
}) {
  const router = useRouter()
  const proprio = comentario.autorId === viewerId
  const cabecalho = (
    <>
      {proprio ? 'Você' : (comentario.autorNome ?? 'Alguém')}{' '}
      <span className="font-normal text-[rgb(var(--foreground-muted))]">
        · {formatRelative(comentario.criadoEm)}
      </span>
    </>
  )
  const corpo = (
    <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
      {comentario.conteudo}
    </p>
  )

  return (
    <div className={compacto ? 'py-2.5 pr-3' : undefined}>
      <div
        className={
          compacto
            ? 'flex items-start gap-2.5'
            : 'flex items-start gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3'
        }
      >
        <Avatar
          nome={comentario.autorNome}
          avatarUrl={comentario.autorAvatarUrl}
          size={compacto ? 'xs' : 'sm'}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          {proprio ? (
            <ComentarioMenu
              comentarioId={comentario.id}
              conteudoInicial={comentario.conteudo}
              autorLabel={cabecalho}
              variant="bare"
              comMencoes={false}
              maxLength={PRACA_COMENTARIO_MAX}
              editarAction={async (id, next) => {
                const r = await editarComentarioPraca(id, next, escopo)
                if ('error' in r) throw new Error(r.error)
                return r.conteudo
              }}
              excluirAction={async (id) => {
                const r = await excluirComentarioPraca(id, escopo)
                if ('error' in r) throw new Error(r.error)
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VotarComentario
              escopo={escopo}
              comentarioId={comentario.id}
              gostei={comentario.gostei}
              naoGostei={comentario.naoGostei}
              meuVoto={comentario.meuVoto}
            />
            {onResponder ? (
              <AppButton
                variant="none"
                icon={MessageSquare}
                type="button"
                onClick={onResponder}
                className={btnResponderClass}
              >
                Responder
              </AppButton>
            ) : null}
            {comentario.autorId !== viewerId ? (
              <PracaDenunciarBotao escopo={escopo} alvoTipo="PRACA_COMENTARIO" alvoId={comentario.id} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function LinhaComentario({
  no,
  escopo,
  alvoTipo,
  alvoId,
  viewerId,
  respondendoId,
  onResponder,
}: {
  no: NoComentario<PracaComentarioItem>
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
  viewerId: string
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
      <CorpoComentarioPraca
        comentario={no.comentario}
        escopo={escopo}
        viewerId={viewerId}
      />
      <div className="px-1">
        <ComentarioRespostasBloco
          total={totalRespostas}
          forcarAberto={naThread}
          acaoResponder={
            <AppButton
              variant="none"
              icon={MessageSquare}
              type="button"
              onClick={() => onResponder(no.comentario.id)}
              className={btnResponderClass}
            >
              Responder
            </AppButton>
          }
          composer={
            alvo ? (
              <FormularioComentario
                escopo={escopo}
                alvoTipo={alvoTipo}
                alvoId={alvoId}
                parentId={alvo.id}
                placeholder={`Resposta a ${alvo.autorNome ?? 'este comentário'}…`}
                compacto
                onEnviado={() => onResponder(null)}
                onCancelar={() => onResponder(null)}
              />
            ) : null
          }
        >
          {respostas.map((r) => (
            <CorpoComentarioPraca
              key={r.id}
              comentario={r}
              escopo={escopo}
              viewerId={viewerId}
              compacto
              onResponder={() => onResponder(r.id)}
            />
          ))}
        </ComentarioRespostasBloco>
      </div>
    </li>
  )
}

export function PracaComentariosSection({
  escopo,
  alvoTipo,
  alvoId,
  comentarios,
  viewerId,
}: {
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
  comentarios: PracaComentarioItem[]
  viewerId: string
}) {
  const [respondendoId, setRespondendoId] = useState<string | null>(null)
  const arvore = useMemo(() => {
    const nos = montarArvoreComentarios(comentarios)
    const raizRanqueada = rankComentariosPraca(nos.map((n) => n.comentario))
    const porId = new Map(nos.map((n) => [n.comentario.id, n]))
    return raizRanqueada.flatMap((c) => {
      const no = porId.get(c.id)
      return no ? [no] : []
    })
  }, [comentarios])

  return (
    <section className="mx-auto w-full max-w-[40rem] space-y-3">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Comentários</h2>
      {arvore.length === 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhum comentário ainda.</p>
      ) : (
        <ul className="space-y-3">
          {arvore.map((no) => (
            <LinhaComentario
              key={no.comentario.id}
              no={no}
              escopo={escopo}
              alvoTipo={alvoTipo}
              alvoId={alvoId}
              viewerId={viewerId}
              respondendoId={respondendoId}
              onResponder={setRespondendoId}
            />
          ))}
        </ul>
      )}
      {!respondendoId ? (
        <FormularioComentario
          escopo={escopo}
          alvoTipo={alvoTipo}
          alvoId={alvoId}
          placeholder="Comente neste card…"
        />
      ) : null}
    </section>
  )
}
