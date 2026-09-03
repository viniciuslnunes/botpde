'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, Check, CheckCircle2, CreditCard, Loader2, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { DatePicker } from '@/components/ui/date-picker'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminPageHeader, AdminPendingTabs, AdminRowActions } from '@/components/admin/ui'
import { MembroOrigemCell } from '@/components/admin/membro-origem-cell'
import {
  emitirCarteirinha,
  renovarCarteirinha,
  revogarCarteirinha,
} from '@/app/admin/socios/actions'
import { MembroDetalheModal } from '@/app/admin/membros/membro-detalhe-modal'
import type { AdminMembroItem } from '@/app/admin/membros/admin-membro-item'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import {
  formatCaixaAltaListagem,
  formatTelefoneListagem,
} from '@/lib/admin-listagem-format'
import { AppButton } from '@/components/ui/button'
import { SearchFilterInput } from '@/components/ui/reactive-search'

export type EstagioSocio = 'solicitacao' | 'aguardando' | 'ativo' | 'vencendo' | 'vencido'

export interface SocioTodosItem {
  detalhe: AdminMembroItem
  estagio: EstagioSocio
  socio?: SocioEmitidoItem
}

export interface SocioEmitidoItem {
  id: string
  userId: string
  numeroSocio: number
  /** Nº do recrutamento (exibição); não o sequencial legado. */
  numeroLabel: string
  nome: string
  validadeIso: string
  validadeLabel: string
  email: string | null
  /** Área de atuação no tenant (vem do `SaasMembro`, não da carteirinha). */
  departamentoNome: string | null
  avatarUrl: string | null
  vencida: boolean
  vencendo: boolean
  /** Cadastro completo do SaasMembro (modal de detalhes). */
  detalhe: AdminMembroItem | null
}

export interface MembroElegivelItem {
  userId: string
  membroId: string
  nome: string
  numeroAssociado: string | null
  discordTag: string | null
  telefone: string | null
  cidade: string | null
  avatarUrl: string | null
  sedeNome: string | null
  departamentoNome: string | null
  aprovadoEmLabel: string | null
  /** Presente na lista; null nas opções leves do modal de emissão. */
  detalhe: AdminMembroItem | null
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
  proximoNumero,
}: {
  open: boolean
  onClose: () => void
  membrosElegiveis: MembroElegivelItem[]
  initialUserId?: string | null
  /** Sugestão quando o sócio ainda não tem nº (caminho «quero me associar»). */
  proximoNumero?: string
}) {
  const [pending, startTransition] = useTransition()
  const [userId, setUserId] = useState(initialUserId ?? '')
  const [nome, setNome] = useState(() => {
    const m = membrosElegiveis.find((x) => x.userId === (initialUserId ?? ''))
    return m?.nome ?? ''
  })
  const [numeroAssociado, setNumeroAssociado] = useState(() => {
    const m = membrosElegiveis.find((x) => x.userId === (initialUserId ?? ''))
    return m?.numeroAssociado?.trim() || proximoNumero || ''
  })
  const [validade, setValidade] = useState(getValidadePadrao)
  const [filtro, setFiltro] = useState('')
  const formIds = useId()
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const { formRef, markPristine } = useTrackedForm({
    title: 'Nova carteirinha',
    enabled: open,
  })

  useEffect(() => {
    if (open) firstFieldRef.current?.focus()
  }, [open])
  const { confirmDiscard } = useUnsavedChangesContext()

  async function closeForm() {
    const ok = await confirmDiscard()
    if (ok) onClose()
  }

  function onSelectMembro(id: string) {
    setUserId(id)
    const m = membrosElegiveis.find((x) => x.userId === id)
    if (m) {
      setNome(m.nome)
      setNumeroAssociado(m.numeroAssociado?.trim() || proximoNumero || '')
    }
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

  const idNome = `${formIds}-nome`
  const idValidade = `${formIds}-validade`
  const q = filtro.trim().toLowerCase()
  const filtrados = q
    ? membrosElegiveis.filter((m) => {
        const hay = [m.nome, m.cidade, m.discordTag, m.telefone, m.numeroAssociado]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    : membrosElegiveis
  const selecionado = membrosElegiveis.find((m) => m.userId === userId)

  return (
    <AppModal
      open={open}
      onClose={() => void closeForm()}
      size="lg"
      labelledBy="emitir-carteirinha-titulo"
      busy={pending}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4 sm:px-6">
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

      <AppModalBody className="px-5 py-4 sm:px-6">
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5 @2xl/modal:grid-cols-2">
          <input type="hidden" name="userId" value={userId} />

          <div>
            <p className="block text-sm font-medium text-[rgb(var(--foreground))]">
              Membro
            </p>
            {selecionado && (
              <p className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                Selecionado:{' '}
                <span className="font-medium text-[rgb(var(--foreground))]">
                  {selecionado.nome}
                </span>
                {selecionado.numeroAssociado
                  ? ` · nº ${selecionado.numeroAssociado}`
                  : ''}
                {selecionado.cidade
                  ? ` · ${formatCaixaAltaListagem(selecionado.cidade)}`
                  : ''}
              </p>
            )}
            <SearchFilterInput
              value={filtro}
              onChange={setFiltro}
              placeholder="Buscar por nome, cidade ou telefone…"
              ariaLabel="Membro"
              exibirDropdown={false}
              inputRef={firstFieldRef}
              inputClassName="mt-1.5 rounded-lg"
              className="mt-0"
            />
            <ul
              role="listbox"
              aria-label="Sócios elegíveis"
              className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] @2xl/modal:max-h-[min(22rem,50dvh)]"
            >
              {filtrados.length === 0 ? (
                <li className="px-3 py-3 text-sm text-[rgb(var(--foreground-muted))]">
                  Nenhum sócio encontrado.
                </li>
              ) : (
                filtrados.map((m) => {
                  const active = m.userId === userId
                  return (
                    <li key={m.userId} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onClick={() => onSelectMembro(m.userId)}
                        className={[
                          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                          active
                            ? 'bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                            : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                        ].join(' ')}
                      >
                        <Avatar url={m.avatarUrl} nome={m.nome} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.nome}</span>
                          <span className="block truncate text-xs text-[rgb(var(--foreground-muted))]">
                            {[
                              m.numeroAssociado ? `nº ${m.numeroAssociado}` : null,
                              formatCaixaAltaListagem(m.cidade),
                              formatTelefoneListagem(m.telefone),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        {active && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            {membrosElegiveis.length >= 300 && (
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                Mostrando até 300 elegíveis. Use a busca para afinar.
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
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
                htmlFor={`${formIds}-numero`}
                className="block text-sm font-medium text-[rgb(var(--foreground))]"
              >
                Nº de associado
              </label>
              <input
                id={`${formIds}-numero`}
                name="numeroAssociado"
                required
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={7}
                value={numeroAssociado}
                onChange={(e) => setNumeroAssociado(e.target.value.replace(/\D/g, '').slice(0, 7))}
                placeholder={proximoNumero ? `Sugestão: ${proximoNumero}` : 'Somente dígitos'}
                readOnly={Boolean(selecionado?.numeroAssociado?.trim())}
                className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] read-only:opacity-70"
              />
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                {selecionado?.numeroAssociado?.trim()
                  ? 'Número já informado no cadastro.'
                  : 'Quem se associou agora ainda não tem nº — atribua aqui na emissão.'}
              </p>
            </div>

            <div>
              <label
                htmlFor={idValidade}
                className="block text-sm font-medium text-[rgb(var(--foreground))]"
              >
                Válida até
              </label>
              <DatePicker
                id={idValidade}
                name="validade"
                value={validade}
                onChange={setValidade}
                required
                min={new Date().toISOString().split('T')[0]}
                aria-label="Válida até"
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                Padrão: 1 ano a partir de hoje.
              </p>
            </div>

            <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
              <AppButton
                variant="none"
                icon={X}
                type="button"
                onClick={() => void closeForm()}
                className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
              >
                Cancelar
              </AppButton>
              <AppButton
                variant="primary"
                icon={Check}
                loading={pending}
                type="submit"
                disabled={pending || !userId}
                className="gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Emitir
              </AppButton>
            </div>
          </div>
        </form>
      </AppModalBody>
    </AppModal>
  )
}


function EstagioSocioBadge({ estagio }: { estagio: EstagioSocio }) {
  const config: Record<
    EstagioSocio,
    { label: string; className: string }
  > = {
    solicitacao: {
      label: 'Solicitação',
      className:
        'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    aguardando: {
      label: 'Aguardando emissão',
      className:
        'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    ativo: {
      label: 'Ativo',
      className:
        'bg-[rgb(var(--color-success)_/_0.16)] text-[rgb(var(--color-success-fg))]',
    },
    vencendo: {
      label: 'Vencendo',
      className:
        'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    vencido: {
      label: 'Vencido',
      className:
        'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]',
    },
  }
  const item = config[estagio]
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.className}`}
    >
      {item.label}
    </span>
  )
}

function ValidadeStatus({ socio }: { socio: SocioEmitidoItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {socio.vencida ? (
        <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-danger" />
      ) : socio.vencendo ? (
        <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-warning" />
      ) : (
        <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-success" />
      )}
      <span
        className={[
          'text-sm',
          socio.vencida
            ? 'text-danger'
            : socio.vencendo
              ? 'text-warning'
              : 'text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        {socio.validadeLabel}
      </span>
      {socio.vencida && (
        <span className="rounded-full bg-[rgb(var(--color-danger)_/_0.16)] px-1.5 py-0.5 text-xs font-medium text-danger">
          Vencida
        </span>
      )}
      {socio.vencendo && (
        <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-1.5 py-0.5 text-xs font-medium text-warning">
          Vence em breve
        </span>
      )}
    </div>
  )
}

function SocioActions({
  socio,
  stacked = false,
}: {
  socio: SocioEmitidoItem
  stacked?: boolean
}) {
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
      descricao: `A carteirinha nº ${socio.numeroLabel} de ${socio.nome} será removida. O membro continua aprovado e volta à fila de emissão.`,
      labelConfirmar: 'Revogar',
      variante: 'destructive',
      cancelled: 'Revogação cancelada.',
      run: () => revogarCarteirinha(socio.id),
      success: 'Carteirinha revogada.',
    })
  }

  if (pending) {
    return (
      <div className={stacked ? 'flex justify-center' : 'flex justify-end'}>
        <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  if (renovando) {
    return (
      <div
        className={
          stacked
            ? 'flex flex-col gap-2'
            : 'flex flex-wrap items-center justify-end gap-2'
        }
      >
        <DatePicker
          value={novaValidade}
          onChange={setNovaValidade}
          min={new Date().toISOString().split('T')[0]}
          aria-label="Nova validade"
          className={stacked ? 'w-full' : undefined}
        />
        <div className={stacked ? 'flex gap-2' : 'contents'}>
          <button
            type="button"
            onClick={handleRenovar}
            className={[
              'app-touch-target inline-flex h-8 items-center justify-center gap-1 rounded-lg btn-success px-2.5 text-xs font-medium',
              stacked ? 'min-w-0 flex-1' : '',
            ].join(' ')}
          >
            <Check className="h-3.5 w-3.5" /> OK
          </button>
          <button
            type="button"
            onClick={() => setRenovando(false)}
            className="app-touch-target inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <AdminRowActions
      ariaLabel={`Ações da carteirinha de ${socio.nome}`}
      fullWidth={stacked}
      items={[
        {
          id: 'renovar',
          label: 'Renovar',
          icon: RefreshCw,
          onSelect: () => setRenovando(true),
        },
        {
          id: 'revogar',
          label: 'Revogar',
          icon: Trash2,
          tone: 'danger',
          onSelect: () => void handleRevogar(),
        },
      ]}
    />
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
    <AppButton
      variant="primary"
      icon={Plus}
      type="button"
      onClick={() => onEmitir(membro.userId)}
      className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
    >
      Emitir
    </AppButton>
  )
}

export function AdminSociosClient({
  todosItens,
  socios,
  elegiveis,
  elegiveisModal,
  solicitacoes,
  solicitacoesTabela,
  contagens,
  statusFiltro,
  tabHrefs,
  podeEmitir,
  podeGerirAcessos,
  podeBloquear,
  podeApagar,
  bloqueadosUserIds,
  toolbar,
  cabecalho,
  paginacao,
  temFiltroAtivo,
  proximoNumero,
}: {
  /** Visão unificada — todo o funil de sócio. */
  todosItens: SocioTodosItem[]
  socios: SocioEmitidoItem[]
  elegiveis: MembroElegivelItem[]
  /** Opções do select de emissão (cap server-side). */
  elegiveisModal: MembroElegivelItem[]
  /** Sócios PENDENTE — fila de admissão (aba Solicitações). */
  solicitacoes: AdminMembroItem[]
  /** Tabela de aprovação reusada de membros (server monta o cabecalho). */
  solicitacoesTabela: ReactNode
  contagens: {
    todos: number
    emitidas: number
    ativos: number
    vencendo: number
    vencidos: number
    aguardando: number
    solicitacoes: number
  }
  statusFiltro: string
  tabHrefs: Record<string, string>
  podeEmitir: boolean
  /** `roles:manage` do admin logado — libera a aba Acessos do card. */
  podeGerirAcessos: boolean
  /** `members:block` — libera bloquear/desbloquear no card. */
  podeBloquear: boolean
  /** `members:purge` — libera apagar de vez (Presidente/super-admin). */
  podeApagar: boolean
  /** userIds bloqueados no tenant (ou herdado da Sede). Carregado em lote. */
  bloqueadosUserIds: string[]
  toolbar: ReactNode
  cabecalho: ReactNode
  paginacao: ReactNode
  temFiltroAtivo: boolean
  proximoNumero?: string
}) {
  const [emitOpen, setEmitOpen] = useState(false)
  const [emitUserId, setEmitUserId] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<AdminMembroItem | null>(null)
  const fecharDetalhe = useCallback(() => setSelecionado(null), [])

  const isTodos = statusFiltro === 'todos'
  const isAguardando = statusFiltro === 'aguardando'
  const isSolicitacoes = statusFiltro === 'solicitacoes'

  function abrirDetalhe(detalhe: AdminMembroItem | null | undefined) {
    if (detalhe) setSelecionado(detalhe)
  }

  function abrirEmit(userId?: string) {
    setEmitUserId(userId ?? null)
    setEmitOpen(true)
  }

  const tabs = [
    { key: 'todos', label: 'Todos', count: contagens.todos },
    {
      key: 'solicitacoes',
      label: 'Solicitações',
      count: contagens.solicitacoes,
      countClass:
        'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    {
      key: 'aguardando',
      label: 'Aguardando emissão',
      count: contagens.aguardando,
      countClass:
        'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    { key: 'emitidas', label: 'Emitidas', count: contagens.emitidas },
    { key: 'ativos', label: 'Ativos', count: contagens.ativos },
    {
      key: 'vencendo',
      label: 'Vencendo',
      count: contagens.vencendo,
      countClass:
        'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    {
      key: 'vencidos',
      label: 'Vencidos',
      count: contagens.vencidos,
      countClass:
        'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]',
    },
  ]

  return (
    <>
      <AdminPageHeader
        title="Sócios"
        actions={
          podeEmitir && !isSolicitacoes ? (
            <AppButton
              variant="primary"
              icon={Plus}
              type="button"
              onClick={() => abrirEmit()}
              disabled={contagens.aguardando === 0 || elegiveisModal.length === 0}
              title={
                contagens.aguardando === 0
                  ? 'Nenhum sócio aprovado aguardando carteirinha'
                  : undefined
              }
              className="gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed"
            >
              Emitir carteirinha
            </AppButton>
          ) : undefined
        }
      >
        <AdminPendingTabs
          tabs={tabs.map((tab) => ({
            id: tab.key,
            label: tab.label,
            count: tab.count,
            countClass: tab.countClass,
            href: tabHrefs[tab.key],
          }))}
          activeId={statusFiltro}
          paramKey="status"
        />
        {toolbar}
      </AdminPageHeader>

      <div className="flex-1 overflow-auto py-4">
        <div className="app-container">
          {isTodos ? (
            todosItens.length === 0 ? (
              <MotionEmptyState
                icon={
                  <Users className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
                }
                title={
                  temFiltroAtivo ? 'Nenhum sócio encontrado' : 'Nenhum sócio cadastrado'
                }
                description={
                  temFiltroAtivo
                    ? 'Tente outro termo de busca ou limpe os filtros.'
                    : 'Solicitações, emissões e carteirinhas aparecem aqui.'
                }
                className="flex flex-col items-center justify-center py-16 text-center"
              />
            ) : (
              <MotionReveal index={0}>
                <ul className="space-y-2 md:hidden">
                  {todosItens.map(({ detalhe, estagio, socio }) => (
                    <li
                      key={detalhe.id}
                      className="cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                      onClick={() => abrirDetalhe(detalhe)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrirDetalhe(detalhe)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalhes de ${detalhe.nome}`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar url={detalhe.avatarUrl} nome={detalhe.nome} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-[rgb(var(--foreground))]">
                              {detalhe.nome}
                            </p>
                            <EstagioSocioBadge estagio={estagio} />
                          </div>
                          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                            {[
                              detalhe.numeroAssociado?.trim()
                                ? `nº ${detalhe.numeroAssociado.trim()}`
                                : socio?.numeroLabel
                                  ? `nº ${socio.numeroLabel}`
                                  : null,
                              formatCaixaAltaListagem(detalhe.departamentoNome),
                              formatCaixaAltaListagem(detalhe.cidade),
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                          {socio ? (
                            <div className="mt-2">
                              <ValidadeStatus socio={socio} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                        {cabecalho}
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgb(var(--border))]">
                      {todosItens.map(({ detalhe, estagio, socio }) => (
                        <tr
                          key={detalhe.id}
                          className="cursor-pointer transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                          onClick={() => abrirDetalhe(detalhe)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              abrirDetalhe(detalhe)
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Ver detalhes de ${detalhe.nome}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-bold text-[rgb(var(--foreground))]">
                              {socio?.numeroLabel ??
                                (detalhe.numeroAssociado?.trim() || '—')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar url={detalhe.avatarUrl} nome={detalhe.nome} />
                              <div className="min-w-0">
                                <p className="font-medium text-[rgb(var(--foreground))]">
                                  {detalhe.nome}
                                </p>
                                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                                  {formatTelefoneListagem(detalhe.telefone) ?? '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(detalhe.departamentoNome) ?? '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(detalhe.sedeNome) ?? '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(detalhe.departamentoUnidadeNome) ??
                                '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <MembroOrigemCell membro={detalhe} />
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(detalhe.cidade) ?? '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {detalhe.criadoEmLabel}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <EstagioSocioBadge estagio={estagio} />
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {estagio === 'aguardando' && podeEmitir ? (
                              <AppButton
                                variant="primary"
                                icon={Plus}
                                type="button"
                                onClick={() => abrirEmit(detalhe.userId)}
                                className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                              >
                                Emitir
                              </AppButton>
                            ) : socio && podeEmitir ? (
                              <SocioActions socio={socio} />
                            ) : (
                              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MotionReveal>
            )
          ) : isSolicitacoes ? (
            solicitacoes.length === 0 ? (
              <MotionEmptyState
                icon={
                  <Users className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
                }
                title={
                  temFiltroAtivo
                    ? 'Nenhuma solicitação encontrada'
                    : 'Nenhuma solicitação pendente'
                }
                description={
                  temFiltroAtivo
                    ? 'Tente outro termo de busca ou limpe os filtros.'
                    : 'Quando alguém pedir associação como sócio, a solicitação aparece aqui.'
                }
                className="flex flex-col items-center justify-center py-16 text-center"
              />
            ) : (
              <MotionReveal index={0}>{solicitacoesTabela}</MotionReveal>
            )
          ) : isAguardando ? (
            elegiveis.length === 0 ? (
              <MotionEmptyState
                icon={
                  temFiltroAtivo ? (
                    <Users className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
                  ) : (
                    <CheckCircle2 className="mb-3 h-10 w-10 text-success" />
                  )
                }
                title={
                  temFiltroAtivo
                    ? 'Nenhum sócio encontrado'
                    : 'Ninguém aguardando emissão'
                }
                description={
                  temFiltroAtivo
                    ? 'Tente outro termo de busca ou limpe os filtros.'
                    : contagens.emitidas > 0
                      ? 'Todos os sócios aprovados já têm carteirinha.'
                      : 'Quando um sócio for aprovado nas Solicitações, ele aparece aqui para emissão.'
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

                <ul className="space-y-2 md:hidden">
                  {elegiveis.map((membro) => (
                    <li
                      key={membro.userId}
                      className="cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                      onClick={() => abrirDetalhe(membro.detalhe)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrirDetalhe(membro.detalhe)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalhes de ${membro.nome}`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar url={membro.avatarUrl} nome={membro.nome} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[rgb(var(--foreground))]">
                            {membro.nome}
                          </p>
                          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                            {[
                              membro.numeroAssociado
                                ? `nº ${membro.numeroAssociado}`
                                : null,
                              formatCaixaAltaListagem(membro.departamentoNome),
                              formatCaixaAltaListagem(membro.sedeNome),
                              formatCaixaAltaListagem(membro.cidade),
                              formatTelefoneListagem(membro.telefone),
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                          {membro.aprovadoEmLabel && (
                            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                              Aprovado em {membro.aprovadoEmLabel}
                            </p>
                          )}
                          {membro.detalhe ? (
                            <div className="mt-1">
                              <MembroOrigemCell membro={membro.detalhe} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div
                        className="mt-3"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {podeEmitir ? (
                          <AppButton
                            variant="primary"
                            icon={Plus}
                            type="button"
                            onClick={() => abrirEmit(membro.userId)}
                            className="w-full gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                          >
                            Emitir carteirinha
                          </AppButton>
                        ) : (
                          <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
                            Sem permissão
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                        {cabecalho}
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgb(var(--border))]">
                      {elegiveis.map((membro) => (
                        <tr
                          key={membro.userId}
                          className="cursor-pointer transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                          onClick={() => abrirDetalhe(membro.detalhe)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              abrirDetalhe(membro.detalhe)
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Ver detalhes de ${membro.nome}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-bold text-[rgb(var(--foreground))]">
                              {membro.numeroAssociado?.trim() || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar url={membro.avatarUrl} nome={membro.nome} />
                              <div className="min-w-0">
                                <p className="font-medium text-[rgb(var(--foreground))]">
                                  {membro.nome}
                                </p>
                                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                                  {[
                                    membro.discordTag,
                                    formatTelefoneListagem(membro.telefone),
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(membro.departamentoNome) ?? '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(membro.sedeNome) ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {membro.detalhe ? (
                              <MembroOrigemCell membro={membro.detalhe} />
                            ) : (
                              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(membro.cidade) ?? '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {membro.aprovadoEmLabel ?? '—'}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MotionReveal>
            )
          ) : socios.length === 0 ? (
            <MotionEmptyState
              icon={
                <CreditCard className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
              }
              title={
                temFiltroAtivo
                  ? 'Nenhuma carteirinha encontrada'
                  : statusFiltro === 'emitidas'
                    ? 'Nenhuma carteirinha emitida'
                    : 'Nenhuma carteirinha nesta categoria'
              }
              description={
                temFiltroAtivo ? (
                  'Tente outro nome ou número, ou limpe os filtros.'
                ) : contagens.aguardando > 0 ? (
                  <span>
                    Há {contagens.aguardando} sócio
                    {contagens.aguardando !== 1 ? 's' : ''} aprovado
                    {contagens.aguardando !== 1 ? 's' : ''} sem carteirinha.{' '}
                    <Link
                      href={tabHrefs.aguardando ?? '/admin/socios?status=aguardando'}
                      className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                    >
                      Ver fila de emissão
                    </Link>
                  </span>
                ) : (
                  'Aprove sócios nas Solicitações e emita a carteirinha numerada aqui.'
                )
              }
              className="flex flex-col items-center justify-center py-16 text-center"
            />
          ) : (
            <MotionReveal index={0}>
              <ul className="space-y-2 md:hidden">
                {socios.map((socio) => (
                  <li
                    key={socio.id}
                    className="cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                    onClick={() => abrirDetalhe(socio.detalhe)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        abrirDetalhe(socio.detalhe)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver detalhes de ${socio.nome}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar url={socio.avatarUrl} nome={socio.nome} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-sm font-bold text-[rgb(var(--foreground))]">
                            {socio.numeroLabel}
                          </span>
                          <span className="font-medium text-[rgb(var(--foreground))]">
                            {socio.nome}
                          </span>
                        </div>
                        {(socio.departamentoNome || socio.email || socio.detalhe?.telefone) && (
                          <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
                            {[
                              formatCaixaAltaListagem(socio.departamentoNome),
                              formatTelefoneListagem(socio.detalhe?.telefone),
                              socio.email,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        {socio.detalhe ? (
                          <div className="mt-1">
                            <MembroOrigemCell membro={socio.detalhe} />
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <ValidadeStatus socio={socio} />
                        </div>
                      </div>
                    </div>
                    {podeEmitir && (
                      <div
                        className="mt-3 border-t border-[rgb(var(--border))] pt-3"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <SocioActions socio={socio} stacked />
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                      {cabecalho}
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--border))]">
                    {socios.map((socio) => {
                      const telefone = formatTelefoneListagem(socio.detalhe?.telefone)
                      return (
                        <tr
                          key={socio.id}
                          className="cursor-pointer transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                          onClick={() => abrirDetalhe(socio.detalhe)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              abrirDetalhe(socio.detalhe)
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Ver detalhes de ${socio.nome}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-bold text-[rgb(var(--foreground))]">
                              {socio.numeroLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar url={socio.avatarUrl} nome={socio.nome} />
                              <div className="min-w-0">
                                <span className="font-medium text-[rgb(var(--foreground))]">
                                  {socio.nome}
                                </span>
                                {telefone ? (
                                  <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                                    {telefone}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {formatCaixaAltaListagem(socio.departamentoNome) ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {socio.detalhe ? (
                              <MembroOrigemCell membro={socio.detalhe} />
                            ) : (
                              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-xs text-[rgb(var(--foreground-muted))]">
                              {socio.email ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ValidadeStatus socio={socio} />
                          </td>
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {podeEmitir ? (
                              <SocioActions socio={socio} />
                            ) : (
                              <span className="block text-right text-xs text-[rgb(var(--foreground-muted))]">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </MotionReveal>
          )}

          {paginacao}
        </div>
      </div>

      {podeEmitir && emitOpen && (
        <EmitirCarteirinhaModal
          key={emitUserId ?? 'blank'}
          open
          onClose={() => setEmitOpen(false)}
          membrosElegiveis={elegiveisModal}
          initialUserId={emitUserId}
          proximoNumero={proximoNumero}
        />
      )}

      <MembroDetalheModal
        membro={selecionado}
        onClose={fecharDetalhe}
        podeGerirAcessos={podeGerirAcessos}
        podeBloquear={podeBloquear}
        podeApagar={podeApagar}
        bloqueado={selecionado ? bloqueadosUserIds.includes(selecionado.userId) : false}
      />
    </>
  )
}
