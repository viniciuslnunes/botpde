'use client'

import { useDeferredValue, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { Globe, Loader2, Lock, Plus, Search, Users, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { criarGrupo, entrarGrupoPublico, pedirEntradaGrupo } from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import type { GrupoItem } from '@/lib/feed'

type FiltroGrupo = 'TODOS' | 'MEUS' | 'PUBLICOS' | 'PRIVADOS' | 'ENTRAR'
type OrdenacaoGrupo = 'relevancia' | 'membros' | 'nome'
type SecaoGrupo = 'meus' | 'descobrir'

const SECAO_GRUPO_LABEL: Record<SecaoGrupo, string> = {
  meus: 'Meus grupos',
  descobrir: 'Descobrir',
}

interface GruposClientProps {
  gruposIniciais: GrupoItem[]
}

function compararRelevancia(a: GrupoItem, b: GrupoItem): number {
  if (a.souMembro !== b.souMembro) return a.souMembro ? -1 : 1
  if (a.souAdmin !== b.souAdmin) return a.souAdmin ? -1 : 1
  if (a.pedidoPendente !== b.pedidoPendente) return a.pedidoPendente ? -1 : 1
  return b.membros - a.membros
}

export function GruposClient({ gruposIniciais }: GruposClientProps) {
  const [grupos, setGrupos] = useState(gruposIniciais)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [publica, setPublica] = useState(true)
  const [pending, startTransition] = useTransition()

  const [busca, setBusca] = useState('')
  const buscaDeferred = useDeferredValue(busca)
  const [filtro, setFiltro] = useState<FiltroGrupo>('TODOS')
  const [ordenacao, setOrdenacao] = useState<OrdenacaoGrupo>('relevancia')

  const contagens = useMemo(() => {
    const c: Record<FiltroGrupo, number> = {
      TODOS: grupos.length,
      MEUS: 0,
      PUBLICOS: 0,
      PRIVADOS: 0,
      ENTRAR: 0,
    }
    for (const grupo of grupos) {
      if (grupo.souMembro) c.MEUS += 1
      if (grupo.publica) c.PUBLICOS += 1
      else c.PRIVADOS += 1
      if (!grupo.souMembro && !grupo.pedidoPendente) c.ENTRAR += 1
    }
    return c
  }, [grupos])

  const filtrados = useMemo(() => {
    const q = normalizarTexto(buscaDeferred)
    const list = grupos.filter((grupo) => {
      if (filtro === 'MEUS' && !grupo.souMembro) return false
      if (filtro === 'PUBLICOS' && !grupo.publica) return false
      if (filtro === 'PRIVADOS' && grupo.publica) return false
      if (filtro === 'ENTRAR' && (grupo.souMembro || grupo.pedidoPendente)) return false
      if (!q) return true
      return normalizarTexto([grupo.nome, grupo.descricao].filter(Boolean).join(' ')).includes(q)
    })

    return [...list].sort((a, b) => {
      if (ordenacao === 'membros' && a.membros !== b.membros) return b.membros - a.membros
      if (ordenacao === 'nome') return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR')
      return compararRelevancia(a, b)
    })
  }, [grupos, filtro, buscaDeferred, ordenacao])

  const secoes = useMemo(() => {
    const buckets: Record<SecaoGrupo, GrupoItem[]> = { meus: [], descobrir: [] }
    for (const grupo of filtrados) buckets[grupo.souMembro ? 'meus' : 'descobrir'].push(grupo)
    return (['meus', 'descobrir'] as SecaoGrupo[])
      .filter((secao) => buckets[secao].length > 0)
      .map((secao) => ({ secao, grupos: buckets[secao] }))
  }, [filtrados])

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarGrupoPublico(id)
        setGrupos((prev) =>
          prev.map((g) =>
            g.id === id
              ? { ...g, souMembro: true, pedidoPendente: false, membros: g.membros + 1 }
              : g,
          ),
        )
        toast.success('Você entrou no grupo!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedir(id: string) {
    startTransition(async () => {
      try {
        await pedirEntradaGrupo(id)
        setGrupos((prev) =>
          prev.map((g) => (g.id === id ? { ...g, pedidoPendente: true } : g)),
        )
        toast.success('Pedido enviado — aguarde aprovação.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível pedir entrada.')
      }
    })
  }

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    startTransition(async () => {
      try {
        const { id } = await criarGrupo(nome.trim(), descricao.trim() || undefined, publica)
        setGrupos((prev) => [
          {
            id,
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            avatarUrl: null,
            codigoConvite: null,
            somenteAdminPublica: false,
            membros: 1,
            publica,
            souMembro: true,
            pedidoPendente: false,
            souAdmin: true,
            silenciada: false,
          },
          ...prev,
        ])
        setCriando(false)
        setNome('')
        setDescricao('')
        setPublica(true)
        toast.success('Grupo criado!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível criar o grupo.')
      }
    })
  }

  const filtros: Array<{ id: FiltroGrupo; label: string }> = [
    { id: 'TODOS', label: 'Todos' },
    { id: 'MEUS', label: 'Meus' },
    { id: 'PUBLICOS', label: 'Públicos' },
    { id: 'PRIVADOS', label: 'Privados' },
    { id: 'ENTRAR', label: 'Para entrar' },
  ]

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar grupos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou descrição…"
              className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-9 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.35)]"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <m.button
              type="button"
              onClick={() => setCriando((v) => !v)}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[rgb(var(--color-primary))] px-3.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Criar grupo</span>
            </m.button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filtros.map((f) => {
            const ativo = filtro === f.id
            const count = contagens[f.id]
            if (f.id !== 'TODOS' && count === 0) return null
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={ativo}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  ativo
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {f.label}
                <span
                  className={[
                    'tabular-nums',
                    ativo
                      ? 'text-[rgb(var(--color-primary-fg))]'
                      : 'text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            )
          })}

          <label className="ml-auto flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
            <span className="sr-only sm:not-sr-only">Ordenar</span>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as OrdenacaoGrupo)}
              className="h-8 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs font-medium text-[rgb(var(--foreground))]"
            >
              <option value="relevancia">Relevância</option>
              <option value="membros">Mais membros</option>
              <option value="nome">Nome A–Z</option>
            </select>
          </label>
        </div>

        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {filtrados.length === grupos.length
            ? `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}`
            : `${filtrados.length} de ${grupos.length} grupos`}
        </p>
      </div>

      <AnimatePresence>
        {criando && (
          <m.form
            key="criar-grupo"
            onSubmit={criar}
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="card-soft space-y-3 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              placeholder="Nome do grupo"
              required
              className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            />
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Descrição (opcional)"
              className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
            />
            <fieldset className="flex gap-2">
              <legend className="sr-only">Visibilidade</legend>
              <button
                type="button"
                onClick={() => setPublica(true)}
                className={[
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  publica
                    ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                    : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                <Globe className="h-4 w-4" />
                Público
              </button>
              <button
                type="button"
                onClick={() => setPublica(false)}
                className={[
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  !publica
                    ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                    : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                <Lock className="h-4 w-4" />
                Privado
              </button>
            </fieldset>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {publica
                ? 'Qualquer membro da torcida pode entrar na hora.'
                : 'Entrada só após aprovação de um admin do grupo.'}
            </p>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar grupo
            </button>
          </m.form>
        )}
      </AnimatePresence>

      <section className="space-y-4">
        {grupos.length === 0 ? (
          <MotionEmptyState
            className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
            title="Nenhum grupo ainda."
            description="Seja o primeiro a criar!"
          />
        ) : filtrados.length === 0 ? (
          <MotionEmptyState
            className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
            title="Nenhum grupo corresponde aos filtros."
            description="Tente outra busca ou volte para Todos."
          />
        ) : (
          secoes.map(({ secao, grupos: lista }) => (
            <div key={secao} className="space-y-3">
              <h2 className="flex items-center gap-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {SECAO_GRUPO_LABEL[secao]}
                <span className="font-medium normal-case tracking-normal tabular-nums">
                  {lista.length}
                </span>
              </h2>
              <m.ul
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3"
              >
                {lista.map((g) => (
                  <m.li key={g.id} variants={staggerItem} layout className="min-w-0">
                    <GrupoCard
                      grupo={g}
                      onEntrar={entrar}
                      onPedirEntrada={pedir}
                      pending={pending}
                    />
                  </m.li>
                ))}
              </m.ul>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function GrupoCard({
  grupo,
  onEntrar,
  onPedirEntrada,
  pending,
}: {
  grupo: GrupoItem
  onEntrar: (id: string) => void
  onPedirEntrada: (id: string) => void
  pending: boolean
}) {
  const href = `/portal/comunidade/grupos/${grupo.id}`
  const grupoNome = grupo.nome ?? 'Grupo'
  const resumo =
    grupo.descricao?.trim() ||
    (grupo.publica
      ? 'Grupo aberto a qualquer membro da torcida.'
      : 'Grupo privado — entrada mediante aprovação.')

  return (
    <article className="card-soft flex h-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--primary)_/_0.4)] hover:shadow-sm">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Link
            href={href}
            className="flex shrink-0 items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
            aria-label={`Abrir grupo ${grupoNome}`}
          >
            <Avatar nome={grupoNome} avatarUrl={grupo.avatarUrl} size="xl" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  grupo.publica
                    ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                    : 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
                ].join(' ')}
              >
                {grupo.publica ? (
                  <>
                    <Globe className="h-3 w-3" aria-hidden />
                    Público
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" aria-hidden />
                    Privado
                  </>
                )}
              </span>
              {grupo.souAdmin ? (
                <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                  admin
                </span>
              ) : null}
            </div>

            <Link
              href={href}
              className="mt-1.5 line-clamp-2 text-sm font-semibold uppercase leading-snug tracking-wide text-[rgb(var(--foreground))] text-balance hover:underline"
            >
              {grupoNome}
            </Link>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden />
                <span className="tabular-nums">
                  {grupo.membros} {grupo.membros === 1 ? 'membro' : 'membros'}
                </span>
              </span>
              {!grupo.publica ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" aria-hidden />
                  Pedido
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))] text-pretty">
          {resumo}
        </p>

        <div className="mt-auto">
          {grupo.souMembro ? (
            <Link
              href={href}
              className="inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
            >
              Abrir grupo
            </Link>
          ) : grupo.pedidoPendente ? (
            <span className="inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Pedido enviado
            </span>
          ) : grupo.publica ? (
            <m.button
              type="button"
              disabled={pending}
              onClick={() => onEntrar(grupo.id)}
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
            >
              Entrar
            </m.button>
          ) : (
            <m.button
              type="button"
              disabled={pending}
              onClick={() => onPedirEntrada(grupo.id)}
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
              className="inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
            >
              Solicitar
            </m.button>
          )}
        </div>
      </div>
    </article>
  )
}
