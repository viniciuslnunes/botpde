'use client'

import { useId } from 'react'
import { X } from 'lucide-react'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import { VistoriaBandeiraForm } from '@/components/patrimonio/vistoria-bandeira-form'
import type { PatrimonioCardVistoria } from '@/components/patrimonio/patrimonio-item-card'
import { useUnsavedChangesContext } from '@/lib/unsaved-changes'

export function PatrimonioVistoriaModal({
  open,
  itemId,
  itemNome,
  inicial,
  onClose,
}: {
  open: boolean
  itemId: string
  itemNome: string
  inicial: PatrimonioCardVistoria
  onClose: () => void
}) {
  const titleId = useId()
  const { confirmDiscard } = useUnsavedChangesContext()

  async function requestClose() {
    const ok = await confirmDiscard()
    if (ok) onClose()
  }

  return (
    <AppModal open={open} onClose={() => void requestClose()} size="lg" labelledBy={titleId}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-tight text-[rgb(var(--foreground))] sm:text-lg"
          >
            Vistoria · {itemNome}
          </h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Medidas, mastro e autorização — o que o clube pede na entrada do estádio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void requestClose()}
          aria-label="Fechar"
          className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <AppModalBody className="px-5 py-4 sm:px-6">
        <VistoriaBandeiraForm
          itemId={itemId}
          itemNome={itemNome}
          inicial={inicial}
          variant="modal"
          onSaved={onClose}
          onCancel={() => void requestClose()}
        />
      </AppModalBody>
    </AppModal>
  )
}
