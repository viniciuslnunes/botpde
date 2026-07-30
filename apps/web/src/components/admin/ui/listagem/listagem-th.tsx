import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  construirHrefOrdenacao,
  proximaDir,
  type ListagemColunaSpec,
  type ListagemFacetas,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import { montarFiltroUI, type OpcoesDinamicas } from '@/lib/listagem/ui'
import { ListagemColunaFiltro } from './listagem-coluna-filtro'

export interface ListagemThProps {
  spec: ListagemSpec
  params: ListagemParams
  coluna: ListagemColunaSpec
  /** Contagens por opção; ausente = popover sem números. */
  facetas?: ListagemFacetas
  /** Opções de domínio dinâmico (unidades, cargos…) por id de filtro. */
  dinamicas?: OpcoesDinamicas
  /** Params fora do contrato a preservar (aba de status, período de gráfico…). */
  extras?: Record<string, string | undefined>
  className?: string
}

/**
 * Cabeçalho de coluna com ordenação por URL e, quando o spec declara, filtro
 * ancorado na própria coluna. Server component: só as props serializáveis do
 * popover atravessam para o cliente.
 */
export function ListagemTh({
  spec,
  params,
  coluna,
  facetas,
  dinamicas,
  extras,
  className = '',
}: ListagemThProps) {
  const ordenavel = !!coluna.ordenarPor
  const ativo = params.sort === coluna.id
  const Icon = !ativo ? ArrowUpDown : params.dir === 'asc' ? ArrowUp : ArrowDown
  const alinhaDireita = coluna.align === 'right'

  return (
    <th
      className={[
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide',
        alinhaDireita ? 'text-right' : 'text-left',
        className,
      ].join(' ')}
      aria-sort={
        ordenavel && ativo ? (params.dir === 'asc' ? 'ascending' : 'descending') : undefined
      }
    >
      <span
        className={[
          'inline-flex items-center gap-1',
          alinhaDireita ? 'justify-end' : '',
        ].join(' ')}
      >
        {ordenavel ? (
          <Link
            href={construirHrefOrdenacao(
              spec,
              params,
              coluna.id,
              proximaDir(spec, coluna.id, params),
            )}
            title={
              ativo
                ? `Ordenado ${params.dir === 'asc' ? 'crescente' : 'decrescente'} — clique para inverter`
                : `Ordenar por ${coluna.label}`
            }
            className={[
              'inline-flex items-center gap-1 transition-colors',
              ativo
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {coluna.label}
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </Link>
        ) : (
          <span className="text-[rgb(var(--foreground-muted))]">{coluna.label}</span>
        )}

        {coluna.filtro && (
          <ListagemColunaFiltro
            {...montarFiltroUI(
              spec,
              params,
              coluna.filtro,
              facetas,
              dinamicas,
              extras,
            )}
          />
        )}
      </span>
    </th>
  )
}
