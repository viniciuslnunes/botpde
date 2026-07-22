'use client'

import { useActionState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Video } from 'lucide-react'
import { criarSalaNacional, type CriarSalaState } from '@/app/portal/comunidade/salas/actions'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'
import { useTrackedForm } from '@/lib/unsaved-changes'

const INITIAL: CriarSalaState = {}

/** Sala aberta na Comunidade Nacional — só título, sem vínculo de evento. */
export function CriarSalaNacionalForm() {
  const [state, action, pending] = useActionState<CriarSalaState, FormData>(
    criarSalaNacional,
    INITIAL,
  )
  const { formRef } = useTrackedForm({ title: 'Nova sala nacional' })

  return (
    <m.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSnappy}
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
    >
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <Video className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
        Abrir uma sala aberta a todos os torcedores
      </h2>

      <AnimatePresence>
        {state.message && (
          <m.div
            key="erro"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="mb-3 overflow-hidden rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {state.message}
          </m.div>
        )}
      </AnimatePresence>

      <form ref={formRef} action={action} className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          name="titulo"
          data-unsaved-label="Título da sala"
          required
          minLength={3}
          maxLength={120}
          placeholder="Ex: Bate-papo pré-jogo"
          disabled={pending}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] disabled:opacity-60"
        />
        <m.button
          type="submit"
          disabled={pending}
          whileTap={{ scale: pending ? 1 : 0.96 }}
          transition={springSnappy}
          className="rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-60"
        >
          {pending ? 'Criando…' : 'Criar sala'}
        </m.button>
      </form>
    </m.section>
  )
}
