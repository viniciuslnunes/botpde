/**
 * Frota da caravana — regras puras.
 *
 * A caravana real sai em mais de um ônibus, de mais de um ponto, e cada
 * veículo tem um responsável que fecha a porta sabendo quem está dentro.
 * Antes disso havia uma lotação só (a do evento), o que escondia três coisas
 * que decidem o dia: se a frota comporta os confirmados, quem ainda não tem
 * lugar, e quem responde por cada ônibus.
 *
 * Sem banco: serve à Server Action, ao painel do admin e ao manifesto.
 */

/**
 * @typedef {object} VeiculoLotacao
 * @property {string} id
 * @property {string} identificacao
 * @property {number} capacidade
 * @property {boolean} temResponsavel
 */

/**
 * @typedef {object} AlocacaoPassageiro
 * @property {string} userId
 * @property {string | null} veiculoId
 * @property {boolean} [confirmado] só confirmado ocupa assento
 */

/**
 * Ocupação por veículo + quem ficou de fora. Recusado e lista de espera não
 * ocupam assento: contá-los faria a frota parecer cheia sem estar.
 *
 * @param {readonly VeiculoLotacao[]} veiculos
 * @param {readonly AlocacaoPassageiro[]} alocacoes
 */
export function resumirFrota(veiculos, alocacoes) {
  const porVeiculo = new Map()
  for (const v of veiculos ?? []) {
    porVeiculo.set(v.id, {
      id: v.id,
      identificacao: v.identificacao,
      capacidade: Math.max(0, v.capacidade ?? 0),
      ocupados: 0,
      livres: Math.max(0, v.capacidade ?? 0),
      lotado: false,
      excedido: false,
      temResponsavel: Boolean(v.temResponsavel),
    })
  }

  let semVeiculo = 0
  let alocados = 0

  for (const a of alocacoes ?? []) {
    if (a?.confirmado === false) continue
    const destino = a?.veiculoId ? porVeiculo.get(a.veiculoId) : null
    if (!destino) {
      semVeiculo += 1
      continue
    }
    destino.ocupados += 1
    alocados += 1
  }

  for (const v of porVeiculo.values()) {
    v.livres = v.capacidade - v.ocupados
    v.lotado = v.livres <= 0
    v.excedido = v.livres < 0
  }

  const lista = [...porVeiculo.values()]
  const capacidadeTotal = lista.reduce((soma, v) => soma + v.capacidade, 0)
  const confirmados = alocados + semVeiculo

  return {
    veiculos: lista,
    capacidadeTotal,
    alocados,
    semVeiculo,
    confirmados,
    /** Assentos que faltam para caber todo mundo (0 quando a frota comporta). */
    faltamAssentos: Math.max(0, confirmados - capacidadeTotal),
    semResponsavel: lista.filter((v) => !v.temResponsavel).length,
  }
}

/**
 * Pode alocar mais uma pessoa neste veículo? A capacidade é do ônibus, e
 * estourá-la não é detalhe: é gente em pé na estrada.
 *
 * @param {{ capacidade: number, ocupados: number }} veiculo
 * @param {boolean} [jaEstavaNele] realocação dentro do mesmo veículo
 */
export function podeAlocarNoVeiculo(veiculo, jaEstavaNele = false) {
  if (jaEstavaNele) return { permitido: true, motivo: null }
  const capacidade = Math.max(0, veiculo?.capacidade ?? 0)
  const ocupados = Math.max(0, veiculo?.ocupados ?? 0)
  if (ocupados >= capacidade) {
    return { permitido: false, motivo: 'Veículo lotado' }
  }
  return { permitido: true, motivo: null }
}

/**
 * Pendências da frota, na ordem em que atrapalham a viagem.
 *
 * @param {ReturnType<typeof resumirFrota>} resumo
 * @param {number} horasAteEvento
 */
export function pendenciasFrota(resumo, horasAteEvento) {
  const pendencias = []
  if (!resumo || horasAteEvento < 0) return pendencias

  if (resumo.veiculos.length === 0) {
    if (resumo.confirmados > 0) {
      pendencias.push({
        chave: 'sem-veiculo',
        severidade: 'alta',
        texto: 'Caravana sem veículo cadastrado',
      })
    }
    return pendencias
  }

  if (resumo.faltamAssentos > 0) {
    pendencias.push({
      chave: 'assentos',
      severidade: 'alta',
      texto: `Faltam ${resumo.faltamAssentos} assento(s) para os confirmados`,
    })
  }
  if (resumo.semResponsavel > 0) {
    pendencias.push({
      chave: 'sem-responsavel',
      severidade: 'alta',
      texto: `${resumo.semResponsavel} veículo(s) sem responsável`,
    })
  }
  if (resumo.semVeiculo > 0 && horasAteEvento <= 72) {
    pendencias.push({
      chave: 'sem-lugar',
      severidade: 'media',
      texto: `${resumo.semVeiculo} confirmado(s) ainda sem ônibus`,
    })
  }
  return pendencias
}
