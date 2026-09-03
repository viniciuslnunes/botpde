'use client'

import { useState, useTransition } from 'react'
import { Bus, Plus, Printer, Trash2 } from 'lucide-react'
import { Badge, FieldError, Input } from '@torcida/ui'
import { AppButton, AppButtonLink } from '@/components/ui/button'
import { runPersistAction } from '@/lib/toast-action'
import {
  alocarPassageiroVeiculo,
  excluirVeiculoCaravana,
  salvarVeiculoCaravana,
  type VeiculoState,
} from '@/app/admin/eventos/veiculo-actions'
import type { FrotaDaCaravana } from '@/lib/caravana-frota'
import type { MembroOption } from '@/components/eventos/escala-painel'

/**
 * Frota da caravana: quantos ônibus, quem responde por cada um, de onde sai e
 * quem viaja em qual. A lista nominal por veículo é o que a empresa de
 * fretamento pede — e o que a torcida precisa ter em mãos se algo acontecer no
 * trajeto.
 */

function formatarHorario(valor: Date | string | null): string {
  if (!valor) return ''
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(valor),
  )
}

function paraInputDatetime(valor: Date | string | null): string {
  if (!valor) return ''
  const d = new Date(valor)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function FrotaPainel({
  eventoId,
  frota,
  membros,
  podeGerir,
}: {
  eventoId: string
  frota: FrotaDaCaravana
  membros: MembroOption[]
  podeGerir: boolean
}) {
  const [state, setState] = useState<VeiculoState>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const { veiculos, passageiros, resumo, pendencias } = frota
  const semLugar = passageiros.filter((p) => !p.veiculoId)

  function executar(acao: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      await runPersistAction(acao, { id: `frota-${eventoId}`, success })
    })
  }

  const emEdicao = editando ? veiculos.find((v) => v.id === editando) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Assentos
          </p>
          <p className="text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {resumo.alocados}/{resumo.capacidadeTotal}
          </p>
        </div>
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Sem ônibus
          </p>
          <p className="text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {resumo.semVeiculo}
          </p>
        </div>
        <AppButtonLink
          href={`/admin/eventos/${eventoId}/manifesto`}
          variant="outline"
          size="sm"
          icon={Printer}
          className="ml-auto"
        >
          Manifesto
        </AppButtonLink>
      </div>

      {pendencias.length > 0 && (
        <ul className="space-y-1.5">
          {pendencias.map((p) => (
            <li
              key={p.chave}
              className={
                p.severidade === 'alta'
                  ? 'rounded-xl border border-[rgb(var(--color-danger)_/_0.35)] bg-[rgb(var(--color-danger)_/_0.08)] px-3 py-2 text-sm text-[rgb(var(--foreground))]'
                  : 'rounded-xl border border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--color-warning)_/_0.08)] px-3 py-2 text-sm text-[rgb(var(--foreground))]'
              }
            >
              {p.texto}
            </li>
          ))}
        </ul>
      )}

      {podeGerir && (
        <form
          key={editando ?? 'novo'}
          action={async (fd) => {
            fd.set('eventoId', eventoId)
            const resultado = await salvarVeiculoCaravana(editando, {}, fd)
            setState(resultado)
            if (resultado.ok) setEditando(null)
          }}
          className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">
            {emEdicao ? `Editar ${emEdicao.identificacao}` : 'Adicionar veículo'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Identificação
              </label>
              <Input
                name="identificacao"
                required
                maxLength={60}
                defaultValue={emEdicao?.identificacao ?? ''}
                placeholder="Ônibus 1"
              />
              <FieldError errors={state.errors?.identificacao} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Capacidade
              </label>
              <Input
                name="capacidade"
                type="number"
                min={1}
                max={120}
                required
                defaultValue={emEdicao?.capacidade ?? ''}
              />
              <FieldError errors={state.errors?.capacidade} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Empresa de fretamento
              </label>
              <Input name="empresa" maxLength={120} defaultValue={emEdicao?.empresa ?? ''} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Placa
              </label>
              <Input name="placa" maxLength={10} defaultValue={emEdicao?.placa ?? ''} />
            </div>
            <div>
              <label
                htmlFor={`frota-resp-${eventoId}`}
                className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
              >
                Responsável pelo veículo
              </label>
              <select
                id={`frota-resp-${eventoId}`}
                name="responsavelId"
                defaultValue={emEdicao?.responsavelId ?? ''}
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              >
                <option value="">Sem responsável</option>
                {membros.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.nome}
                  </option>
                ))}
              </select>
              <FieldError errors={state.errors?.responsavelId} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Horário de embarque
              </label>
              <Input
                name="horarioEmbarque"
                type="datetime-local"
                defaultValue={paraInputDatetime(emEdicao?.horarioEmbarque ?? null)}
              />
              <FieldError errors={state.errors?.horarioEmbarque} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Ponto de embarque
              </label>
              <Input
                name="pontoEmbarque"
                maxLength={200}
                defaultValue={emEdicao?.pontoEmbarque ?? ''}
                placeholder="Sede, Praça da Bandeira…"
              />
            </div>
          </div>

          {state.message && (
            <p className="text-sm text-[rgb(var(--color-danger-fg))]">{state.message}</p>
          )}

          <div className="flex gap-2">
            <AppButton type="submit" variant="primary" icon={Plus} disabled={pendente}>
              {emEdicao ? 'Salvar veículo' : 'Adicionar'}
            </AppButton>
            {emEdicao && (
              <AppButton
                type="button"
                variant="ghost"
                icon={Bus}
                onClick={() => setEditando(null)}
              >
                Cancelar
              </AppButton>
            )}
          </div>
        </form>
      )}

      {veiculos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum veículo. Cadastre o primeiro ônibus para montar a lista de embarque.
        </p>
      ) : (
        <ul className="space-y-3">
          {veiculos.map((v) => {
            const doVeiculo = passageiros.filter((p) => p.veiculoId === v.id)
            return (
              <li
                key={v.id}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Bus className="h-4 w-4 text-[rgb(var(--foreground-muted))]" aria-hidden />
                  <span className="font-medium text-[rgb(var(--foreground))]">
                    {v.identificacao}
                  </span>
                  <Badge variant={v.lotado ? 'warning' : 'neutral'}>
                    {v.ocupados}/{v.capacidade}
                  </Badge>
                  {v.responsavelNome ? (
                    <Badge variant="neutral">{v.responsavelNome}</Badge>
                  ) : (
                    <Badge variant="danger">Sem responsável</Badge>
                  )}
                  {podeGerir && (
                    <div className="ml-auto flex gap-2">
                      <AppButton
                        type="button"
                        variant="secondary-soft"
                        size="sm"
                        icon={Bus}
                        onClick={() => setEditando(v.id)}
                      >
                        Editar
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="danger-soft"
                        size="sm"
                        icon={Trash2}
                        iconOnly
                        aria-label={`Excluir ${v.identificacao}`}
                        disabled={pendente}
                        onClick={() =>
                          executar(
                            () => excluirVeiculoCaravana(v.id),
                            'Veículo removido — passageiros voltaram para a fila.',
                          )
                        }
                      />
                    </div>
                  )}
                </div>

                {(v.pontoEmbarque || v.horarioEmbarque || v.empresa || v.placa) && (
                  <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                    {[
                      v.pontoEmbarque,
                      v.horarioEmbarque ? formatarHorario(v.horarioEmbarque) : null,
                      v.empresa,
                      v.placa,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}

                {doVeiculo.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {doVeiculo.map((p) => (
                      <li
                        key={p.userId}
                        className="rounded-lg bg-[rgb(var(--background-subtle))] px-2 py-1 text-xs text-[rgb(var(--foreground))]"
                      >
                        {p.nome}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {semLugar.length > 0 && (
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <p className="mb-2 text-sm font-medium text-[rgb(var(--foreground))]">
            Confirmados sem ônibus ({semLugar.length})
          </p>
          <ul className="space-y-1.5">
            {semLugar.map((p) => (
              <li key={p.userId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[rgb(var(--foreground))]">{p.nome}</span>
                {podeGerir && veiculos.length > 0 && (
                  <select
                    aria-label={`Ônibus de ${p.nome}`}
                    defaultValue=""
                    disabled={pendente}
                    onChange={(e) => {
                      const destino = e.target.value
                      if (!destino) return
                      executar(
                        () => alocarPassageiroVeiculo(eventoId, p.userId, destino),
                        `${p.nome} alocado.`,
                      )
                    }}
                    className="ml-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-xs text-[rgb(var(--foreground))]"
                  >
                    <option value="">Alocar em…</option>
                    {veiculos
                      .filter((v) => !v.lotado)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.identificacao} ({v.livres} livre{v.livres === 1 ? '' : 's'})
                        </option>
                      ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
