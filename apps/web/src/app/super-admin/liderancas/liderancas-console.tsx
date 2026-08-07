'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Crown, Loader2, Search, UserCheck, UserMinus, UserX } from 'lucide-react'
import { useConfirmAction } from '@/lib/confirm-action'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import type { GrupoLideranca, LinhaLideranca } from '@/lib/liderancas-console'
import {
  removerLiderancaSuperAdmin,
  transferirLiderancaSuperAdmin,
  type LiderancaState,
} from './actions'

function textoBusca(linha: LinhaLideranca, grupo: GrupoLideranca): string {
  return normalizarTexto(
    [
      linha.nome,
      linha.tipoLabel,
      linha.slug ?? '',
      grupo.nome,
      grupo.clubeLabel ?? '',
      ...linha.lideres.map((l) => `${l.nome ?? ''} ${l.email ?? ''}`),
    ].join(' '),
  )
}

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

export function LiderancasConsole({ grupos }: { grupos: GrupoLideranca[] }) {
  const [busca, setBusca] = useState('')
  const [soMinhas, setSoMinhas] = useState(false)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [state, action] = useActionState<LiderancaState, FormData>(
    transferirLiderancaSuperAdmin,
    {},
  )
  const [removendo, startRemover] = useTransition()
  const confirmAction = useConfirmAction()

  const totalMinhas = useMemo(
    () =>
      grupos.reduce(
        (acc, g) => acc + (g.raiz.souEu ? 1 : 0) + g.filhas.filter((f) => f.souEu).length,
        0,
      ),
    [grupos],
  )
  const totalSemLider = useMemo(
    () =>
      grupos.reduce(
        (acc, g) =>
          acc +
          (g.raiz.lideres.length === 0 ? 1 : 0) +
          g.filhas.filter((f) => f.lideres.length === 0).length,
        0,
      ),
    [grupos],
  )

  const gruposFiltrados = useMemo(() => {
    const alvo = normalizarTexto(busca)
    return grupos
      .map((g) => {
        const passa = (linha: LinhaLideranca) =>
          (!soMinhas || linha.souEu) && (!alvo || textoBusca(linha, g).includes(alvo))
        const raizPassa = passa(g.raiz)
        const filhas = g.filhas.filter(passa)
        if (!raizPassa && filhas.length === 0) return null
        return { grupo: g, mostrarRaiz: raizPassa, filhas }
      })
      .filter((x): x is { grupo: GrupoLideranca; mostrarRaiz: boolean; filhas: LinhaLideranca[] } =>
        Boolean(x),
      )
  }, [grupos, busca, soMinhas])

  const todasLinhas = useMemo(
    () => grupos.flatMap((g) => [g.raiz, ...g.filhas]),
    [grupos],
  )
  const selecionada = todasLinhas.find((l) => l.id === selecionadaId) ?? null

  useEffect(() => {
    if (state.success) window.location.reload()
  }, [state.success])

  function removerLider(linha: LinhaLideranca) {
    startRemover(async () => {
      const ok = await confirmAction({
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
      })
      if (ok) window.location.reload()
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Torcidas" valor={grupos.length} />
        <Kpi label="Sem liderança" valor={totalSemLider} destaque={totalSemLider > 0} />
        <Kpi label="Sob sua posse" valor={totalMinhas} destaque={totalMinhas > 0} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar torcida, unidade, clube ou e-mail de quem lidera…"
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
            aria-label="Buscar liderança"
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--foreground))]">
          <input
            type="checkbox"
            checked={soMinhas}
            onChange={(e) => setSoMinhas(e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--color-primary))]"
          />
          Só onde eu lidero
        </label>
      </div>

      {gruposFiltrados.length === 0 ? (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
          {soMinhas
            ? 'Você não é presidente nem liderança de nenhuma unidade.'
            : 'Nenhuma torcida ou unidade encontrada.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {gruposFiltrados.map(({ grupo, mostrarRaiz, filhas }) => (
            <li
              key={grupo.tenantId}
              className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
            >
              <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: grupo.corPrimaria }}
                >
                  {grupo.nome.charAt(0).toUpperCase()}
                </span>
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
                {mostrarRaiz && (
                  <LinhaItem
                    linha={grupo.raiz}
                    selecionada={selecionadaId === grupo.raiz.id}
                    onSelecionar={setSelecionadaId}
                    onRemover={removerLider}
                    removendo={removendo}
                  />
                )}
                {filhas.map((f) => (
                  <LinhaItem
                    key={f.id}
                    linha={f}
                    recuada
                    selecionada={selecionadaId === f.id}
                    onSelecionar={setSelecionadaId}
                    onRemover={removerLider}
                    removendo={removendo}
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
  removendo,
}: {
  linha: LinhaLideranca
  recuada?: boolean
  selecionada: boolean
  onSelecionar: (id: string | null) => void
  onRemover: (linha: LinhaLideranca) => void
  removendo: boolean
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
            disabled={removendo}
            onClick={() => onRemover(linha)}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {removendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
            Remover
          </button>
        )}
      </div>
    </li>
  )
}
