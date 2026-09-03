'use client'

import { useState, useTransition } from 'react'
import { CalendarCheck, CircleSlash, Trash2, UserPlus } from 'lucide-react'
import {
  FUNCAO_ESCALA_DESCRICAO,
  FUNCAO_ESCALA_LABEL,
  STATUS_ESCALA_LABEL,
  funcoesParaTipo,
} from '@torcida/types'
import { Badge, FieldError, Input } from '@torcida/ui'
import { AppButton } from '@/components/ui/button'
import {
  convocarParaEscala,
  removerDaEscala,
  atualizarStatusEscala,
  type EscalaState,
} from '@/app/admin/eventos/escala-actions'
import { runPersistAction } from '@/lib/toast-action'
import type { EscalaItem } from '@/lib/escala'

/**
 * Escala da operação no cockpit do evento: quem trabalha, em que posto, e o
 * que ainda está descoberto. A presença vem do check-in do evento — a escala
 * não guarda presença própria.
 */

type ResumoFuncao = {
  funcao: string
  ocupados: number
  aceitos: number
  aguardando: number
  recusados: number
  presentes: number
}

type Resumo = {
  total: number
  aceitos: number
  aguardando: number
  recusados: number
  presentes: number
  temCoordenacao: boolean
  funcoes: ResumoFuncao[]
}

export type MembroOption = { userId: string; nome: string; email: string | null }

function labelFuncao(funcao: string): string {
  return FUNCAO_ESCALA_LABEL[funcao as keyof typeof FUNCAO_ESCALA_LABEL] ?? funcao
}

function tomDoStatus(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ACEITO') return 'success'
  if (status === 'CONVOCADO') return 'warning'
  if (status === 'RECUSADO') return 'danger'
  return 'neutral'
}

function ResumoCobertura({ resumo }: { resumo: Resumo }) {
  const chips = [
    { label: 'Postos', valor: resumo.total },
    { label: 'Confirmados', valor: resumo.aceitos },
    { label: 'Sem resposta', valor: resumo.aguardando },
    { label: 'Recusas', valor: resumo.recusados },
    { label: 'Presentes', valor: resumo.presentes },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2"
        >
          <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {c.label}
          </p>
          <p className="text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {c.valor}
          </p>
        </div>
      ))}
    </div>
  )
}

export function EscalaPainel({
  eventoId,
  tipoEvento,
  itens,
  resumo,
  membros,
  podeGerir,
}: {
  eventoId: string
  tipoEvento: string
  itens: EscalaItem[]
  resumo: Resumo
  membros: MembroOption[]
  podeGerir: boolean
}) {
  const [state, setState] = useState<EscalaState>({})
  const [pendente, startTransition] = useTransition()
  const funcoes = funcoesParaTipo(tipoEvento)

  const disponiveis = membros.filter((m) => !itens.some((i) => i.userId === m.userId))

  function executar(acao: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      await runPersistAction(acao, { id: `escala-${eventoId}`, success })
    })
  }

  return (
    <div className="space-y-5">
      <ResumoCobertura resumo={resumo} />

      {!resumo.temCoordenacao && (
        <p className="rounded-xl border border-[rgb(var(--color-danger)_/_0.35)] bg-[rgb(var(--color-danger)_/_0.08)] px-3 py-2 text-sm text-[rgb(var(--foreground))]">
          Nenhuma coordenação escalada — ninguém responde por esta operação.
        </p>
      )}

      {podeGerir && (
        <form
          action={async (fd) => {
            fd.set('eventoId', eventoId)
            const resultado = await convocarParaEscala({}, fd)
            setState(resultado)
            if (resultado.ok) {
              const form = document.getElementById(`escala-form-${eventoId}`)
              if (form instanceof HTMLFormElement) form.reset()
            }
          }}
          id={`escala-form-${eventoId}`}
          className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">Escalar alguém</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`escala-user-${eventoId}`}
                className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
              >
                Quem
              </label>
              <select
                id={`escala-user-${eventoId}`}
                name="userId"
                required
                defaultValue=""
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              >
                <option value="" disabled>
                  Escolher membro
                </option>
                {disponiveis.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.nome}
                  </option>
                ))}
              </select>
              <FieldError errors={state.errors?.userId} />
            </div>

            <div>
              <label
                htmlFor={`escala-funcao-${eventoId}`}
                className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
              >
                Posto
              </label>
              <select
                id={`escala-funcao-${eventoId}`}
                name="funcao"
                defaultValue={funcoes[0]}
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              >
                {funcoes.map((f) => (
                  <option key={f} value={f}>
                    {labelFuncao(f)} — {FUNCAO_ESCALA_DESCRICAO[f] ?? ''}
                  </option>
                ))}
              </select>
              <FieldError errors={state.errors?.funcao} />
            </div>
          </div>

          <div>
            <label
              htmlFor={`escala-obs-${eventoId}`}
              className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
            >
              Detalhe do posto (opcional)
            </label>
            <Input
              id={`escala-obs-${eventoId}`}
              name="observacao"
              maxLength={200}
              placeholder="Ônibus 2, surdo 3, portão B…"
            />
            <FieldError errors={state.errors?.observacao} />
          </div>

          {state.message && (
            <p className="text-sm text-[rgb(var(--color-danger-fg))]">{state.message}</p>
          )}

          <AppButton type="submit" variant="primary" icon={UserPlus} disabled={pendente}>
            Escalar
          </AppButton>
        </form>
      )}

      {itens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ninguém escalado ainda. Comece pela coordenação: é quem responde pela operação.
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {item.nome}
                  </span>
                  <Badge variant="neutral">{labelFuncao(item.funcao)}</Badge>
                  <Badge variant={tomDoStatus(item.status)}>
                    {STATUS_ESCALA_LABEL[item.status as keyof typeof STATUS_ESCALA_LABEL] ??
                      item.status}
                  </Badge>
                  {item.alerta && (
                    <Badge variant={item.alerta.tom === 'danger' ? 'danger' : 'warning'}>
                      {item.alerta.texto}
                    </Badge>
                  )}
                  {item.checkedInAt && (
                    <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--color-success-fg))]">
                      <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                      Presente
                    </span>
                  )}
                </div>
                {(item.observacao || item.areaNome) && (
                  <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
                    {[item.areaNome, item.observacao].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {podeGerir && (
                <div className="flex shrink-0 gap-2">
                  {item.status !== 'SUBSTITUIDO' && (
                    <AppButton
                      type="button"
                      variant="secondary-soft"
                      size="sm"
                      icon={CircleSlash}
                      disabled={pendente}
                      onClick={() =>
                        executar(
                          () => atualizarStatusEscala(item.id, 'SUBSTITUIDO'),
                          'Posto liberado para outra pessoa.',
                        )
                      }
                    >
                      Substituir
                    </AppButton>
                  )}
                  <AppButton
                    type="button"
                    variant="danger-soft"
                    size="sm"
                    icon={Trash2}
                    iconOnly
                    aria-label={`Remover ${item.nome} da escala`}
                    disabled={pendente}
                    onClick={() =>
                      executar(() => removerDaEscala(item.id), 'Removido da escala.')
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
