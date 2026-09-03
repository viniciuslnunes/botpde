/**
 * Previsão de consumo do bar — regras puras sobre histórico de vendas.
 * Estima unidades por produto para o próximo jogo com base na média dos
 * últimos N jogos com partida vinculada.
 */

/**
 * @typedef {{ produtoId: string, nome: string, mediaUnidades: number, jogosBase: number }} PrevisaoBarItem
 */

/**
 * @param {Array<{ produtoId: string, nome: string, quantidade: number, eventoId: string }>} linhas
 * @param {number} [limiteJogos]
 * @returns {PrevisaoBarItem[]}
 */
export function calcularPrevisaoConsumoBar(linhas, limiteJogos = 3) {
  if (!linhas.length) return []

  /** @type {Map<string, { nome: string, porEvento: Map<string, number> }>} */
  const porProduto = new Map()

  for (const row of linhas) {
    if (!porProduto.has(row.produtoId)) {
      porProduto.set(row.produtoId, { nome: row.nome, porEvento: new Map() })
    }
    const bucket = porProduto.get(row.produtoId)
    if (!bucket) continue
    const prev = bucket.porEvento.get(row.eventoId) ?? 0
    bucket.porEvento.set(row.eventoId, prev + row.quantidade)
  }

  /** @type {PrevisaoBarItem[]} */
  const out = []
  for (const [produtoId, { nome, porEvento }] of porProduto) {
    const totais = [...porEvento.values()].sort((a, b) => b - a).slice(0, limiteJogos)
    if (totais.length === 0) continue
    const media = totais.reduce((s, n) => s + n, 0) / totais.length
    out.push({
      produtoId,
      nome,
      mediaUnidades: Math.ceil(media),
      jogosBase: totais.length,
    })
  }

  out.sort((a, b) => b.mediaUnidades - a.mediaUnidades)
  return out
}

/**
 * Alerta de ruptura: previsão acima do estoque atual.
 *
 * @param {PrevisaoBarItem[]} previsao
 * @param {Array<{ produtoId: string, estoque: number, estoqueMinimo?: number | null }>} estoque
 * @returns {Array<PrevisaoBarItem & { estoque: number, falta: number }>}
 */
export function previsaoBarComRuptura(previsao, estoque) {
  const mapa = new Map(estoque.map((e) => [e.produtoId, e]))
  /** @type {Array<PrevisaoBarItem & { estoque: number, falta: number }>} */
  const out = []
  for (const item of previsao) {
    const row = mapa.get(item.produtoId)
    if (!row) continue
    const est = row.estoque ?? 0
    if (item.mediaUnidades > est) {
      out.push({ ...item, estoque: est, falta: item.mediaUnidades - est })
    }
  }
  return out
}
