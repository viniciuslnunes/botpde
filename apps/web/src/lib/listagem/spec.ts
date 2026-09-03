/**
 * Contrato declarativo de listagem administrativa.
 *
 * Uma listagem descreve suas colunas, filtros e busca UMA vez, num `ListagemSpec`;
 * o parse dos `searchParams`, a montagem do `where`/`orderBy` e a UI (paginação,
 * chips, popover de filtro por coluna) derivam desse spec. É a mesma filosofia de
 * `ADMIN_MODULOS` para as tabs: fonte única, sem `buildHref`/`parseXFiltro`
 * reescritos por página.
 *
 * NÃO se aplica a feeds com cursor (comunidade, rede, canais, mural de grupo,
 * thread de DM): offset desestabiliza a paginação quando há insert constante.
 */

export type SortDir = 'asc' | 'desc'

export type ListagemFiltroTipo = 'enum' | 'texto' | 'data' | 'booleano'

export interface ListagemFiltroOpcao {
  valor: string
  label: string
}

export interface ListagemFiltroSpec {
  /** Chave na URL (`?status=`). */
  id: string
  label: string
  tipo: ListagemFiltroTipo
  /**
   * Campo Prisma alvo. Caminho com ponto atravessa relação (`sede.nome`).
   * Vem SEMPRE do spec (objeto estático) — nunca de `searchParams`.
   */
  campo: string
  /** Opções fixas de enum. Ausente = opções dinâmicas, informadas pela página. */
  opcoes?: readonly ListagemFiltroOpcao[]
  /** Aceita vários valores (`?status=A,B`) → `{ in: [...] }`. */
  multiplo?: boolean
  /** Liga a contagem por opção (`groupBy`). Só para baixa cardinalidade. */
  faceta?: boolean
  /** Valor sentinela que representa "campo nulo" (ex.: `nenhuma` → `sedeId: null`). */
  valorNulo?: string
  /**
   * Cláusula pronta por valor de opção, para o que não cabe em `campo`: relação
   * vazia ("Sem perfil"), combinação de campos, negação. Estática e vinda do
   * spec, nunca da URL — o valor da URL só seleciona uma chave deste mapa.
   *
   * Use `ESCOPO_TENANT` onde o `tenantId` corrente deve entrar:
   * `{ userRoles: { none: { tenantId: ESCOPO_TENANT } } }`. Sem isso, "sem
   * perfil" significaria "sem perfil em torcida nenhuma" e esconderia quem tem
   * cargo em outra torcida.
   */
  clausulas?: Record<string, Record<string, unknown>>
  /**
   * Quando `campo` atravessa `relação.some.campo` (ex.: `user.membros.some.sedeId`),
   * estes predicados entram DENTRO do `some` junto do valor concreto. Use
   * `ESCOPO_TENANT` para não casar membro de outra torcida pelo mesmo `sedeId`.
   */
  escopoSome?: Record<string, unknown>
}

/**
 * Sentinela substituída pelo `tenantId` do escopo ao montar o `where`. Existe
 * para que cláusulas declaradas no spec possam ser escopadas por torcida sem
 * virar função (o que as tornaria opacas aos testes de invariante).
 */
export const ESCOPO_TENANT = '\u0000listagem:tenantId'

export interface ListagemColunaSpec {
  id: string
  label: string
  /** Campo Prisma do `orderBy`. Ausente = coluna não ordenável. */
  ordenarPor?: string
  /** Direção do primeiro clique nesta coluna. */
  dirPadrao?: SortDir
  align?: 'left' | 'right'
  /** Filtro ancorado neste cabeçalho. */
  filtro?: ListagemFiltroSpec
}

export interface ListagemBuscaCampo {
  campo: string
  /**
   * `texto` → `contains` case-insensitive (padrão);
   * `digitos` → `contains` sensível, para telefone/documento/número.
   */
  modo?: 'texto' | 'digitos'
}

/**
 * Como a busca livre (`?q=`) vira cláusula Prisma.
 * - `frase` (padrão): um único `contains` por campo, OR entre campos.
 * - `termos`: divide `q` em palavras; cada termo precisa casar em algum campo
 *   (AND entre termos, OR entre campos) — "pde praia" acha "PDE FIEL PRAIA".
 */
export type ListagemBuscaModo = 'frase' | 'termos'

/** Teto de tokens na busca multi-termo — evita AND patológico vindo da URL. */
export const BUSCA_TERMOS_MAX = 8

export interface ListagemSpec {
  /** Identidade estável — chave do snapshot persistido e dos testes. */
  id: string
  basePath: string
  colunas: readonly ListagemColunaSpec[]
  /** Filtros que não pertencem a uma coluna (ficam na toolbar). */
  filtrosAvulsos?: readonly ListagemFiltroSpec[]
  /** Campos varridos pela busca livre `?q=`. */
  buscaEm?: readonly ListagemBuscaCampo[]
  buscaPlaceholder?: string
  /** Padrão: `frase`. Use `termos` quando o usuário digita palavras soltas. */
  buscaModo?: ListagemBuscaModo
  sortPadrao: string
  dirPadrao: SortDir
  porPaginaPadrao?: number
  /**
   * Campos que a listagem nunca seleciona nem faceta — dados sensíveis (LGE:
   * cpf, rg, comprovante) pertencem ao detalhe, com permissão própria.
   * Travado por teste de invariante.
   */
  camposProibidos?: readonly string[]
  /**
   * Params do contrato que não entram no snapshot (`localStorage`). Abas
   * (`?status=` em Torcedores) e busca/offset já são efêmeros por padrão —
   * use isto quando o filtro aparece na URL mas a entrada pela rota nua deve
   * voltar ao default da página.
   */
  paramsEphemeros?: readonly string[]
}

export interface ListagemParams {
  pagina: number
  porPagina: number
  sort: string
  dir: SortDir
  q: string
  /** Só chaves declaradas no spec, com valores já validados. */
  filtros: Record<string, string[]>
}

export interface ListagemFaceta {
  valor: string
  label: string
  count: number
}

export type ListagemFacetas = Record<string, ListagemFaceta[]>

export interface ListagemPaginacao {
  total: number
  pagina: number
  porPagina: number
  totalPaginas: number
  /** Faixa 1-indexada exibida ("Mostrando 1–25 de 831"). `de` = 0 quando vazio. */
  faixa: { de: number; ate: number }
}

export const POR_PAGINA_OPCOES = [25, 50, 100] as const

export const POR_PAGINA_PADRAO = 25

/** Teto duro: sem ele, `?porPagina=100000` reabre o dump que a paginação fecha. */
export const POR_PAGINA_MAX = 100

/**
 * Teto de página. Offset profundo degrada no Postgres (varre e descarta), então
 * além disso a UI pede refino de filtro em vez de deixar o usuário varrer.
 */
export const PAGINA_MAX = 500

/** Teto de valores por filtro — evita `IN (...)` patológico vindo da URL. */
export const VALORES_POR_FILTRO_MAX = 40

/** Teto de tamanho de um valor de filtro ou termo de busca. */
export const VALOR_FILTRO_TAMANHO_MAX = 120

export const PARAM_PAGINA = 'pagina'
export const PARAM_POR_PAGINA = 'porPagina'
export const PARAM_SORT = 'sort'
export const PARAM_DIR = 'dir'
export const PARAM_BUSCA = 'q'

/** Params reservados pelo contrato — nome de filtro não pode colidir. */
export const PARAMS_RESERVADOS: readonly string[] = [
  PARAM_PAGINA,
  PARAM_POR_PAGINA,
  PARAM_SORT,
  PARAM_DIR,
  PARAM_BUSCA,
]

/** Todos os filtros do spec (de coluna + avulsos), na ordem de declaração. */
export function filtrosDoSpec(spec: ListagemSpec): ListagemFiltroSpec[] {
  const deColuna = spec.colunas
    .map((c) => c.filtro)
    .filter((f): f is ListagemFiltroSpec => !!f)
  return [...deColuna, ...(spec.filtrosAvulsos ?? [])]
}

export function filtroPorId(spec: ListagemSpec, id: string): ListagemFiltroSpec | null {
  return filtrosDoSpec(spec).find((f) => f.id === id) ?? null
}

/** Colunas ordenáveis — allowlist de `?sort=`. */
export function colunasOrdenaveis(spec: ListagemSpec): ListagemColunaSpec[] {
  return spec.colunas.filter((c) => !!c.ordenarPor)
}

export function colunaPorId(spec: ListagemSpec, id: string): ListagemColunaSpec | null {
  return spec.colunas.find((c) => c.id === id) ?? null
}

/** Direção do primeiro clique numa coluna; cai no default do spec. */
export function dirPadraoDaColuna(spec: ListagemSpec, colunaId: string): SortDir {
  return colunaPorId(spec, colunaId)?.dirPadrao ?? spec.dirPadrao
}

/** Próxima direção ao clicar no cabeçalho: coluna nova → default; ativa → inverte. */
export function proximaDir(
  spec: ListagemSpec,
  colunaId: string,
  params: ListagemParams,
): SortDir {
  if (colunaId !== params.sort) return dirPadraoDaColuna(spec, colunaId)
  return params.dir === 'asc' ? 'desc' : 'asc'
}

export function porPaginaDoSpec(spec: ListagemSpec): number {
  const bruto = spec.porPaginaPadrao ?? POR_PAGINA_PADRAO
  return Math.min(bruto, POR_PAGINA_MAX)
}

/** Há filtro ou busca ativos? Distingue "sem registros" de "sem resultados". */
export function temFiltroAtivo(params: ListagemParams): boolean {
  if (params.q.trim().length > 0) return true
  return Object.values(params.filtros).some((v) => v.length > 0)
}
