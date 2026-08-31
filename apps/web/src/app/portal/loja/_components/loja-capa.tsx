'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { LOJA_CAPA_ASPECT } from '@/lib/image-crop'
import { useConfirmAction } from '@/lib/confirm-action'
import { runPersistAction } from '@/lib/toast-action'
import { atualizarCapaLoja } from '../actions'

const OVERLAY_VIS =
  'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'

function CapaBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      className="app-touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function LojaCapaMidia({
  src,
  alt,
  corPrimaria,
}: {
  src: string | null
  alt: string
  corPrimaria?: string
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center"
        decoding="async"
      />
    )
  }

  return (
    <div
      className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgb(var(--color-primary)_/_0.45),transparent_55%),linear-gradient(160deg,rgb(var(--color-primary)_/_0.35),rgb(var(--background))_70%)]"
      style={
        corPrimaria
          ? {
              background: `radial-gradient(ellipse at 30% 20%, ${corPrimaria}99, transparent 55%), linear-gradient(160deg, ${corPrimaria}80, rgb(var(--background)) 72%)`,
            }
          : undefined
      }
      aria-hidden
    />
  )
}

export function LojaCapaControles({
  tenantId,
  capaUrl,
  capaCustom,
}: {
  tenantId: string
  capaUrl: string | null
  capaCustom: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const confirmAction = useConfirmAction()

  const crop = useCroppedImageUpload({
    aspect: LOJA_CAPA_ASPECT,
    purpose: 'loja',
    tenantId,
    title: 'Ajustar capa da loja',
    onDone: async ({ url }) => {
      if (!url) return
      const ok = await runPersistAction(() => atualizarCapaLoja(tenantId, url), {
        success: 'Capa atualizada.',
        errorFallback: 'Não foi possível salvar a capa.',
      })
      if (ok) router.refresh()
    },
  })

  function escolherArquivo() {
    fileRef.current?.click()
  }

  async function excluir() {
    const ok = await confirmAction({
      titulo: 'Excluir a capa desta loja?',
      descricao:
        'A vitrine volta a usar a foto do produto em destaque, se essa opção estiver ligada no admin.',
      labelConfirmar: 'Excluir',
      variante: 'destructive',
      cancelled: false,
      run: () => atualizarCapaLoja(tenantId, null),
      success: 'Capa removida.',
      errorFallback: 'Não foi possível remover a capa.',
    })
    if (ok) router.refresh()
  }

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

      {!capaUrl ? (
        <div className="pointer-events-none absolute right-2 top-2 z-10 p-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              escolherArquivo()
            }}
            disabled={crop.busy}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition-colors hover:bg-black/75 disabled:opacity-50"
          >
            {crop.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Adicionar capa
          </button>
        </div>
      ) : (
        <div
          className={[
            'pointer-events-none absolute right-2 top-2 z-10 flex gap-1.5 transition-opacity',
            OVERLAY_VIS,
          ].join(' ')}
        >
          <span className="pointer-events-auto flex gap-1.5">
            <CapaBtn label="Alterar capa" onClick={escolherArquivo} disabled={crop.busy}>
              {crop.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            </CapaBtn>
            {capaCustom ? (
              <CapaBtn label="Excluir capa" onClick={() => void excluir()} disabled={crop.busy}>
                <Trash2 className="h-4 w-4" />
              </CapaBtn>
            ) : null}
          </span>
        </div>
      )}
    </>
  )
}
