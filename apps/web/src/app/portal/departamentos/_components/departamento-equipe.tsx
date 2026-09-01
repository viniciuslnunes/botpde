'use client'

import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { UserMinus, UserPlus } from 'lucide-react'
import {
  adicionarMembroArea,
  adicionarMembroAreaDepartamento,
  buscarCandidatosArea,
  removerMembroArea,
  removerMembroAreaDepartamento,
  type ActionState,
} from '@/app/portal/departamentos/actions'
import { useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { AvatarFoto } from '@/components/media/avatar-foto'
import { classeFocoCard, useFocoCard } from './departamento-foco'

export type MembroEquipe = {
  userId: string
  nome: string | null
  email: string
  nickname: string | null
  avatarUrl: string | null
  isGestor: boolean
  /** Áreas deste departamento em que a pessoa atua (vazio se o depto não tem áreas). */
  areaIds?: string[]
}

export type AreaFiltro = { id: string; nome: string }

function rotuloPessoa(m: Pick<MembroEquipe, 'nome' | 'nickname' | 'email'>) {
  return m.nome?.trim() || (m.nickname ? `@${m.nickname}` : null) || m.email
}

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function RelationStem({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <div className="h-4 w-px bg-[rgb(var(--border-strong)_/_0.55)]" />
      <span className="my-0.5 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </span>
      <div className="h-4 w-px bg-[rgb(var(--border-strong)_/_0.55)]" />
    </div>
  )
}

function PessoaCard({
  membro,
  roleLabel,
  accent,
  action,
  areas,
  podeGerirAreas,
  departamentoId,
  slug,
  foco,
}: {
  membro: MembroEquipe
  roleLabel: string
  accent: string
  action?: ReactNode
  areas?: AreaFiltro[]
  podeGerirAreas?: boolean
  departamentoId: string
  slug: string
  foco?: boolean
}) {
  const nome = rotuloPessoa(membro)
  const areasDaPessoa = (areas ?? []).filter((a) => membro.areaIds?.includes(a.id))
  const areasDisponiveis = (areas ?? []).filter((a) => !membro.areaIds?.includes(a.id))
  const focoRef = useFocoCard(Boolean(foco))

  return (
    <div
      ref={focoRef}
      id={`pessoa-${membro.userId}`}
      aria-current={foco ? 'true' : undefined}
      className={[
        'flex min-w-[12rem] max-w-[16rem] flex-col gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 shadow-sm',
        classeFocoCard(Boolean(foco)),
      ].join(' ')}
      style={{ borderColor: `${accent}66` }}
    >
      <div className="flex items-center gap-2.5">
        {membro.avatarUrl ? (
          <AvatarFoto
            src={membro.avatarUrl}
            px={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {initials(nome)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{nome}</p>
          <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
            {roleLabel}
            {membro.nickname ? ` · @${membro.nickname}` : ''}
          </p>
        </div>
        {action}
      </div>

      {areas && areas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {areasDaPessoa.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]"
            >
              {a.nome}
              {podeGerirAreas && (
                <RemoverDaAreaBotao
                  departamentoId={departamentoId}
                  slug={slug}
                  areaId={a.id}
                  areaNome={a.nome}
                  targetUserId={membro.userId}
                  personLabel={nome}
                />
              )}
            </span>
          ))}
          {podeGerirAreas && areasDisponiveis.length > 0 && (
            <AdicionarAreaSelect
              departamentoId={departamentoId}
              slug={slug}
              targetUserId={membro.userId}
              areasDisponiveis={areasDisponiveis}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AdicionarAreaSelect({
  departamentoId,
  slug,
  targetUserId,
  areasDisponiveis,
}: {
  departamentoId: string
  slug: string
  targetUserId: string
  areasDisponiveis: AreaFiltro[]
}) {
  const [areaId, setAreaId] = useState('')
  const [state, action, pending] = useActionState(adicionarMembroAreaDepartamento, {} as ActionState)
  useActionStateToast(state, pending, 'Incluído na área', { onSuccess: () => setAreaId('') })

  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <input type="hidden" name="areaId" value={areaId} />
      <select
        value={areaId}
        onChange={(e) => setAreaId(e.target.value)}
        className="rounded-full border border-dashed border-[rgb(var(--border))] bg-transparent px-2 py-0.5 text-[10px] text-[rgb(var(--foreground-muted))] outline-none"
      >
        <option value="">+ área</option>
        {areasDisponiveis.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>
      {areaId && (
        <button
          type="submit"
          disabled={pending}
          className="app-action rounded-full bg-[rgb(var(--primary))] px-2 py-0.5 text-[10px] font-medium text-primary-on disabled:opacity-50"
        >
          OK
        </button>
      )}
    </form>
  )
}

function RemoverDaAreaBotao({
  departamentoId,
  slug,
  areaId,
  areaNome,
  targetUserId,
  personLabel,
}: {
  departamentoId: string
  slug: string
  areaId: string
  areaNome: string
  targetUserId: string
  personLabel: string
}) {
  const confirmAction = useConfirmAction()
  return (
    <button
      type="button"
      onClick={() =>
        void confirmAction({
          titulo: `Remover ${personLabel} de ${areaNome}?`,
          descricao: 'A pessoa continua no departamento; só sai desta área.',
          labelConfirmar: 'Remover',
          variante: 'destructive',
          cancelled: false,
          run: async () => {
            const fd = new FormData()
            fd.set('areaId', areaId)
            fd.set('departamentoId', departamentoId)
            fd.set('slug', slug)
            fd.set('targetUserId', targetUserId)
            return removerMembroAreaDepartamento({}, fd)
          },
          success: `Removido de ${areaNome}`,
        })
      }
      className="app-action -mr-1 rounded-full p-0.5 hover:text-red-600"
      title="Remover da área"
    >
      ×
    </button>
  )
}

export function DepartamentoEquipe({
  departamentoId,
  slug,
  cor,
  membros,
  isGestor,
  currentUserId,
  areas = [],
  focoPessoaId,
}: {
  departamentoId: string
  slug: string
  /** Mantido para compat com a página; o mural não repete o nome da área. */
  nome?: string
  cor: string
  membros: MembroEquipe[]
  isGestor: boolean
  currentUserId: string
  /** Áreas do departamento — habilita o filtro por chips e os badges por pessoa. */
  areas?: AreaFiltro[]
  /** Deep-link `?pessoa=` — destaca o card da pessoa. */
  focoPessoaId?: string
}) {
  const [filtroAreaId, setFiltroAreaId] = useState<string | null>(null)
  const membrosFiltrados = useMemo(
    () => (filtroAreaId ? membros.filter((m) => m.areaIds?.includes(filtroAreaId)) : membros),
    [membros, filtroAreaId],
  )
  const gestores = membrosFiltrados.filter((m) => m.isGestor)
  const colaboradores = membrosFiltrados.filter((m) => !m.isGestor)
  const vazio = membrosFiltrados.length === 0

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex items-center gap-2 border-b border-[rgb(var(--border))] pb-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Equipe</h2>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
            {gestores.length} gestor{gestores.length === 1 ? '' : 'es'} · {colaboradores.length}{' '}
            membro{colaboradores.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[rgb(var(--border))] py-3">
          <button
            type="button"
            onClick={() => setFiltroAreaId(null)}
            className={[
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              filtroAreaId === null
                ? 'bg-[rgb(var(--primary))] text-primary-on'
                : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            Todas
          </button>
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setFiltroAreaId(a.id)}
              className={[
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                filtroAreaId === a.id
                  ? 'bg-[rgb(var(--primary))] text-primary-on'
                  : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {a.nome}
            </button>
          ))}
        </div>
      )}

      {isGestor && (
        <div id="gestao" className="scroll-mt-20 border-b border-[rgb(var(--border))] py-4">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Incluir membro</h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Sócios aprovados desta torcida entram na equipe do departamento.
          </p>
          <AdicionarMembroForm departamentoId={departamentoId} slug={slug} />
        </div>
      )}

      {vazio ? (
        <p className="mt-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
          {filtroAreaId
            ? 'Ninguém desta área ainda.'
            : isGestor
              ? 'Ainda sem pessoas. Use a busca acima para incluir o primeiro membro.'
              : 'Sem pessoas neste departamento'}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {gestores.length > 0 && (
            <div>
              <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Gestores
              </p>
              <div className="flex flex-wrap items-start justify-center gap-3">
                {gestores.map((m) => (
                  <PessoaCard
                    key={m.userId}
                    membro={m}
                    roleLabel="Gestor"
                    accent={cor}
                    areas={areas}
                    podeGerirAreas={isGestor}
                    departamentoId={departamentoId}
                    slug={slug}
                    foco={m.userId === focoPessoaId}
                  />
                ))}
              </div>
            </div>
          )}

          {colaboradores.length > 0 && (
            <div>
              {gestores.length > 0 && <RelationStem label="equipe" />}
              <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Colaboradores
              </p>
              <div className="flex flex-wrap items-start justify-center gap-3">
                {colaboradores.map((m) => (
                  <PessoaCard
                    key={m.userId}
                    membro={m}
                    roleLabel="Colaborador"
                    accent={cor}
                    areas={areas}
                    podeGerirAreas={isGestor}
                    departamentoId={departamentoId}
                    slug={slug}
                    foco={m.userId === focoPessoaId}
                    action={
                      isGestor && m.userId !== currentUserId ? (
                        <RemoverMembroButton
                          departamentoId={departamentoId}
                          slug={slug}
                          targetUserId={m.userId}
                          label={rotuloPessoa(m)}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {gestores.length > 0 && colaboradores.length === 0 && (
            <div className="pt-1">
              <RelationStem label="equipe" />
              <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
                Ainda sem colaboradores neste departamento
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function RemoverMembroButton({
  departamentoId,
  slug,
  targetUserId,
  label,
}: {
  departamentoId: string
  slug: string
  targetUserId: string
  label: string
}) {
  const confirmAction = useConfirmAction()

  return (
    <button
      type="button"
      onClick={() => {
        void confirmAction({
          titulo: `Remover ${label} deste departamento?`,
          descricao: 'A pessoa sai da equipe. Pode ser incluída de novo depois.',
          labelConfirmar: 'Remover',
          variante: 'destructive',
          cancelled: 'Remoção cancelada.',
          run: async () => {
            const fd = new FormData()
            fd.set('departamentoId', departamentoId)
            fd.set('slug', slug)
            fd.set('targetUserId', targetUserId)
            return removerMembroArea({}, fd)
          },
          success: `${label} removido do departamento`,
        })
      }}
      className="app-action inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
      title={`Remover ${label}`}
      aria-label={`Remover ${label}`}
    >
      <UserMinus className="h-4 w-4" />
    </button>
  )
}

function AdicionarMembroForm({
  departamentoId,
  slug,
}: {
  departamentoId: string
  slug: string
}) {
  const [q, setQ] = useState('')
  /** Última busca concluída; o termo junto deriva "já buscou" e a lista visível. */
  const [busca, setBusca] = useState<{
    termo: string
    itens: Array<{ id: string; nome: string | null; email: string; nickname: string | null }>
  }>({ termo: '', itens: [] })
  const [pendingSearch, startSearch] = useTransition()
  const [state, action, pending] = useActionState(adicionarMembroArea, {} as ActionState)
  useActionStateToast(state, pending, 'Membro adicionado ao departamento')

  const qBusca = q.trim().length >= 2 ? q.trim() : ''
  const buscaConcluida = qBusca !== '' && busca.termo === qBusca
  const candidatosVisiveis = buscaConcluida ? busca.itens : []
  const buscou = buscaConcluida

  useEffect(() => {
    if (!qBusca) return
    let cancelled = false
    const t = setTimeout(() => {
      startSearch(() => {
        void buscarCandidatosArea(departamentoId, qBusca).then((rows) => {
          if (!cancelled) setBusca({ termo: qBusca, itens: rows })
        })
      })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [qBusca, departamentoId])

  useEffect(() => {
    if (!state.ok) return
    // Limpar o termo já esconde a lista e zera o "buscou" (ambos derivados).
    const t = setTimeout(() => setQ(''), 0)
    return () => clearTimeout(t)
  }, [state.ok])

  return (
    <div className="mt-3 space-y-3">
      <label className="block">
        <span className="sr-only">Buscar sócio</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, e-mail ou @"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
      </label>
      {pendingSearch && qBusca && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Buscando…</p>
      )}
      {!pendingSearch && buscou && qBusca && candidatosVisiveis.length === 0 && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Nenhum sócio encontrado para “{qBusca}”.
        </p>
      )}
      {candidatosVisiveis.length > 0 && (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
          {candidatosVisiveis.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {c.nome?.trim() || c.email}
                </p>
                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                  {c.nickname ? `@${c.nickname}` : c.email}
                </p>
              </div>
              <form action={action}>
                <input type="hidden" name="departamentoId" value={departamentoId} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="targetUserId" value={c.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="app-action inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1.5 text-xs font-medium text-primary-on disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Incluir
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
