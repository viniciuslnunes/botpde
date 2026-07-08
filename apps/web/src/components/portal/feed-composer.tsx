'use client'

import { useActionState, useEffect, useRef } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { FieldError, Input, SubmitButton, Textarea } from '@torcida/ui'
import { publicarPost, type PublicarPostState } from '@/app/portal/comunidade/actions'

const INITIAL_STATE: PublicarPostState = {}

export function FeedComposer() {
  const [state, action] = useActionState<PublicarPostState, FormData>(publicarPost, INITIAL_STATE)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form ref={formRef} action={action} className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Compartilhar no feed
      </h2>

      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {state.success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Post publicado com sucesso.
        </div>
      )}

      <div>
        <Textarea
          name="conteudo"
          required
          maxLength={3000}
          rows={3}
          placeholder="No que você está pensando para a torcida?"
        />
        <FieldError errors={state.errors?.conteudo} />
      </div>

      <div>
        <Input
          name="imagemUrl"
          type="url"
          placeholder="URL da imagem (opcional)"
          maxLength={500}
        />
        <FieldError errors={state.errors?.imagemUrl} />
      </div>

      <SubmitButton label="Publicar" icon={<MessageSquarePlus className="h-4 w-4" />} />
    </form>
  )
}
