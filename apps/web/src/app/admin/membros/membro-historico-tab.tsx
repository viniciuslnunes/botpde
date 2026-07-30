'use client'

import { useEffect, useState } from 'react'
import { History, Loader2, ShieldCheck, User, Wrench } from 'lucide-react'
import { listarHistoricoMembro, type MembroHistoricoEntrada } from './historico-actions'

const ATOR_VISUAL = {
  admin: {
    icone: ShieldCheck,
    label: 'Administração',
    classe: 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
  },
  solicitante: {
    icone: User,
    label: 'O próprio associado',
    classe: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  sistema: {
    icone: Wrench,
    label: 'Sistema',
    classe: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  },
} as const

export function TabHistorico({ membroId }: { membroId: string }) {
  const [entradas, setEntradas] = useState<MembroHistoricoEntrada[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Montado com `key={membroId}` — não precisa limpar estado ao trocar de
  // membro, o componente remonta.
  useEffect(() => {
    let ativo = true
    listarHistoricoMembro(membroId)
      .then((r) => {
        if (!ativo) return
        if (r.ok) setEntradas(r.entradas)
        else setErro(r.error)
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar o histórico.')
      })
    return () => {
      ativo = false
    }
  }, [membroId])

  if (erro) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
        <p className="text-sm font-medium text-[rgb(var(--foreground))]">{erro}</p>
      </div>
    )
  }

  if (entradas === null) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[rgb(var(--foreground-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando histórico…
      </div>
    )
  }

  if (entradas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
        <History className="mx-auto h-8 w-8 text-[rgb(var(--foreground-muted))]" />
        <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">
          Nenhuma alteração registrada
        </p>
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          Aprovações, reprovações, edições de cadastro e reenvios aparecem aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Registro de auditoria deste cadastro — ações da administração da torcida e do
        próprio associado. Somente leitura.
      </p>
      <ol className="space-y-2.5">
        {entradas.map((entrada) => {
          const visual = ATOR_VISUAL[entrada.atorTipo]
          const Icone = visual.icone
          return (
            <li
              key={entrada.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-3"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${visual.classe}`}
                >
                  <Icone className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                      {entrada.acaoLabel}
                    </p>
                    <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
                      {entrada.quandoLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    {entrada.atorNome}
                    {entrada.atorEmail ? ` · ${entrada.atorEmail}` : ''} · {visual.label}
                  </p>
                  {entrada.detalhes.length > 0 && (
                    <dl className="mt-2 space-y-1 border-t border-[rgb(var(--border))] pt-2">
                      {entrada.detalhes.map((d, i) => (
                        <div key={`${entrada.id}-${i}`} className="flex flex-wrap gap-x-2">
                          <dt className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
                            {d.label}:
                          </dt>
                          <dd className="min-w-0 break-words text-xs text-[rgb(var(--foreground))]">
                            {d.valor}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
