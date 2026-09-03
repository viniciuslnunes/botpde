'use client'

import { useState, useTransition } from 'react'
import { denunciarBrechoAction } from '../actions'
import { runPersistAction } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'
import { Gavel, X } from 'lucide-react'

export function BrechoDenunciaForm({
  anuncioId,
  lojaUserId,
  interesseId,
}: {
  anuncioId?: string
  lojaUserId?: string
  interesseId?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [pending, start] = useTransition()
  const [ok, setOk] = useState(false)

  if (ok) {
    return <p className="text-sm text-[rgb(var(--foreground-muted))]">Denúncia enviada à equipe de Materiais/Loja.</p>
  }

  if (!aberto) {
    return (
      <AppButton
        variant="none"
        icon={Gavel}
        type="button"
        className="app-touch-line text-sm text-[rgb(var(--foreground-muted))] underline-offset-2 hover:underline"
        onClick={() => setAberto(true)}
      >
        Declarar má fé
      </AppButton>
    )
  }

  return (
    <form
      className="space-y-2 rounded-xl border border-[rgb(var(--border))] p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const done = await runPersistAction(() => denunciarBrechoAction(fd), {
            success: 'Denúncia enviada. A equipe de Materiais foi avisada.',
          })
          if (done) setOk(true)
        })
      }}
    >
      {anuncioId ? <input type="hidden" name="anuncioId" value={anuncioId} /> : null}
      {lojaUserId ? <input type="hidden" name="lojaUserId" value={lojaUserId} /> : null}
      {interesseId ? <input type="hidden" name="interesseId" value={interesseId} /> : null}
      <textarea
        name="motivo"
        required
        minLength={8}
        maxLength={500}
        rows={3}
        placeholder="O que parece de má fé? (golpe, item de acervo da torcida, ameaça…)"
        className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="app-action rounded-xl bg-[rgb(var(--color-danger,_220_38_38))] px-4 text-sm font-semibold text-white"
        >
          {pending ? 'Enviando…' : 'Enviar denúncia'}
        </button>
        <AppButton variant="none" icon={X} type="button" className="app-action px-3 text-sm" onClick={() => setAberto(false)}>
          Cancelar
        </AppButton>
      </div>
    </form>
  )
}
