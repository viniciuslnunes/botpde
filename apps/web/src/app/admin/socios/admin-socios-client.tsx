'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionReveal } from '@/components/motion/motion-reveal'
import {
  emitirCarteirinha,
  renovarCarteirinha,
  revogarCarteirinha,
} from '@/app/admin/socios/actions'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface SocioEmitidoItem {
  id: string
  userId: string
  numeroSocio: number
  nome: string
  validadeIso: string
  validadeLabel: string
  email: string | null
  avatarUrl: string | null
  vencida: boolean
  vencendo: boolean
}

export interface MembroElegivelItem {
  userId: string
  membroId: string
  nome: string
  discordTag: string | null
  telefone: string | null
  cidade: string | null
  avatarUrl: string | null
  sedeNome: string | null
  departamentoNome: string | null
  aprovadoEmLabel: string | null
}

function getValidadePadrao() {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function Avatar({
  url,
  nome,
  size = 32,
}: {
  url: string | null
  nome: string
  size?: number
}) {
  const cls = size >= 40 ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs'
  if (url) {
    if (canOptimizeImageUrl(url)) {
      return (
        <Image
          src={url}
          alt={nome}
          width={size}
          height={size}
          className={`${cls} shrink-0 rounded-full object-cover`}
        />
      )
    }
    return (
      // URL externa não otimizável pelo next/image
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nome}
        loading="lazy"
        decoding="async"
        className={`${cls} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <div
      className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] font-bold text-[rgb(var(--color-primary-fg))]`}
    >
      {nome.charAt(0).toUpperCase()}
    </div>
  )
}

/** Formulário de emissão — modal controlado; preenche nome ao escolher o membro. */
export function EmitirCarteirinhaModal({
  open,
  onClose,
  membrosElegiveis,
  initialUserId,
}: {
  open: boolean
  onClose: () => void
  membrosElegiveis: MembroElegivelItem[]
  initialUserId?: string | null
}) {
  const initialMembro = membrosElegiveis.find((x) => x.userId === (initialUserId ?? ''))
  const [pending, startTransition] = useTransition()
  const [userId, setUserId] = useState(initialUserId ?? '')
  const [nome, setNome] = useState(initialMembro?.nome ?? '')
  const [validade, setValidade] = useState(getValidadePadrao)
  const formIds = useId()
  const firstFieldRef = useRef<HTMLSelectElement>(null)
  const { formRef, markPristine } = useTrackedForm({
    title: 'Nova carteirinha',
    enabled: open,
  })
  const { confirmDiscard } = useUnsavedChangesContext()

  async function closeForm() {
    const ok = await confirmDiscard()
    if (ok) onClose()
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void closeForm()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      window.clearTimeout(t)
    }
    // closeForm fecha sobre confirmDiscard/onClose estáveis o suficiente no ciclo do modal
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reamarra ao abrir/fechar
  }, [open])

  function onSelectMembro(id: string) {
    setUserId(id)
    const m = membrosElegiveis.find((x) => x.userId === id)
    if (m) setNome(m.nome)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await runPersistAction(() => emitirCarteirinha(fd), {
        success: 'Carteirinha emitida.',
        errorFallback: 'Não foi possível emitir a carteirinha.',
      })
      if (ok) {
        markPristine()
        onClose()
      }
    })
  }

  if (!open) return null

  const idMembro = `${formIds}-membro`
  const idNome = `${formIds}-nome`
  const idValidade = `${formIds}-validade`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => void closeForm()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="emitir-carteirinha-titulo"
        className="w-full max-w-md rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3
            id="emitir-carteirinha-titulo"
            className="font-semibold text-[rgb(var(--foreground))]"
          >
            Emitir carteirinha
          </h3>
          <button
            type="button"
            onClick={() => void closeForm()}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor={idMembro}
              className="block text-sm font-medium text-[rgb(var(--foreground))]"
            >
              Membro
            </label>
            <select
              ref={firstFieldRef}
              id={idMembro}
              name="userId"
              required
              value={userId}
              onChange={(e) => onSelectMembro(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            >
              <option value="">Selecione um sócio aprovado…</option>
              {membrosElegiveis.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.nome}
                  {m.cidade ? ` · ${m.cidade}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={idNome}
              className="block text-sm font-medium text-[rgb(var(--foreground))]"
            >
              Nome na carteirinha
            </label>
            <input
              id={idNome}
              name="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>

          <div>
            <label
              htmlFor={idValidade}
              className="block text-sm font-medium text-[rgb(var(--foreground))]"
            >
              Válida até
            </label>
            <input
              id={idValidade}
              name="validade"
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              required
              min={new Date().toISOString().split('T')[0]}
              className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Padrão: 1 ano a partir de hoje.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void closeForm()}
              className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !userId}
              className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Emitir
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SocioActions({ socio }: { socio: SocioEmitidoItem }) {
  const [renovando, setRenovando] = useState(false)
  const [pending, startTransition] = useTransition()
  const [novaValidade, setNovaValidade] = useState(getValidadePadrao)
  const confirmAction = useConfirmAction()

  function handleRenovar() {
    startTransition(async () => {
      const ok = await runPersistAction(
        () => renovarCarteirinha(socio.id, novaValidade),
        { success: 'Carteirinha renovada.' },
      )
      if (ok) setRenovando(false)
    })
  }

  async function handleRevogar() {
    await confirmAction({
      titulo: 'Revogar esta carteirinha?',
      descricao: `A carteirinha nº ${String(socio.numeroSocio).padStart(5, '0')} de ${socio.nome} será removida. O membro continua aprovado e volta à fila de emissão.`,
      labelConfirmar: 'Revogar',
      variante: 'destructive',
      cancelled: 'Revogação cancelada.',
      run: () => revogarCarteirinha(socio.id),
      success: 'Carteirinha revogada.',
    })
  }

  if (pending) {
    return (
      <div className="flex justify-end">
        <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  if (renovando) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          type="date"
          value={novaValidade}
          onChange={(e) => setNovaValidade(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="app-action rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
        <button
          type="button"
          onClick={handleRenovar}
          className="app-action flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          <Check className="h-3 w-3" /> OK
        </button>
        <button
          type="button"
          onClick={() => setRenovando(false)}
          className="app-action rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setRenovando(true)}
        className="app-action flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        title="Renovar validade"
      >
        <RefreshCw className="h-3 w-3" />
        Renovar
      </button>
      <button
        type="button"
        onClick={() => void handleRevogar()}
        className="app-action flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        title="Revogar carteirinha"
      >
        <Trash2 className="h-3 w-3" />
        Revogar
      </button>
    </div>
  )
}

function EmitirLinhaButton({
  membro,
  onEmitir,
}: {
  membro: MembroElegivelItem
  onEmitir: (userId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onEmitir(membro.userId)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
    >
      <Plus className="h-3.5 w-3.5" />
      Emitir
    </button>
  )
}

export function AdminSociosClient({
  socios,
  elegiveis,
  elegiveisModal,
  contagens,
  statusFiltro,
  busca,
  podeEmitir,
}: {
  socios: SocioEmitidoItem[]
  elegiveis: MembroElegivelItem[]
  /** Opções do select de emissão (cap server-side). */
  elegiveisModal: MembroElegivelItem[]
  contagens: {
    emitidas: number
    ativos: number
    vencendo: number
    vencidos: number
    aguardando: number
  }
  statusFiltro: string
  busca: string
  podeEmitir: boolean
}) {
  const [emitOpen, setEmitOpen] = useState(false)
  const [emitUserId, setEmitUserId] = useState<string | null>(null)

  const isAguardando = statusFiltro === 'aguardando'

  function abrirEmit(userId?: string) {
    setEmitUserId(userId ?? null)
    setEmitOpen(true)
  }

  function tabsHref(status: string) {
    const p = new URLSearchParams()
    if (status && status !== 'todos') p.set('status', status)
    if (busca) p.set('q', busca)
    // troca de aba volta à página 1
    const qs = p.toString()
    return `/admin/socios${qs ? `?${qs}` : ''}`
  }

  const tabs = [
    {
      key: 'aguardando',
      label: 'Aguardando',
      count: contagens.aguardando,
      countClass:
        'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    },
    { key: 'todos', label: 'Emitidas', count: contagens.emitidas },
    { key: 'ativos', label: 'Ativos', count: contagens.ativos },
    {
      key: 'vencendo',
      label: 'Vencendo',
      count: contagens.vencendo,
      countClass:
        'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    },
    {
      key: 'vencidos',
      label: 'Vencidos',
      count: contagens.vencidos,
      countClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    },
  ]

  return (
    <>
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Sócios</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {contagens.emitidas} carteirinha
                {contagens.emitidas !== 1 ? 's' : ''} emitida
                {contagens.emitidas !== 1 ? 's' : ''}
                {contagens.aguardando > 0 && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {contagens.aguardando} aguardando emissão
                    </span>
                  </>
                )}
              </p>
            </div>
            {podeEmitir && (
              <button
                type="button"
                onClick={() => abrirEmit()}
                disabled={contagens.aguardando === 0 || elegiveisModal.length === 0}
                title={
                  contagens.aguardando === 0
                    ? 'Nenhum sócio aprovado aguardando carteirinha'
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Emitir carteirinha
              </button>
            )}
          </div>

          <div className="app-scrollbar-none -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1">
            {tabs.map((tab) => {
              const active = statusFiltro === tab.key
              const showCount =
                tab.key === 'aguardando'
                  ? tab.count > 0
                  : tab.count > 0 || active
              return (
                <m.div key={tab.key} whileTap={{ scale: 0.97 }} transition={springSnappy}>
                  <Link
                    href={tabsHref(tab.key)}
                    className={[
                      'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                        : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    {tab.label}
                    {showCount && (
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                          active
                            ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                            : tab.countClass ??
                              'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                        ].join(' ')}
                      >
                        {tab.count}
                      </span>
                    )}
                  </Link>
                </m.div>
              )
            })}
          </div>

          <form method="GET" action="/admin/socios" className="mt-3">
            {statusFiltro !== 'todos' && (
              <input type="hidden" name="status" value={statusFiltro} />
            )}
            <input
              type="search"
              name="q"
              defaultValue={busca}
              placeholder={
                isAguardando
                  ? 'Buscar sócio aguardando por nome, cidade ou telefone…'
                  : 'Buscar carteirinha por nome ou número…'
              }
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
            />
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-4">
        <div className="app-container">
          {isAguardando ? (
            elegiveis.length === 0 ? (
              <MotionEmptyState
                icon={
                  busca ? (
                    <Users className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
                  ) : (
                    <CheckCircle2 className="mb-3 h-10 w-10 text-green-500" />
                  )
                }
                title={
                  busca
                    ? 'Nenhum sócio encontrado'
                    : 'Ninguém aguardando emissão'
                }
                description={
                  busca
                    ? 'Tente outro termo de busca.'
                    : contagens.emitidas > 0
                      ? 'Todos os sócios aprovados já têm carteirinha.'
                      : 'Quando um sócio for aprovado em Membros, ele aparece aqui para emissão.'
                }
                className="flex flex-col items-center justify-center py-16 text-center"
              />
            ) : (
              <MotionReveal index={0}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">
                    Sócios aprovados sem carteirinha numerada. Emita para liberar
                    o acesso no portal.
                  </p>
                </div>
                <m.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                >
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                          Sócio
                        </th>
                        <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] md:table-cell">
                          Unidade
                        </th>
                        <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] lg:table-cell">
                          Cidade
                        </th>
                        <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] xl:table-cell">
                          Aprovado em
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgb(var(--border))]">
                      <AnimatePresence initial={false}>
                        {elegiveis.map((membro) => (
                          <m.tr
                            key={membro.userId}
                            layout
                            variants={staggerItem}
                            initial="hidden"
                            animate="show"
                            className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar url={membro.avatarUrl} nome={membro.nome} />
                                <div className="min-w-0">
                                  <p className="font-medium text-[rgb(var(--foreground))]">
                                    {membro.nome}
                                  </p>
                                  <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                                    {[membro.discordTag, membro.telefone]
                                      .filter(Boolean)
                                      .join(' · ') || '—'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="hidden px-4 py-3 md:table-cell">
                              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                {membro.sedeNome ?? '—'}
                              </span>
                            </td>
                            <td className="hidden px-4 py-3 lg:table-cell">
                              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                {membro.cidade ?? '—'}
                              </span>
                            </td>
                            <td className="hidden px-4 py-3 xl:table-cell">
                              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                {membro.aprovadoEmLabel ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {podeEmitir ? (
                                <EmitirLinhaButton
                                  membro={membro}
                                  onEmitir={abrirEmit}
                                />
                              ) : (
                                <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                  Sem permissão
                                </span>
                              )}
                            </td>
                          </m.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </m.div>
              </MotionReveal>
            )
          ) : socios.length === 0 ? (
            <MotionEmptyState
              icon={
                <CreditCard className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
              }
              title={
                busca
                  ? 'Nenhuma carteirinha encontrada'
                  : statusFiltro === 'todos'
                    ? 'Nenhuma carteirinha emitida'
                    : 'Nenhuma carteirinha nesta categoria'
              }
              description={
                busca ? (
                  'Tente outro nome ou número.'
                ) : elegiveis.length > 0 ? (
                  <span>
                    Há {elegiveis.length} sócio
                    {elegiveis.length !== 1 ? 's' : ''} aprovado
                    {elegiveis.length !== 1 ? 's' : ''} sem carteirinha.{' '}
                    <Link
                      href={tabsHref('aguardando')}
                      className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                    >
                      Ver fila de emissão
                    </Link>
                  </span>
                ) : (
                  'Aprove sócios em Membros e emita a carteirinha numerada aqui.'
                )
              }
              className="flex flex-col items-center justify-center py-16 text-center"
            />
          ) : (
            <MotionReveal index={0}>
              <m.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
              >
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Nº
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Nome
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] md:table-cell">
                        Contato
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Validade
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--border))]">
                    <AnimatePresence initial={false}>
                      {socios.map((socio) => (
                        <m.tr
                          key={socio.id}
                          layout
                          variants={staggerItem}
                          initial="hidden"
                          animate="show"
                          className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-bold text-[rgb(var(--foreground))]">
                              {String(socio.numeroSocio).padStart(5, '0')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar url={socio.avatarUrl} nome={socio.nome} />
                              <span className="font-medium text-[rgb(var(--foreground))]">
                                {socio.nome}
                              </span>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {socio.email ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {socio.vencida ? (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                              ) : socio.vencendo ? (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                              )}
                              <span
                                className={[
                                  'text-sm',
                                  socio.vencida
                                    ? 'text-red-600 dark:text-red-400'
                                    : socio.vencendo
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-[rgb(var(--foreground))]',
                                ].join(' ')}
                              >
                                {socio.validadeLabel}
                              </span>
                              {socio.vencida && (
                                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                                  Vencida
                                </span>
                              )}
                              {socio.vencendo && (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                  Vence em breve
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {podeEmitir ? (
                              <SocioActions socio={socio} />
                            ) : (
                              <span className="block text-right text-xs text-[rgb(var(--foreground-muted))]">
                                —
                              </span>
                            )}
                          </td>
                        </m.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </m.div>
            </MotionReveal>
          )}
        </div>
      </div>

      {podeEmitir && emitOpen && (
        <EmitirCarteirinhaModal
          key={emitUserId ?? 'blank'}
          open
          onClose={() => setEmitOpen(false)}
          membrosElegiveis={elegiveisModal}
          initialUserId={emitUserId}
        />
      )}
    </>
  )
}
