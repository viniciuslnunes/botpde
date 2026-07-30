'use client'

import { useMemo, useRef, useState, useTransition, useId } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Pencil, Trash2, X, Check, Shield, Search, ChevronDown, Eye } from 'lucide-react'
import {
  PERMISSION_GROUPS,
  applyPermissionCascade,
  DEPARTAMENTO_MODULOS,
  rotuloCargoSistema,
  isDepartamentoCanonico,
  PAPEL_DEPARTAMENTO,
  permissionsDoPacoteDepartamento,
} from '@torcida/types'
import { AccessPermissionPreview, AccessPermissionCompare } from '@/components/admin/access-permission-preview'
import { ImageUploadField } from '@/components/media/image-upload-field'
import {
  salvarPerfilTenant,
  salvarDiscordGuildId,
  salvarAfiliacao,
  salvarBalancoFinanceiroVisivel,
  salvarBalancoDetalheNivel,
  salvarHierarquiaVisivel,
  salvarExigirDocumentosCadastro,
  salvarCanalOficial,
  criarRole,
  atualizarRole,
  excluirRole,
  criarDepartamento,
  atualizarDepartamento,
  excluirDepartamento,
} from '@/app/admin/(plataforma)/configuracoes/actions'
import { toast } from '@torcida/ui'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmAction, useConfirmDialog } from '@/lib/confirm-action'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import {
  useTrackedForm,
  useUnsavedChanges,
  useUnsavedChangesContext,
} from '@/lib/unsaved-changes'

// ── Perfil do Tenant ──────────────────────────────────────────────────────────

interface PerfilTenantFormProps {
  nome: string
}

export function PerfilTenantForm({ nome }: PerfilTenantFormProps) {
  const [pending, startTransition] = useTransition()
  const { formRef, markPristine } = useTrackedForm({ title: 'Perfil da torcida' })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarPerfilTenant(fd), {
        success: 'Perfil da torcida salvo.',
      })
      if (ok) markPristine()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Nome da torcida
        </label>
        <input
          name="nome"
          defaultValue={nome}
          required
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm uppercase tracking-wide text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        />
      </div>

      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Cores, fundo e identidade visual ficam em{' '}
        <Link
          href="/admin/design"
          className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
        >
          Design
        </Link>
        .
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar alterações
        </button>
      </div>
    </form>
  )
}

// ── Balanço financeiro (prestação de contas) ─────────────────────────────────

interface BalancoVisivelFormProps {
  visivel: boolean
  detalheNivel: 'TOTAIS' | 'CATEGORIAS' | 'COMPLETO'
}

export function BalancoVisivelForm({ visivel, detalheNivel }: BalancoVisivelFormProps) {
  const [pending, startTransition] = useTransition()
  const [ativo, setAtivo] = useState(visivel)
  const [nivel, setNivel] = useState(detalheNivel)

  function salvarVisivel(next: boolean) {
    setAtivo(next)
    const fd = new FormData()
    fd.set('balancoFinanceiroVisivel', next ? 'true' : 'false')
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarBalancoFinanceiroVisivel(fd), {
        success: next
          ? 'Balanço visível no portal para membros.'
          : 'Balanço oculto do portal.',
      })
      if (!ok) setAtivo(!next)
    })
  }

  function salvarNivel(next: 'TOTAIS' | 'CATEGORIAS' | 'COMPLETO') {
    const prev = nivel
    setNivel(next)
    const fd = new FormData()
    fd.set('balancoDetalheNivel', next)
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarBalancoDetalheNivel(fd), {
        success: 'Nível de detalhe do balanço atualizado.',
      })
      if (!ok) setNivel(prev)
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Quando ativo, membros logados veem o balanço em{' '}
        <Link
          href="/portal/balanco"
          className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
        >
          /portal/balanco
        </Link>
        . Escolha quanto detalhe expor (totais, categorias ou lançamentos completos).
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          checked={ativo}
          disabled={pending}
          onChange={(e) => salvarVisivel(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Publicar balanço financeiro no portal
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            {pending ? 'Salvando…' : ativo ? 'Visível para membros' : 'Oculto'}
          </span>
        </span>
      </label>

      {ativo && (
        <fieldset className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
          <legend className="px-1 text-sm font-medium text-[rgb(var(--foreground))]">
            Nível de detalhe
          </legend>
          {(
            [
              { value: 'TOTAIS' as const, label: 'Só totais', hint: 'Receitas, despesas e saldo' },
              {
                value: 'CATEGORIAS' as const,
                label: 'Totais e categorias',
                hint: 'Sem lançamentos individuais',
              },
              {
                value: 'COMPLETO' as const,
                label: 'Completo',
                hint: 'Itens, unidade, departamento e responsável',
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-[rgb(var(--background-subtle))]"
            >
              <input
                type="radio"
                name="balancoDetalheNivel"
                checked={nivel === opt.value}
                disabled={pending}
                onChange={() => salvarNivel(opt.value)}
                className="mt-1 h-4 w-4 border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                  {opt.label}
                </span>
                <span className="block text-xs text-[rgb(var(--foreground-muted))]">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}

// ── Hierarquia visível para as unidades (R3) ─────────────────────────────────

interface HierarquiaVisivelFormProps {
  visivel: boolean
}

export function HierarquiaVisivelForm({ visivel }: HierarquiaVisivelFormProps) {
  const [pending, startTransition] = useTransition()
  const [ativo, setAtivo] = useState(visivel)

  function salvar(next: boolean) {
    setAtivo(next)
    const fd = new FormData()
    fd.set('hierarquiaVisivelParaFilhos', next ? 'true' : 'false')
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarHierarquiaVisivel(fd), {
        success: next
          ? 'Subsedes e PDEs agora veem a hierarquia completa da torcida.'
          : 'Subsedes e PDEs voltam a ver apenas a própria unidade.',
      })
      if (!ok) setAtivo(!next)
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Por padrão, cada subsede e PDE com portal próprio enxerga apenas a sua
        unidade (mais o conteúdo público da Sede). Ative para que elas vejam a
        árvore completa da torcida — todas as unidades irmãs.
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          checked={ativo}
          disabled={pending}
          onChange={(e) => salvar(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Permitir que subsedes e PDEs vejam a hierarquia completa da torcida
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            {pending
              ? 'Salvando…'
              : ativo
                ? 'Hierarquia completa visível para as unidades'
                : 'Cada unidade vê só a si mesma'}
          </span>
        </span>
      </label>
    </div>
  )
}

// ── Cadastro de sócios (documentos no onboarding) ─────────────────────────────

interface DocumentosCadastroFormProps {
  exigir: boolean
}

export function DocumentosCadastroForm({ exigir }: DocumentosCadastroFormProps) {
  const [pending, startTransition] = useTransition()
  const [ativo, setAtivo] = useState(exigir)

  function salvar(next: boolean) {
    setAtivo(next)
    const fd = new FormData()
    fd.set('exigirDocumentosCadastro', next ? 'true' : 'false')
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarExigirDocumentosCadastro(fd), {
        success: next
          ? 'Foto do RG e comprovante de residência passam a ser obrigatórios no cadastro de sócio.'
          : 'Documentos de RG e residência ficam opcionais no cadastro de sócio.',
      })
      if (!ok) setAtivo(!next)
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        No onboarding de sócio, a foto do RG e o comprovante de residência ficam
        obrigatórios por padrão — para controle e registro na admissão. Desative
        se a torcida preferir solicitar esses documentos depois da aprovação.
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          checked={ativo}
          disabled={pending}
          onChange={(e) => salvar(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Exigir foto do RG e comprovante de residência no cadastro
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            {pending
              ? 'Salvando…'
              : ativo
                ? 'Documentos obrigatórios na solicitação de sócio'
                : 'Documentos opcionais — podem ser pedidos depois'}
          </span>
        </span>
      </label>
    </div>
  )
}

// ── Integração Discord ────────────────────────────────────────────────────────

interface DiscordFormProps {
  discordGuildId: string | null
}

export function DiscordForm({ discordGuildId }: DiscordFormProps) {
  const [pending, startTransition] = useTransition()
  const { formRef, markPristine } = useTrackedForm({ title: 'Integração Discord' })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarDiscordGuildId(fd), {
        success: 'Guild ID do Discord salvo.',
      })
      if (ok) markPristine()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
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
  const { formRef, markPristine } = useTrackedForm({ title: 'Afiliação' })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarAfiliacao(fd), {
        success: 'Afiliação salva.',
      })
      if (ok) markPristine()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
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
      </div>
    </form>
  )
}

// ── Canal oficial (mural desta unidade na Comunidade) ────────────────────────

const VISIBILIDADE_CANAL_OPCOES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'TENANT', label: 'Só esta torcida', hint: 'Visível apenas para membros desta torcida' },
  { value: 'HIERARQUIA', label: 'Hierarquia', hint: 'Sede, subsedes e PDEs da mesma árvore' },
  { value: 'ALIADOS', label: 'Hierarquia + aliados', hint: 'Também visível para torcidas aliadas' },
  { value: 'PUBLICO', label: 'Comunidade aberta', hint: 'Qualquer torcedor com acesso à Comunidade' },
]

interface CanalOficialFormProps {
  nome: string
  descricao: string | null
  avatarUrl: string | null
  visibilidadeCanal: string
  somenteAdminPublica: boolean
  publica: boolean
}

export function CanalOficialForm({
  nome,
  descricao,
  avatarUrl: avatarUrlInicial,
  visibilidadeCanal,
  somenteAdminPublica,
  publica,
}: CanalOficialFormProps) {
  const [pending, startTransition] = useTransition()
  const [avatarUrl, setAvatarUrl] = useState(avatarUrlInicial ?? '')
  const { formRef, markPristine } = useTrackedForm({ title: 'Canal oficial' })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('somenteAdminPublica', fd.has('somenteAdminPublica') ? 'true' : 'false')
    fd.set('publica', fd.has('publica') ? 'true' : 'false')
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarCanalOficial(fd), {
        success: 'Canal oficial atualizado.',
      })
      if (ok) markPristine()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Identidade e regras do mural oficial desta unidade na{' '}
        <Link
          href="/portal/comunidade/canais"
          className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
        >
          Comunidade
        </Link>
        . Sem foto definida, usa a foto da sede ou o logo da torcida.
      </p>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Nome do canal
        </label>
        <input
          name="nome"
          defaultValue={nome}
          required
          minLength={3}
          maxLength={80}
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Descrição
        </label>
        <textarea
          name="descricao"
          defaultValue={descricao ?? ''}
          maxLength={280}
          rows={2}
          className="mt-1.5 w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        />
      </div>

      <div>
        <ImageUploadField
          name="avatarUrl"
          label="Foto do canal"
          value={avatarUrl}
          onChange={setAvatarUrl}
          aspect={1}
          purpose="comunidade"
          buttonLabel="Enviar foto"
          hint="Quadrada — ajuste o enquadramento antes do upload."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Quem pode ver este canal
        </label>
        <select
          name="visibilidadeCanal"
          defaultValue={visibilidadeCanal}
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        >
          {VISIBILIDADE_CANAL_OPCOES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          {VISIBILIDADE_CANAL_OPCOES.find((o) => o.value === visibilidadeCanal)?.hint}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          name="somenteAdminPublica"
          defaultChecked={somenteAdminPublica}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Só administradores publicam
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            Desative para deixar qualquer membro publicar no mural
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          name="publica"
          defaultChecked={publica}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Canal aberto
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            Desative para exigir pedido de entrada — a liderança aprova cada torcedor
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar canal oficial
        </button>
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
  /** Permissões efetivas (já resolvidas com herança do depto) — UI/search */
  permissions: string[]
  permissionsExtras?: string[]
  departamentoId?: string | null
  papelNoDepartamento?: string | null
  /** Quantos usuários têm este cargo atribuído — bloqueia exclusão quando > 0 */
  emUso?: number
}

interface DepartamentoOpt {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
}

interface RolesManagerProps {
  roles: Role[]
  departamentos?: DepartamentoOpt[]
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

export function RolesManager({ roles, departamentos = [], tipoSede }: RolesManagerProps) {
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()

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

  function executar(acao: () => Promise<unknown>, successMessage: string) {
    setErro(null)
    startTransition(async () => {
      try {
        await acao()
        toast.success(successMessage)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Erro ao salvar o cargo'
        setErro(message)
        toast.error(message)
      }
    })
  }

  const editando = criando || editandoId !== null

  return (
    <div className="space-y-3">
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
              initialPermissions={role.permissionsExtras?.length ? role.permissionsExtras : []}
              initialDepartamentoId={role.departamentoId ?? null}
              initialPapel={role.papelNoDepartamento ?? null}
              departamentos={departamentos}
              isSystem={role.isSystem}
              onCancel={() => setEditandoId(null)}
              onSubmit={(fd) => {
                executar(async () => {
                  await atualizarRole(role.id, fd)
                  setEditandoId(null)
                }, 'Cargo atualizado.')
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
                void confirmAction({
                  titulo: `Excluir o cargo "${role.nome}"?`,
                  descricao:
                    'Esta ação remove o cargo. Usuários vinculados precisarão de outro perfil.',
                  labelConfirmar: 'Excluir',
                  variante: 'destructive',
                  cancelled: 'Exclusão cancelada.',
                  run: async () => {
                    setErro(null)
                    try {
                      await excluirRole(role.id)
                    } catch (e) {
                      const message =
                        e instanceof Error ? e.message : 'Erro ao salvar o cargo'
                      setErro(message)
                      throw e
                    }
                  },
                  success: 'Cargo excluído.',
                })
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
            departamentos={departamentos}
            onCancel={() => setCriando(false)}
            onSubmit={(fd) => {
              executar(async () => {
                await criarRole(fd)
                setCriando(false)
              }, 'Cargo criado.')
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
  const [aberto, setAberto] = useState(false)
  const emUso = role.emUso ?? 0
  const podeExcluir = !role.isSystem && emUso === 0
  const nomeExibicao = role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome
  const resumoPerms = role.permissions.includes('*')
    ? 'Todas as permissões'
    : role.permissions.length === 0
      ? 'Sem permissões'
      : `${role.permissions.length} permiss${role.permissions.length === 1 ? 'ão' : 'ões'}`

  return (
    <div
      className={[
        'rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-opacity',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="mt-1 h-4 w-4 shrink-0 rounded-full border border-[rgb(var(--border))]"
          style={{ backgroundColor: role.cor }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[rgb(var(--foreground))]">{nomeExibicao}</span>
            {role.isSystem && (
              <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                <Shield className="h-3 w-3" /> Sistema
              </span>
            )}
            {emUso > 0 && (
              <Link
                href="/admin/acessos?secao=pessoas"
                className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                {emUso} pessoa{emUso === 1 ? '' : 's'}
              </Link>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{resumoPerms}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            title={aberto ? 'Ocultar permissões' : 'Ver permissões'}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            Ver
            <ChevronDown className={['h-3.5 w-3.5 transition-transform', aberto ? 'rotate-180' : ''].join(' ')} />
          </button>
          {!role.isSystem && (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={pending || disabled}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:pointer-events-none"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending || disabled || !podeExcluir}
                title={podeExcluir ? 'Excluir cargo' : 'Cargo em uso — remova-o das pessoas primeiro'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {aberto && (
        <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.5)] px-4 py-3">
          <AccessPermissionPreview permissions={role.permissions} />
          {role.isSystem && (
            <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
              Cargo de sistema — permissões fixas. Atribua em{' '}
              <Link href="/admin/acessos?secao=pessoas" className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline">
                Pessoas
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RoleForm({
  initialNome = '',
  initialCor = '#6b7280',
  initialPermissions = [],
  initialDepartamentoId = null,
  initialPapel = null,
  departamentos = [],
  isSystem = false,
  onCancel,
  onSubmit,
  pending,
}: {
  initialNome?: string
  initialCor?: string
  initialPermissions?: string[]
  initialDepartamentoId?: string | null
  initialPapel?: string | null
  departamentos?: DepartamentoOpt[]
  isSystem?: boolean
  onCancel: () => void
  onSubmit: (fd: FormData) => void
  pending: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const formId = useId()
  const [cor, setCor] = useState(initialCor)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialPermissions))
  const [departamentoId, setDepartamentoId] = useState<string>(initialDepartamentoId ?? '')
  const [papel, setPapel] = useState<string>(initialPapel ?? PAPEL_DEPARTAMENTO.MEMBRO)
  const { confirmDiscard } = useUnsavedChangesContext()
  const confirmDialog = useConfirmDialog()

  const isEdit = initialNome !== ''
  const initial = new Set(initialPermissions)
  const deptoSelecionado = departamentos.find((d) => d.id === departamentoId) ?? null
  const pacoteDepto = deptoSelecionado
    ? permissionsDoPacoteDepartamento(deptoSelecionado, papel)
    : []

  // Diff em relação ao estado original (só relevante na edição — na criação
  // tudo é novo por definição, sem destaque, como na referência)
  const added = isEdit ? [...selected].filter((p) => !initial.has(p)) : []
  const removed = isEdit ? [...initial].filter((p) => !selected.has(p)) : []

  const roleUnsaved = useMemo(() => {
    const list: string[] = []
    if (!isEdit) {
      list.push('Novo cargo em criação')
      if (selected.size > 0) list.push(`${selected.size} permissões selecionadas`)
      return list
    }
    if (cor !== initialCor) list.push('Cor')
    if ((departamentoId || '') !== (initialDepartamentoId ?? '')) list.push('Departamento')
    if (departamentoId && papel !== (initialPapel ?? PAPEL_DEPARTAMENTO.MEMBRO)) {
      list.push('Papel na área')
    }
    if (added.length > 0) list.push(`${added.length} permissão(ões) adicionada(s)`)
    if (removed.length > 0) list.push(`${removed.length} permissão(ões) removida(s)`)
    return list
  }, [
    isEdit,
    cor,
    initialCor,
    departamentoId,
    initialDepartamentoId,
    papel,
    initialPapel,
    added.length,
    removed.length,
    selected.size,
  ])

  useUnsavedChanges({
    id: `role-form-${initialNome || 'novo'}`,
    title: isEdit ? `Editar cargo — ${initialNome}` : 'Novo cargo',
    isDirty: roleUnsaved.length > 0,
    changes: roleUnsaved,
  })

  function toggle(key: string) {
    setSelected((prev) => {
      const prevArr = [...prev]
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return new Set(applyPermissionCascade(prevArr, [...next]))
    })
  }

  function groupChanges(groupKeys: readonly string[]) {
    return {
      added: added.filter((p) => groupKeys.includes(p)).length,
      removed: removed.filter((p) => groupKeys.includes(p)).length,
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!departamentoId && selected.size === 0) return

    if (isEdit && (added.length > 0 || removed.length > 0)) {
      const linhas = [
        ...added.map((p) => `+ ${permissionLabel(p)}`),
        ...removed.map((p) => `− ${permissionLabel(p)}`),
      ]
      const ok = await confirmDialog({
        titulo: `Salvar alterações do cargo "${initialNome}"?`,
        descricao: linhas.join('\n'),
        labelConfirmar: 'Salvar',
        cancelled: 'Salvamento cancelado.',
      })
      if (!ok) return
    } else if (!isEdit) {
      const ok = await confirmDialog({
        titulo: 'Criar o novo cargo?',
        descricao: 'O cargo será criado com as permissões selecionadas.',
        labelConfirmar: 'Criar',
        variante: 'success',
        cancelled: 'Criação cancelada.',
      })
      if (!ok) return
    }

    const fd = new FormData(e.currentTarget)
    fd.delete('permissions')
    fd.delete('permissionsExtras')
    for (const p of selected) {
      fd.append('permissionsExtras', p)
      if (!departamentoId) fd.append('permissions', p)
    }
    if (departamentoId) {
      fd.set('departamentoId', departamentoId)
      fd.set('papelNoDepartamento', papel)
    } else {
      fd.delete('departamentoId')
      fd.delete('papelNoDepartamento')
    }
    onSubmit(fd)
  }

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
    <form
      id={formId}
      ref={formRef}
      onSubmit={handleSubmit}
      data-persist-bar-root=""
      className="space-y-4"
    >
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Nome</label>
          <input
            name="nome"
            defaultValue={initialNome}
            required
            disabled={isSystem}
            placeholder="Ex: Gestor · Bandeiras"
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
            <input type="hidden" name="cor" value={cor} />
          </div>
        </div>
      </div>

      {!isSystem && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Departamento (área)
            </label>
            <select
              value={departamentoId}
              onChange={(e) => setDepartamentoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            >
              <option value="">Transversal (sem área)</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
          {departamentoId && (
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Papel na área
              </label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
              >
                <option value={PAPEL_DEPARTAMENTO.MEMBRO}>Membro</option>
                <option value={PAPEL_DEPARTAMENTO.GESTOR}>Gestor</option>
              </select>
            </div>
          )}
        </div>
      )}

      {deptoSelecionado && (
        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5">
          <p className="text-xs font-medium text-[rgb(var(--foreground))]">
            Pacote do departamento ({papel === PAPEL_DEPARTAMENTO.GESTOR ? 'gestor' : 'membro'}) —{' '}
            {pacoteDepto.length} permiss{pacoteDepto.length === 1 ? 'ão' : 'ões'}
          </p>
          <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
            Herança ao vivo do template da área. Ajuste o pacote em Departamentos; aqui só extras.
          </p>
        </div>
      )}

      {!departamentoId && selected.size === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Selecione ao menos uma permissão ou vincule um departamento.
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          {departamentoId ? 'Permissões adicionais (além do pacote da área)' : 'Permissões'}
        </p>
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
                    const noPacote = pacoteDepto.includes(item.key)
                    const isBase = group.base === item.key
                    return (
                      <label
                        key={item.key}
                        className={[
                          itemClass(item.key),
                          noPacote ? 'opacity-60' : '',
                        ].join(' ')}
                        title={noPacote ? 'Já coberta pelo pacote do departamento' : undefined}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selected.has(item.key) || noPacote}
                          disabled={noPacote}
                          onChange={() => toggle(item.key)}
                        />
                        <span
                          className={[
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                            selected.has(item.key) || noPacote
                              ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                              : 'border-[rgb(var(--border-strong))]',
                          ].join(' ')}
                        >
                          {(selected.has(item.key) || noPacote) && (
                            <Check className="h-2.5 w-2.5 text-white" />
                          )}
                        </span>
                        <span className={isEdit && removed.includes(item.key) ? 'line-through opacity-70' : ''}>
                          {item.label}
                          {noPacote ? ' · área' : ''}
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
          {departamentoId
            ? `${pacoteDepto.length} da área + ${selected.size} extra${selected.size === 1 ? '' : 's'}`
            : `${selected.size} permiss${selected.size === 1 ? 'ão' : 'ões'} selecionada${selected.size === 1 ? '' : 's'}`}
        </p>
      </div>

      <StickyPersistBar
        locked={roleUnsaved.length > 0 || pending}
        dirtyLabel={
          roleUnsaved.length > 0
            ? roleUnsaved.length === 1
              ? roleUnsaved[0]
              : `${roleUnsaved.length} alterações`
            : undefined
        }
        hint={
          isEdit
            ? 'Role para revisar permissões. Alterações só valem após salvar.'
            : 'Revise as permissões e confirme a criação do cargo.'
        }
      >
        <button
          type="button"
          onClick={() => {
            void confirmDiscard().then((ok) => {
              if (ok) onCancel()
            })
          }}
          disabled={pending}
          className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form={formId}
          disabled={pending || (!departamentoId && selected.size === 0) || isSystem}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {initialNome ? 'Salvar' : 'Criar cargo'}
        </button>
      </StickyPersistBar>
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
  const confirmAction = useConfirmAction()

  return (
    <div className="space-y-3">
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
                  const ok = await runPersistAction(
                    () => atualizarDepartamento(departamento.id, fd),
                    { success: 'Departamento atualizado.' },
                  )
                  if (ok) setEditandoId(null)
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
                void confirmAction({
                  titulo: `Excluir o departamento "${departamento.nome}"?`,
                  descricao: 'Áreas e vínculos associados podem ser afetados.',
                  labelConfirmar: 'Excluir',
                  variante: 'destructive',
                  cancelled: 'Exclusão cancelada.',
                  run: () => excluirDepartamento(departamento.id),
                  success: 'Departamento excluído.',
                })
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
                const ok = await runPersistAction(() => criarDepartamento(fd), {
                  success: 'Departamento criado.',
                })
                if (ok) setCriando(false)
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
  const [aberto, setAberto] = useState(false)
  const organizacional =
    departamento.permissions.length === 0 && departamento.permissionsGestor.length === 0
  const canonico = isDepartamentoCanonico(departamento.slug)

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="mt-1 h-4 w-4 shrink-0 rounded-full border border-[rgb(var(--border))]"
          style={{ backgroundColor: departamento.cor }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[rgb(var(--foreground))]">{departamento.nome}</span>
            {canonico && (
              <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
                Padrão
              </span>
            )}
            {departamento.moduloPortal && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                {moduloPortalLabel(departamento.moduloPortal)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {organizacional
              ? 'Organizacional — não concede acesso'
              : `Colaborador: ${departamento.permissions.length} · Gestor+: ${departamento.permissionsGestor.length}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            title={aberto ? 'Ocultar permissões' : 'Ver permissões'}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            Ver
            <ChevronDown className={['h-3.5 w-3.5 transition-transform', aberto ? 'rotate-180' : ''].join(' ')} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {aberto && (
        <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.45)] px-4 py-4 sm:px-5">
          {organizacional ? (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Este departamento só organiza pessoas — não adiciona permissões. Atribua em{' '}
              <Link href="/admin/acessos?secao=pessoas" className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline">
                Pessoas
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <AccessPermissionCompare
                permissionsMembro={departamento.permissions}
                permissionsGestor={departamento.permissionsGestor}
              />
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Atribua membro/gestor em{' '}
                <Link href="/admin/acessos?secao=pessoas" className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline">
                  Pessoas
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      )}
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
  const formId = useId()
  const { confirmDiscard } = useUnsavedChangesContext()

  const isEdit = initialNome !== ''
  const initialPermKey = useMemo(
    () => [...initialPermissions].sort().join(','),
    [initialPermissions],
  )
  const initialGestorKey = useMemo(
    () => [...initialPermissionsGestor].sort().join(','),
    [initialPermissionsGestor],
  )

  const deptoUnsaved = useMemo(() => {
    const list: string[] = []
    if (!isEdit) {
      list.push('Novo departamento em criação')
      return list
    }
    if (cor !== initialCor) list.push('Cor')
    if ([...selected].sort().join(',') !== initialPermKey) list.push('Permissões de membro')
    if ([...selectedGestor].sort().join(',') !== initialGestorKey) list.push('Permissões de gestor')
    return list
  }, [isEdit, cor, initialCor, selected, selectedGestor, initialPermKey, initialGestorKey])

  useUnsavedChanges({
    id: `depto-form-${initialNome || 'novo'}`,
    title: isEdit ? `Editar departamento — ${initialNome}` : 'Novo departamento',
    isDirty: deptoUnsaved.length > 0,
    changes: deptoUnsaved,
  })

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
    <form
      id={formId}
      onSubmit={handleSubmit}
      data-persist-bar-root=""
      className="space-y-4"
    >
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

      <StickyPersistBar
        locked={deptoUnsaved.length > 0 || pending}
        dirtyLabel={
          deptoUnsaved.length > 0
            ? deptoUnsaved.length === 1
              ? deptoUnsaved[0]
              : `${deptoUnsaved.length} alterações`
            : undefined
        }
        hint={
          isEdit
            ? 'Role para revisar permissões. Alterações só valem após salvar.'
            : 'Revise membro/gestor e confirme a criação da área.'
        }
      >
        <button
          type="button"
          onClick={() => {
            void confirmDiscard().then((ok) => {
              if (ok) onCancel()
            })
          }}
          className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3 w-3" /> Cancelar
        </button>
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {isEdit ? 'Salvar' : 'Criar departamento'}
        </button>
      </StickyPersistBar>
    </form>
  )
}
