'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Star, UserCheck, UserPlus, X } from 'lucide-react'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import { AdminRowActions } from '@/components/admin/ui'
import {
  adicionarMembroAreaDepartamento,
  buscarCandidatosParaArea,
  definirResponsavelArea,
  listarMembrosArea,
  nomearResponsavelArea,
  type AreaMembroAdmin,
} from '@/app/portal/departamentos/actions'
import { runPersistAction } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'

export type AreaGestaoProps = {
  areaId: string
  areaNome: string
  departamentoId: string
  slug: string
  href: string
  semResponsavel: boolean
  responsaveis: string[]
}

function rotulo(m: { nome: string | null; nickname: string | null }, fallback: string) {
  return m.nome?.trim() || (m.nickname ? `@${m.nickname}` : null) || fallback
}

export function AreaGestaoAcoes(props: AreaGestaoProps) {
  const [aberto, setAberto] = useState(false)
  const router = useRouter()

  return (
    <>
      {props.semResponsavel ? (
        <AppButton
          variant="none"
          icon={UserCheck}
          type="button"
          onClick={() => setAberto(true)}
          aria-label={`Nomear responsável de ${props.areaNome}`}
          className="app-action inline-flex items-center rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2.5 text-xs font-medium text-[rgb(var(--color-warning-fg))] hover:opacity-90"
        >
          Nomear
        </AppButton>
      ) : null}
      <AdminRowActions
        ariaLabel={`Ações de ${props.areaNome}`}
        items={[
          {
            id: 'responsavel',
            label: props.semResponsavel ? 'Nomear responsável' : 'Trocar responsável',
            icon: Star,
            onSelect: () => setAberto(true),
          },
          {
            id: 'abrir',
            label: 'Abrir ficha',
            icon: ExternalLink,
            onSelect: () => {
              router.push(props.href)
            },
          },
        ]}
      />
      {aberto ? (
        <AreaGestaoModal key={props.areaId} {...props} onFechar={() => setAberto(false)} />
      ) : null}
    </>
  )
}

/** @deprecated Use AreaGestaoAcoes fora de tabela. Mantido para linhas `<td>`. */
export function AreaGestaoCelulas(props: AreaGestaoProps) {
  return <AreaGestaoAcoes {...props} />
}

function AreaGestaoModal({
  areaId,
  areaNome,
  departamentoId,
  slug,
  onFechar,
}: AreaGestaoProps & { onFechar: () => void }) {
  const router = useRouter()
  const [membros, setMembros] = useState<AreaMembroAdmin[] | null>(null)
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<
    Array<{ id: string; nome: string | null; email: string; nickname: string | null }>
  >([])
  const [pendingAcao, startAcao] = useTransition()

  async function buscarPessoas(termo: string): Promise<ReactiveSearchOption[]> {
    const rows = await buscarCandidatosParaArea(areaId, departamentoId, termo)
    setResultados(rows)
    return rows.map((c) => ({
      id: c.id,
      label: c.nome?.trim() || c.email,
      sublabel: c.nickname ? `@${c.nickname}` : c.email,
      searchText: [c.nome, c.email, c.nickname].filter(Boolean).join(' '),
      payload: c,
    }))
  }

  const qBusca = q.trim().length >= 2 ? q.trim() : ''
  const candidatos = qBusca ? resultados : []

  useEffect(() => {
    let cancelled = false
    void listarMembrosArea(areaId, departamentoId).then((rows) => {
      if (!cancelled) setMembros(rows)
    })
    return () => {
      cancelled = true
    }
  }, [areaId, departamentoId])

  function recarregar() {
    void listarMembrosArea(areaId, departamentoId).then(setMembros)
    router.refresh()
  }

  function nomear(userId: string, nome: string) {
    startAcao(async () => {
      const fd = new FormData()
      fd.set('areaId', areaId)
      fd.set('departamentoId', departamentoId)
      fd.set('slug', slug)
      fd.set('targetUserId', userId)
      const ok = await runPersistAction(() => nomearResponsavelArea({}, fd), {
        success: `${nome} é responsável de ${areaNome}`,
        successDescription: 'Isso não concede permissão extra — só accountability.',
      })
      if (ok) {
        recarregar()
        onFechar()
      }
    })
  }

  function incluir(userId: string, nome: string) {
    startAcao(async () => {
      const fd = new FormData()
      fd.set('areaId', areaId)
      fd.set('departamentoId', departamentoId)
      fd.set('slug', slug)
      fd.set('targetUserId', userId)
      const ok = await runPersistAction(() => adicionarMembroAreaDepartamento({}, fd), {
        success: `${nome} entrou em ${areaNome}`,
      })
      if (ok) {
        setResultados((prev) => prev.filter((p) => p.id !== userId))
        recarregar()
      }
    })
  }

  function alternarPapel(m: AreaMembroAdmin) {
    const proximo = m.papel === 'RESPONSAVEL' ? 'MEMBRO' : 'RESPONSAVEL'
    startAcao(async () => {
      const fd = new FormData()
      fd.set('areaId', areaId)
      fd.set('departamentoId', departamentoId)
      fd.set('slug', slug)
      fd.set('targetUserId', m.userId)
      fd.set('papel', proximo)
      const ok = await runPersistAction(() => definirResponsavelArea({}, fd), {
        success:
          proximo === 'RESPONSAVEL'
            ? `${rotulo(m, 'Pessoa')} virou responsável`
            : `${rotulo(m, 'Pessoa')} voltou a membro`,
      })
      if (ok) recarregar()
    })
  }

  const busy = pendingAcao

  return (
    <AppModal
      open
      onClose={onFechar}
      size="md"
      labelledBy="area-gestao-titulo"
      busy={busy}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2
            id="area-gestao-titulo"
            className="text-base font-semibold text-[rgb(var(--foreground))]"
          >
            {areaNome}
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Nomeie quem responde por esta frente. A pessoa precisa já estar no departamento.
            Responsável não ganha permissão extra.
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="app-action rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <AppModalBody className="space-y-4 px-4 py-4 sm:px-5">
        {membros === null ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">Carregando equipe…</p>
        ) : membros.length === 0 ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Ninguém nesta área ainda. Busque abaixo quem já está no departamento.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {membros.map((m) => (
              <li key={m.userId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                  {rotulo(m, 'Pessoa')}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => alternarPapel(m)}
                  className={[
                    'app-action inline-flex items-center gap-1 rounded-full px-2 text-[11px] font-medium disabled:opacity-50',
                    m.papel === 'RESPONSAVEL'
                      ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                >
                  <Star
                    className="h-3 w-3"
                    fill={m.papel === 'RESPONSAVEL' ? 'currentColor' : 'none'}
                  />
                  {m.papel === 'RESPONSAVEL' ? 'Responsável' : 'Membro'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <SearchFilterInput
          value={q}
          onChange={(next) => {
            setQ(next)
            if (next.trim().length < 2) setResultados([])
          }}
          placeholder="Buscar quem já está no departamento…"
          ariaLabel="Buscar pessoa do departamento"
          onSearch={buscarPessoas}
          onSelectSuggestion={(item) => setQ(item.label)}
          minChars={2}
          noResultsMessage="Ninguém do departamento — inclua a pessoa em Acessos · Pessoas primeiro."
        />

        {qBusca && candidatos.length === 0 ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Ninguém do departamento para “{qBusca}”. Inclua a pessoa em{' '}
            <a href="/admin/acessos?secao=pessoas" className="underline">
              Acessos · Pessoas
            </a>{' '}
            primeiro.
          </p>
        ) : null}

        {candidatos.length > 0 ? (
          <ul className="divide-y divide-[rgb(var(--border))] rounded-lg border border-[rgb(var(--border))]">
            {candidatos.map((c) => {
              const nome = c.nome?.trim() || c.email
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                    {nome}
                    {c.nickname ? (
                      <span className="ml-1 text-xs text-[rgb(var(--foreground-muted))]">
                        @{c.nickname}
                      </span>
                    ) : null}
                  </span>
                  <AppButton
                    variant="none"
                    icon={UserPlus}
                    type="button"
                    disabled={busy}
                    onClick={() => incluir(c.id, nome)}
                    className="app-action inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
                  >
                    Incluir
                  </AppButton>
                  <AppButton
                    variant="primary"
                    icon={Star}
                    type="button"
                    disabled={busy}
                    onClick={() => nomear(c.id, nome)}
                    className="gap-1 rounded-lg px-2 text-xs font-medium"
                  >
                    Nomear
                  </AppButton>
                </li>
              )
            })}
          </ul>
        ) : null}
      </AppModalBody>
    </AppModal>
  )
}
