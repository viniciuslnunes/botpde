'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { criarEvento, editarEvento, excluirEvento, type EventoState } from '@/app/admin/eventos/actions'
import { Loader2, Trash2, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FieldError, Input, Textarea, SubmitButton } from '@torcida/ui'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'
import { runPersistAction, submitRedirectAction } from '@/lib/toast-action'

/** Valor datetime-local no formato esperado pelo input */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ── Criar ─────────────────────────────────────────────────────────────────── */
export function CriarEventoForm() {
  const [state, setState] = useState<EventoState>({})

  // Padrão: amanhã às 12h
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  amanha.setHours(12, 0, 0, 0)

  return (
    <form
      action={async (fd) => {
        await submitRedirectAction(() => criarEvento({}, fd), setState, {
          success: 'Evento criado.',
        })
      }}
      className="space-y-4"
    >
      <AnimatePresence>
        {state.message && (
          <m.div
            key="erro"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {state.message}
          </m.div>
        )}
      </AnimatePresence>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <Input name="titulo" type="text" placeholder="Ex: Jogo Corinthians x Santos" required />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data e hora <span className="text-red-500">*</span>
          </label>
          <Input
            name="data"
            type="datetime-local"
            defaultValue={toDatetimeLocal(amanha)}
            required
          />
          <FieldError errors={state.errors?.data} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Local
          </label>
          <Input name="local" type="text" placeholder="Ex: Neo Química Arena" />
          <FieldError errors={state.errors?.local} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição
        </label>
        <Textarea
          name="descricao"
          rows={3}
          placeholder="Detalhes, ponto de encontro, informações adicionais..."
          className="resize-none"
        />
        <FieldError errors={state.errors?.descricao} />
      </div>

      <SubmitButton label="Criar evento" icon={<CalendarPlus className="h-4 w-4" />} />
    </form>
  )
}

/* ── Editar ─────────────────────────────────────────────────────────────────── */
type EventoData = {
  id: string
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
}

export function EditarEventoForm({ evento }: { evento: EventoData }) {
  const [state, setState] = useState<EventoState>({})

  return (
    <form
      action={async (fd) => {
        await submitRedirectAction(() => editarEvento(evento.id, {}, fd), setState, {
          success: 'Evento atualizado.',
        })
      }}
      className="space-y-4"
    >
      <AnimatePresence>
        {state.message && (
          <m.div
            key="erro"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {state.message}
          </m.div>
        )}
      </AnimatePresence>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <Input name="titulo" type="text" defaultValue={evento.titulo} required />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data e hora <span className="text-red-500">*</span>
          </label>
          <Input
            name="data"
            type="datetime-local"
            defaultValue={toDatetimeLocal(new Date(evento.data))}
            required
          />
          <FieldError errors={state.errors?.data} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Local
          </label>
          <Input name="local" type="text" defaultValue={evento.local ?? ''} />
          <FieldError errors={state.errors?.local} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição
        </label>
        <Textarea
          name="descricao"
          rows={3}
          defaultValue={evento.descricao ?? ''}
          className="resize-none"
        />
        <FieldError errors={state.errors?.descricao} />
      </div>

      <SubmitButton label="Salvar alterações" icon={<CalendarPlus className="h-4 w-4" />} />
    </form>
  )
}

/* ── Excluir ─────────────────────────────────────────────────────────────────── */
export function ExcluirEventoButton({ eventoId }: { eventoId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleExcluir() {
    if (!confirm('Excluir este evento? Todos os RSVPs também serão removidos.')) return
    startTransition(async () => {
      await runPersistAction(() => excluirEvento(eventoId), {
        success: 'Evento excluído.',
      })
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleExcluir}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      {pending ? 'Excluindo...' : 'Excluir'}
    </button>
  )
}
