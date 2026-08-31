'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Crown,
  Network,
  Search,
  Shield,
  UserRound,
  Users2,
  CreditCard,
  Users,
  KeyRound,
  EyeOff,
} from 'lucide-react'
import type { OrgDepartamentoBranch, OrgPerson, OrganizacaoTree } from '@/lib/organizacao-tree'
import { AvatarFoto } from '@/components/media/avatar-foto'

const BASE_PREVIEW = 8

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function personMatches(person: OrgPerson, needle: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  return (
    person.nome.toLowerCase().includes(n) ||
    (person.email?.toLowerCase().includes(n) ?? false) ||
    person.badges.some((b) => b.toLowerCase().includes(n))
  )
}

function branchHasMatch(branch: OrgDepartamentoBranch, needle: string): boolean {
  if (!needle) return true
  if (branch.nome.toLowerCase().includes(needle.toLowerCase())) return true
  return (
    branch.gestores.some((p) => personMatches(p, needle)) ||
    branch.membros.some((p) => personMatches(p, needle))
  )
}

function filterPeople(people: OrgPerson[], needle: string): OrgPerson[] {
  if (!needle) return people
  return people.filter((p) => personMatches(p, needle))
}

function PersonNode({
  person,
  roleLabel,
  accent,
  highlighted,
}: {
  person: OrgPerson
  roleLabel?: string
  accent?: string
  highlighted?: boolean
}) {
  const href = `/admin/acessos?secao=pessoas&usuario=${encodeURIComponent(person.id)}`
  return (
    <Link
      href={href}
      title={`Gerenciar acesso de ${person.nome}`}
      className={[
        'flex min-w-[12rem] max-w-[16rem] items-center gap-2.5 rounded-xl border bg-[rgb(var(--surface))] px-3 py-2.5 shadow-sm transition-colors',
        'hover:border-[rgb(var(--primary)_/_0.45)] hover:bg-[rgb(var(--primary)_/_0.04)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--primary))]',
        highlighted
          ? 'border-[rgb(var(--primary))] ring-2 ring-[rgb(var(--primary)_/_0.25)]'
          : 'border-[rgb(var(--border))]',
      ].join(' ')}
      style={accent && !highlighted ? { borderColor: `${accent}66` } : undefined}
    >
      {person.avatarUrl ? (
        <AvatarFoto
          src={person.avatarUrl}
          px={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: accent ?? 'rgb(var(--primary))' }}
        >
          {initials(person.nome)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{person.nome}</p>
        {roleLabel && (
          <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">{roleLabel}</p>
        )}
        {person.badges.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {person.badges.map((b) => (
              <span
                key={b}
                className="rounded bg-[rgb(var(--background-subtle))] px-1.5 py-px text-[10px] font-medium text-[rgb(var(--foreground-muted))]"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))] opacity-50" aria-hidden />
    </Link>
  )
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex min-w-[11rem] max-w-[14rem] items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.4)] px-3 py-3 text-center text-xs text-[rgb(var(--foreground-muted))]">
      {label}
    </div>
  )
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

function PeopleRow({
  people,
  roleLabel,
  accent,
  emptyLabel,
  needle,
}: {
  people: OrgPerson[]
  roleLabel: string
  accent?: string
  emptyLabel: string
  needle: string
}) {
  const filtered = filterPeople(people, needle)
  if (people.length === 0) {
    return (
      <div className="flex justify-center">
        <EmptySlot label={emptyLabel} />
      </div>
    )
  }
  if (filtered.length === 0) {
    return (
      <div className="flex justify-center">
        <EmptySlot label="Nenhuma pessoa nesta busca" />
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-start justify-center gap-3">
      {filtered.map((p) => (
        <PersonNode
          key={p.id}
          person={p}
          roleLabel={roleLabel}
          accent={accent}
          highlighted={Boolean(needle) && personMatches(p, needle)}
        />
      ))}
    </div>
  )
}

function DepartamentoBranchCard({
  branch,
  aberto,
  onToggle,
  needle,
}: {
  branch: OrgDepartamentoBranch
  aberto: boolean
  onToggle: () => void
  needle: string
}) {
  const vazio = branch.gestores.length === 0 && branch.membros.length === 0
  const gestores = filterPeople(branch.gestores, needle)
  const membros = filterPeople(branch.membros, needle)
  const matchBusca = branchHasMatch(branch, needle)

  return (
    <div
      className={[
        'flex w-[15rem] max-w-[20rem] flex-col rounded-2xl border bg-[rgb(var(--surface))] transition-opacity',
        needle && !matchBusca ? 'opacity-35' : 'opacity-100',
        matchBusca && needle
          ? 'border-[rgb(var(--primary)_/_0.5)]'
          : 'border-[rgb(var(--border))]',
      ].join(' ')}
      style={{ borderTopColor: branch.cor, borderTopWidth: 3 }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="flex w-full items-start gap-2 border-b border-[rgb(var(--border))] px-3 py-2.5 text-left transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.6)]"
      >
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: branch.cor }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{branch.nome}</p>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
            {branch.gestores.length} gestor{branch.gestores.length === 1 ? '' : 'es'} ·{' '}
            {branch.membros.length} membro{branch.membros.length === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronDown
          className={[
            'mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
            aberto ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {aberto && (
        <div className="space-y-3 px-3 py-3">
          {vazio ? (
            <div className="space-y-2 text-center">
              <p className="text-xs text-[rgb(var(--foreground-muted))]">Sem pessoas nesta área</p>
              <Link
                href="/admin/acessos?secao=pessoas"
                className="inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
              >
                Atribuir em Acessos
              </Link>
            </div>
          ) : gestores.length === 0 && membros.length === 0 ? (
            <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
              Nenhuma pessoa nesta busca
            </p>
          ) : (
            <>
              {gestores.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Gestores
                  </p>
                  <div className="flex flex-col gap-2">
                    {gestores.map((p) => (
                      <PersonNode
                        key={p.id}
                        person={p}
                        roleLabel="Gestor"
                        accent={branch.cor}
                        highlighted={Boolean(needle)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {membros.length > 0 && (
                <div>
                  {gestores.length > 0 && <RelationStem label="equipe" />}
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Colaboradores
                  </p>
                  <div className="flex flex-col gap-2">
                    {membros.map((p) => (
                      <PersonNode
                        key={p.id}
                        person={p}
                        roleLabel="Colaborador"
                        accent={branch.cor}
                        highlighted={Boolean(needle)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function BaseTier({
  title,
  icon: Icon,
  people,
  emptyHint,
  needle,
  forceOpen,
}: {
  title: string
  icon: typeof Users
  people: OrgPerson[]
  emptyHint: string
  needle: string
  forceOpen: boolean
}) {
  const filtered = filterPeople(people, needle)
  const [aberto, setAberto] = useState(people.length <= BASE_PREVIEW)
  const expandido = forceOpen || aberto || Boolean(needle)
  const visiveis = expandido ? filtered : filtered.slice(0, BASE_PREVIEW)
  const restantes = filtered.length - visiveis.length

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">{title}</h3>
          <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
            {needle ? `${filtered.length}/${people.length}` : people.length}
          </span>
        </div>
        {filtered.length > BASE_PREVIEW && !needle && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] transition-colors hover:bg-[rgb(var(--primary)_/_0.08)]"
          >
            {aberto ? 'Recolher' : `Ver todos (${filtered.length})`}
            <ChevronDown className={['h-3.5 w-3.5 transition-transform', aberto ? 'rotate-180' : ''].join(' ')} />
          </button>
        )}
      </div>
      <div className="px-4 py-4">
        {people.length === 0 ? (
          <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">{emptyHint}</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">Nenhuma pessoa nesta busca</p>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {visiveis.map((p) => (
                <PersonNode key={p.id} person={p} highlighted={Boolean(needle)} />
              ))}
            </div>
            {restantes > 0 && (
              <p className="mt-3 text-center text-xs text-[rgb(var(--foreground-muted))]">
                +{restantes} não exibido{restantes === 1 ? '' : 's'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function branchIds(tree: OrganizacaoTree): string[] {
  const ids: string[] = []
  if (tree.diretoria) ids.push(tree.diretoria.id)
  for (const d of tree.departamentos) ids.push(d.id)
  return ids
}

export function OrganizacaoMural({ tree }: { tree: OrganizacaoTree }) {
  const allIds = useMemo(() => branchIds(tree), [tree])
  const [busca, setBusca] = useState('')
  const [soComPessoas, setSoComPessoas] = useState(false)
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (tree.diretoria && (tree.diretoria.gestores.length > 0 || tree.diretoria.membros.length > 0)) {
      initial.add(tree.diretoria.id)
    }
    return initial
  })

  const needle = busca.trim()

  const stats = useMemo(() => {
    const emDepto = new Set<string>()
    for (const d of [tree.diretoria, ...tree.departamentos]) {
      if (!d) continue
      for (const p of [...d.gestores, ...d.membros]) emDepto.add(p.id)
    }
    return {
      presidentes: tree.presidentes.length,
      vices: tree.vices.length,
      emDepto: emDepto.size,
      socios: tree.sociosBase.length,
      torcedores: tree.torcedoresBase.length,
      deptosVazios: tree.departamentos.filter((d) => d.gestores.length === 0 && d.membros.length === 0)
        .length,
    }
  }, [tree])

  const departamentosVisiveis = useMemo(() => {
    return tree.departamentos.filter((d) => {
      if (soComPessoas && d.gestores.length === 0 && d.membros.length === 0) return false
      if (needle && !branchHasMatch(d, needle)) return false
      return true
    })
  }, [tree.departamentos, soComPessoas, needle])

  const openForSearch = useMemo(() => {
    if (!needle) return null as Set<string> | null
    const next = new Set<string>()
    for (const id of allIds) {
      const branch =
        tree.diretoria?.id === id
          ? tree.diretoria
          : tree.departamentos.find((d) => d.id === id)
      if (branch && branchHasMatch(branch, needle)) next.add(id)
    }
    return next
  }, [needle, allIds, tree])

  function isAberto(id: string): boolean {
    if (openForSearch) return openForSearch.has(id)
    return abertos.has(id)
  }

  function toggle(id: string) {
    setAbertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandirTodos() {
    setAbertos(new Set(allIds))
  }

  function recolherTodos() {
    setAbertos(new Set())
  }

  const temAtivos =
    tree.presidentes.length > 0 ||
    tree.vices.length > 0 ||
    (tree.diretoria &&
      (tree.diretoria.gestores.length > 0 || tree.diretoria.membros.length > 0)) ||
    tree.departamentos.some((d) => d.gestores.length > 0 || d.membros.length > 0) ||
    tree.sociosBase.length > 0 ||
    tree.torcedoresBase.length > 0

  if (!temAtivos) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-12 text-center">
        <Network className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
          Hierarquia ainda vazia
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
          Atribua o Presidente em Estrutura › Presidência. Vice e departamentos ficam em Controle
          de acesso. Aprove membros para aparecerem como sócios ou torcedores na base da árvore.
        </p>
        <Link
          href="/admin/acessos?secao=pessoas"
          className="mt-5 inline-flex items-center rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Ir para Controle de acesso
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo + toolbar */}
      <div className="sticky top-0 z-10 -mx-1 space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.92)] px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-1 text-[rgb(var(--foreground-muted))]">
            <Crown className="h-3.5 w-3.5" />
            {stats.presidentes} {tree.rotuloPresidente.toLowerCase()}
            {stats.presidentes === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-1 text-[rgb(var(--foreground-muted))]">
            <Shield className="h-3.5 w-3.5" />
            {stats.vices} {tree.rotuloVice.toLowerCase()}
            {stats.vices === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-1 text-[rgb(var(--foreground-muted))]">
            <Users2 className="h-3.5 w-3.5" />
            {stats.emDepto} em departamentos
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-1 text-[rgb(var(--foreground-muted))]">
            <CreditCard className="h-3.5 w-3.5" />
            {stats.socios} sócios na base
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-1 text-[rgb(var(--foreground-muted))]">
            <UserRound className="h-3.5 w-3.5" />
            {stats.torcedores} torcedores na base
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa, e-mail ou departamento…"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
              aria-label="Buscar na hierarquia"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={expandirTodos}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-2 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              title="Expandir todos os departamentos"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Expandir
            </button>
            <button
              type="button"
              onClick={recolherTodos}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-2 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              title="Recolher todos os departamentos"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
              Recolher
            </button>
            <button
              type="button"
              onClick={() => setSoComPessoas((v) => !v)}
              aria-pressed={soComPessoas}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-colors',
                soComPessoas
                  ? 'border-[rgb(var(--color-primary)_/_0.4)] bg-[rgb(var(--color-primary)_/_0.1)] font-semibold text-[rgb(var(--color-primary-fg))]'
                  : 'border-[rgb(var(--border))] font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
              ].join(' ')}
              title="Ocultar departamentos sem pessoas"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Só com pessoas
              {soComPessoas && stats.deptosVazios > 0 ? ` (−${stats.deptosVazios})` : ''}
            </button>
            <Link
              href="/admin/acessos?secao=pessoas"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-2.5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Acessos
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center pb-4">
        {tree.presidentes.length > 1 && (
          <div className="mb-4 w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Esta torcida admite apenas um {tree.rotuloPresidente.toLowerCase()}. Há{' '}
            {tree.presidentes.length} no cargo. Consolide em{' '}
            <Link
              href="/admin/presidencia"
              className="font-semibold underline underline-offset-2"
            >
              Estrutura › Presidência
            </Link>
            .
          </div>
        )}
        <section className="flex w-full flex-col items-center" aria-label={tree.rotuloPresidente}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            {tree.rotuloPresidente}
          </p>
          <PeopleRow
            people={tree.presidentes}
            roleLabel={tree.rotuloPresidente}
            accent="#f59e0b"
            emptyLabel={`Nenhum ${tree.rotuloPresidente.toLowerCase()} atribuído`}
            needle={needle}
          />
        </section>

        <RelationStem label="comanda" />

        <section className="flex w-full flex-col items-center" aria-label={tree.rotuloVice}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            {tree.rotuloVice}
          </p>
          <PeopleRow
            people={tree.vices}
            roleLabel={tree.rotuloVice}
            accent="#0ea5e9"
            emptyLabel={`Nenhum ${tree.rotuloVice.toLowerCase()} atribuído`}
            needle={needle}
          />
        </section>

        <RelationStem label="apoia" />

        <section className="flex w-full flex-col items-center" aria-label="Diretoria">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            Diretoria
          </p>
          {tree.diretoria ? (
            <DepartamentoBranchCard
              branch={tree.diretoria}
              aberto={isAberto(tree.diretoria.id)}
              onToggle={() => toggle(tree.diretoria!.id)}
              needle={needle}
            />
          ) : (
            <EmptySlot label="Departamento Diretoria não encontrado — rode o seed de departamentos" />
          )}
        </section>

        {departamentosVisiveis.length > 0 && (
          <>
            <RelationStem label="dirige" />
            <section className="flex w-full flex-col items-center" aria-label="Departamentos">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
                Departamentos · gestores e colaboradores
                {soComPessoas || needle
                  ? ` (${departamentosVisiveis.length})`
                  : ''}
              </p>
              <div className="relative w-full overflow-x-auto">
                <div
                  className="pointer-events-none absolute left-[8%] right-[8%] top-0 hidden h-px bg-[rgb(var(--border-strong)_/_0.45)] md:block"
                  aria-hidden
                />
                <div className="flex flex-wrap justify-center gap-4 pt-3 md:gap-5">
                  {departamentosVisiveis.map((branch) => (
                    <div key={branch.id} className="flex flex-col items-center">
                      <div
                        className="mb-2 hidden h-3 w-px bg-[rgb(var(--border-strong)_/_0.45)] md:block"
                        aria-hidden
                      />
                      <DepartamentoBranchCard
                        branch={branch}
                        aberto={isAberto(branch.id)}
                        onToggle={() => toggle(branch.id)}
                        needle={needle}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {departamentosVisiveis.length === 0 && tree.departamentos.length > 0 && (
          <p className="mt-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
            Nenhum departamento corresponde aos filtros atuais.
          </p>
        )}

        <RelationStem label="associa" />

        <section className="flex w-full flex-col items-center gap-4" aria-label="Base associativa">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            Base associativa
          </p>
          <p className="max-w-lg text-center text-xs text-[rgb(var(--foreground-muted))]">
            Sócios e torcedores sem cargo de liderança nem departamento. Clique em uma pessoa para
            ir ao Controle de acesso.
          </p>
          <BaseTier
            title="Sócios"
            icon={CreditCard}
            people={tree.sociosBase}
            emptyHint="Nenhum sócio apenas na base (todos já estão em cargos/áreas ou não há sócios aprovados)."
            needle={needle}
            forceOpen={Boolean(needle)}
          />
          <BaseTier
            title="Torcedores"
            icon={Users}
            people={tree.torcedoresBase}
            emptyHint="Nenhum torcedor apenas na base."
            needle={needle}
            forceOpen={Boolean(needle)}
          />
        </section>
      </div>

      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        Hierarquia territorial (Sede → Subsede → PDE) fica em{' '}
        <Link href="/admin/sedes" className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline">
          Sedes
        </Link>
        {' '}e na{' '}
        <Link href="/admin/torcida" className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline">
          Visão da torcida
        </Link>
        .
      </p>
    </div>
  )
}
