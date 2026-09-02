'use client'

import { useState, useTransition } from 'react'
import { toast } from '@torcida/ui'
import { slugMemoriaCapitulo } from '@torcida/types'
import { removerMemoriaCapitulo, salvarMemoriaCapitulo } from '@/app/portal/memoria/actions'
import type { MemoriaCapituloResumo } from '@/app/portal/memoria/_lib/memoria-capitulos'
import { AppButton } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

type Props = {
  capitulos: MemoriaCapituloResumo[]
  podeGerir: boolean
}

export function MemoriaCapitulosAdmin({ capitulos, podeGerir }: Props) {
  const [titulo, setTitulo] = useState('')
  const [slug, setSlug] = useState('')
  const [descricao, setDescricao] = useState('')
  const [diasRaw, setDiasRaw] = useState('')
  const [pending, start] = useTransition()

  if (!podeGerir) return null

  function autoSlug(nextTitulo: string) {
    setTitulo(nextTitulo)
    const s = slugMemoriaCapitulo(nextTitulo)
    if (s) setSlug(s)
  }

  function salvar() {
    const dias = diasRaw
      .split(/[\s,;]+/)
      .map((d) => d.trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    start(async () => {
      const res = await salvarMemoriaCapitulo({
        titulo: titulo.trim(),
        slug: slug.trim(),
        descricao: descricao.trim() || undefined,
        dias,
        ativo: true,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Capítulo salvo.')
      setTitulo('')
      setSlug('')
      setDescricao('')
      setDiasRaw('')
    })
  }

  function remover(id: string) {
    start(async () => {
      const res = await removerMemoriaCapitulo({ id })
      if (res.error) toast.error(res.error)
      else toast.success('Capítulo removido.')
    })
  }

  return (
    <section className="mt-8 space-y-4 rounded-2xl border border-[rgb(var(--border))] p-4">
      <div>
        <h2 className="portal-kicker text-[rgb(var(--foreground))]">Capítulos do acervo</h2>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Agrupe dias em campanhas ou temporadas — a linha do tempo continua por dia civil.
        </p>
      </div>

      {capitulos.length > 0 && (
        <ul className="space-y-2">
          {capitulos.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                  {c.titulo}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgb(var(--foreground-muted))]">
                  {c.slug} · {c.dias.length} dias
                </span>
              </span>
              <AppButton
                variant="none"
                icon={Trash2}
                type="button"
                disabled={pending}
                onClick={() => remover(c.id)}
                className="app-touch-line shrink-0 text-xs text-[rgb(var(--color-danger-fg))]"
              >
                Excluir
              </AppButton>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-[rgb(var(--border))] pt-4">
        <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Novo capítulo</p>
        <input
          value={titulo}
          onChange={(e) => autoSlug(e.target.value)}
          placeholder="Título (ex.: Libertadores 2026)"
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-base"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug-do-capitulo"
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 font-mono text-sm"
        />
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição opcional"
          rows={2}
          className="w-full resize-y rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-base"
        />
        <textarea
          value={diasRaw}
          onChange={(e) => setDiasRaw(e.target.value)}
          placeholder="Dias YYYY-MM-DD separados por espaço ou vírgula"
          rows={2}
          className="w-full resize-y rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 font-mono text-sm"
        />
        <AppButton
          variant="primary"
          icon={Plus}
          type="button"
          disabled={pending}
          onClick={salvar}
          className="rounded-xl px-4 text-sm font-semibold"
        >
          Criar capítulo
        </AppButton>
      </div>
    </section>
  )
}
