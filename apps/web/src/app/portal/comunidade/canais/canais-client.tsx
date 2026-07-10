'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Radio, Plus, Loader2, Users, Building2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { criarCanalTematico, entrarCanal } from '@/app/portal/comunidade/actions'
import {
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkCanalComunidade,
  linkUnidadeComunidade,
  type CanalItem,
  type UnidadeBuscaItem,
} from '@/lib/canais'

interface CanaisClientProps {
  canais: CanalItem[]
  unidades: UnidadeBuscaItem[]
  podeCriarCanal: boolean
  tenantAtualId: string
}

export function CanaisClient({
  canais,
  unidades,
  podeCriarCanal,
  tenantAtualId,
}: CanaisClientProps) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [visibilidade, setVisibilidade] = useState<'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'>(
    'HIERARQUIA',
  )
  const [pending, startTransition] = useTransition()

  const oficiais = canais.filter((c) => c.canalOficial)
  const tematicos = canais.filter((c) => !c.canalOficial)

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarCanal(id)
        toast.success('Inscrito no canal!')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    startTransition(async () => {
      try {
        const { id } = await criarCanalTematico(nome.trim(), descricao.trim() || undefined, visibilidade)
        toast.success('Canal criado!')
        window.location.href = linkCanalComunidade(id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível criar.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Canais oficiais das unidades e comunidades temáticas
        </p>
        {podeCriarCanal && (
          <button
            type="button"
            onClick={() => setCriando((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Novo canal
          </button>
        )}
      </div>

      {criando && (
        <form
          onSubmit={criar}
          className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            placeholder="Nome do canal temático"
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
          <select
            value={visibilidade}
            onChange={(e) =>
              setVisibilidade(e.target.value as 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO')
            }
            className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
          >
            <option value="TENANT">Só esta torcida</option>
            <option value="HIERARQUIA">Hierarquia (sede/subsede/PDE)</option>
            <option value="ALIADOS">Hierarquia + aliados</option>
            <option value="PUBLICO">Comunidade aberta</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar canal
          </button>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <Building2 className="h-4 w-4" />
          Unidades na hierarquia
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {unidades.map((u) => (
            <Link
              key={u.tenantId}
              href={linkUnidadeComunidade(u.tenantId)}
              className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              {u.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--primary)_/_0.12)] text-sm font-bold text-[rgb(var(--primary))]">
                  {u.nome.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-[rgb(var(--foreground))]">{u.nome}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {labelTipoUnidade(u.tipo)}
                  {u.cidade ? ` · ${u.cidade}` : ''}
                  {u.tenantId === tenantAtualId ? ' · você' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {oficiais.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Radio className="h-4 w-4" />
            Canais oficiais
          </h2>
          <div className="space-y-2">
            {oficiais.map((c) => (
              <CanalCard key={c.id} canal={c} onEntrar={entrar} pending={pending} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Comunidades temáticas</h2>
        {tematicos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum canal temático ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {tematicos.map((c) => (
              <CanalCard key={c.id} canal={c} onEntrar={entrar} pending={pending} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function CanalCard({
  canal,
  onEntrar,
  pending,
}: {
  canal: CanalItem
  onEntrar: (id: string) => void
  pending: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="min-w-0">
        <p className="font-semibold text-[rgb(var(--foreground))]">
          {canal.nome ?? 'Canal'}
          {canal.canalOficial && (
            <span className="ml-2 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--primary))]">
              Oficial
            </span>
          )}
        </p>
        {canal.descricao && (
          <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
            {canal.descricao}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {canal.membros}
          </span>
          <span>{canal.tenantNome}</span>
          <span>{labelVisibilidadeCanal(canal.visibilidadeCanal)}</span>
        </div>
      </div>
      {canal.souMembro ? (
        <Link
          href={canal.canalOficial ? linkUnidadeComunidade(canal.tenantId) : linkCanalComunidade(canal.id)}
          className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
        >
          Abrir
        </Link>
      ) : (
        <button
          type="button"
          disabled={pending || !canal.publica}
          onClick={() => onEntrar(canal.id)}
          className="shrink-0 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Inscrever
        </button>
      )}
    </div>
  )
}
