'use client'

import { useActionState } from 'react'
import { criarSala, type CriarSalaState } from '@/app/portal/comunidade/salas/actions'

interface EventoOption {
  id: string
  titulo: string
}

interface CriarSalaFormProps {
  eventos: EventoOption[]
}

const INITIAL: CriarSalaState = {}

export function CriarSalaForm({ eventos }: CriarSalaFormProps) {
  const [state, action, pending] = useActionState<CriarSalaState, FormData>(criarSala, INITIAL)

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Criar nova sala
      </h2>

      {state.message && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <form action={action} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <input
          name="titulo"
          required
          minLength={3}
          maxLength={120}
          placeholder="Ex: Pré-jogo da rodada"
          disabled={pending}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] disabled:opacity-60"
        />
        <select
          name="eventoId"
          defaultValue=""
          disabled={pending}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] disabled:opacity-60"
        >
          <option value="">Sem evento vinculado</option>
          {eventos.map((evento) => (
            <option key={evento.id} value={evento.id}>
              {evento.titulo}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Criando…' : 'Criar sala'}
        </button>
      </form>
    </section>
  )
}
