'use client'

import { useRef, useState, useTransition } from 'react'
import { Loader2, Plus, Pencil, Trash2, X, Check, Shield } from 'lucide-react'
import {
  salvarPerfilTenant,
  salvarDiscordGuildId,
  criarRole,
  atualizarRole,
  excluirRole,
} from '@/app/admin/configuracoes/actions'

// ── Permissões disponíveis ────────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    label: 'Membros',
    items: [
      { key: 'members:view', label: 'Ver membros' },
      { key: 'members:approve', label: 'Aprovar membros' },
      { key: 'members:reject', label: 'Reprovar membros' },
      { key: 'members:warn', label: 'Advertir membros' },
      { key: 'members:block', label: 'Bloquear membros' },
    ],
  },
  {
    label: 'Loja',
    items: [
      { key: 'store:view_orders', label: 'Ver pedidos' },
      { key: 'store:manage', label: 'Gerenciar produtos' },
    ],
  },
  {
    label: 'Eventos',
    items: [
      { key: 'events:create', label: 'Criar eventos' },
      { key: 'events:manage', label: 'Gerenciar eventos' },
    ],
  },
  {
    label: 'Outros',
    items: [
      { key: 'sedes:manage', label: 'Gerenciar sedes' },
      { key: 'roles:manage', label: 'Gerenciar cargos' },
      { key: 'reports:view', label: 'Ver relatórios' },
    ],
  },
]

// ── Perfil do Tenant ──────────────────────────────────────────────────────────

interface PerfilTenantFormProps {
  nome: string
  corPrimaria: string
}

export function PerfilTenantForm({ nome, corPrimaria }: PerfilTenantFormProps) {
  const [pending, startTransition] = useTransition()
  const [cor, setCor] = useState(corPrimaria)
  const [success, setSuccess] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await salvarPerfilTenant(fd)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Nome da torcida
        </label>
        <input
          name="nome"
          defaultValue={nome}
          required
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Cor primária
        </label>
        <div className="mt-1.5 flex items-center gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-lg border border-[rgb(var(--border))] shadow-sm transition-colors"
            style={{ backgroundColor: cor }}
          />
          <input
            type="color"
            name="corPrimaria"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-transparent p-0.5"
          />
          <input
            type="text"
            value={cor}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setCor(e.target.value)
            }}
            className="w-28 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            maxLength={7}
          />
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            Hex: #RRGGBB
          </span>
        </div>
        {/* Preview */}
        <div className="mt-3 flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
          <span>Preview:</span>
          <span
            className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: cor }}
          >
            Membro ativo
          </span>
          <span
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: cor }}
          >
            Botão
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: cor }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar alterações
        </button>
        {success && (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Salvo com sucesso
          </span>
        )}
      </div>
    </form>
  )
}

// ── Integração Discord ────────────────────────────────────────────────────────

interface DiscordFormProps {
  discordGuildId: string | null
}

export function DiscordForm({ discordGuildId }: DiscordFormProps) {
  const [pending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await salvarDiscordGuildId(fd)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Guild ID do servidor Discord
        </label>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Encontre em Discord → Configurações do servidor → Widget → ID do servidor
        </p>
        <input
          name="discordGuildId"
          defaultValue={discordGuildId ?? ''}
          placeholder="ex: 123456789012345678"
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)] placeholder:font-sans placeholder:text-[rgb(var(--foreground-muted))]"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar Guild ID
        </button>
        {success && (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Salvo com sucesso
          </span>
        )}
      </div>
    </form>
  )
}

// ── Cargos ────────────────────────────────────────────────────────────────────

interface Role {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  permissions: string[]
}

interface RolesManagerProps {
  roles: Role[]
}

export function RolesManager({ roles }: RolesManagerProps) {
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3">
      {/* Lista de cargos */}
      <div className="space-y-2">
        {roles.map((role) =>
          editandoId === role.id ? (
            <RoleForm
              key={role.id}
              initialNome={role.nome}
              initialCor={role.cor}
              initialPermissions={role.permissions}
              isSystem={role.isSystem}
              onCancel={() => setEditandoId(null)}
              onSubmit={(fd) => {
                startTransition(async () => {
                  await atualizarRole(role.id, fd)
                  setEditandoId(null)
                })
              }}
              pending={pending}
            />
          ) : (
            <RoleRow
              key={role.id}
              role={role}
              onEdit={() => setEditandoId(role.id)}
              onDelete={() => {
                if (!confirm(`Excluir o cargo "${role.nome}"?`)) return
                startTransition(() => excluirRole(role.id))
              }}
              pending={pending}
            />
          ),
        )}
      </div>

      {/* Criar novo cargo */}
      {criando ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] p-4">
          <p className="mb-3 text-sm font-medium text-[rgb(var(--foreground))]">Novo cargo</p>
          <RoleForm
            onCancel={() => setCriando(false)}
            onSubmit={(fd) => {
              startTransition(async () => {
                await criarRole(fd)
                setCriando(false)
              })
            }}
            pending={pending}
          />
        </div>
      ) : (
        <button
          onClick={() => setCriando(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] py-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))] hover:text-[rgb(var(--foreground))]"
        >
          <Plus className="h-4 w-4" />
          Criar novo cargo
        </button>
      )}
    </div>
  )
}

function RoleRow({
  role,
  onEdit,
  onDelete,
  pending,
}: {
  role: Role
  onEdit: () => void
  onDelete: () => void
  pending: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      {/* Cor */}
      <div className="h-4 w-4 shrink-0 rounded-full border border-[rgb(var(--border))]" style={{ backgroundColor: role.cor }} />

      {/* Nome + badge sistema */}
      <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
        <span className="font-medium text-[rgb(var(--foreground))]">{role.nome}</span>
        {role.isSystem && (
          <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            <Shield className="h-3 w-3" /> Sistema
          </span>
        )}
        <span className="text-xs text-[rgb(var(--foreground-muted))]">
          {role.permissions.length === 0
            ? 'Sem permissões'
            : `${role.permissions.length} permiss${role.permissions.length === 1 ? 'ão' : 'ões'}`}
        </span>
      </div>

      {/* Ações */}
      {!role.isSystem && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function RoleForm({
  initialNome = '',
  initialCor = '#6b7280',
  initialPermissions = [],
  isSystem = false,
  onCancel,
  onSubmit,
  pending,
}: {
  initialNome?: string
  initialCor?: string
  initialPermissions?: string[]
  isSystem?: boolean
  onCancel: () => void
  onSubmit: (fd: FormData) => void
  pending: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [cor, setCor] = useState(initialCor)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialPermissions))

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    // Injeta as permissões selecionadas manualmente (checkboxes podem ser perdidos)
    fd.delete('permissions')
    for (const p of selected) fd.append('permissions', p)
    onSubmit(fd)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Nome</label>
          <input
            name="nome"
            defaultValue={initialNome}
            required
            disabled={isSystem}
            placeholder="Ex: Moderador"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Cor</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              name="corPrimaria"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-transparent p-0.5"
            />
            <input
              type="hidden"
              name="cor"
              value={cor}
            />
          </div>
        </div>
      </div>

      {/* Permissões */}
      <div>
        <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">Permissões</p>
        <div className="space-y-3">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    className={[
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                      selected.has(item.key)
                        ? 'border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]'
                        : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selected.has(item.key)}
                      onChange={() => toggle(item.key)}
                    />
                    <span
                      className={[
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                        selected.has(item.key)
                          ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                          : 'border-[rgb(var(--border-strong))]',
                      ].join(' ')}
                    >
                      {selected.has(item.key) && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {initialNome ? 'Salvar' : 'Criar cargo'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3 w-3" /> Cancelar
        </button>
      </div>
    </form>
  )
}
