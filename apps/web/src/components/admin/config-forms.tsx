'use client'

import { useRef, useState, useTransition } from 'react'
import { Loader2, Plus, Pencil, Trash2, X, Check, Shield, Search, Eye } from 'lucide-react'
import { PERMISSION_GROUPS, applyPermissionCascade, DEPARTAMENTO_MODULOS, rotuloCargoSistema, isDepartamentoCanonico } from '@torcida/types'
import {
  salvarPerfilTenant,
  salvarDiscordGuildId,
  salvarAfiliacao,
  criarRole,
  atualizarRole,
  excluirRole,
  criarDepartamento,
  atualizarDepartamento,
  excluirDepartamento,
} from '@/app/admin/configuracoes/actions'

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

// ── Afiliação (owner) ─────────────────────────────────────────────────────────

interface AfiliacaoOption {
  id: string
  nome: string
}

interface AfiliacaoFormProps {
  afiliacaoId: string | null
  afiliacoes: AfiliacaoOption[]
}

export function AfiliacaoForm({ afiliacaoId, afiliacoes }: AfiliacaoFormProps) {
  const [pending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await salvarAfiliacao(fd)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Time apoiado (Afiliação)
        </label>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Define qual clube esta torcida apoia para notícias e identidade compartilhada.
        </p>
        <select
          name="afiliacaoId"
          defaultValue={afiliacaoId ?? ''}
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        >
          <option value="">Sem afiliação</option>
          {afiliacoes.map((afiliacao) => (
            <option key={afiliacao.id} value={afiliacao.id}>
              {afiliacao.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar afiliação
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
  /** Quantos usuários têm este cargo atribuído — bloqueia exclusão quando > 0 */
  emUso?: number
}

interface RolesManagerProps {
  roles: Role[]
  /** TipoSede do tenant — contextualiza rótulos de cargos de sistema (Presidente/Liderança) */
  tipoSede: string
}

/** Label amigável de uma permissão (fallback pro próprio código). */
function permissionLabel(key: string): string {
  for (const group of PERMISSION_GROUPS) {
    const item = group.items.find((i) => i.key === key)
    if (item) return item.label
  }
  return key
}

export function RolesManager({ roles, tipoSede }: RolesManagerProps) {
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Busca por nome do cargo OU por permissão que ele concede (como na referência:
  // procurar "aprovar" encontra os perfis que têm essa permissão)
  const needle = busca.trim().toLowerCase()
  const rolesFiltrados = needle
    ? roles.filter(
        (role) =>
          role.nome.toLowerCase().includes(needle) ||
          role.permissions.some(
            (p) =>
              p.toLowerCase().includes(needle) ||
              permissionLabel(p).toLowerCase().includes(needle),
          ),
      )
    : roles

  function executar(acao: () => Promise<void>) {
    setErro(null)
    startTransition(async () => {
      try {
        await acao()
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao salvar o cargo')
      }
    })
  }

  const editando = criando || editandoId !== null

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Cargos são papéis transversais (Presidente, Recrutador…). A atribuição a pessoas fica em{' '}
        <a href="/admin/acessos" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
          Controle de acesso
        </a>
        .
      </p>
      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {erro}
        </div>
      )}

      {/* Busca (oculta durante criação/edição, como na referência) */}
      {!editando && roles.length > 3 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cargo ou permissão..."
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
        </div>
      )}

      {/* Lista de cargos */}
      <div className="space-y-2">
        {rolesFiltrados.length === 0 && !criando && (
          <p className="py-4 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum cargo encontrado
          </p>
        )}
        {rolesFiltrados.map((role) =>
          editandoId === role.id ? (
            <RoleForm
              key={role.id}
              initialNome={role.nome}
              initialCor={role.cor}
              initialPermissions={role.permissions}
              isSystem={role.isSystem}
              onCancel={() => setEditandoId(null)}
              onSubmit={(fd) => {
                executar(async () => {
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
              tipoSede={tipoSede}
              disabled={editando}
              onEdit={() => {
                setErro(null)
                setEditandoId(role.id)
              }}
              onDelete={() => {
                if (!confirm(`Excluir o cargo "${role.nome}"?`)) return
                executar(() => excluirRole(role.id))
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
              executar(async () => {
                await criarRole(fd)
                setCriando(false)
              })
            }}
            pending={pending}
          />
        </div>
      ) : (
        !editando && (
          <button
            onClick={() => {
              setErro(null)
              setCriando(true)
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] py-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))] hover:text-[rgb(var(--foreground))]"
          >
            <Plus className="h-4 w-4" />
            Criar novo cargo
          </button>
        )
      )}
    </div>
  )
}

function RoleRow({
  role,
  tipoSede,
  disabled,
  onEdit,
  onDelete,
  pending,
}: {
  role: Role
  /** TipoSede do tenant — contextualiza o rótulo dos cargos de sistema */
  tipoSede: string
  /** Outro cargo está em edição/criação — desabilita interações desta linha */
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
  pending: boolean
}) {
  const emUso = role.emUso ?? 0
  const podeExcluir = !role.isSystem && emUso === 0

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 transition-opacity',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Cor */}
      <div className="h-4 w-4 shrink-0 rounded-full border border-[rgb(var(--border))]" style={{ backgroundColor: role.cor }} />

      {/* Nome + badges */}
      <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
        <span className="font-medium text-[rgb(var(--foreground))]">
          {role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome}
        </span>
        {role.isSystem && (
          <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            <Shield className="h-3 w-3" /> Sistema
          </span>
        )}
        <span className="text-xs text-[rgb(var(--foreground-muted))]">
          {role.permissions.length === 0
            ? 'Sem permissões'
            : role.permissions.includes('*')
              ? 'Todas as permissões'
              : `${role.permissions.length} permiss${role.permissions.length === 1 ? 'ão' : 'ões'}`}
        </span>
        {emUso > 0 && (
          <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
            {emUso} usuário{emUso === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Ações */}
      {!role.isSystem && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            disabled={pending || disabled}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:pointer-events-none"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={pending || disabled || !podeExcluir}
            title={podeExcluir ? 'Excluir cargo' : 'Cargo em uso — remova-o dos usuários primeiro'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
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

  const isEdit = initialNome !== ''
  const initial = new Set(initialPermissions)

  // Diff em relação ao estado original (só relevante na edição — na criação
  // tudo é novo por definição, sem destaque, como na referência)
  const added = isEdit ? [...selected].filter((p) => !initial.has(p)) : []
  const removed = isEdit ? [...initial].filter((p) => !selected.has(p)) : []

  function toggle(key: string) {
    setSelected((prev) => {
      const prevArr = [...prev]
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      // Cascata: marcar não-base puxa a base do grupo; desmarcar a base
      // derruba as irmãs (mesma regra aplicada no servidor)
      return new Set(applyPermissionCascade(prevArr, [...next]))
    })
  }

  /** Contadores de mudança por grupo, para o badge no cabeçalho (edição) */
  function groupChanges(groupKeys: readonly string[]) {
    return {
      added: added.filter((p) => groupKeys.includes(p)).length,
      removed: removed.filter((p) => groupKeys.includes(p)).length,
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selected.size === 0) return

    // Confirmação com resumo das mudanças antes de gravar
    if (isEdit && (added.length > 0 || removed.length > 0)) {
      const linhas = [
        ...added.map((p) => `  + ${permissionLabel(p)}`),
        ...removed.map((p) => `  − ${permissionLabel(p)}`),
      ]
      if (!confirm(`Salvar as alterações do cargo "${initialNome}"?\n\n${linhas.join('\n')}`)) return
    } else if (!isEdit) {
      if (!confirm('Criar o novo cargo com as permissões selecionadas?')) return
    }

    const fd = new FormData(e.currentTarget)
    // Injeta as permissões selecionadas manualmente (checkboxes podem ser perdidos)
    fd.delete('permissions')
    for (const p of selected) fd.append('permissions', p)
    onSubmit(fd)
  }

  /** Estilo do item conforme estado: selecionado / adicionado / removido / neutro */
  function itemClass(key: string): string {
    const base = 'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors'
    if (isEdit && added.includes(key)) {
      return `${base} border-green-400 bg-green-50 text-[rgb(var(--foreground))] dark:border-green-700 dark:bg-green-950`
    }
    if (isEdit && removed.includes(key)) {
      return `${base} border-red-300 bg-red-50 text-[rgb(var(--foreground-muted))] dark:border-red-800 dark:bg-red-950`
    }
    if (selected.has(key)) {
      return `${base} border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]`
    }
    return `${base} border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]`
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

      {/* Aviso: nenhuma permissão selecionada */}
      {selected.size === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Selecione ao menos uma permissão para o cargo.
        </div>
      )}

      {/* Permissões */}
      <div>
        <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">Permissões</p>
        <div className="space-y-3">
          {PERMISSION_GROUPS.map((group) => {
            const groupKeys = group.items.map((i) => i.key)
            const changes = groupChanges(groupKeys)
            return (
              <div key={group.label}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  {group.label}
                  {changes.added > 0 && (
                    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900 dark:text-green-300">
                      +{changes.added}
                    </span>
                  )}
                  {changes.removed > 0 && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900 dark:text-red-300">
                      −{changes.removed}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {group.items.map((item) => {
                    const isBase = group.base === item.key
                    return (
                      <label key={item.key} className={itemClass(item.key)}>
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
                        <span className={isEdit && removed.includes(item.key) ? 'line-through opacity-70' : ''}>
                          {item.label}
                        </span>
                        {isBase && (
                          <Eye
                            className="ml-auto h-3 w-3 shrink-0 text-[rgb(var(--foreground-muted))]"
                            aria-label="Permissão base do grupo — exigida pelas demais"
                          />
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          {selected.size} permiss{selected.size === 1 ? 'ão' : 'ões'} selecionada{selected.size === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || selected.size === 0}
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

// ── Departamentos ────────────────────────────────────────────────────────────
// Unidade de acesso: além do agrupamento organizacional (Diretoria, Financeiro,
// Sócio...), o departamento concede permissões aos seus membros e pode abrir
// um módulo do portal.

interface Departamento {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
  moduloPortal: string | null
  slug: string
}

/** Label do módulo de portal (fallback pro próprio slug). */
function moduloPortalLabel(key: string): string {
  return DEPARTAMENTO_MODULOS.find((m) => m.key === key)?.label ?? key
}

interface DepartamentosManagerProps {
  departamentos: Departamento[]
}

export function DepartamentosManager({ departamentos }: DepartamentosManagerProps) {
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Departamentos são áreas com colaborador (membro) e gestor. A atribuição a pessoas fica em{' '}
        <a href="/admin/acessos" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
          Controle de acesso
        </a>
        .
      </p>
      <div className="space-y-2">
        {departamentos.map((departamento) =>
          editandoId === departamento.id ? (
            <DepartamentoForm
              key={departamento.id}
              initialNome={departamento.nome}
              initialCor={departamento.cor}
              initialPermissions={departamento.permissions}
              initialPermissionsGestor={departamento.permissionsGestor}
              initialModulo={departamento.moduloPortal}
              onCancel={() => setEditandoId(null)}
              onSubmit={(fd) => {
                startTransition(async () => {
                  await atualizarDepartamento(departamento.id, fd)
                  setEditandoId(null)
                })
              }}
              pending={pending}
            />
          ) : (
            <DepartamentoRow
              key={departamento.id}
              departamento={departamento}
              onEdit={() => setEditandoId(departamento.id)}
              onDelete={() => {
                if (!confirm(`Excluir o departamento "${departamento.nome}"?`)) return
                startTransition(() => excluirDepartamento(departamento.id))
              }}
              pending={pending}
            />
          ),
        )}
      </div>

      {criando ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] p-4">
          <p className="mb-3 text-sm font-medium text-[rgb(var(--foreground))]">Novo departamento</p>
          <DepartamentoForm
            onCancel={() => setCriando(false)}
            onSubmit={(fd) => {
              startTransition(async () => {
                await criarDepartamento(fd)
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
          Criar novo departamento
        </button>
      )}
    </div>
  )
}

function DepartamentoRow({
  departamento,
  onEdit,
  onDelete,
  pending,
}: {
  departamento: Departamento
  onEdit: () => void
  onDelete: () => void
  pending: boolean
}) {
  const organizacional =
    departamento.permissions.length === 0 && departamento.permissionsGestor.length === 0
  const canonico = isDepartamentoCanonico(departamento.slug)

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <div className="h-4 w-4 shrink-0 rounded-full border border-[rgb(var(--border))]" style={{ backgroundColor: departamento.cor }} />
      <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
        <span className="font-medium text-[rgb(var(--foreground))]">{departamento.nome}</span>
        {canonico && (
          <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
            Padrão
          </span>
        )}
        <span className="text-xs text-[rgb(var(--foreground-muted))]">
          {organizacional
            ? 'Organizacional — não concede acesso'
            : `membro ${departamento.permissions.length} · gestor+ ${departamento.permissionsGestor.length}`}
        </span>
        {departamento.moduloPortal && (
          <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
            {moduloPortalLabel(departamento.moduloPortal)}
          </span>
        )}
      </div>
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
    </div>
  )
}

function DepartamentoForm({
  initialNome = '',
  initialCor = '#6b7280',
  initialPermissions = [],
  initialPermissionsGestor = [],
  initialModulo = null,
  onCancel,
  onSubmit,
  pending,
}: {
  initialNome?: string
  initialCor?: string
  initialPermissions?: string[]
  initialPermissionsGestor?: string[]
  initialModulo?: string | null
  onCancel: () => void
  onSubmit: (fd: FormData) => void
  pending: boolean
}) {
  const [cor, setCor] = useState(initialCor)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialPermissions))
  const [selectedGestor, setSelectedGestor] = useState<Set<string>>(
    new Set(initialPermissionsGestor),
  )

  const isEdit = initialNome !== ''

  function toggleMembro(key: string) {
    setSelected((prev) => {
      const prevArr = [...prev]
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return new Set(applyPermissionCascade(prevArr, [...next]))
    })
  }

  function toggleGestor(key: string) {
    setSelectedGestor((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      // Cascata considera bases do membro + seleção gestor; remove o que já é membro.
      const cascaded = applyPermissionCascade([...selected], [...selected, ...next])
      return new Set(cascaded.filter((p) => !selected.has(p)))
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.delete('permissions')
    fd.delete('permissionsGestor')
    for (const p of selected) fd.append('permissions', p)
    for (const p of selectedGestor) fd.append('permissionsGestor', p)
    onSubmit(fd)
  }

  function itemClass(key: string, set: Set<string>): string {
    const base = 'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors'
    if (set.has(key)) {
      return `${base} border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]`
    }
    return `${base} border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]`
  }

  function renderGroups(
    set: Set<string>,
    onToggle: (key: string) => void,
    excludeKeys?: Set<string>,
  ) {
    return (
      <div className="space-y-3">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {group.items
                .filter((item) => !excludeKeys?.has(item.key))
                .map((item) => {
                  const isBase = group.base === item.key
                  return (
                    <label key={item.key} className={itemClass(item.key, set)}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={set.has(item.key)}
                        onChange={() => onToggle(item.key)}
                      />
                      <span
                        className={[
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                          set.has(item.key)
                            ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                            : 'border-[rgb(var(--border-strong))]',
                        ].join(' ')}
                      >
                        {set.has(item.key) && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      <span>{item.label}</span>
                      {isBase && (
                        <Eye
                          className="ml-auto h-3 w-3 shrink-0 text-[rgb(var(--foreground-muted))]"
                          aria-label="Permissão base do grupo"
                        />
                      )}
                    </label>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Nome</label>
          <input
            name="nome"
            defaultValue={initialNome}
            required
            placeholder="Ex: Diretoria"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
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
            <input type="hidden" name="cor" value={cor} />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Módulo do portal
        </label>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Área do portal que os membros deste departamento passam a acessar.
        </p>
        <select
          name="moduloPortal"
          defaultValue={initialModulo ?? ''}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        >
          <option value="">Nenhum / apenas organizacional</option>
          {DEPARTAMENTO_MODULOS.map((modulo) => (
            <option key={modulo.key} value={modulo.key}>
              {modulo.label}
            </option>
          ))}
        </select>
      </div>

      {selected.size === 0 && selectedGestor.size === 0 && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Organizacional: sem permissões o departamento não concede acesso — só agrupa pessoas.
        </p>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-[rgb(var(--foreground))]">Permissões do membro</p>
        <p className="mb-2 text-xs text-[rgb(var(--foreground-muted))]">
          Quem é só membro vê / age de forma leve com estas permissões.
        </p>
        {renderGroups(selected, toggleMembro)}
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          {selected.size} permiss{selected.size === 1 ? 'ão' : 'ões'} de membro
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-[rgb(var(--foreground))]">
          Permissões do gestor (a mais)
        </p>
        <p className="mb-2 text-xs text-[rgb(var(--foreground-muted))]">
          Somam-se às do membro. Gestores também podem incluir/remover membros do departamento.
        </p>
        {renderGroups(selectedGestor, toggleGestor, selected)}
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          {selectedGestor.size} permiss{selectedGestor.size === 1 ? 'ão' : 'ões'} exclusivas do gestor
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {isEdit ? 'Salvar' : 'Criar departamento'}
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
