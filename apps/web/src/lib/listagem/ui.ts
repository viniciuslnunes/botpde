import {
  construirHrefFiltro,
  construirHrefListagem,
  paramsDeIntervalo,
  serializarListagemParams,
  type ListagemHrefOverrides,
} from './params'
import {
  PARAMS_RESERVADOS,
  filtrosDoSpec,
  type ListagemFacetas,
  type ListagemFiltroSpec,
  type ListagemFiltroTipo,
  type ListagemParams,
  type ListagemSpec,
} from './spec'

/**
 * Ponte spec → props serializáveis do filtro de coluna.
 *
 * Todo href de opção é montado aqui, no servidor. O componente client só abre o
 * painel e navega: a serialização da URL não é reimplementada no cliente, então
 * não há como as duas versões divergirem.
 */

export interface FiltroOpcaoUI {
  valor: string
  label: string
  count?: number
  href: string
  ativo: boolean
}

export interface CampoOculto {
  nome: string
  valor: string
}

export interface FiltroUI {
  filtroId: string
  label: string
  tipo: ListagemFiltroTipo
  opcoes?: FiltroOpcaoUI[]
  quantidadeAtiva: number
  hrefLimpar: string
  form?: { action: string; ocultos: CampoOculto[] }
  valorTexto?: string
  valorDe?: string
  valorAte?: string
}

/** Opções de domínio dinâmico (ids de sede, cargo…) por filtro. */
export type OpcoesDinamicas = Record<string, { valor: string; label: string }[]>

function alternar(selecionados: string[], valor: string, multiplo: boolean): string[] {
  const ativo = selecionados.includes(valor)
  if (!multiplo) return ativo ? [] : [valor]
  return ativo ? selecionados.filter((v) => v !== valor) : [...selecionados, valor]
}

/**
 * Params a preservar num `<form method="GET">` de filtro. `pagina` fica fora de
 * propósito (filtro novo volta para a primeira página) e o próprio filtro
 * também, porque quem informa o valor dele são os inputs do form.
 */
export function ocultosPreservados(
  spec: ListagemSpec,
  params: ListagemParams,
  exceto: string | null,
  extras?: Record<string, string | undefined>,
): CampoOculto[] {
  const overrides: ListagemHrefOverrides = { pagina: null, extras }
  if (exceto) overrides.filtros = { [exceto]: null }
  const search = serializarListagemParams(spec, params, overrides)
  return [...search.entries()].map(([nome, valor]) => ({ nome, valor }))
}

export function montarFiltroUI(
  spec: ListagemSpec,
  params: ListagemParams,
  filtro: ListagemFiltroSpec,
  facetas: ListagemFacetas = {},
  dinamicas: OpcoesDinamicas = {},
  extras?: Record<string, string | undefined>,
): FiltroUI {
  const selecionados = params.filtros[filtro.id] ?? []
  const base: FiltroUI = {
    filtroId: filtro.id,
    label: filtro.label,
    tipo: filtro.tipo,
    quantidadeAtiva:
      filtro.tipo === 'data'
        ? selecionados.filter((v) => v.length > 0).length
        : selecionados.length,
    hrefLimpar: construirHrefFiltro(spec, params, filtro.id, []),
  }

  if (filtro.tipo === 'enum') {
    const faceta = facetas[filtro.id]
    const fonte: { valor: string; label: string; count?: number }[] =
      faceta && faceta.length > 0
        ? faceta
        : (filtro.opcoes?.map((o) => ({ valor: o.valor, label: o.label })) ??
          dinamicas[filtro.id] ??
          [])

    base.opcoes = fonte.map((opcao) => ({
      valor: opcao.valor,
      label: opcao.label,
      count: opcao.count,
      ativo: selecionados.includes(opcao.valor),
      href: construirHrefFiltro(
        spec,
        params,
        filtro.id,
        alternar(selecionados, opcao.valor, filtro.multiplo ?? false),
      ),
    }))
    return base
  }

  base.form = {
    action: spec.basePath,
    ocultos: ocultosPreservados(spec, params, filtro.id, extras),
  }
  if (filtro.tipo === 'data') {
    base.valorDe = selecionados[0] ?? ''
    base.valorAte = selecionados[1] ?? ''
  } else {
    base.valorTexto = selecionados[0] ?? ''
  }
  return base
}

export interface ChipUI {
  chave: string
  label: string
  valor: string
  href: string
}

/**
 * Chips dos filtros ativos, cada um removendo só o próprio valor. Sem isso o
 * usuário perde de vista por que a lista está curta — e o único caminho de volta
 * é limpar tudo.
 */
export function montarChips(
  spec: ListagemSpec,
  params: ListagemParams,
  facetas: ListagemFacetas = {},
  dinamicas: OpcoesDinamicas = {},
): ChipUI[] {
  const chips: ChipUI[] = []

  for (const filtro of filtrosDoSpec(spec)) {
    const selecionados = params.filtros[filtro.id] ?? []
    if (selecionados.length === 0) continue

    if (filtro.tipo === 'data') {
      const [de, ate] = selecionados
      const rotulo = de && ate ? `${de} a ${ate}` : de ? `desde ${de}` : `até ${ate}`
      chips.push({
        chave: filtro.id,
        label: filtro.label,
        valor: rotulo,
        href: construirHrefFiltro(spec, params, filtro.id, []),
      })
      continue
    }

    for (const valor of selecionados) {
      const rotulo =
        facetas[filtro.id]?.find((f) => f.valor === valor)?.label ??
        filtro.opcoes?.find((o) => o.valor === valor)?.label ??
        dinamicas[filtro.id]?.find((o) => o.valor === valor)?.label ??
        valor
      chips.push({
        chave: `${filtro.id}:${valor}`,
        label: filtro.label,
        valor: rotulo,
        href: construirHrefFiltro(
          spec,
          params,
          filtro.id,
          selecionados.filter((v) => v !== valor),
        ),
      })
    }
  }

  return chips
}

/**
 * Nomes de todos os params que o contrato controla. Base do snapshot persistido:
 * o que não está aqui (aba, seção, período de gráfico) não é da listagem e
 * continua sendo decidido pela URL.
 */
export function paramsDoContrato(spec: ListagemSpec): string[] {
  const nomes = [...PARAMS_RESERVADOS]
  for (const filtro of filtrosDoSpec(spec)) {
    if (filtro.tipo === 'data') {
      const intervalo = paramsDeIntervalo(filtro.id)
      nomes.push(intervalo.de, intervalo.ate)
      continue
    }
    nomes.push(filtro.id)
  }
  return nomes
}

/** Hrefs das opções de itens por página. */
export function montarOpcoesPorPagina(
  spec: ListagemSpec,
  params: ListagemParams,
  opcoes: readonly number[],
): { valor: number; href: string; ativo: boolean }[] {
  return opcoes.map((valor) => ({
    valor,
    ativo: valor === params.porPagina,
    href: construirHrefListagem(spec, params, { porPagina: valor, pagina: 1 }),
  }))
}

export { paramsDeIntervalo }
