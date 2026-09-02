'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  aplicarVotoPracaLocal,
  contagemExibidaVotoPraca,
  proximoVotoPraca,
  rankComentariosPraca,
} from '@torcida/types/portal-noticias-forum'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { PracaComentarioItem } from '@/lib/praca'
import { comentarPracaAction, votarPracaAction } from '../praca-actions'
import { PracaDenunciarBotao } from './praca-denuncia-modal'
import { Avatar } from '@/components/portal/avatar'
import { formatRelative } from '@/lib/format-datetime'

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
}: {
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
  parentId?: string
  placeholder: string
  compacto?: boolean
  onEnviado?: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <form
      ref={formRef}
      className="space-y-2"
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
      <textarea
        name="conteudo"
        required
        rows={compacto ? 2 : 3}
        maxLength={2000}
        placeholder={placeholder}
        className={campoClass()}
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

function LinhaComentario({
  comentario,
  escopo,
  alvoTipo,
  alvoId,
  viewerId,
  respostas,
  indent = false,
}: {
  comentario: PracaComentarioItem
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
  viewerId: string
  respostas: PracaComentarioItem[]
  indent?: boolean
}) {
  const [respondendo, setRespondendo] = useState(false)

  return (
    <li className={indent ? 'ml-8 sm:ml-10' : undefined}>
      <div className="flex items-start gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
        <Avatar
          nome={comentario.autorNome}
          avatarUrl={comentario.autorAvatarUrl}
          size="sm"
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[rgb(var(--foreground))]">
            {comentario.autorNome ?? 'Alguém'}{' '}
            <span className="font-normal text-[rgb(var(--foreground-muted))]">
              · {formatRelative(comentario.criadoEm)}
            </span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
            {comentario.conteudo}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VotarComentario
              escopo={escopo}
              comentarioId={comentario.id}
              gostei={comentario.gostei}
              naoGostei={comentario.naoGostei}
              meuVoto={comentario.meuVoto}
            />
            {!indent ? (
              <button
                type="button"
                onClick={() => setRespondendo((v) => !v)}
                className="app-touch-line inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Responder
              </button>
            ) : null}
            {comentario.autorId !== viewerId ? (
              <PracaDenunciarBotao escopo={escopo} alvoTipo="PRACA_COMENTARIO" alvoId={comentario.id} />
            ) : null}
          </div>
          {respondendo ? (
            <div className="mt-3">
              <FormularioComentario
                escopo={escopo}
                alvoTipo={alvoTipo}
                alvoId={alvoId}
                parentId={comentario.id}
                placeholder="Escreva sua resposta…"
                compacto
                onEnviado={() => setRespondendo(false)}
              />
            </div>
          ) : null}
        </div>
      </div>
      {respostas.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {respostas.map((r) => (
            <LinhaComentario
              key={r.id}
              comentario={r}
              escopo={escopo}
              alvoTipo={alvoTipo}
              alvoId={alvoId}
              viewerId={viewerId}
              respostas={[]}
              indent
            />
          ))}
        </ul>
      ) : null}
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
  const arvore = useMemo(() => {
    const porPai = new Map<string | null, PracaComentarioItem[]>()
    for (const c of comentarios) {
      const chave = c.parentId
      const lista = porPai.get(chave) ?? []
      lista.push(c)
      porPai.set(chave, lista)
    }
    const raiz = rankComentariosPraca(porPai.get(null) ?? [])
    return raiz.map((c) => ({
      comentario: c,
      respostas: porPai.get(c.id) ?? [],
    }))
  }, [comentarios])

  return (
    <section className="mx-auto w-full max-w-[40rem] space-y-3">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Comentários</h2>
      {arvore.length === 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhum comentário ainda.</p>
      ) : (
        <ul className="space-y-3">
          {arvore.map(({ comentario, respostas }) => (
            <LinhaComentario
              key={comentario.id}
              comentario={comentario}
              escopo={escopo}
              alvoTipo={alvoTipo}
              alvoId={alvoId}
              viewerId={viewerId}
              respostas={respostas}
            />
          ))}
        </ul>
      )}
      <FormularioComentario
        escopo={escopo}
        alvoTipo={alvoTipo}
        alvoId={alvoId}
        placeholder="Comente neste card…"
      />
    </section>
  )
}
