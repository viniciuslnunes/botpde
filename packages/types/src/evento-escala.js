/**
 * Escala da operação — quem TRABALHA no evento.
 *
 * `EventoRsvp` responde "quem vai"; a escala responde "quem responde por quê".
 * Motorista, porta do ônibus, bandeirão, caixa do bar e cobertura são postos
 * com nome e dono. Sem isso não existe cobertura, falta nem substituição — e
 * é justamente o que sustenta a leitura de "a torcida está de pé para domingo".
 *
 * Regras puras, sem banco: servem à Server Action, ao painel do admin e ao
 * bloco do portal. Escala é accountability e **não concede permissão** (mesma
 * disciplina de área e projeto).
 */

/** @typedef {'COORDENACAO'|'EMBARQUE'|'CONDUCAO'|'BANDEIRA'|'BATERIA'|'BAR'|'PORTARIA'|'ACOLHIMENTO'|'COBERTURA'|'APOIO'} FuncaoEscala */
/** @typedef {'CONVOCADO'|'ACEITO'|'RECUSADO'|'SUBSTITUIDO'} StatusEscala */

export const FUNCOES_ESCALA = Object.freeze([
  'COORDENACAO',
  'EMBARQUE',
  'CONDUCAO',
  'BANDEIRA',
  'BATERIA',
  'BAR',
  'PORTARIA',
  'ACOLHIMENTO',
  'COBERTURA',
  'APOIO',
])

export const STATUS_ESCALA = Object.freeze([
  'CONVOCADO',
  'ACEITO',
  'RECUSADO',
  'SUBSTITUIDO',
])

/** Rótulo do posto na UI. Texto do dia a dia da torcida, não do banco. */
export const FUNCAO_ESCALA_LABEL = Object.freeze({
  COORDENACAO: 'Coordenação',
  EMBARQUE: 'Embarque',
  CONDUCAO: 'Condução',
  BANDEIRA: 'Bandeira',
  BATERIA: 'Bateria',
  BAR: 'Bar',
  PORTARIA: 'Portaria',
  ACOLHIMENTO: 'Acolhimento',
  COBERTURA: 'Cobertura',
  APOIO: 'Apoio',
})

/** O que a pessoa faz no posto — some na lista, aparece ao escalar. */
export const FUNCAO_ESCALA_DESCRICAO = Object.freeze({
  COORDENACAO: 'Responde pela operação inteira',
  EMBARQUE: 'Porta do ônibus: lista, conferência e contagem',
  CONDUCAO: 'Dirige ou responde pelo veículo',
  BANDEIRA: 'Carrega, monta e guarda bandeirão e faixas',
  BATERIA: 'Ritmista escalado (naipe no detalhe)',
  BAR: 'Caixa e atendimento no dia',
  PORTARIA: 'Porta da sede e controle de acesso',
  ACOLHIMENTO: 'Recebe e acompanha quem chega',
  COBERTURA: 'Foto, vídeo e redes',
  APOIO: 'Posto sem categoria própria',
})

export const STATUS_ESCALA_LABEL = Object.freeze({
  CONVOCADO: 'Aguardando resposta',
  ACEITO: 'Confirmado',
  RECUSADO: 'Recusou',
  SUBSTITUIDO: 'Substituído',
})

/** Status que ainda contam como posto ocupado no cálculo de cobertura. */
export const STATUS_ESCALA_ATIVOS = Object.freeze(['CONVOCADO', 'ACEITO'])

/**
 * Funções sugeridas por tipo de operação. Sugestão de UI, nunca trava: a
 * torcida escala o que precisar (ensaio com cobertura, caravana com bar).
 */
export const FUNCOES_SUGERIDAS_POR_TIPO = Object.freeze({
  CARAVANA: ['COORDENACAO', 'CONDUCAO', 'EMBARQUE', 'BANDEIRA', 'COBERTURA'],
  ENSAIO: ['COORDENACAO', 'BATERIA', 'APOIO'],
  GERAL: ['COORDENACAO', 'PORTARIA', 'BAR', 'ACOLHIMENTO', 'COBERTURA'],
})

/**
 * @param {string} valor
 * @returns {valor is FuncaoEscala}
 */
export function isFuncaoEscala(valor) {
  return FUNCOES_ESCALA.includes(/** @type {FuncaoEscala} */ (valor))
}

/**
 * @param {string} valor
 * @returns {valor is StatusEscala}
 */
export function isStatusEscala(valor) {
  return STATUS_ESCALA.includes(/** @type {StatusEscala} */ (valor))
}

/**
 * Sugestões para o tipo, com o resto do catálogo em seguida — a lista completa
 * continua disponível, só reordenada pelo que aquele tipo costuma precisar.
 * @param {string | null | undefined} tipoEvento
 * @returns {readonly FuncaoEscala[]}
 */
export function funcoesParaTipo(tipoEvento) {
  const sugeridas =
    FUNCOES_SUGERIDAS_POR_TIPO[
      /** @type {keyof typeof FUNCOES_SUGERIDAS_POR_TIPO} */ (tipoEvento ?? 'GERAL')
    ] ?? FUNCOES_SUGERIDAS_POR_TIPO.GERAL
  const resto = FUNCOES_ESCALA.filter((f) => !sugeridas.includes(f))
  return Object.freeze([...sugeridas, ...resto])
}

/**
 * @typedef {object} LinhaEscala
 * @property {FuncaoEscala | string} funcao
 * @property {StatusEscala | string} status
 * @property {Date | string | null} [respondidoEm]
 * @property {Date | string | null} [checkedInAt] presença lida do RSVP
 */

/**
 * @typedef {object} ResumoFuncaoEscala
 * @property {FuncaoEscala | string} funcao
 * @property {number} ocupados postos ativos (convocado + aceito)
 * @property {number} aceitos
 * @property {number} aguardando
 * @property {number} recusados
 * @property {number} presentes check-in registrado
 */

/**
 * Cobertura da operação por posto. Recusado e substituído **não** ocupam vaga:
 * é exatamente o buraco que o gestor precisa enxergar.
 *
 * @param {readonly LinhaEscala[]} linhas
 */
export function resumirEscala(linhas) {
  const porFuncao = new Map()
  let total = 0
  let aceitos = 0
  let aguardando = 0
  let recusados = 0
  let presentes = 0

  for (const linha of linhas ?? []) {
    const funcao = linha?.funcao
    if (!funcao) continue
    const status = linha?.status
    const ativo = STATUS_ESCALA_ATIVOS.includes(/** @type {StatusEscala} */ (status))

    const atual = porFuncao.get(funcao) ?? {
      funcao,
      ocupados: 0,
      aceitos: 0,
      aguardando: 0,
      recusados: 0,
      presentes: 0,
    }

    if (ativo) {
      atual.ocupados += 1
      total += 1
    }
    if (status === 'ACEITO') {
      atual.aceitos += 1
      aceitos += 1
    }
    if (status === 'CONVOCADO') {
      atual.aguardando += 1
      aguardando += 1
    }
    if (status === 'RECUSADO') {
      atual.recusados += 1
      recusados += 1
    }
    if (ativo && linha?.checkedInAt) {
      atual.presentes += 1
      presentes += 1
    }

    porFuncao.set(funcao, atual)
  }

  const funcoes = FUNCOES_ESCALA.filter((f) => porFuncao.has(f)).map((f) => porFuncao.get(f))
  // Função fora do catálogo (dado legado) não pode sumir do resumo.
  for (const [funcao, resumo] of porFuncao) {
    if (!FUNCOES_ESCALA.includes(/** @type {FuncaoEscala} */ (funcao))) funcoes.push(resumo)
  }

  return {
    total,
    aceitos,
    aguardando,
    recusados,
    presentes,
    temCoordenacao: (porFuncao.get('COORDENACAO')?.ocupados ?? 0) > 0,
    funcoes: /** @type {ResumoFuncaoEscala[]} */ (funcoes),
  }
}

/**
 * Pendências da escala, na ordem em que atrapalham o dia.
 *
 * Sem coordenação a operação não tem a quem recorrer — e, como a torcida
 * responde civil e solidariamente pelo que acontece no trajeto e nas
 * imediações (LGE art. 178 §§ 5º e 6º), "ninguém responde por essa" é risco
 * real, não detalhe de processo.
 *
 * @param {object} entrada
 * @param {ReturnType<typeof resumirEscala>} entrada.resumo
 * @param {number} entrada.horasAteEvento
 * @param {number} [entrada.limiteSilencioHoras] silêncio vira pendência a N horas
 */
export function pendenciasEscala({ resumo, horasAteEvento, limiteSilencioHoras = 48 }) {
  const pendencias = []
  if (horasAteEvento < 0) return pendencias

  if (!resumo.temCoordenacao) {
    pendencias.push({
      chave: 'sem-coordenacao',
      severidade: 'alta',
      texto: 'Operação sem responsável na escala',
    })
  }
  if (resumo.total === 0) {
    pendencias.push({
      chave: 'escala-vazia',
      severidade: 'media',
      texto: 'Ninguém escalado para trabalhar',
    })
  }
  if (resumo.aguardando > 0 && horasAteEvento <= limiteSilencioHoras) {
    pendencias.push({
      chave: 'sem-resposta',
      severidade: 'media',
      texto: `${resumo.aguardando} escalado(s) ainda sem resposta`,
    })
  }
  if (resumo.recusados > 0) {
    pendencias.push({
      chave: 'recusas',
      severidade: 'baixa',
      texto: `${resumo.recusados} recusa(s) para cobrir`,
    })
  }
  return pendencias
}
