'use client'

import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Crown, Loader2, UserCheck, UserMinus, UserX } from 'lucide-react'
import { useConfirmAction } from '@/lib/confirm-action'
import { LogoImage } from '@/components/media/logo-image'
import type {
  GrupoLideranca,
  LiderancasResumo,
  LinhaLideranca,
} from '@/lib/liderancas-console'
import {
  removerLiderancaSuperAdmin,
  transferirLiderancaSuperAdmin,
  type LiderancaState,
} from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
      {pending ? 'Salvando…' : 'Transferir'}
    </button>
  )
}

export function LiderancasConsole({
  grupos,
  resumo,
}: {
  grupos: GrupoLideranca[]
  resumo: LiderancasResumo
}) {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [state, action] = useActionState<LiderancaState, FormData>(
    transferirLiderancaSuperAdmin,
    {},
  )
  const confirmAction = useConfirmAction()

  const todasLinhas = grupos.flatMap((g) => [g.raiz, ...g.filhas])
  const selecionada = todasLinhas.find((l) => l.id === selecionadaId) ?? null

  useEffect(() => {
    if (state.success) window.location.reload()
  }, [state.success])

  /**
   * Confirmação fora de `startTransition`: esperar o modal dentro da transição
   * trava o botão em pending para sempre (o modal só monta quando a transição
   * termina, e a transição só termina depois do clique no modal).
   * `useConfirmAction` roda a mutação com loading no botão Confirmar do modal.
   */
  function removerLider(linha: LinhaLideranca) {
    void confirmAction({
      titulo: linha.caso === 'B' ? 'Remover presidente?' : 'Remover liderança?',
      descricao:
        linha.caso === 'B'
          ? `${linha.nome} fica sem presidente. Cadastros e vínculos dos membros não são apagados — só o cargo sai, e o super-admin volta a operar as configurações reservadas até haver nova presidência.`
          : `${linha.nome} fica sem liderança vinculada. O canal oficial da unidade continua como está.`,
      labelConfirmar: 'Remover',
      labelCancelar: 'Cancelar',
      variante: 'destructive',
      cancelled: false,
      success: 'Liderança removida.',
      errorFallback: 'Não foi possível remover.',
      run: () =>
        removerLiderancaSuperAdmin({
          caso: linha.caso,
          tenantId: linha.tenantId,
          sedeId: linha.sedeId,
        }),
    }).then((ok) => {
      if (ok) window.location.reload()
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Torcidas" valor={resumo.torcidas} />
        <Kpi label="Sem liderança" valor={resumo.semLider} destaque={resumo.semLider > 0} />
        <Kpi label="Sob sua posse" valor={resumo.sobMinhaPosse} destaque={resumo.sobMinhaPosse > 0} />
      </div>

      {grupos.length === 0 ? null : (
        <ul className="space-y-4">
          {grupos.map((grupo) => (
            <li
              key={grupo.tenantId}
              className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
            >
              <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
                {grupo.logoUrl ? (
                  // Sem `rounded`: só `useEscudoCircular` decide recorte. Badge
                  // com fundo assado ganha máscara; PNG com alpha (o caso do
                  // escudo do Gaviões) fica natural, sem cantos cortados.
                  <LogoImage
                    src={grupo.logoUrl}
                    alt=""
                    size={64}
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: grupo.corPrimaria }}
                  >
                    {grupo.nome.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                    {grupo.nome}
                  </p>
                  {grupo.clubeLabel && (
                    <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                      {grupo.clubeLabel}
                    </p>
                  )}
                </div>
              </div>

              <ul className="divide-y divide-[rgb(var(--border))]">
                <LinhaItem
                  linha={grupo.raiz}
                  selecionada={selecionadaId === grupo.raiz.id}
                  onSelecionar={setSelecionadaId}
                  onRemover={removerLider}
                />
                {grupo.filhas.map((f) => (
                  <LinhaItem
                    key={f.id}
                    linha={f}
                    recuada
                    selecionada={selecionadaId === f.id}
                    onSelecionar={setSelecionadaId}
                    onRemover={removerLider}
                  />
                ))}
              </ul>

              {selecionada &&
                [grupo.raiz, ...grupo.filhas].some((l) => l.id === selecionada.id) && (
                  <form
                    action={action}
                    className="space-y-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4"
                  >
                    <input type="hidden" name="caso" value={selecionada.caso} />
                    <input type="hidden" name="tenantId" value={selecionada.tenantId} />
                    <input type="hidden" name="sedeId" value={selecionada.sedeId ?? ''} />
                    <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                      {selecionada.caso === 'B' ? 'Nova presidência' : 'Nova liderança'} —{' '}
                      {selecionada.nome}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          name="email"
                          type="email"
                          required
                          placeholder="E-mail de quem assume"
                          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
                        />
                        <input
                          name="motivo"
                          type="text"
                          maxLength={300}
                          placeholder="Motivo (fica no registro de auditoria)"
                          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
                        />
                        {state.errors?.email?.[0] && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {state.errors.email[0]}
                          </p>
                        )}
                        {state.message && !state.success && (
                          <p className="text-xs text-red-600 dark:text-red-400">{state.message}</p>
                        )}
                      </div>
                      <SubmitButton />
                    </div>
                  </form>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Kpi({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-2xl font-semibold ${
          destaque
            ? 'text-[rgb(var(--color-warning-fg))]'
            : 'text-[rgb(var(--foreground))]'
        }`}
      >
        {valor}
      </p>
    </div>
  )
}

function LinhaItem({
  linha,
  recuada,
  selecionada,
  onSelecionar,
  onRemover,
}: {
  linha: LinhaLideranca
  recuada?: boolean
  selecionada: boolean
  onSelecionar: (id: string | null) => void
  onRemover: (linha: LinhaLideranca) => void
}) {
  return (
    <li
      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${recuada ? 'pl-10' : ''} ${
        selecionada ? 'bg-[rgb(var(--color-primary)_/_0.10)]' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-[rgb(var(--foreground))]">
          {linha.nome}
          <span className="shrink-0 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-normal text-[rgb(var(--foreground-muted))]">
            {linha.tipoLabel}
          </span>
          {linha.souEu && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--color-primary)_/_0.16)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-primary-fg))]">
              <Crown className="h-3 w-3" />
              Você
            </span>
          )}
        </p>
        {linha.lideres.length > 0 ? (
          <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
            {linha.lideres.map((l) => l.email ?? l.nome ?? l.userId).join(', ')}
          </p>
        ) : (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <UserX className="h-3 w-3" />
            Sem liderança
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onSelecionar(selecionada ? null : linha.id)}
          className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          {selecionada ? 'Fechar' : 'Transferir'}
        </button>
        {linha.lideres.length > 0 && (
          <button
            type="button"
            onClick={() => onRemover(linha)}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <UserMinus className="h-3 w-3" />
            Remover
          </button>
        )}
      </div>
    </li>
  )
}
