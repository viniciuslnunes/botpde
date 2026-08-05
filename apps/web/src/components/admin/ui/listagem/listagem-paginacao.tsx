import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import {
  PAGINA_MAX,
  POR_PAGINA_OPCOES,
  construirHrefListagem,
  type ListagemPaginacao as ListagemPaginacaoResumo,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import { montarOpcoesPorPagina } from '@/lib/listagem/ui'

export interface ListagemPaginacaoProps {
  spec: ListagemSpec
  params: ListagemParams
  paginacao: ListagemPaginacaoResumo
  /** Params fora do contrato a preservar nos links. */
  extras?: Record<string, string | undefined>
  /** Esconde o seletor de itens por página (listas curtas por natureza). */
  semTamanhoDePagina?: boolean
}

const BTN =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]'

const BTN_INERTE =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-[rgb(var(--border)_/_0.5)] px-2 text-xs text-[rgb(var(--foreground-muted)_/_0.5)]'

/** Janela de até 5 números centrada na página atual. */
function janelaDePaginas(pagina: number, totalPaginas: number): number[] {
  const tamanho = Math.min(5, totalPaginas)
  let inicio = Math.max(1, pagina - Math.floor(tamanho / 2))
  if (inicio + tamanho - 1 > totalPaginas) inicio = totalPaginas - tamanho + 1
  return Array.from({ length: tamanho }, (_, i) => inicio + i)
}

/**
 * Rodapé de listagem: faixa exibida, total real e navegação.
 *
 * Diferente de `TablePagination`, renderiza mesmo com uma página só — o contador
 * de registros é informação em si, e some justo quando o admin quer confirmar
 * que a lista está completa.
 */
export function ListagemPaginacao({
  spec,
  params,
  paginacao,
  extras,
  semTamanhoDePagina = false,
}: ListagemPaginacaoProps) {
  const { total, pagina, totalPaginas, faixa } = paginacao
  const opcoesPorPagina = montarOpcoesPorPagina(spec, params, POR_PAGINA_OPCOES)

  function href(destino: number): string {
    return construirHrefListagem(spec, params, { pagina: destino, extras })
  }

  return (
    <nav
      aria-label="Paginação da listagem"
      className="mt-4 flex flex-col gap-3 border-t border-[rgb(var(--border))] pt-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[rgb(var(--foreground-muted))]">
        <p aria-live="polite">
          {total === 0 ? (
            'Nenhum registro'
          ) : (
            <>
              Mostrando{' '}
              <span className="font-medium tabular-nums text-[rgb(var(--foreground))]">
                {faixa.de}–{faixa.ate}
              </span>{' '}
              de{' '}
              <span className="font-medium tabular-nums text-[rgb(var(--foreground))]">
                {total}
              </span>{' '}
              {total === 1 ? 'registro' : 'registros'}
            </>
          )}
        </p>
        {!semTamanhoDePagina && total > POR_PAGINA_OPCOES[0] && (
          <span className="flex items-center gap-1">
            <span className="text-xs">Por página:</span>
            {opcoesPorPagina.map((opcao) => (
              <Link
                key={opcao.valor}
                href={opcao.href}
                aria-current={opcao.ativo ? 'true' : undefined}
                className={[
                  // h-8/min-w-8: mesmo alvo de toque dos botões de página — no
                  // mobile o px-1.5 py-0.5 dava 25×20, pequeno demais pro dedo.
                  'inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-xs tabular-nums transition-colors',
                  opcao.ativo
                    ? 'bg-[rgb(var(--color-primary)_/_0.16)] font-semibold text-[rgb(var(--color-primary-fg))]'
                    : 'hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {opcao.valor}
              </Link>
            ))}
          </span>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          {pagina > 1 ? (
            <Link href={href(1)} className={BTN} aria-label="Primeira página">
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className={BTN_INERTE} aria-hidden>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </span>
          )}
          {pagina > 1 ? (
            <Link href={href(pagina - 1)} className={BTN} aria-label="Página anterior">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className={BTN_INERTE} aria-hidden>
              <ChevronLeft className="h-3.5 w-3.5" />
            </span>
          )}

          {janelaDePaginas(pagina, totalPaginas).map((numero) => (
            <Link
              key={numero}
              href={href(numero)}
              aria-label={`Página ${numero}`}
              aria-current={numero === pagina ? 'page' : undefined}
              className={
                numero === pagina
                  ? 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.16)] px-2 text-xs font-semibold tabular-nums text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                  : `${BTN} tabular-nums`
              }
            >
              {numero}
            </Link>
          ))}

          {pagina < totalPaginas ? (
            <Link href={href(pagina + 1)} className={BTN} aria-label="Próxima página">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className={BTN_INERTE} aria-hidden>
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
          {pagina < totalPaginas ? (
            <Link
              href={href(Math.min(totalPaginas, PAGINA_MAX))}
              className={BTN}
              aria-label="Última página"
            >
              <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className={BTN_INERTE} aria-hidden>
              <ChevronsRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      )}

      {totalPaginas > PAGINA_MAX && (
        <p className="text-xs text-[rgb(var(--color-warning-fg,var(--foreground-muted)))]">
          Mais de {PAGINA_MAX} páginas — refine a busca ou os filtros para chegar ao
          registro certo.
        </p>
      )}
    </nav>
  )
}
