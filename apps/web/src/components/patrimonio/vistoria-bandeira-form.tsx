'use client'

import { useState, useTransition, type FormEvent } from 'react'
import {
  registrarVistoriaBandeira,
  type VistoriaState,
} from '@/app/admin/bandeiras/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { AppButton } from '@/components/ui/button'
import { X } from 'lucide-react'

export type VistoriaInicial = {
  larguraM?: number | null
  alturaM?: number | null
  comMastro?: boolean
  orgao?: string | null
  protocolo?: string | null
  validade?: string | null
  observacao?: string | null
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

const FIELD =
  'mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]'

const VISTORIA_LABELS: Record<string, string> = {
  larguraM: 'Largura',
  alturaM: 'Altura',
  orgao: 'Órgão',
  protocolo: 'Protocolo',
  validade: 'Validade',
  comMastro: 'Mastro',
  observacao: 'Observação da vistoria',
}

/**
 * Ficha de vistoria de uma bandeira: o que o clube e a polícia pedem na
 * entrada. Campo a campo, não texto livre — sem estrutura ninguém consegue
 * avisar que a liberação venceu.
 */
export function VistoriaBandeiraForm({
  itemId,
  itemNome,
  inicial,
  variant = 'bloco',
  onSaved,
  onCancel,
}: {
  itemId: string
  itemNome: string
  inicial?: VistoriaInicial | null
  /** `modal` omite o título interno — o AppModal já traz. */
  variant?: 'bloco' | 'modal'
  onSaved?: () => void
  onCancel?: () => void
}) {
  const [state, setState] = useState<VistoriaState>({})
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()
  const { formRef, markPristine, isDirty, changes } = useTrackedForm({
    id: `vistoria-bandeira-${itemId}`,
    title: `Vistoria · ${itemNome}`,
    labels: VISTORIA_LABELS,
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await confirmAction({
        titulo: `Salvar vistoria de “${itemNome}”?`,
        descricao: changes.length
          ? `Vai gravar: ${changes.join(', ')}.`
          : 'Confirme para gravar a ficha de liberação.',
        labelConfirmar: 'Salvar vistoria',
        cancelled: 'Vistoria não gravada.',
        run: async () => {
          const result = await registrarVistoriaBandeira({}, fd)
          setState(result)
          return result
        },
        success: 'Vistoria registrada.',
      })
      if (ok) {
        markPristine()
        onSaved?.()
      }
    })
  }

  const ehModal = variant === 'modal'

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      data-persist-bar-root=""
      className={
        ehModal
          ? 'space-y-3'
          : 'space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4'
      }
    >
      <input type="hidden" name="itemId" value={itemId} />
      {ehModal ? null : (
        <div>
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Vistoria e liberação
          </h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {itemNome} — medidas e autorização conferidas na entrada do estádio.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Largura (m)
          <input
            name="larguraM"
            type="number"
            step="0.1"
            min="0.1"
            required
            defaultValue={inicial?.larguraM ?? ''}
            data-unsaved-label="Largura"
            className={FIELD}
          />
          <FieldError messages={state.errors?.larguraM} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Altura (m)
          <input
            name="alturaM"
            type="number"
            step="0.1"
            min="0.1"
            required
            defaultValue={inicial?.alturaM ?? ''}
            data-unsaved-label="Altura"
            className={FIELD}
          />
          <FieldError messages={state.errors?.alturaM} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Órgão / clube que liberou
          <input
            name="orgao"
            maxLength={120}
            defaultValue={inicial?.orgao ?? ''}
            data-unsaved-label="Órgão"
            placeholder="Ex.: SCCP — segurança do estádio"
            className={FIELD}
          />
          <FieldError messages={state.errors?.orgao} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Protocolo / registro
          <input
            name="protocolo"
            maxLength={80}
            defaultValue={inicial?.protocolo ?? ''}
            data-unsaved-label="Protocolo"
            className={FIELD}
          />
          <FieldError messages={state.errors?.protocolo} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Validade da liberação
          <input
            name="validade"
            type="date"
            defaultValue={inicial?.validade ?? ''}
            data-unsaved-label="Validade"
            className={FIELD}
          />
          <span className="mt-1 block text-[11px] text-[rgb(var(--foreground-muted))]">
            Em branco = liberação sem prazo declarado (não entra no aviso).
          </span>
          <FieldError messages={state.errors?.validade} />
        </label>

        <label className="flex items-end gap-2 pb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <input
            type="checkbox"
            name="comMastro"
            value="1"
            defaultChecked={inicial?.comMastro ?? false}
            data-unsaved-label="Mastro"
            className="rounded border-[rgb(var(--border))]"
          />
          Entra com mastro
        </label>
      </div>

      <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Observação
        <textarea
          name="observacao"
          rows={2}
          maxLength={500}
          defaultValue={inicial?.observacao ?? ''}
          data-unsaved-label="Observação da vistoria"
          placeholder="Restrições do setor, exigência de material antichama, etc."
          className={FIELD}
        />
        <FieldError messages={state.errors?.observacao} />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isDirty ? (
          <p className="mr-auto text-xs font-medium text-[rgb(var(--foreground))]">
            {changes.length === 1 ? changes[0] : `${changes.length} campos da vistoria`}
          </p>
        ) : null}
        {onCancel ? (
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={onCancel}
            className="app-action rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Cancelar
          </AppButton>
        ) : null}
        <button
          type="submit"
          disabled={pending || !isDirty}
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar vistoria'}
        </button>
      </div>
    </form>
  )
}
