'use client'

import { useActionState, useEffect, useState, useTransition, type ReactNode } from 'react'
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

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function RelationStem({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <div className="h-4 w-px bg-[rgb(var(--border-strong)_/_0.55)]" />
      <span className="my-0.5 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </span>
      <div className="h-4 w-px bg-[rgb(var(--border-strong)_/_0.55)]" />
    </div>
  )
}

function PessoaCard({
  membro,
  roleLabel,
  accent,
  action,
}: {
  membro: MembroEquipe
  roleLabel: string
  accent: string
  action?: ReactNode
}) {
  const nome = rotuloPessoa(membro)
  return (
    <div
      className="flex min-w-[12rem] max-w-[16rem] items-center gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 shadow-sm"
      style={{ borderColor: `${accent}66` }}
    >
      {membro.avatarUrl ? (
        <img
          src={membro.avatarUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          {initials(nome)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{nome}</p>
        <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
          {roleLabel}
          {membro.nickname ? ` · @${membro.nickname}` : ''}
        </p>
      </div>
      {action}
    </div>
  )
}

export function DepartamentoEquipe({
  departamentoId,
  slug,
  cor,
  membros,
  isGestor,
  currentUserId,
}: {
  departamentoId: string
  slug: string
  /** Mantido para compat com a página; o mural não repete o nome da área. */
  nome?: string
  cor: string
  membros: MembroEquipe[]
  isGestor: boolean
  currentUserId: string
}) {
  const gestores = membros.filter((m) => m.isGestor)
  const colaboradores = membros.filter((m) => !m.isGestor)
  const vazio = membros.length === 0

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex items-center gap-2 border-b border-[rgb(var(--border))] pb-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Equipe</h2>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
            {gestores.length} gestor{gestores.length === 1 ? '' : 'es'} · {colaboradores.length}{' '}
            membro{colaboradores.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {isGestor && (
        <div id="gestao" className="scroll-mt-20 border-b border-[rgb(var(--border))] py-4">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Incluir membro</h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Sócios aprovados desta torcida entram na equipe do departamento.
          </p>
          <AdicionarMembroForm departamentoId={departamentoId} slug={slug} />
        </div>
      )}

      {vazio ? (
        <p className="mt-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
          {isGestor
            ? 'Ainda sem pessoas. Use a busca acima para incluir o primeiro membro.'
            : 'Sem pessoas nesta área'}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {gestores.length > 0 && (
            <div>
              <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Gestores
              </p>
              <div className="flex flex-wrap items-start justify-center gap-3">
                {gestores.map((m) => (
                  <PessoaCard key={m.userId} membro={m} roleLabel="Gestor" accent={cor} />
                ))}
              </div>
            </div>
          )}

          {colaboradores.length > 0 && (
            <div>
              {gestores.length > 0 && <RelationStem label="equipe" />}
              <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Colaboradores
              </p>
              <div className="flex flex-wrap items-start justify-center gap-3">
                {colaboradores.map((m) => (
                  <PessoaCard
                    key={m.userId}
                    membro={m}
                    roleLabel="Colaborador"
                    accent={cor}
                    action={
                      isGestor && m.userId !== currentUserId ? (
                        <RemoverMembroButton
                          departamentoId={departamentoId}
                          slug={slug}
                          targetUserId={m.userId}
                          label={rotuloPessoa(m)}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {gestores.length > 0 && colaboradores.length === 0 && (
            <div className="pt-1">
              <RelationStem label="equipe" />
              <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
                Ainda sem colaboradores nesta área
              </p>
            </div>
          )}
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
    <form
      action={(fd) => {
        if (!window.confirm(`Remover ${label} desta área?`)) return
        action(fd)
      }}
    >
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <button
        type="submit"
        disabled={pending}
        className="app-action inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
        title={`Remover ${label}`}
        aria-label={`Remover ${label}`}
      >
        <UserMinus className="h-4 w-4" />
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
  const [buscou, setBuscou] = useState(false)
  const [pendingSearch, startSearch] = useTransition()
  const [state, action, pending] = useActionState(adicionarMembroArea, {} as ActionState)
  useActionStateToast(state, pending, 'Membro adicionado à área')

  const qBusca = q.trim().length >= 2 ? q.trim() : ''
  const candidatosVisiveis = qBusca ? candidatos : []

  useEffect(() => {
    if (!qBusca) {
      setBuscou(false)
      setCandidatos([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      startSearch(() => {
        void buscarCandidatosArea(departamentoId, qBusca).then((rows) => {
          if (!cancelled) {
            setCandidatos(rows)
            setBuscou(true)
          }
        })
      })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [qBusca, departamentoId])

  useEffect(() => {
    if (!state.ok) return
    const t = setTimeout(() => {
      setQ('')
      setCandidatos([])
      setBuscou(false)
    }, 0)
    return () => clearTimeout(t)
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
      {pendingSearch && qBusca && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Buscando…</p>
      )}
      {!pendingSearch && buscou && qBusca && candidatosVisiveis.length === 0 && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Nenhum sócio encontrado para “{qBusca}”.
        </p>
      )}
      {candidatosVisiveis.length > 0 && (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
          {candidatosVisiveis.map((c) => (
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
