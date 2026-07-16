'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { UserMinus, UserPlus } from 'lucide-react'
import {
  adicionarMembroArea,
  buscarCandidatosArea,
  removerMembroArea,
  type ActionState,
} from '@/app/portal/departamentos/actions'
import { useActionStateToast } from '@/lib/toast-action'

export type MembroEquipe = {
  userId: string
  nome: string | null
  email: string
  nickname: string | null
  avatarUrl: string | null
  isGestor: boolean
}

function rotuloPessoa(m: Pick<MembroEquipe, 'nome' | 'nickname' | 'email'>) {
  return m.nome?.trim() || (m.nickname ? `@${m.nickname}` : null) || m.email
}

export function DepartamentoEquipe({
  departamentoId,
  slug,
  membros,
  isGestor,
  currentUserId,
}: {
  departamentoId: string
  slug: string
  membros: MembroEquipe[]
  isGestor: boolean
  currentUserId: string
}) {
  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Equipe</h2>
      <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
        {membros.length} {membros.length === 1 ? 'pessoa' : 'pessoas'} nesta área
      </p>

      <ul className="mt-4 divide-y divide-[rgb(var(--border))]">
        {membros.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-xs font-bold text-[rgb(var(--foreground-muted))]">
              {rotuloPessoa(m).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                {rotuloPessoa(m)}
              </p>
              <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                {m.isGestor ? 'Gestor' : 'Membro'}
                {m.nickname ? ` · @${m.nickname}` : ''}
              </p>
            </div>
            {isGestor && m.userId !== currentUserId && !m.isGestor && (
              <RemoverMembroButton
                departamentoId={departamentoId}
                slug={slug}
                targetUserId={m.userId}
                label={rotuloPessoa(m)}
              />
            )}
          </li>
        ))}
      </ul>

      {isGestor && (
        <div id="gestao" className="mt-6 border-t border-[rgb(var(--border))] pt-5">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Gestão da área</h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Inclua sócios aprovados desta torcida na equipe do departamento.
          </p>
          <AdicionarMembroForm departamentoId={departamentoId} slug={slug} />
        </div>
      )}
    </section>
  )
}

function RemoverMembroButton({
  departamentoId,
  slug,
  targetUserId,
  label,
}: {
  departamentoId: string
  slug: string
  targetUserId: string
  label: string
}) {
  const [state, action, pending] = useActionState(removerMembroArea, {} as ActionState)
  useActionStateToast(state, pending, `${label} removido da área`)

  return (
    <form action={action}>
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <button
        type="submit"
        disabled={pending}
        className="app-action inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
        title="Remover da área"
      >
        <UserMinus className="h-3.5 w-3.5" />
        Remover
      </button>
    </form>
  )
}

function AdicionarMembroForm({
  departamentoId,
  slug,
}: {
  departamentoId: string
  slug: string
}) {
  const [q, setQ] = useState('')
  const [candidatos, setCandidatos] = useState<
    Array<{ id: string; nome: string | null; email: string; nickname: string | null }>
  >([])
  const [pendingSearch, startSearch] = useTransition()
  const [state, action, pending] = useActionState(adicionarMembroArea, {} as ActionState)
  useActionStateToast(state, pending, 'Membro adicionado à área')

  useEffect(() => {
    if (q.trim().length < 2) {
      setCandidatos([])
      return
    }
    const t = setTimeout(() => {
      startSearch(() => {
        void buscarCandidatosArea(departamentoId, q).then(setCandidatos)
      })
    }, 280)
    return () => clearTimeout(t)
  }, [q, departamentoId])

  useEffect(() => {
    if (state.ok) {
      setQ('')
      setCandidatos([])
    }
  }, [state.ok])

  return (
    <div className="mt-3 space-y-3">
      <label className="block">
        <span className="sr-only">Buscar sócio</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, e-mail ou @"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
      </label>
      {pendingSearch && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Buscando…</p>
      )}
      {candidatos.length > 0 && (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
          {candidatos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {c.nome?.trim() || c.email}
                </p>
                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                  {c.nickname ? `@${c.nickname}` : c.email}
                </p>
              </div>
              <form action={action}>
                <input type="hidden" name="departamentoId" value={departamentoId} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="targetUserId" value={c.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="app-action inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Incluir
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
