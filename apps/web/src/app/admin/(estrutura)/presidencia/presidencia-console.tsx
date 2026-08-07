'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, Crown, Loader2, Search, UserCheck, UserX } from 'lucide-react'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import type { CandidatoLideranca, LiderAtual } from '@/lib/lideranca'
import { transferirPresidenciaAction, type PresidenciaState } from './actions'

export type UnidadeLideranca = {
  sedeId: string
  nome: string
  tipoLabel: string
  lider: LiderAtual | null
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
      {pending ? 'Transferindo…' : label}
    </button>
  )
}

export function PresidenciaConsole({
  tenantNome,
  meuUserId,
  presidentes,
  candidatos,
  unidades,
}: {
  tenantNome: string
  meuUserId: string
  presidentes: LiderAtual[]
  candidatos: CandidatoLideranca[]
  unidades: UnidadeLideranca[]
}) {
  return (
    <div className="space-y-6">
      <BlocoPresidencia
        tenantNome={tenantNome}
        meuUserId={meuUserId}
        presidentes={presidentes}
        candidatos={candidatos}
      />
      {unidades.length > 0 && (
        <BlocoUnidades unidades={unidades} candidatos={candidatos} />
      )}
    </div>
  )
}

function BlocoPresidencia({
  tenantNome,
  meuUserId,
  presidentes,
  candidatos,
}: {
  tenantNome: string
  meuUserId: string
  presidentes: LiderAtual[]
  candidatos: CandidatoLideranca[]
}) {
  const [state, action] = useActionState<PresidenciaState, FormData>(
    transferirPresidenciaAction,
    {},
  )
  const [confirmado, setConfirmado] = useState(false)
  const elegiveis = useMemo(
    () => candidatos.filter((c) => c.userId !== meuUserId),
    [candidatos, meuUserId],
  )

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
          <Crown className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Presidência de {tenantNome}
          </h2>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            {presidentes.length > 0
              ? `Hoje: ${presidentes.map((p) => p.nome ?? p.email ?? p.userId).join(', ')}.`
              : 'Esta unidade está sem presidente.'}{' '}
            Quem assume passa a ter acesso total; você continua como administrador.
          </p>
        </div>
      </header>

      {elegiveis.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4 text-sm text-[rgb(var(--foreground-muted))]">
          Ninguém além de você tem cadastro aprovado nesta unidade ainda. A presidência só passa
          para quem já é membro — aprove o cadastro de quem vai assumir primeiro.
        </p>
      ) : (
        <form action={action} className="mt-4 space-y-3">
          <SeletorPessoa candidatos={elegiveis} name="novoUserId" />

          <input
            name="motivo"
            type="text"
            maxLength={300}
            placeholder="Motivo (fim de mandato, eleição, renúncia…) — fica no registro de auditoria"
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
          />

          <label className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--color-primary))]"
            />
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Entendo que perco o cargo de presidente assim que confirmar. Só o novo presidente (ou
              o suporte da plataforma) poderá devolvê-lo.
            </span>
          </label>

          {state.message && (
            <p
              className={`text-sm ${
                state.success
                  ? 'text-[rgb(var(--color-success-fg))]'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {state.message}
            </p>
          )}

          <div className={confirmado ? '' : 'pointer-events-none opacity-50'}>
            <Submit label="Transferir presidência" />
          </div>
        </form>
      )}
    </section>
  )
}

function BlocoUnidades({
  unidades,
  candidatos,
}: {
  unidades: UnidadeLideranca[]
  candidatos: CandidatoLideranca[]
}) {
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [state, action] = useActionState<PresidenciaState, FormData>(
    transferirPresidenciaAction,
    {},
  )

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <header className="border-b border-[rgb(var(--border))] px-5 py-4">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Liderança das suas unidades
        </h2>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Subsedes e pontos de encontro sem portal próprio. Unidade que já virou portal decide a
          presidência dela por dentro — não aparece aqui.
        </p>
      </header>

      <ul className="divide-y divide-[rgb(var(--border))]">
        {unidades.map((u) => (
          <li key={u.sedeId} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {u.nome}
                  <span className="shrink-0 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-normal text-[rgb(var(--foreground-muted))]">
                    {u.tipoLabel}
                  </span>
                </p>
                {u.lider ? (
                  <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                    {u.lider.nome ?? u.lider.email ?? u.lider.userId}
                  </p>
                ) : (
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    <UserX className="h-3 w-3" />
                    Sem liderança
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAbertaId(abertaId === u.sedeId ? null : u.sedeId)}
                className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                {abertaId === u.sedeId ? 'Fechar' : u.lider ? 'Transferir' : 'Definir'}
              </button>
            </div>

            {abertaId === u.sedeId && (
              <form action={action} className="mt-3 space-y-3">
                <input type="hidden" name="sedeId" value={u.sedeId} />
                <SeletorPessoa candidatos={candidatos} name="novoUserId" />
                <input
                  name="motivo"
                  type="text"
                  maxLength={300}
                  placeholder="Motivo (fica no registro de auditoria)"
                  className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
                />
                {state.message && !state.success && (
                  <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
                )}
                <Submit label="Definir liderança" />
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Busca + rádio: lista curta de membros aprovados, sem select nativo travado. */
function SeletorPessoa({
  candidatos,
  name,
}: {
  candidatos: CandidatoLideranca[]
  name: string
}) {
  const [busca, setBusca] = useState('')
  const filtrados = useMemo(() => {
    const alvo = normalizarTexto(busca)
    if (!alvo) return candidatos
    return candidatos.filter((c) =>
      normalizarTexto(`${c.nome} ${c.email ?? ''} ${c.unidade ?? ''}`).includes(alvo),
    )
  }, [busca, candidatos])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar membro por nome, e-mail ou unidade…"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
          aria-label="Buscar membro"
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
          Nenhum membro aprovado corresponde à busca.
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
          {filtrados.map((c) => (
            <li key={c.userId} className="border-b border-[rgb(var(--border))] last:border-b-0">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[rgb(var(--surface))]">
                <input
                  type="radio"
                  name={name}
                  value={c.userId}
                  required
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--color-primary))]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[rgb(var(--foreground))]">
                    {c.nome}
                  </span>
                  <span className="block truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                    {[c.email, c.unidade].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
