'use client'

import { useState, useTransition } from 'react'
import {
  BRECHO_CATEGORIA,
  BRECHO_MODALIDADE,
} from '@torcida/types'
import { ImageUploadField } from '@/components/media/image-upload-field'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { runPersistAction } from '@/lib/toast-action'
import { criarAnuncioBrechoAction } from '../actions'

type Modalidade = 'TROCA' | 'DOACAO' | 'VENDA'
type Categoria = keyof typeof BRECHO_CATEGORIA

export function BrechoAnuncioForm() {
  const [pending, start] = useTransition()
  const [modalidade, setModalidade] = useState<Modalidade>('TROCA')
  const [categoria, setCategoria] = useState<Categoria>('CAMISA')
  const [foto, setFoto] = useState('')
  const [dirty, setDirty] = useState(false)
  const aviso = BRECHO_CATEGORIA[categoria].aviso

  return (
    <form
      data-persist-bar-root
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set('imagensUrlJson', JSON.stringify(foto ? [foto] : []))
        start(async () => {
          await runPersistAction(() => criarAnuncioBrechoAction(fd), {
            success: 'Anúncio publicado.',
          })
        })
      }}
      onChange={() => setDirty(true)}
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">Título</span>
        <input
          name="titulo"
          required
          minLength={2}
          maxLength={100}
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Descrição</span>
        <textarea
          name="descricao"
          required
          minLength={8}
          maxLength={2000}
          rows={4}
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Modalidade</span>
          <select
            name="modalidade"
            value={modalidade}
            onChange={(e) => setModalidade(e.target.value as Modalidade)}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
          >
            {Object.entries(BRECHO_MODALIDADE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            {BRECHO_MODALIDADE[modalidade].hint}
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Categoria</span>
          <select
            name="categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as Categoria)}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
          >
            {Object.entries(BRECHO_CATEGORIA).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {aviso ? (
        <p className="text-xs text-[rgb(var(--color-warning-fg))]">{aviso}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tamanho</span>
          <input
            name="tamanho"
            maxLength={10}
            placeholder="M, G, UN…"
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
          />
        </label>
        {modalidade === 'VENDA' ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Preço pedido (R$)</span>
            <input
              name="preco"
              type="number"
              min={1}
              step="0.01"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
            />
          </label>
        ) : null}
        {modalidade === 'TROCA' ? (
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">O que aceita em troca</span>
            <input
              name="aceitoTroca"
              required
              maxLength={400}
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
            />
          </label>
        ) : null}
      </div>
      <ImageUploadField
        name="fotoUrl"
        label="Foto do item"
        value={foto}
        onChange={(url) => {
          setFoto(url)
          setDirty(true)
        }}
        purpose="brecho"
        aspect={1}
      />
      <StickyPersistBar locked={dirty || pending} dirtyLabel={dirty ? 'Anúncio não publicado' : undefined}>
        <button
          type="submit"
          disabled={pending || !foto}
          className="app-action rounded-xl bg-[rgb(var(--color-primary))] px-4 font-semibold text-[rgb(var(--color-primary-on))]"
        >
          {pending ? 'Publicando…' : 'Publicar'}
        </button>
      </StickyPersistBar>
    </form>
  )
}
