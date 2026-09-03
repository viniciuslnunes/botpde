'use client'

import { useActionState, useEffect, useMemo, useState, type ReactNode } from 'react'
import { UserMinus, UserPlus } from 'lucide-react'
import {
  adicionarMembroArea,
  buscarCandidatosArea,
  removerMembroArea,
  type ActionState,
} from '@/app/portal/departamentos/actions'
import { useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { AvatarFoto } from '@/components/media/avatar-foto'
import { classeFocoCard, useFocoCard } from './departamento-foco'
import { DepartamentoAreaMembroSecao } from '@/components/departamentos/departamento-area-membro'
import { AppButton } from '@/components/ui/button'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'

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

      {areas && areas.length > 0 ? (
        <DepartamentoAreaMembroSecao
          areasDaPessoa={areasDaPessoa}
          areasDisponiveis={areasDisponiveis}
          podeGerir={Boolean(podeGerirAreas)}
          departamentoId={departamentoId}
          slug={slug}
          targetUserId={membro.userId}
          personLabel={nome}
        />
      ) : null}
    </div>
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
  const [resultados, setResultados] = useState<
    Array<{ id: string; nome: string | null; email: string; nickname: string | null }>
  >([])
  const [ultimoTermo, setUltimoTermo] = useState('')
  const [state, action, pending] = useActionState(adicionarMembroArea, {} as ActionState)
  useActionStateToast(state, pending, 'Membro adicionado ao departamento')

  async function buscarSocios(termo: string): Promise<ReactiveSearchOption[]> {
    const rows = await buscarCandidatosArea(departamentoId, termo)
    setResultados(rows)
    setUltimoTermo(termo)
    return rows.map((c) => ({
      id: c.id,
      label: c.nome?.trim() || c.email,
      sublabel: c.nickname ? `@${c.nickname}` : c.email,
      searchText: [c.nome, c.email, c.nickname].filter(Boolean).join(' '),
      payload: c,
    }))
  }

  const qBusca = q.trim().length >= 2 ? q.trim() : ''
  const candidatosVisiveis = ultimoTermo === qBusca && qBusca ? resultados : []
  const buscou = ultimoTermo === qBusca && qBusca !== ''

  useEffect(() => {
    if (!state.ok) return
    // Limpar o termo já esconde a lista e zera o "buscou" (ambos derivados).
    const t = setTimeout(() => setQ(''), 0)
    return () => clearTimeout(t)
  }, [state.ok])

  return (
    <div className="mt-3 space-y-3">
      <SearchFilterInput
        value={q}
        onChange={(next) => {
          setQ(next)
          if (next.trim().length < 2) {
            setResultados([])
            setUltimoTermo('')
          }
        }}
        placeholder="Buscar por nome, e-mail ou @"
        ariaLabel="Buscar sócio"
        onSearch={buscarSocios}
        onSelectSuggestion={(item) => setQ(item.label)}
        minChars={2}
        noResultsMessage="Nenhum sócio encontrado."
      />
      {buscou && qBusca && candidatosVisiveis.length === 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Nenhum sócio encontrado para “{qBusca}”.
        </p>
      ) : null}
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
                <AppButton
                  variant="primary"
                  icon={UserPlus}
                  type="submit"
                  disabled={pending}
                  className="gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  Incluir
                </AppButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
