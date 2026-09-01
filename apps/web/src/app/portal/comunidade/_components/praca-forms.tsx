'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from '@torcida/ui'
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
}: {
  escopo: EscopoComunidade
  topicoId: string
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
        fd.set('topicoId', topicoId)
        start(async () => {
          const r = await responderTopicoAction(fd)
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          formRef.current?.reset()
          toast.success('Resposta publicada.')
          router.refresh()
        })
      }}
    >
      <textarea name="conteudo" required rows={4} maxLength={8000} placeholder="Deixe sua resposta" className={campoClass()} />
      <button type="submit" disabled={pending} className="app-action rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on disabled:opacity-50">
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
}: {
  escopo: EscopoComunidade
  alvoTipo: 'ARTIGO' | 'NOTICIA' | 'TOPICO' | 'RESPOSTA'
  alvoId: string
  gostei?: number
  naoGostei?: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const saldo = gostei - naoGostei

  function votar(valor: 1 | -1) {
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('alvoTipo', alvoTipo)
    fd.set('alvoId', alvoId)
    fd.set('valor', String(valor))
    start(async () => {
      const r = await votarPracaAction(fd)
      if ('error' in r) toast.error(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => votar(1)}
        aria-label="Concordo"
        className="app-touch-target inline-flex items-center gap-1 rounded-lg px-3 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
      >
        <ChevronUp className="h-4 w-4" />
        Concordo
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
        {saldo}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => votar(-1)}
        aria-label="Discordo"
        className="app-touch-target inline-flex items-center gap-1 rounded-lg px-3 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
      >
        <ChevronDown className="h-4 w-4" />
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
