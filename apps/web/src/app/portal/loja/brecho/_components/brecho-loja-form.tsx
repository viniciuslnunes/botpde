'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageUploadField } from '@/components/media/image-upload-field'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { LOJA_CAPA_ASPECT } from '@/lib/image-crop'
import { runPersistAction } from '@/lib/toast-action'
import { salvarMinhaLojaBrecho } from '../actions'

export function BrechoLojaForm({
  nome,
  bio,
  fotoUrl,
  capaUrl,
}: {
  nome: string
  bio: string
  fotoUrl: string
  capaUrl: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [foto, setFoto] = useState(fotoUrl)
  const [capa, setCapa] = useState(capaUrl)
  const [dirty, setDirty] = useState(false)

  return (
    <form
      data-persist-bar-root
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const ok = await runPersistAction(() => salvarMinhaLojaBrecho(fd), {
            success: 'Loja salva.',
          })
          if (ok) {
            setDirty(false)
            router.refresh()
          }
        })
      }}
      onChange={() => setDirty(true)}
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">Nome da loja</span>
        <input
          name="nome"
          defaultValue={nome}
          required
          minLength={2}
          maxLength={80}
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Bio</span>
        <textarea
          name="bio"
          defaultValue={bio}
          maxLength={280}
          rows={3}
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
        />
      </label>
      <ImageUploadField
        name="capaUrl"
        label="Capa da vitrine"
        value={capa}
        onChange={(url) => {
          setCapa(url)
          setDirty(true)
        }}
        purpose="brecho"
        aspect={LOJA_CAPA_ASPECT}
        cropTitle="Ajustar capa do brechó"
        hint="Imagem larga (16:9). É o que aparece no hub da loja e no ranking de confiança."
      />
      <ImageUploadField
        name="fotoUrl"
        label="Foto da loja"
        value={foto}
        onChange={(url) => {
          setFoto(url)
          setDirty(true)
        }}
        purpose="brecho"
        aspect={1}
        hint="Ícone quadrado ao lado do nome."
      />
      <StickyPersistBar locked={dirty || pending} dirtyLabel={dirty ? 'Alterações na loja' : undefined}>
        <button type="submit" disabled={pending} className="app-action rounded-xl bg-[rgb(var(--color-primary))] px-4 font-semibold text-[rgb(var(--color-primary-on))]">
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </StickyPersistBar>
    </form>
  )
}
