'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  Crown,
  Network,
  Shield,
  UserRound,
  Users2,
  CreditCard,
  Users,
} from 'lucide-react'
import type { OrgDepartamentoBranch, OrgPerson, OrganizacaoTree } from '@/lib/organizacao-tree'

const BASE_PREVIEW = 8

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function PersonNode({
  person,
  roleLabel,
  accent,
}: {
  person: OrgPerson
  roleLabel?: string
  accent?: string
}) {
  return (
    <div
      className="flex min-w-[11rem] max-w-[14rem] items-center gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 shadow-sm"
      style={accent ? { borderColor: `${accent}66` } : undefined}
    >
      {person.avatarUrl ? (
        <img
          src={person.avatarUrl}
          alt=""
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
    </div>
  )
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex min-w-[11rem] max-w-[14rem] items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.4)] px-3 py-3 text-center text-xs text-[rgb(var(--foreground-muted))]">
      {label}
    </div>
  )
}

/** Conector vertical + rótulo da relação */
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
}: {
  people: OrgPerson[]
  roleLabel: string
  accent?: string
  emptyLabel: string
}) {
  if (people.length === 0) {
    return (
      <div className="flex justify-center">
        <EmptySlot label={emptyLabel} />
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-start justify-center gap-3">
      {people.map((p) => (
        <PersonNode key={p.id} person={p} roleLabel={roleLabel} accent={accent} />
      ))}
    </div>
  )
}

function DepartamentoBranchCard({ branch }: { branch: OrgDepartamentoBranch }) {
  const vazio = branch.gestores.length === 0 && branch.membros.length === 0
  return (
    <div
      className="flex min-w-[15rem] max-w-[20rem] flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      style={{ borderTopColor: branch.cor, borderTopWidth: 3 }}
    >
      <div className="border-b border-[rgb(var(--border))] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: branch.cor }} />
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{branch.nome}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
          {branch.gestores.length} gestor{branch.gestores.length === 1 ? '' : 'es'} ·{' '}
          {branch.membros.length} membro{branch.membros.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="space-y-3 px-3 py-3">
        {vazio ? (
          <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">Sem pessoas nesta área</p>
        ) : (
          <>
            {branch.gestores.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Gestores
                </p>
                <div className="flex flex-col gap-2">
                  {branch.gestores.map((p) => (
                    <PersonNode key={p.id} person={p} roleLabel="Gestor" accent={branch.cor} />
                  ))}
                </div>
              </div>
            )}
            {branch.membros.length > 0 && (
              <div>
                {branch.gestores.length > 0 && <RelationStem label="equipe" />}
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Colaboradores
                </p>
                <div className="flex flex-col gap-2">
                  {branch.membros.map((p) => (
                    <PersonNode key={p.id} person={p} roleLabel="Colaborador" accent={branch.cor} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function BaseTier({
  title,
  icon: Icon,
  people,
  emptyHint,
}: {
  title: string
  icon: typeof Users
  people: OrgPerson[]
  emptyHint: string
}) {
  const [aberto, setAberto] = useState(people.length <= BASE_PREVIEW)
  const visiveis = aberto ? people : people.slice(0, BASE_PREVIEW)
  const restantes = people.length - visiveis.length

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">{title}</h3>
          <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
            {people.length}
          </span>
        </div>
        {people.length > BASE_PREVIEW && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--primary))] transition-colors hover:bg-[rgb(var(--primary)_/_0.08)]"
          >
            {aberto ? 'Recolher' : `Ver todos (${people.length})`}
            <ChevronDown className={['h-3.5 w-3.5 transition-transform', aberto ? 'rotate-180' : ''].join(' ')} />
          </button>
        )}
      </div>
      <div className="px-4 py-4">
        {people.length === 0 ? (
          <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">{emptyHint}</p>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {visiveis.map((p) => (
                <PersonNode key={p.id} person={p} />
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

export function OrganizacaoMural({ tree }: { tree: OrganizacaoTree }) {
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
          Atribua Presidente, Vice e departamentos em Controle de acesso. Aprove membros para
          aparecerem como sócios ou torcedores na base da árvore.
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
    <div className="space-y-1">
      {/* Legenda */}
      <div className="mb-6 flex flex-wrap items-center gap-3 text-[11px] text-[rgb(var(--foreground-muted))]">
        <span className="inline-flex items-center gap-1.5">
          <Crown className="h-3.5 w-3.5" /> {tree.rotuloPresidente}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> {tree.rotuloVice}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users2 className="h-3.5 w-3.5" /> Departamentos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5" /> Sócios
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5" /> Torcedores
        </span>
      </div>

      <div className="flex flex-col items-center overflow-x-auto pb-4">
        {/* Presidente */}
        <section className="flex w-full flex-col items-center" aria-label={tree.rotuloPresidente}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            {tree.rotuloPresidente}
          </p>
          <PeopleRow
            people={tree.presidentes}
            roleLabel={tree.rotuloPresidente}
            accent="#f59e0b"
            emptyLabel={`Nenhum ${tree.rotuloPresidente.toLowerCase()} atribuído`}
          />
        </section>

        <RelationStem label="comanda" />

        {/* Vice */}
        <section className="flex w-full flex-col items-center" aria-label={tree.rotuloVice}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            {tree.rotuloVice}
          </p>
          <PeopleRow
            people={tree.vices}
            roleLabel={tree.rotuloVice}
            accent="#0ea5e9"
            emptyLabel={`Nenhum ${tree.rotuloVice.toLowerCase()} atribuído`}
          />
        </section>

        <RelationStem label="apoia" />

        {/* Diretoria */}
        <section className="flex w-full flex-col items-center" aria-label="Diretoria">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            Diretoria
          </p>
          {tree.diretoria ? (
            <DepartamentoBranchCard branch={tree.diretoria} />
          ) : (
            <EmptySlot label="Departamento Diretoria não encontrado — rode o seed de departamentos" />
          )}
        </section>

        {tree.departamentos.length > 0 && (
          <>
            <RelationStem label="dirige" />
            <section className="flex w-full flex-col items-center" aria-label="Departamentos">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
                Departamentos · gestores e colaboradores
              </p>
              {/* Trilho horizontal estilo árvore */}
              <div className="relative w-full">
                <div
                  className="pointer-events-none absolute left-[8%] right-[8%] top-0 hidden h-px bg-[rgb(var(--border-strong)_/_0.45)] md:block"
                  aria-hidden
                />
                <div className="flex flex-wrap justify-center gap-4 pt-3 md:gap-5">
                  {tree.departamentos.map((branch) => (
                    <div key={branch.id} className="flex flex-col items-center">
                      <div className="mb-2 hidden h-3 w-px bg-[rgb(var(--border-strong)_/_0.45)] md:block" aria-hidden />
                      <DepartamentoBranchCard branch={branch} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        <RelationStem label="associa" />

        {/* Base */}
        <section className="flex w-full flex-col items-center gap-4" aria-label="Base associativa">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            Base associativa
          </p>
          <p className="max-w-lg text-center text-xs text-[rgb(var(--foreground-muted))]">
            Sócios e torcedores sem cargo de liderança nem departamento — a base da torcida.
            Quem já aparece acima não se repete aqui.
          </p>
          <BaseTier
            title="Sócios"
            icon={CreditCard}
            people={tree.sociosBase}
            emptyHint="Nenhum sócio apenas na base (todos já estão em cargos/áreas ou não há sócios aprovados)."
          />
          <BaseTier
            title="Torcedores"
            icon={Users}
            people={tree.torcedoresBase}
            emptyHint="Nenhum torcedor apenas na base."
          />
        </section>
      </div>

      <p className="mt-6 text-center text-xs text-[rgb(var(--foreground-muted))]">
        Hierarquia territorial (Sede → Subsede → PDE) fica em{' '}
        <Link href="/admin/sedes" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
          Sedes
        </Link>
        {' '}e na{' '}
        <Link href="/admin/torcida" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
          Visão da torcida
        </Link>
        . Atribuições em{' '}
        <Link href="/admin/acessos?secao=pessoas" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
          Controle de acesso
        </Link>
        .
      </p>
    </div>
  )
}
