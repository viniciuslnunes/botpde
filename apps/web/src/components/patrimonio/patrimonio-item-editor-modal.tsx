'use client'

import { useId } from 'react'
import { X } from 'lucide-react'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import {
  PatrimonioItemForm,
  type PatrimonioFormInitial,
  type ResponsavelOption,
} from '@/components/patrimonio/patrimonio-item-form'
import { useUnsavedChangesContext } from '@/lib/unsaved-changes'

export function PatrimonioItemEditorModal({
  open,
  item,
  candidatos,
  tenantId,
  categoriaTravada,
  onClose,
}: {
  open: boolean
  /** `null` = cadastrar novo. */
  item: PatrimonioFormInitial | null
  candidatos: ResponsavelOption[]
  tenantId: string
  categoriaTravada?: string | null
  onClose: () => void
}) {
  const titleId = useId()
  const { confirmDiscard } = useUnsavedChangesContext()
  const isEdit = Boolean(item?.id)

  async function requestClose() {
    const ok = await confirmDiscard()
    if (ok) onClose()
  }

  return (
    <AppModal
      open={open}
      onClose={() => void requestClose()}
      size="lg"
      labelledBy={titleId}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-tight text-[rgb(var(--foreground))] sm:text-lg"
          >
            {isEdit ? `Editar ${item?.nome}` : 'Novo item'}
          </h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            {isEdit
              ? 'Foto, nome, status e onde a peça está guardada.'
              : 'Cadastre com foto. É o que diferencia peças parecidas no acervo.'}
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
        <PatrimonioItemForm
          initial={
            item ?? {
              nome: '',
              categoria: categoriaTravada ?? 'OUTROS',
              status: 'DISPONIVEL',
              quantidade: 1,
              localizacao: null,
              valorEstimado: null,
              observacao: null,
              fotoUrl: null,
              responsavelId: null,
            }
          }
          candidatos={candidatos}
          tenantId={tenantId}
          categoriaTravada={categoriaTravada}
          onCancel={() => void requestClose()}
          onSaved={onClose}
        />
      </AppModalBody>
    </AppModal>
  )
}
