'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, UserCheck } from 'lucide-react'
import { Badge, type BadgeVariant } from '@torcida/ui'
import { toast } from '@torcida/ui'
import { useConfirmAction } from '@/lib/confirm-action'
import type { UsuarioBuscaItem } from '@/app/api/super-admin/usuarios/busca/route'
import type {
  UsuarioDetalhe,
  UsuarioVinculo,
} from '@/app/api/super-admin/usuarios/[id]/route'
import { ExportarDadosButton } from './exportar-dados-button'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'

const STATUS_VARIANT: Record<'PENDENTE' | 'APROVADO' | 'REPROVADO', BadgeVariant> = {
  PENDENTE: 'warning',
  APROVADO: 'success',
  REPROVADO: 'danger',
}

/**
 * Espelha `motivoImpedeApagar` (`lib/membros-purge.ts`), que é quem decide de
 * verdade no servidor: só cadastro reprovado ou desligado, nunca espelho da
 * Sede. Aqui é só affordance — esconder o botão evita oferecer uma ação que a
 * rota vai recusar com 409.
 */
function podeApagarVinculo(v: UsuarioVinculo): boolean {
  if (!v.membroId || v.membroEspelhado) return false
  return v.membroStatus === 'REPROVADO' || v.membroDesligado
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function BuscaUsuarioClient({ idInicial }: { idInicial?: string }) {
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState<{ termo: string; itens: UsuarioBuscaItem[] }>({
    termo: '',
    itens: [],
  })
  const [selecionado, setSelecionado] = useState<UsuarioDetalhe | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(() => Boolean(idInicial))
  const [apagandoId, setApagandoId] = useState<string | null>(null)
  const confirmAction = useConfirmAction()
  const abortRef = useRef<AbortController | null>(null)
  const detalhePedidoRef = useRef<string | null>(null)

  const termoBusca = q.trim().length >= 2 ? q.trim() : ''
  const resultados = busca.termo === termoBusca ? busca.itens : []

  async function buscarUsuarios(termo: string): Promise<ReactiveSearchOption[]> {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let itens: UsuarioBuscaItem[] = []
    try {
      const res = await fetch(`/api/super-admin/usuarios/busca?q=${encodeURIComponent(termo)}`, {
        signal: controller.signal,
      })
      const data = (await res.json()) as { usuarios?: UsuarioBuscaItem[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro na busca')
      itens = data.usuarios ?? []
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return []
      toast.error(e instanceof Error ? e.message : 'Erro na busca')
    }
    setBusca({ termo, itens })
    return itens.map((u) => ({
      id: u.id,
      label: u.nome ?? u.email ?? u.nickname ?? 'Usuário',
      sublabel: [u.email, u.nickname ? `@${u.nickname}` : null].filter(Boolean).join(' · '),
      searchText: [u.nome, u.email, u.nickname].filter(Boolean).join(' '),
      payload: u,
    }))
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  const selecionar = useCallback(async (id: string) => {
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
  }, [])

  useEffect(() => {
    if (!idInicial) return
    if (detalhePedidoRef.current === idInicial) return
    detalhePedidoRef.current = idInicial
    void selecionar(idInicial)
  }, [idInicial, selecionar])

  async function apagarCadastro(userId: string, v: UsuarioVinculo) {
    if (!v.membroId) return
    const membroId = v.membroId
    await confirmAction({
      titulo: `Apagar o cadastro em ${v.tenantNome}?`,
      descricao:
        'Remove o cadastro, o espelho na Sede e a carteirinha. A auditoria e um bloqueio, se houver, permanecem. Não dá para desfazer.',
      labelConfirmar: 'Apagar',
      variante: 'destructive',
      cancelled: 'Cadastro mantido.',
      run: async () => {
        setApagandoId(membroId)
        try {
          const res = await fetch(`/api/super-admin/membros/${membroId}`, {
            method: 'DELETE',
          })
          const data = (await res.json()) as { ok?: boolean; error?: string }
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível apagar o cadastro.')
          // Recarrega o detalhe: o vínculo apagado precisa sumir da lista, e o
          // usuário pode continuar com cargo no tenant (linha permanece).
          await selecionar(userId)
        } finally {
          setApagandoId(null)
        }
      },
      success: 'Cadastro apagado.',
    })
  }

  return (
    <div className="space-y-6">
      <SearchFilterInput
        value={q}
        onChange={(next) => {
          setQ(next)
          if (next.trim().length < 2) setBusca({ termo: '', itens: [] })
        }}
        placeholder="Buscar por e-mail, nome ou @nickname…"
        ariaLabel="Buscar usuários"
        onSearch={buscarUsuarios}
        onSelectSuggestion={(item) => void selecionar(item.id)}
        minChars={2}
        noResultsMessage="Nenhum usuário encontrado."
      />

      {termoBusca && resultados.length === 0 && busca.termo === termoBusca ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum usuário encontrado para &quot;{termoBusca}&quot;.
        </p>
      ) : null}

      {resultados.length > 0 ? (
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
      ) : null}

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
                    {podeApagarVinculo(v) && (
                      <button
                        type="button"
                        onClick={() => void apagarCadastro(selecionado.id, v)}
                        disabled={apagandoId === v.membroId}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-danger transition-colors hover:underline disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {apagandoId === v.membroId ? 'Apagando…' : 'Apagar cadastro'}
                      </button>
                    )}
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
