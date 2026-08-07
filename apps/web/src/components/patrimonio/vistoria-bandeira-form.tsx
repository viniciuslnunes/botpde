'use client'

import { useActionState } from 'react'
import {
  registrarVistoriaBandeira,
  type VistoriaState,
} from '@/app/admin/bandeiras/actions'
import { useActionStateToast } from '@/lib/toast-action'

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

/**
 * Ficha de vistoria de uma bandeira: o que o clube e a polícia pedem na
 * entrada. Campo a campo, não texto livre — sem estrutura ninguém consegue
 * avisar que a liberação venceu.
 */
export function VistoriaBandeiraForm({
  itemId,
  itemNome,
  inicial,
  onCancel,
}: {
  itemId: string
  itemNome: string
  inicial?: VistoriaInicial | null
  onCancel?: () => void
}) {
  const [state, action, pending] = useActionState(
    registrarVistoriaBandeira,
    {} as VistoriaState,
  )
  useActionStateToast(state, pending, 'Vistoria registrada.')

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <div>
        <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Vistoria e liberação
        </h3>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          {itemNome} — medidas e autorização conferidas na entrada do estádio.
        </p>
      </div>

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
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
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
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.alturaM} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Órgão / clube que liberou
          <input
            name="orgao"
            maxLength={120}
            defaultValue={inicial?.orgao ?? ''}
            placeholder="Ex.: SCCP — segurança do estádio"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.orgao} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Protocolo / registro
          <input
            name="protocolo"
            maxLength={80}
            defaultValue={inicial?.protocolo ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.protocolo} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Validade da liberação
          <input
            name="validade"
            type="date"
            defaultValue={inicial?.validade ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
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
          placeholder="Restrições do setor, exigência de material antichama, etc."
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
        />
        <FieldError messages={state.errors?.observacao} />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar vistoria'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
