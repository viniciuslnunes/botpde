'use client'

import { useActionState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { criarEvento, editarEvento, excluirEvento, type EventoState } from '@/app/admin/eventos/actions'
import { Loader2, Trash2, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2.5 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-transparent focus:ring-2 focus:ring-[rgb(var(--color-primary))] transition-all'

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-500">{errors[0]}</p>
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
      {pending ? 'Salvando...' : label}
    </button>
  )
}

/** Valor datetime-local no formato esperado pelo input */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ── Criar ─────────────────────────────────────────────────────────────────── */
export function CriarEventoForm() {
  const [state, action] = useActionState<EventoState, FormData>(criarEvento, {})

  // Padrão: amanhã às 12h
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  amanha.setHours(12, 0, 0, 0)

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <input name="titulo" type="text" placeholder="Ex: Jogo Corinthians x Santos" required className={inputClass} />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data e hora <span className="text-red-500">*</span>
          </label>
          <input
            name="data"
            type="datetime-local"
            defaultValue={toDatetimeLocal(amanha)}
            required
            className={inputClass}
          />
          <FieldError errors={state.errors?.data} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Local
          </label>
          <input name="local" type="text" placeholder="Ex: Neo Química Arena" className={inputClass} />
          <FieldError errors={state.errors?.local} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição
        </label>
        <textarea
          name="descricao"
          rows={3}
          placeholder="Detalhes, ponto de encontro, informações adicionais..."
          className={`${inputClass} resize-none`}
        />
        <FieldError errors={state.errors?.descricao} />
      </div>

      <SubmitButton label="Criar evento" />
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
  const boundAction = editarEvento.bind(null, evento.id)
  const [state, action] = useActionState<EventoState, FormData>(boundAction, {})

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <input name="titulo" type="text" defaultValue={evento.titulo} required className={inputClass} />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data e hora <span className="text-red-500">*</span>
          </label>
          <input
            name="data"
            type="datetime-local"
            defaultValue={toDatetimeLocal(new Date(evento.data))}
            required
            className={inputClass}
          />
          <FieldError errors={state.errors?.data} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Local
          </label>
          <input name="local" type="text" defaultValue={evento.local ?? ''} className={inputClass} />
          <FieldError errors={state.errors?.local} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição
        </label>
        <textarea
          name="descricao"
          rows={3}
          defaultValue={evento.descricao ?? ''}
          className={`${inputClass} resize-none`}
        />
        <FieldError errors={state.errors?.descricao} />
      </div>

      <SubmitButton label="Salvar alterações" />
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
      await excluirEvento(eventoId)
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
