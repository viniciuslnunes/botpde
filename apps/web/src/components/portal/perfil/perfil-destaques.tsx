'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Plus, Loader2 } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { toast } from '@torcida/ui'
import { criarDestaquePerfil } from '@/app/portal/comunidade/actions'
import { DestaqueViewer } from './destaque-viewer'
import type { DestaquePerfilItem, PostSocialItem } from '@/lib/feed'

interface PerfilDestaquesProps {
  destaques: DestaquePerfilItem[]
  posts: PostSocialItem[]
  isSelf: boolean
  userId: string
  autorNome: string | null
}

export function PerfilDestaques({
  destaques,
  posts,
  isSelf,
  userId,
  autorNome,
}: PerfilDestaquesProps) {
  const [criando, setCriando] = useState(false)
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  const [titulo, setTitulo] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  const visiveis = destaques.filter((d) => d.posts.length > 0)

  if (visiveis.length === 0 && !isSelf) return null

  function togglePost(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 5 ? [...prev, id] : prev,
    )
  }

  function salvarDestaque(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || selecionados.length === 0) return
    startTransition(async () => {
      try {
        await criarDestaquePerfil(titulo.trim(), selecionados)
        setCriando(false)
        setTitulo('')
        setSelecionados([])
        toast.success('Destaque criado!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível criar o destaque.')
      }
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {visiveis.map((d, idx) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setViewerIdx(idx)}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-[rgb(var(--primary))] p-0.5 transition-transform hover:scale-105">
              {d.capaUrl ? (
                canOptimizeImageUrl(d.capaUrl) ? (
                  <Image src={d.capaUrl} alt="" width={64} height={64} className="h-full w-full rounded-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.capaUrl} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-lg">
                  ★
                </div>
              )}
            </div>
            <span className="max-w-[4.5rem] truncate text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
              {d.titulo}
            </span>
          </button>
        ))}
        {isSelf && (
          <button
            type="button"
            onClick={() => setCriando((v) => !v)}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary))]">
              <Plus className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium text-[rgb(var(--foreground-muted))]">Novo</span>
          </button>
        )}
      </div>

      {viewerIdx !== null && visiveis[viewerIdx] && (
        <DestaqueViewer
          destaques={visiveis}
          userId={userId}
          autorNome={autorNome}
          initialDestaqueIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}

      {criando && isSelf && (
        <form
          onSubmit={salvarDestaque}
          className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={40}
            placeholder="Título do destaque"
            className="h-9 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
          />
          <p className="text-xs text-[rgb(var(--foreground-muted))]">Selecione até 5 publicações:</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {posts.slice(0, 15).map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[rgb(var(--background-subtle))]"
              >
                <input
                  type="checkbox"
                  checked={selecionados.includes(p.id)}
                  onChange={() => togglePost(p.id)}
                  className="rounded"
                />
                <span className="line-clamp-1 text-xs text-[rgb(var(--foreground))]">{p.conteudo}</span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={pending || !titulo.trim() || selecionados.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar destaque
          </button>
        </form>
      )}
    </section>
  )
}
