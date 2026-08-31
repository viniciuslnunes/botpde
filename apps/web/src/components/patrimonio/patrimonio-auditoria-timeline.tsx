import { Archive, History, Trash2 } from 'lucide-react'
import { STATUS_PATRIMONIO_LABEL } from '@torcida/types'
import type { PatrimonioAuditoriaEntrada } from '@/lib/patrimonio-auditoria'

export function PatrimonioAuditoriaTimeline({
  entradas,
  emptyDescription,
}: {
  entradas: PatrimonioAuditoriaEntrada[]
  emptyDescription?: string
}) {
  if (entradas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
        <History className="mx-auto h-8 w-8 text-[rgb(var(--foreground-muted))]" aria-hidden />
        <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">
          Nenhuma baixa ou exclusão registrada
        </p>
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          {emptyDescription ??
            'Quando um item for baixado do inventário ou excluído de vez, quem fez e quando aparece aqui.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Linha do tempo de baixas (item permanece no histórico) e exclusões permanentes —
        quem fez e quando. Somente leitura.
      </p>
      <ol className="space-y-2.5">
        {entradas.map((entrada) => {
          const exclusao = entrada.acao === 'PATRIMONIO_ITEM_EXCLUIDO'
          return (
            <li
              key={entrada.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-3"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={[
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    exclusao
                      ? 'bg-[rgb(var(--color-danger)_/_0.14)] text-[rgb(var(--color-danger-fg))]'
                      : 'bg-[rgb(var(--color-warning)_/_0.14)] text-[rgb(var(--color-warning-fg))]',
                  ].join(' ')}
                >
                  {exclusao ? (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Archive className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                      {entrada.acaoLabel}
                    </p>
                    <time
                      dateTime={entrada.quando.toISOString()}
                      className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]"
                    >
                      {entrada.quandoLabel}
                    </time>
                  </div>
                  <p className="mt-0.5 text-sm text-[rgb(var(--foreground))]">{entrada.nome}</p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    Por {entrada.atorNome}
                    {entrada.atorEmail ? ` · ${entrada.atorEmail}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                    {[
                      entrada.categoriaLabel,
                      entrada.quantidade != null ? `qtd ${entrada.quantidade}` : null,
                      entrada.localizacao,
                      entrada.statusAnterior && exclusao
                        ? `estava ${STATUS_PATRIMONIO_LABEL[entrada.statusAnterior] ?? entrada.statusAnterior}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
