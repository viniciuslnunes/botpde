/**
 * Contrato de listagem administrativa — paginação, ordenação e filtros por
 * coluna a partir de um `ListagemSpec` único por módulo.
 *
 * `query.ts` fica FORA deste barril de propósito: é `'server-only'` e importá-lo
 * de um componente client quebraria o build. Server components importam
 * `@/lib/listagem/query` explicitamente.
 */
export {
  BUSCA_TERMOS_MAX,
  ESCOPO_TENANT,
  POR_PAGINA_OPCOES,
  POR_PAGINA_PADRAO,
  POR_PAGINA_MAX,
  PAGINA_MAX,
  VALORES_POR_FILTRO_MAX,
  VALOR_FILTRO_TAMANHO_MAX,
  PARAM_PAGINA,
  PARAM_POR_PAGINA,
  PARAM_SORT,
  PARAM_DIR,
  PARAM_BUSCA,
  PARAMS_RESERVADOS,
  filtrosDoSpec,
  filtroPorId,
  colunasOrdenaveis,
  colunaPorId,
  dirPadraoDaColuna,
  proximaDir,
  porPaginaDoSpec,
  temFiltroAtivo,
  type SortDir,
  type ListagemFiltroTipo,
  type ListagemFiltroOpcao,
  type ListagemFiltroSpec,
  type ListagemColunaSpec,
  type ListagemBuscaCampo,
  type ListagemBuscaModo,
  type ListagemSpec,
  type ListagemParams,
  type ListagemFaceta,
  type ListagemFacetas,
  type ListagemPaginacao,
} from './spec'

export {
  parseListagemParams,
  serializarListagemParams,
  construirHrefListagem,
  construirHrefOrdenacao,
  construirHrefFiltro,
  construirHrefLimparFiltros,
  type SearchParamsCru,
  type ListagemHrefOverrides,
} from './params'

export {
  serializarQueryFormListagem,
  snapshotContratoListagem,
  aplicarSnapshotListagem,
  urlTemParamContrato,
} from './form-query'
