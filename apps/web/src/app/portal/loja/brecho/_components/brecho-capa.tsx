'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { LOJA_CAPA_ASPECT } from '@/lib/image-crop'
import { useConfirmAction } from '@/lib/confirm-action'
import { runPersistAction } from '@/lib/toast-action'
import { atualizarCapaBrecho } from '../actions'
import { AppButton } from '@/components/ui/button'

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

/** Overlay de capa na vitrine P2P — só o dono (sócio da praça). */
export function BrechoCapaControles({
  capaUrl,
  sempreVisivel = false,
}: {
  capaUrl: string | null
  /** Na vitrine do dono os botões ficam à mostra — hover escondia no toque. */
  sempreVisivel?: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const confirmAction = useConfirmAction()

  const crop = useCroppedImageUpload({
    aspect: LOJA_CAPA_ASPECT,
    purpose: 'brecho',
    title: 'Ajustar capa do brechó',
    onDone: async ({ url }) => {
      if (!url) return
      const ok = await runPersistAction(() => atualizarCapaBrecho(url), {
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
      titulo: 'Excluir a capa do seu brechó?',
      descricao: 'O card volta ao fundo da torcida, sem foto.',
      labelConfirmar: 'Excluir',
      variante: 'destructive',
      cancelled: false,
      run: () => atualizarCapaBrecho(null),
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
          <AppButton
            variant="none"
            icon={ImagePlus}
            loading={crop.busy}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              escolherArquivo()
            }}
            disabled={crop.busy}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition-colors hover:bg-black/75 disabled:opacity-50"
          >
            Adicionar capa
          </AppButton>
        </div>
      ) : (
        <div
          className={[
            'pointer-events-none absolute right-2 top-2 z-10 flex gap-1.5 transition-opacity',
            sempreVisivel ? 'opacity-100' : OVERLAY_VIS,
          ].join(' ')}
        >
          <span className="pointer-events-auto flex gap-1.5">
            <CapaBtn label="Alterar capa" onClick={escolherArquivo} disabled={crop.busy}>
              {crop.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            </CapaBtn>
            <CapaBtn label="Excluir capa" onClick={() => void excluir()} disabled={crop.busy}>
              <Trash2 className="h-4 w-4" />
            </CapaBtn>
          </span>
        </div>
      )}
    </>
  )
}
