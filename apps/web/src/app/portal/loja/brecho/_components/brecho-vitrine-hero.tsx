'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Pencil } from 'lucide-react'
import { LogoImage } from '@/components/media/logo-image'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { LojaCapaMidia } from '../../_components/loja-capa'
import { runPersistAction } from '@/lib/toast-action'
import { atualizarIdentidadeBrecho } from '../actions'
import { BrechoCapaControles } from './brecho-capa'

const CLIP =
  '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]'

function BrechoFotoEdit({
  fotoUrl,
  nome,
}: {
  fotoUrl: string | null
  nome: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const crop = useCroppedImageUpload({
    aspect: 1,
    purpose: 'brecho',
    title: 'Ajustar foto do brechó',
    onDone: async ({ url }) => {
      if (!url) return
      const ok = await runPersistAction(() => atualizarIdentidadeBrecho({ fotoUrl: url }), {
        success: 'Foto atualizada.',
        errorFallback: 'Não foi possível salvar a foto.',
      })
      if (ok) router.refresh()
    },
  })

  return (
    <>
      {crop.dialog}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) crop.open(file)
        }}
      />
      <button
        type="button"
        aria-label="Alterar foto do brechó"
        title="Alterar foto"
        disabled={crop.busy}
        onClick={() => fileRef.current?.click()}
        className="group/foto relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 border-[rgb(var(--surface))] bg-[rgb(var(--background-subtle))] shadow-md"
      >
        {fotoUrl ? (
          <LogoImage src={fotoUrl} alt={nome} size={64} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[rgb(var(--foreground-muted))]">
            {crop.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/foto:opacity-100">
          {crop.busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Pencil className="h-4 w-4 text-white" />
          )}
        </span>
      </button>
    </>
  )
}

function BrechoNomeEdit({ nome }: { nome: string }) {
  const router = useRouter()
  const [prev, setPrev] = useState(nome)
  const [texto, setTexto] = useState(nome)
  const [editando, setEditando] = useState(false)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (nome !== prev) {
    setPrev(nome)
    setTexto(nome)
  }

  async function salvar() {
    const next = texto.trim()
    if (next.length < 2 || next === nome) {
      setTexto(nome)
      setEditando(false)
      return
    }
    setPending(true)
    const ok = await runPersistAction(() => atualizarIdentidadeBrecho({ nome: next }), {
      success: 'Nome atualizado.',
      errorFallback: 'Não foi possível salvar o nome.',
    })
    setPending(false)
    if (ok) {
      setEditando(false)
      router.refresh()
    }
  }

  if (!editando) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="truncate text-xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-2xl">
          {nome}
        </h1>
        <button
          type="button"
          aria-label="Editar nome do brechó"
          title="Editar nome"
          onClick={() => setEditando(true)}
          className="app-touch-target inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      value={texto}
      maxLength={80}
      disabled={pending}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => void salvar()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void salvar()
        }
        if (e.key === 'Escape') {
          setTexto(nome)
          setEditando(false)
        }
      }}
      className="w-full min-w-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-xl font-black uppercase tracking-tight"
      aria-label="Nome do brechó"
    />
  )
}

export function BrechoVitrineHero({
  nome,
  capaUrl,
  capaExibicao,
  fotoUrl,
  fallbackAvatarUrl,
  ranking,
  bio,
  podeEditar,
  denuncia,
}: {
  nome: string
  capaUrl: string | null
  capaExibicao?: string | null
  fotoUrl: string | null
  fallbackAvatarUrl: string | null
  ranking: ReactNode
  bio: string | null
  podeEditar: boolean
  denuncia: ReactNode
}) {
  const foto = fotoUrl || fallbackAvatarUrl

  return (
    <section className="space-y-3">
      <div className={`group relative overflow-hidden ${CLIP}`}>
        <div className="relative h-28 w-full overflow-hidden bg-[rgb(var(--background-subtle))] sm:h-36">
          <LojaCapaMidia src={capaExibicao ?? capaUrl} alt="" />
          {podeEditar ? <BrechoCapaControles capaUrl={capaUrl} sempreVisivel /> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {podeEditar ? (
          <BrechoFotoEdit fotoUrl={fotoUrl} nome={nome} />
        ) : foto ? (
          <LogoImage
            src={foto}
            alt=""
            size={64}
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          {podeEditar ? (
            <BrechoNomeEdit nome={nome} />
          ) : (
            <h1 className="truncate text-xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-2xl">
              {nome}
            </h1>
          )}
          <div className="text-[rgb(var(--foreground-muted))]">{ranking}</div>
          {bio ? <p className="text-sm text-[rgb(var(--foreground-muted))]">{bio}</p> : null}
        </div>
        {denuncia}
      </div>
    </section>
  )
}
