'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  aplicarVotoPracaLocal,
  contagemExibidaVotoPraca,
  proximoVotoPraca,
} from '@torcida/types/portal-noticias-forum'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import {
  criarTopicoAction,
  responderTopicoAction,
  votarPracaAction,
  comentarPracaAction,
  publicarArtigoAction,
} from '../praca-actions'

function campoClass() {
  return 'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]'
}

export function CriarTopicoForm({ escopo }: { escopo: EscopoComunidade }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <form
      className="space-y-3"
      action={(fd) => {
        fd.set('escopo', escopo)
        start(async () => {
          const r = await criarTopicoAction(fd)
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          router.push(`/portal/comunidade/forum/${r.id}?escopo=${escopo}`)
        })
      }}
    >
      <input name="titulo" required minLength={3} maxLength={180} placeholder="Título do tópico" className={campoClass()} />
      <textarea name="corpo" required rows={8} maxLength={8000} placeholder="O que você quer discutir?" className={campoClass()} />
      <button type="submit" disabled={pending} className="app-action w-full rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on disabled:opacity-50">
        {pending ? 'Publicando…' : 'Publicar tópico'}
      </button>
    </form>
  )
}

export function ResponderTopicoForm({
  escopo,
  topicoId,
  parentId,
  placeholder = 'Deixe sua resposta',
  compacto = false,
  onEnviado,
  onCancelar,
}: {
  escopo: EscopoComunidade
  topicoId: string
  parentId?: string
  placeholder?: string
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
        fd.set('topicoId', topicoId)
        if (parentId) fd.set('parentId', parentId)
        start(async () => {
          const r = await responderTopicoAction(fd)
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          formRef.current?.reset()
          toast.success(parentId ? 'Resposta na thread.' : 'Resposta publicada.')
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
        rows={compacto ? 2 : 4}
        maxLength={8000}
        placeholder={placeholder}
        className={campoClass()}
        autoFocus={Boolean(parentId)}
      />
      <button
        type="submit"
        disabled={pending}
        className="app-action rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Responder'}
      </button>
    </form>
  )
}

export function VotarPracaBotoes({
  escopo,
  alvoTipo,
  alvoId,
  gostei = 0,
  naoGostei = 0,
  meuVoto = null,
}: {
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA' | 'TOPICO' | 'RESPOSTA' | 'COMENTARIO'
  alvoId: string
  gostei?: number
  naoGostei?: number
  meuVoto?: 1 | -1 | null
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
    fd.set('alvoTipo', alvoTipo)
    fd.set('alvoId', alvoId)
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
          'app-touch-target inline-flex items-center gap-1 rounded-lg px-2 text-xs font-medium disabled:opacity-50',
          voto === 1
            ? 'text-[rgb(var(--color-primary-fg))]'
            : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        <ChevronUp className={['h-4 w-4', voto === 1 ? 'stroke-[2.5]' : ''].join(' ')} />
        Concordo
      </button>
      <span
        className="min-w-7 px-1 text-center text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]"
        aria-label={`${apoios} de saldo no tópico`}
      >
        {apoios}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => votar(-1)}
        aria-pressed={voto === -1}
        aria-label={voto === -1 ? 'Remover discordância' : 'Discordo'}
        className={[
          'app-touch-target inline-flex items-center gap-1 rounded-lg px-2 text-xs font-medium disabled:opacity-50',
          voto === -1
            ? 'text-[rgb(var(--foreground))]'
            : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        <ChevronDown className={['h-4 w-4', voto === -1 ? 'stroke-[2.5]' : ''].join(' ')} />
        Discordo
      </button>
    </div>
  )
}

export function ComentarPracaForm({
  escopo,
  alvoTipo,
  alvoId,
}: {
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
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
        start(async () => {
          const r = await comentarPracaAction(fd)
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          formRef.current?.reset()
          router.refresh()
        })
      }}
    >
      <textarea name="conteudo" required rows={3} maxLength={2000} placeholder="Comente neste card" className={campoClass()} />
      <button type="submit" disabled={pending} className="app-action rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on disabled:opacity-50">
        {pending ? 'Enviando…' : 'Comentar'}
      </button>
    </form>
  )
}

export function PublicarArtigoForm({ escopo }: { escopo: EscopoComunidade }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  return (
    <form
      className="space-y-3"
      action={(fd) => {
        fd.set('escopo', escopo)
        start(async () => {
          setErro(null)
          const r = await publicarArtigoAction(fd)
          if ('error' in r) {
            setErro(r.error)
            toast.error(r.error)
            return
          }
          router.push(`/portal/comunidade/noticias/${r.id}?escopo=${escopo}`)
        })
      }}
    >
      <input name="titulo" required minLength={3} maxLength={180} placeholder="Título" className={campoClass()} />
      <input name="resumo" maxLength={400} placeholder="Resumo (opcional)" className={campoClass()} />
      <textarea name="corpo" required rows={12} maxLength={20000} placeholder="Texto do artigo" className={campoClass()} />
      {erro && <p className="text-sm text-red-500">{erro}</p>}
      <button type="submit" disabled={pending} className="app-action w-full rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on disabled:opacity-50">
        {pending ? 'Publicando…' : 'Publicar artigo'}
      </button>
    </form>
  )
}
