'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'

interface MembroBusca {
  id: string
  nome: string | null
  avatarUrl: string | null
  tenantNome: string
  perfilPrivado: boolean
  statusSeguimento: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null
  seguidores: number
  podeSeguir: boolean
}

export function BuscaMembrosClient() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [membros, setMembros] = useState<MembroBusca[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const buscar = useCallback(async (termo: string) => {
    if (termo.length < 2) {
      setMembros([])
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/comunidade/membros?q=${encodeURIComponent(termo)}`)
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Erro na busca')
      }
      const data = (await res.json()) as { membros: MembroBusca[] }
      setMembros(data.membros)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na busca')
      setMembros([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    startTransition(() => void buscar(debounced))
  }, [debounced, buscar])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar membros por nome ou bio…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          autoFocus
        />
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando…
        </div>
      )}

      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {erro}
        </p>
      )}

      {!carregando && debounced.length >= 2 && membros.length === 0 && !erro && (
        <p className="py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum membro encontrado para &quot;{debounced}&quot;.
        </p>
      )}

      {debounced.length < 2 && !carregando && (
        <p className="py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Digite ao menos 2 caracteres para buscar.
        </p>
      )}

      <div className="space-y-2">
        {membros.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
          >
            <Link href={`/portal/comunidade/perfil/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar nome={m.nome} avatarUrl={m.avatarUrl} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                  {m.nome ?? 'Membro'}
                </p>
                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                  {m.tenantNome}
                  {m.seguidores > 0 && ` · ${m.seguidores} seguidor${m.seguidores === 1 ? '' : 'es'}`}
                  {m.perfilPrivado && ' · Privado'}
                </p>
              </div>
            </Link>
            {m.podeSeguir && <SeguimentoButtons userId={m.id} status={m.statusSeguimento} />}
          </div>
        ))}
      </div>
    </div>
  )
}
