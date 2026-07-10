'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Users, Plus, Loader2, MessageCircle } from 'lucide-react'
import { toast } from '@torcida/ui'
import { criarGrupoPublico, entrarGrupoPublico } from '@/app/portal/comunidade/actions'
import type { GrupoPublicoItem } from '@/lib/feed'

interface GruposClientProps {
  gruposIniciais: GrupoPublicoItem[]
}

export function GruposClient({ gruposIniciais }: GruposClientProps) {
  const [grupos, setGrupos] = useState(gruposIniciais)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pending, startTransition] = useTransition()

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarGrupoPublico(id)
        setGrupos((prev) =>
          prev.map((g) => (g.id === id ? { ...g, souMembro: true, membros: g.membros + 1 } : g)),
        )
        toast.success('Você entrou no grupo!')
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
        const { id } = await criarGrupoPublico(nome.trim(), descricao.trim() || undefined)
        setGrupos((prev) => [
          {
            id,
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            membros: 1,
            souMembro: true,
          },
          ...prev,
        ])
        setCriando(false)
        setNome('')
        setDescricao('')
        toast.success('Grupo criado!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível criar o grupo.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Grupos temáticos abertos da torcida
        </p>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Criar grupo
        </button>
      </div>

      {criando && (
        <form onSubmit={criar} className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
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
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </button>
        </form>
      )}

      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum grupo público ainda. Seja o primeiro a criar!
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[rgb(var(--foreground))]">{g.nome ?? 'Grupo'}</p>
                {g.descricao && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                    {g.descricao}
                  </p>
                )}
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
                  <Users className="h-3.5 w-3.5" />
                  {g.membros} membro{g.membros === 1 ? '' : 's'}
                </span>
              </div>
              {g.souMembro ? (
                <Link
                  href={`/portal/mensagens?conversa=${g.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Abrir
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => entrar(g.id)}
                  className="shrink-0 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Entrar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
