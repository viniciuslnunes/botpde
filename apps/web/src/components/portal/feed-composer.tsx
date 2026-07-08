'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { ImagePlus, Send, X } from 'lucide-react'
import { FieldError } from '@torcida/ui'
import { publicarPost, type PublicarPostState } from '@/app/portal/comunidade/actions'
import { Avatar } from './avatar'

const INITIAL_STATE: PublicarPostState = {}

interface FeedComposerProps {
  userName: string | null
  userAvatar: string | null
}

export function FeedComposer({ userName, userAvatar }: FeedComposerProps) {
  const [state, action, pending] = useActionState<PublicarPostState, FormData>(
    publicarPost,
    INITIAL_STATE,
  )
  const [expanded, setExpanded] = useState(false)
  const [comImagem, setComImagem] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const firstName = userName?.split(' ')[0] ?? 'torcedor'

  // Após publicar, limpa os campos do formulário (o composer segue aberto para o
  // próximo post). Apenas manipulação de DOM — sem setState dentro do efeito.
  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <Avatar nome={userName} avatarUrl={userAvatar} size="md" />
        <div className="min-w-0 flex-1">
          {!expanded ? (
            <button
              type="button"
              onClick={() => {
                setExpanded(true)
                requestAnimationFrame(() => textareaRef.current?.focus())
              }}
              className="h-11 w-full rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 text-left text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))]"
            >
              No que você tá pensando, {firstName}?
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                name="conteudo"
                required
                maxLength={3000}
                rows={3}
                placeholder={`No que você tá pensando, ${firstName}?`}
                className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
              />
              <FieldError errors={state.errors?.conteudo} />

              {comImagem && (
                <div>
                  <input
                    name="imagemUrl"
                    type="url"
                    autoFocus
                    placeholder="Cole a URL de uma imagem"
                    maxLength={500}
                    className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                  />
                  <FieldError errors={state.errors?.imagemUrl} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {state.message && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      {expanded && (
        <div className="mt-3 flex items-center justify-between border-t border-[rgb(var(--border))] pt-3">
          <button
            type="button"
            onClick={() => setComImagem((v) => !v)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
              comImagem
                ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            {comImagem ? <X className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
            {comImagem ? 'Remover imagem' : 'Imagem'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {pending ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
