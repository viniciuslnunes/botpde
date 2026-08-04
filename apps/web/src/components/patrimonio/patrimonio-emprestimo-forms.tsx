'use client'

import { useActionState, useState } from 'react'
import { ImageUploadField } from '@/components/media/image-upload-field'
import {
  abrirEmprestimoPatrimonio,
  devolverEmprestimoPatrimonio,
  type EmprestimoState,
} from '@/app/portal/patrimonio/emprestimo-actions'

const initial: EmprestimoState = {}

export function RetirarPatrimonioForm({
  itemId,
  itemNome,
  tenantId,
}: {
  itemId: string
  itemNome: string
  tenantId: string
}) {
  const [foto, setFoto] = useState('')
  const [state, action, pending] = useActionState(abrirEmprestimoPatrimonio, initial)

  if (state.ok) {
    return (
      <p className="text-sm text-[rgb(var(--color-success-fg))]">
        Retirada registrada — {itemNome} está com você.
      </p>
    )
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <input type="hidden" name="itemId" value={itemId} />
      <p className="text-sm font-medium text-[rgb(var(--foreground))]">
        Retirar · {itemNome}
      </p>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Tire uma foto na saída. Sem foto a retirada não fecha.
      </p>
      <ImageUploadField
        name="fotoSaidaUrl"
        label="Foto da retirada"
        value={foto}
        onChange={setFoto}
        aspect={4 / 3}
        purpose="patrimonio"
        tenantId={tenantId}
        cropTitle="Enquadrar evidência"
        fieldErrors={state.errors?.fotoSaidaUrl}
      />
      {state.error ? (
        <p className="text-xs text-[rgb(var(--color-danger-fg))]">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !foto}
        className="rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
      >
        {pending ? 'Registrando…' : 'Confirmar retirada'}
      </button>
    </form>
  )
}

export function DevolverPatrimonioForm({
  emprestimoId,
  itemNome,
  tenantId,
}: {
  emprestimoId: string
  itemNome: string
  tenantId: string
}) {
  const [foto, setFoto] = useState('')
  const [state, action, pending] = useActionState(devolverEmprestimoPatrimonio, initial)

  if (state.ok) {
    return (
      <p className="text-sm text-[rgb(var(--color-success-fg))]">
        Devolução registrada — {itemNome} voltou ao inventário.
      </p>
    )
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <input type="hidden" name="emprestimoId" value={emprestimoId} />
      <p className="text-sm font-medium text-[rgb(var(--foreground))]">
        Devolver · {itemNome}
      </p>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Foto de como o item ficou guardado — obrigatória.
      </p>
      <ImageUploadField
        name="fotoGuardaUrl"
        label="Foto de como ficou guardado"
        value={foto}
        onChange={setFoto}
        aspect={4 / 3}
        purpose="patrimonio"
        tenantId={tenantId}
        cropTitle="Enquadrar guarda"
        fieldErrors={state.errors?.fotoGuardaUrl}
      />
      {state.error ? (
        <p className="text-xs text-[rgb(var(--color-danger-fg))]">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !foto}
        className="rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
      >
        {pending ? 'Registrando…' : 'Confirmar devolução'}
      </button>
    </form>
  )
}
