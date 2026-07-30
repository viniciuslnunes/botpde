import { z } from 'zod'
import {
  PAGINA_MAX,
  PARAM_BUSCA,
  PARAM_DIR,
  PARAM_PAGINA,
  PARAM_POR_PAGINA,
  PARAM_SORT,
  POR_PAGINA_MAX,
  VALOR_FILTRO_TAMANHO_MAX,
  VALORES_POR_FILTRO_MAX,
  colunasOrdenaveis,
  filtrosDoSpec,
  porPaginaDoSpec,
  type ListagemFiltroSpec,
  type ListagemParams,
  type ListagemSpec,
  type SortDir,
} from './spec'

/** Shape cru de `searchParams` no App Router. */
export type SearchParamsCru = Record<string, string | string[] | undefined>

/** Separador de valores múltiplos na URL (`?status=PENDENTE,APROVADO`). */
const SEPARADOR = ','

function primeiro(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? ''
  return valor ?? ''
}

/**
 * Params vêm da URL, ou seja, do usuário. Toda entrada hostil degrada para o
 * default em vez de estourar — uma listagem não pode dar 500 em `?pagina=abc`.
 */
const paginaSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGINA_MAX)
  .catch(1)

const dirSchema = z.enum(['asc', 'desc'])

function parsePorPagina(cru: string, padrao: number): number {
  const parsed = z.coerce.number().int().min(1).max(POR_PAGINA_MAX).catch(padrao).parse(cru)
  return parsed
}

const buscaSchema = z
  .string()
  .trim()
  .max(VALOR_FILTRO_TAMANHO_MAX)
  .catch('')

/**
 * Valores aceitos num filtro. Ausência de `opcoes` significa domínio dinâmico
 * (ids de sede, de cargo…): aí valida-se forma e cardinalidade, nunca conteúdo
 * livre — e o nome do campo continua vindo do spec, não da URL.
 */
function parseValoresFiltro(
  filtro: ListagemFiltroSpec,
  cru: string,
): string[] {
  if (!cru) return []

  const brutos = cru
    .split(SEPARADOR)
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= VALOR_FILTRO_TAMANHO_MAX)

  const permitidos = filtro.opcoes
    ? brutos.filter(
        (v) => v === filtro.valorNulo || filtro.opcoes!.some((o) => o.valor === v),
      )
    : brutos

  const unicos = [...new Set(permitidos)].slice(0, VALORES_POR_FILTRO_MAX)
  if (filtro.multiplo) return unicos
  return unicos.slice(0, 1)
}

/** Nome dos params de um filtro de data: `?criadoEmDe=&criadoEmAte=`. */
export function paramsDeIntervalo(filtroId: string): { de: string; ate: string } {
  return { de: `${filtroId}De`, ate: `${filtroId}Ate` }
}

const dataIsoSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .catch('')

/**
 * Intervalo em dois params em vez de um valor com vírgula: assim o popover de
 * data continua sendo um `<form method="GET">` que funciona sem JS.
 * Guarda sempre `[de, ate]`, com string vazia no lado aberto.
 */
function parseIntervaloData(cru: SearchParamsCru, filtro: ListagemFiltroSpec): string[] {
  const nomes = paramsDeIntervalo(filtro.id)
  const de = dataIsoSchema.parse(primeiro(cru[nomes.de]))
  const ate = dataIsoSchema.parse(primeiro(cru[nomes.ate]))
  if (!de && !ate) return []
  return [de, ate]
}

/**
 * Traduz `searchParams` no contrato da listagem. `sort` e `dir` saem de
 * allowlist derivada do spec; `porPagina` respeita o teto duro; filtros
 * desconhecidos na URL são descartados em silêncio.
 */
export function parseListagemParams(
  cru: SearchParamsCru,
  spec: ListagemSpec,
): ListagemParams {
  const ordenaveis = colunasOrdenaveis(spec).map((c) => c.id)
  const sortCru = primeiro(cru[PARAM_SORT])
  const sort = ordenaveis.includes(sortCru) ? sortCru : spec.sortPadrao

  const dirCru = primeiro(cru[PARAM_DIR])
  const dirParsed = dirSchema.safeParse(dirCru)
  const dir: SortDir = dirParsed.success
    ? dirParsed.data
    : (spec.colunas.find((c) => c.id === sort)?.dirPadrao ?? spec.dirPadrao)

  const filtros: Record<string, string[]> = {}
  for (const filtro of filtrosDoSpec(spec)) {
    const valores =
      filtro.tipo === 'data'
        ? parseIntervaloData(cru, filtro)
        : parseValoresFiltro(filtro, primeiro(cru[filtro.id]))
    if (valores.length > 0) filtros[filtro.id] = valores
  }

  return {
    pagina: paginaSchema.parse(primeiro(cru[PARAM_PAGINA]) || '1'),
    porPagina: parsePorPagina(primeiro(cru[PARAM_POR_PAGINA]), porPaginaDoSpec(spec)),
    sort,
    dir,
    q: buscaSchema.parse(primeiro(cru[PARAM_BUSCA])),
    filtros,
  }
}

/** Overrides aceitos ao montar um href. `null` remove o param. */
export interface ListagemHrefOverrides {
  pagina?: number | null
  porPagina?: number | null
  sort?: string | null
  dir?: SortDir | null
  q?: string | null
  filtros?: Record<string, string[] | null>
  /** Params fora do contrato a preservar (tab de status, período de gráfico…). */
  extras?: Record<string, string | undefined>
}

/**
 * Monta a query da listagem omitindo tudo que está no default — URL curta,
 * compartilhável e estável para o cache de RSC.
 */
export function serializarListagemParams(
  spec: ListagemSpec,
  params: ListagemParams,
  overrides: ListagemHrefOverrides = {},
): URLSearchParams {
  const search = new URLSearchParams()

  const pagina = overrides.pagina === null ? 1 : (overrides.pagina ?? params.pagina)
  const porPagina =
    overrides.porPagina === null
      ? porPaginaDoSpec(spec)
      : (overrides.porPagina ?? params.porPagina)
  const sort = overrides.sort === null ? spec.sortPadrao : (overrides.sort ?? params.sort)
  const dirBase = overrides.dir === null ? undefined : (overrides.dir ?? params.dir)
  const q = overrides.q === null ? '' : (overrides.q ?? params.q)

  if (q.trim()) search.set(PARAM_BUSCA, q.trim())

  for (const filtro of filtrosDoSpec(spec)) {
    const sobrescrito = overrides.filtros?.[filtro.id]
    const valores =
      sobrescrito === null ? [] : (sobrescrito ?? params.filtros[filtro.id] ?? [])
    if (valores.length === 0) continue

    if (filtro.tipo === 'data') {
      const nomes = paramsDeIntervalo(filtro.id)
      const [de, ate] = valores
      if (de) search.set(nomes.de, de)
      if (ate) search.set(nomes.ate, ate)
      continue
    }
    search.set(filtro.id, valores.join(SEPARADOR))
  }

  const dirDaColuna = spec.colunas.find((c) => c.id === sort)?.dirPadrao ?? spec.dirPadrao
  const dir = dirBase ?? dirDaColuna
  if (!(sort === spec.sortPadrao && dir === dirDaColuna)) {
    search.set(PARAM_SORT, sort)
    search.set(PARAM_DIR, dir)
  }

  if (porPagina !== porPaginaDoSpec(spec)) search.set(PARAM_POR_PAGINA, String(porPagina))
  if (pagina > 1) search.set(PARAM_PAGINA, String(pagina))

  for (const [chave, valor] of Object.entries(overrides.extras ?? {})) {
    if (valor === undefined || valor === '') continue
    search.set(chave, valor)
  }

  return search
}

export function construirHrefListagem(
  spec: ListagemSpec,
  params: ListagemParams,
  overrides: ListagemHrefOverrides = {},
): string {
  const qs = serializarListagemParams(spec, params, overrides).toString()
  return qs ? `${spec.basePath}?${qs}` : spec.basePath
}

/**
 * Href de ordenação por coluna. Sempre volta para a página 1: manter o offset
 * ao reordenar mostra uma fatia arbitrária da nova ordem.
 */
export function construirHrefOrdenacao(
  spec: ListagemSpec,
  params: ListagemParams,
  colunaId: string,
  dir: SortDir,
): string {
  return construirHrefListagem(spec, params, { sort: colunaId, dir, pagina: 1 })
}

/** Href que liga/desliga um valor de filtro — base do popover de coluna. */
export function construirHrefFiltro(
  spec: ListagemSpec,
  params: ListagemParams,
  filtroId: string,
  valores: string[],
): string {
  return construirHrefListagem(spec, params, {
    pagina: 1,
    filtros: { [filtroId]: valores.length > 0 ? valores : null },
  })
}

/** Href com todos os filtros e a busca zerados; ordenação e página tamanho ficam. */
export function construirHrefLimparFiltros(
  spec: ListagemSpec,
  params: ListagemParams,
): string {
  const filtros: Record<string, string[] | null> = {}
  for (const filtro of filtrosDoSpec(spec)) filtros[filtro.id] = null
  return construirHrefListagem(spec, params, { pagina: 1, q: null, filtros })
}
