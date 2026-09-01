import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  PARAM_BUSCA,
  construirHrefLimparFiltros,
  filtroPorId,
  temFiltroAtivo,
  type ListagemFacetas,
  type ListagemPaginacao,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import {
  montarChips,
  montarFiltroUI,
  ocultosPreservados,
  paramsDoContrato,
  type OpcoesDinamicas,
} from '@/lib/listagem/ui'
import { ListagemBusca } from './listagem-busca'
import { ListagemChipFiltro, ListagemColunaFiltro } from './listagem-coluna-filtro'
import { ListagemForm } from './listagem-form'
import { ListagemPersistencia } from './listagem-persistencia'

export interface ListagemToolbarProps {
  spec: ListagemSpec
  params: ListagemParams
  paginacao: ListagemPaginacao
  facetas?: ListagemFacetas
  dinamicas?: OpcoesDinamicas
  extras?: Record<string, string | undefined>
  /** Ações à direita (exportar, criar…). */
  acoes?: ReactNode
  /**
   * Filtros a repetir na barra, com a classe dos breakpoints em que a coluna
   * dona do filtro está escondida (ex.: `{ filtroId: 'sede', classe: 'lg:hidden' }`).
   * Sem isso, filtro de coluna oculta fica inalcançável em telas menores.
   */
  filtrosCompactos?: readonly { filtroId: string; classe?: string }[]
  /**
   * Escopo do snapshot da última visão — use o `tenantId`. Ausente = sem
   * persistência.
   */
  escopoChave?: string
}

/**
 * Barra da listagem: busca livre reativa, total de registros, chips dos filtros
 * ativos e "limpar tudo".
 *
 * Server component — só a busca (debounce) e os chips (pending) hidratam.
 */
export function ListagemToolbar({
  spec,
  params,
  paginacao,
  facetas,
  dinamicas,
  extras,
  acoes,
  escopoChave,
  filtrosCompactos,
}: ListagemToolbarProps) {
  const chips = montarChips(spec, params, facetas, dinamicas)
  const filtrando = temFiltroAtivo(params)
  const ocultos = ocultosPreservados(spec, params, null, extras).filter(
    (campo) => campo.nome !== PARAM_BUSCA,
  )

  const compactos = (filtrosCompactos ?? []).flatMap((item) => {
    const filtro = filtroPorId(spec, item.filtroId)
    if (!filtro) return []
    return [
      {
        classe: item.classe ?? '',
        props: montarFiltroUI(spec, params, filtro, facetas, dinamicas, extras),
      },
    ]
  })

  return (
    <div className="space-y-3">
      {escopoChave && (
        <ListagemPersistencia
          listagemId={spec.id}
          basePath={spec.basePath}
          paramsDoContrato={paramsDoContrato(spec)}
          escopoChave={escopoChave}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {spec.buscaEm && spec.buscaEm.length > 0 && (
          <ListagemForm
            action={spec.basePath}
            ariaLabel={`Buscar em ${spec.id}`}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {ocultos.map((campo) => (
              <input key={campo.nome} type="hidden" name={campo.nome} value={campo.valor} />
            ))}
            <ListagemBusca
              defaultValue={params.q}
              placeholder={spec.buscaPlaceholder ?? 'Buscar…'}
              ariaLabel={spec.buscaPlaceholder ?? 'Buscar na listagem'}
            />
            {/* Submit acessível e fallback sem JS. */}
            <button type="submit" className="sr-only">
              Buscar
            </button>
          </ListagemForm>
        )}

        <p className="shrink-0 text-sm tabular-nums text-[rgb(var(--foreground-muted))]">
          {paginacao.total} {paginacao.total === 1 ? 'registro' : 'registros'}
          {filtrando ? ' filtrados' : ''}
        </p>

        {/* Painel aberto de AdminCreateDisclosure marca data-create-open e
            precisa da linha inteira — senão fica espremido ao lado da busca. */}
        {acoes && (
          <div className="ml-auto shrink-0 has-[[data-create-open]]:w-full has-[[data-create-open]]:basis-full has-[[data-create-open]]:ml-0">
            {acoes}
          </div>
        )}
      </div>

      {compactos.length > 0 && (
        <div
          role="group"
          aria-label="Filtros"
          className="flex flex-wrap items-center gap-1.5"
        >
          {compactos.map(({ classe, props }) => (
            <span key={props.filtroId} className={classe}>
              <ListagemColunaFiltro {...props} variante="barra" />
            </span>
          ))}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <ListagemChipFiltro
              key={chip.chave}
              label={chip.label}
              valor={chip.valor}
              href={chip.href}
            />
          ))}
          <Link
            href={construirHrefLimparFiltros(spec, params)}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))] underline-offset-2 transition-colors hover:text-[rgb(var(--foreground))] hover:underline"
          >
            Limpar tudo
          </Link>
        </div>
      )}
    </div>
  )
}
