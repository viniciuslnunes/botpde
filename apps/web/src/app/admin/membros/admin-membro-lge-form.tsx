'use client'

import { useActionState, useEffect } from 'react'
import { formatDataCompetenciaInput } from '@torcida/types'
import {
  atualizarDadosLge,
  desligarMembro,
  type MembroLgeState,
} from './actions'
import { useActionStateToast } from '@/lib/toast-action'

export type PlanoOption = { id: string; nome: string }

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

export function AdminMembroLgeForm({
  membroId,
  initial,
  planos,
  podeDesligar,
  desligadoEm,
}: {
  membroId: string
  initial: {
    rg: string | null
    cpf: string | null
    filiacao: string | null
    escolaridade: string | null
    profissao: string | null
    dataNascimento: Date | null
    planoAssociacaoId: string | null
  }
  planos: PlanoOption[]
  podeDesligar: boolean
  desligadoEm: Date | null
}) {
  const [lgeState, lgeAction, lgePending] = useActionState(atualizarDadosLge, {} as MembroLgeState)
  const [dismissState, dismissAction, dismissPending] = useActionState(
    desligarMembro,
    {} as MembroLgeState,
  )
  useActionStateToast(lgeState, lgePending, 'Dados LGE salvos.')
  useActionStateToast(dismissState, dismissPending, 'Membro desligado.')

  useEffect(() => {
    if (dismissState.ok) window.location.reload()
  }, [dismissState.ok])

  return (
    <div className="space-y-6">
      <form action={lgeAction} className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <input type="hidden" name="membroId" value={membroId} />
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Dados LGE (Lei 14.597/2023)
        </h2>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Informações sensíveis — nunca exibidas no portal público.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            CPF
            <input
              name="cpf"
              defaultValue={initial.cpf ?? ''}
              placeholder="000.000.000-00"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <FieldError messages={lgeState.errors?.cpf} />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            RG
            <input
              name="rg"
              defaultValue={initial.rg ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
            Filiação
            <input
              name="filiacao"
              defaultValue={initial.filiacao ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Escolaridade
            <input
              name="escolaridade"
              defaultValue={initial.escolaridade ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Profissão
            <input
              name="profissao"
              defaultValue={initial.profissao ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data de nascimento
            <input
              name="dataNascimento"
              type="date"
              defaultValue={
                initial.dataNascimento
                  ? formatDataCompetenciaInput(initial.dataNascimento)
                  : ''
              }
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <FieldError messages={lgeState.errors?.dataNascimento} />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Plano de associação
            <select
              name="planoAssociacaoId"
              defaultValue={initial.planoAssociacaoId ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            >
              <option value="">Sem plano</option>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <FieldError messages={lgeState.errors?.planoAssociacaoId} />
          </label>
        </div>

        {lgeState.error && <p className="text-sm text-red-600">{lgeState.error}</p>}

        <button
          type="submit"
          disabled={lgePending || Boolean(desligadoEm)}
          className="rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {lgePending ? 'Salvando…' : 'Salvar dados LGE'}
        </button>
      </form>

      {podeDesligar && !desligadoEm && (
        <form action={dismissAction} className="space-y-3 rounded-2xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900 dark:bg-red-950/30">
          <input type="hidden" name="membroId" value={membroId} />
          <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
            Desligamento estatutário
          </h2>
          <p className="text-xs text-red-700/80 dark:text-red-400/80">
            Registra desligamento formal. O status de aprovação permanece, mas o associado fica
            marcado como desligado.
          </p>
          <label className="block text-xs font-medium text-red-800 dark:text-red-300">
            Motivo
            <textarea
              name="motivo"
              required
              rows={3}
              minLength={5}
              className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm dark:border-red-800 dark:bg-[rgb(var(--background))]"
            />
            <FieldError messages={dismissState.errors?.motivo} />
          </label>
          {dismissState.error && <p className="text-sm text-red-600">{dismissState.error}</p>}
          <button
            type="submit"
            disabled={dismissPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {dismissPending ? 'Processando…' : 'Desligar associado'}
          </button>
        </form>
      )}

      {desligadoEm && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Desligado em {desligadoEm.toLocaleDateString('pt-BR')}.
        </div>
      )}
    </div>
  )
}
