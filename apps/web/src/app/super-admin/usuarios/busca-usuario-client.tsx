'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search, UserCheck } from 'lucide-react'
import { Badge, type BadgeVariant } from '@torcida/ui'
import { toast } from '@torcida/ui'
import type { UsuarioBuscaItem } from '@/app/api/super-admin/usuarios/busca/route'
import type { UsuarioDetalhe } from '@/app/api/super-admin/usuarios/[id]/route'
import { ExportarDadosButton } from './exportar-dados-button'

const STATUS_VARIANT: Record<'PENDENTE' | 'APROVADO' | 'REPROVADO', BadgeVariant> = {
  PENDENTE: 'warning',
  APROVADO: 'success',
  REPROVADO: 'danger',
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function BuscaUsuarioClient() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [resultados, setResultados] = useState<UsuarioBuscaItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [selecionado, setSelecionado] = useState<UsuarioDetalhe | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const buscar = useCallback(async (termo: string) => {
    abortRef.current?.abort()
    if (termo.length < 2) {
      setResultados([])
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setCarregando(true)
    try {
      const res = await fetch(`/api/super-admin/usuarios/busca?q=${encodeURIComponent(termo)}`, {
        signal: controller.signal,
      })
      const data = (await res.json()) as { usuarios?: UsuarioBuscaItem[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro na busca')
      setResultados(data.usuarios ?? [])
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      toast.error(e instanceof Error ? e.message : 'Erro na busca')
      setResultados([])
    } finally {
      if (abortRef.current === controller) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void buscar(debounced)
  }, [debounced, buscar])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function selecionar(id: string) {
    setCarregandoDetalhe(true)
    setSelecionado(null)
    try {
      const res = await fetch(`/api/super-admin/usuarios/${id}`)
      const data = (await res.json()) as UsuarioDetalhe & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro ao carregar usuário')
      setSelecionado(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar usuário')
    } finally {
      setCarregandoDetalhe(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por e-mail, nome ou @nickname…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))]"
        />
      </div>

      {carregando && (
        <p className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando…
        </p>
      )}

      {!carregando && debounced.length >= 2 && resultados.length === 0 && (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum usuário encontrado para &quot;{debounced}&quot;.
        </p>
      )}

      {!carregando && resultados.length > 0 && (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          {resultados.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => selecionar(u.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-xs font-bold text-[rgb(var(--color-primary-fg))]">
                  {(u.nome ?? u.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {u.nome ?? 'Sem nome'}
                    {u.nickname ? (
                      <span className="ml-1.5 text-xs text-[rgb(var(--foreground-muted))]">@{u.nickname}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{u.email}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {carregandoDetalhe && (
        <p className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando usuário…
        </p>
      )}

      {selecionado && (
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[rgb(var(--foreground))]">
                <UserCheck className="h-4 w-4" />
                {selecionado.nome ?? 'Sem nome'}
              </h2>
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                {selecionado.email ?? '—'}
                {selecionado.nickname ? ` · @${selecionado.nickname}` : ''}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                Conta criada em {formatarData(selecionado.criadoEm)}
                {selecionado.ultimoAcessoEm
                  ? ` · último acesso em ${formatarData(selecionado.ultimoAcessoEm)}`
                  : ''}
              </p>
            </div>
            <ExportarDadosButton userId={selecionado.id} nome={selecionado.nome} />
          </div>

          <h3 className="mt-5 text-sm font-semibold text-[rgb(var(--foreground))]">
            Vínculos ({selecionado.vinculos.length})
          </h3>
          {selecionado.vinculos.length === 0 ? (
            <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum vínculo em nenhuma torcida.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {selecionado.vinculos.map((v) => (
                <li
                  key={v.tenantId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-[rgb(var(--foreground))]">{v.tenantNome}</span>
                    <span className="ml-1.5 font-mono text-xs text-[rgb(var(--foreground-muted))]">
                      {v.tenantSlug}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {v.cargo ? <Badge variant="info">{v.cargo}</Badge> : null}
                    {v.membroStatus ? (
                      <Badge variant={STATUS_VARIANT[v.membroStatus]}>
                        {v.membroDesligado ? 'Desligado' : v.membroStatus}
                      </Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
