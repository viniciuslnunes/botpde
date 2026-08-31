'use client'

import { useActionState, useEffect, useState } from 'react'
import {
  formatDataCompetenciaInput,
  formatRg,
  maskRg,
  normalizarCpf,
  validarCpfDigitos,
  validarRg,
} from '@torcida/types'
import {
  atualizarDadosLge,
  desligarMembro,
  type MembroLgeState,
} from './actions'
import { DatePicker } from '@/components/ui/date-picker'
import { useActionStateToast } from '@/lib/toast-action'
import { formatCpfAdmin } from '@/lib/admin-membro-map'

export type PlanoOption = { id: string; nome: string }

function maskCpf(raw: string): string {
  const digitos = raw.replace(/\D/g, '').slice(0, 11)
  const partes = [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9)].filter(Boolean)
  let out = partes.join('.')
  if (digitos.length > 9) out += `-${digitos.slice(9)}`
  return out
}

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
  espelhado,
  aprovadoNaUnidadeNome,
  canEdit = false,
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
  /** Espelho na Sede — LGE só leitura; edite na unidade de origem. */
  espelhado?: boolean
  aprovadoNaUnidadeNome?: string | null
  /** `members:approve` — quem só vê o cadastro não altera RG/CPF. */
  canEdit?: boolean
}) {
  const [lgeState, lgeAction, lgePending] = useActionState(atualizarDadosLge, {} as MembroLgeState)
  const [dismissState, dismissAction, dismissPending] = useActionState(
    desligarMembro,
    {} as MembroLgeState,
  )
  useActionStateToast(lgeState, lgePending, 'Dados LGE salvos.')
  useActionStateToast(dismissState, dismissPending, 'Membro desligado.')

  const [cpf, setCpf] = useState(() => formatCpfAdmin(initial.cpf) ?? '')
  const [rg, setRg] = useState(() => formatRg(initial.rg) ?? '')
  const [erroCpfLocal, setErroCpfLocal] = useState<string | null>(null)
  const [erroRgLocal, setErroRgLocal] = useState<string | null>(null)

  useEffect(() => {
    if (dismissState.ok) window.location.reload()
  }, [dismissState.ok])

  const via = aprovadoNaUnidadeNome?.trim()
  const campoSomenteLeitura =
    'mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))]'
  const cpfExibicao = formatCpfAdmin(initial.cpf) ?? initial.cpf
  const rgExibicao = formatRg(initial.rg) ?? initial.rg

  if (espelhado || !canEdit) {
    const planoNome =
      planos.find((p) => p.id === initial.planoAssociacaoId)?.nome ?? null
    return (
      <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Dados LGE (Lei 14.597/2023)
        </h2>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {espelhado
            ? via
              ? `Registro espelhado — aprovado via ${via}. Edite na unidade de origem.`
              : 'Registro espelhado — edite na unidade de origem.'
            : 'Somente quem aprova membros pode alterar RG, CPF e filiação.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">CPF</p>
            <p className={campoSomenteLeitura}>{cpfExibicao || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">RG</p>
            <p className={campoSomenteLeitura}>{rgExibicao || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Filiação</p>
            <p className={campoSomenteLeitura}>{initial.filiacao || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Escolaridade</p>
            <p className={campoSomenteLeitura}>{initial.escolaridade || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Profissão</p>
            <p className={campoSomenteLeitura}>{initial.profissao || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Data de nascimento
            </p>
            <p className={campoSomenteLeitura}>
              {initial.dataNascimento
                ? formatDataCompetenciaInput(initial.dataNascimento)
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Plano de associação
            </p>
            <p className={campoSomenteLeitura}>{planoNome || '—'}</p>
          </div>
        </div>
      </div>
    )
  }

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
              inputMode="numeric"
              maxLength={14}
              value={cpf}
              onChange={(e) => {
                setCpf(maskCpf(e.target.value))
                setErroCpfLocal(null)
              }}
              onBlur={() => {
                if (!cpf) return
                const n = normalizarCpf(cpf)
                if (!n || !validarCpfDigitos(n)) setErroCpfLocal('CPF inválido')
              }}
              placeholder="000.000.000-00"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <FieldError messages={erroCpfLocal ? [erroCpfLocal] : lgeState.errors?.cpf} />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            RG
            <input
              name="rg"
              inputMode="text"
              autoComplete="off"
              maxLength={12}
              value={rg}
              onChange={(e) => {
                setRg(maskRg(e.target.value))
                setErroRgLocal(null)
              }}
              onBlur={() => {
                if (!rg) return
                if (!validarRg(rg)) setErroRgLocal('RG inválido')
              }}
              placeholder="00.000.000-0"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <FieldError messages={erroRgLocal ? [erroRgLocal] : lgeState.errors?.rg} />
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
            <div className="mt-1">
              <DatePicker
                name="dataNascimento"
                maxToday
                defaultValue={
                  initial.dataNascimento
                    ? formatDataCompetenciaInput(initial.dataNascimento)
                    : ''
                }
                aria-label="Data de nascimento"
              />
            </div>
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
