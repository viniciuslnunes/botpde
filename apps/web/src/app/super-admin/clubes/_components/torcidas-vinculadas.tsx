'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { AnimatePresence, m } from 'motion/react'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'
import {
  carregarUnidadesTorcidaAction,
  type UnidadeTorcidaView,
} from '../actions'

export type TorcidaVinculadaView = {
  id: string
  nome: string
  slug: string
  ativo: boolean
  membros: number
  posts: number
  unidadesCount: number
}

const numero = (n: number) => n.toLocaleString('pt-BR')

/**
 * Lista de torcidas-raiz do clube, com disclosure lazy das unidades
 * (Caso A no worktree + portais Caso B).
 */
export function TorcidasVinculadas({ torcidas }: { torcidas: TorcidaVinculadaView[] }) {
  if (torcidas.length === 0) {
    return (
      <p className="mt-4 text-sm text-[rgb(var(--foreground-muted))]">
        Nenhuma torcida usa este clube ainda.
      </p>
    )
  }

  return (
    <ul className="mt-4 divide-y divide-[rgb(var(--border))]">
      {torcidas.map((t) => (
        <TorcidaLinha key={t.id} torcida={t} />
      ))}
    </ul>
  )
}

function TorcidaLinha({ torcida }: { torcida: TorcidaVinculadaView }) {
  const [aberto, setAberto] = useState(false)
  const [unidades, setUnidades] = useState<UnidadeTorcidaView[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function alternar() {
    const proximo = !aberto
    setAberto(proximo)
    if (!proximo || unidades !== null || pending) return

    startTransition(async () => {
      setErro(null)
      const res = await carregarUnidadesTorcidaAction(torcida.id)
      if (!res.ok) {
        setErro(res.erro ?? 'Não foi possível carregar as unidades.')
        return
      }
      setUnidades(res.unidades)
    })
  }

  const temUnidades = torcida.unidadesCount > 0

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={alternar}
          disabled={!temUnidades && !aberto}
          aria-expanded={aberto}
          className={[
            'flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.35)]',
            temUnidades
              ? 'hover:bg-[rgb(var(--background-subtle)_/_0.55)]'
              : 'cursor-default',
          ].join(' ')}
        >
          <ChevronDown
            className={[
              'mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
              aberto ? 'rotate-180' : '',
              !temUnidades ? 'opacity-30' : '',
            ].join(' ')}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
              {torcida.nome}
            </p>
            <p className="font-mono text-[11px] text-[rgb(var(--foreground-muted))]">
              {torcida.slug}
              {temUnidades
                ? ` · ${numero(torcida.unidadesCount)} unidade${torcida.unidadesCount === 1 ? '' : 's'}`
                : null}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3 pl-6 text-xs tabular-nums text-[rgb(var(--foreground-muted))] sm:pl-0">
          <span>
            <span className="font-semibold text-[rgb(var(--foreground))]">
              {numero(torcida.membros)}
            </span>{' '}
            membros
          </span>
          <span>
            <span className="font-semibold text-[rgb(var(--foreground))]">
              {numero(torcida.posts)}
            </span>{' '}
            posts
          </span>
          {!torcida.ativo ? <Badge variant="neutral">Suspensa</Badge> : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {aberto ? (
          <m.div
            key="unidades"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden"
          >
            <div className="ml-6 mt-2 border-l border-[rgb(var(--border))] pl-3">
              {pending && unidades === null ? (
                <p className="flex items-center gap-2 py-2 text-xs text-[rgb(var(--foreground-muted))]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Carregando unidades…
                </p>
              ) : null}
              {erro ? (
                <p className="py-2 text-xs text-[rgb(var(--destructive))]" role="alert">
                  {erro}
                </p>
              ) : null}
              {unidades && unidades.length === 0 ? (
                <p className="py-2 text-xs text-[rgb(var(--foreground-muted))]">
                  Nenhuma unidade cadastrada nesta torcida.
                </p>
              ) : null}
              {unidades && unidades.length > 0 ? (
                <ul className="divide-y divide-[rgb(var(--border)_/_0.6)]">
                  {unidades.map((u) => (
                    <li
                      key={`${u.caso}-${u.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[rgb(var(--foreground))]">
                          <span className="text-[rgb(var(--foreground-muted))]">
                            {u.tipoLabel}
                          </span>{' '}
                          {u.nome}
                        </p>
                        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                          {u.caso === 'B' && u.slug ? (
                            <span className="font-mono">{u.slug}</span>
                          ) : (
                            'Sem portal próprio'
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                        <span>
                          <span className="font-semibold text-[rgb(var(--foreground))]">
                            {numero(u.membros)}
                          </span>{' '}
                          membros
                        </span>
                        {u.caso === 'B' ? (
                          <span>
                            <span className="font-semibold text-[rgb(var(--foreground))]">
                              {numero(u.posts)}
                            </span>{' '}
                            posts
                          </span>
                        ) : (
                          <Badge variant="neutral">Sem portal</Badge>
                        )}
                        {!u.ativo ? <Badge variant="neutral">Inativa</Badge> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}
