/**
 * Moderação de conteúdo — taxonomia, gravidade e SLA. Regras **puras**: sem
 * banco, sem sessão. Fonte normativa: `docs/data/politica-de-conteudo.md` §1–§2.
 *
 * Princípio do módulo (ARCHITECTURE §5.33): rotular não é decidir. Aqui só se
 * classifica e se prioriza — quem age é a Server Action com `assertPermission`.
 */

/** @typedef {'S0' | 'S1' | 'S2' | 'S3' | 'S4'} GravidadeViolacao */

/** @type {readonly GravidadeViolacao[]} */
export const GRAVIDADES = Object.freeze(['S0', 'S1', 'S2', 'S3', 'S4'])

/**
 * Taxonomia completa (§2.1–§2.4). `label` é o que o **moderador** lê na fila —
 * curto e em pt-BR; `descricao` é o lembrete do que entra na categoria.
 *
 * @type {Readonly<Record<string, { label: string, gravidade: GravidadeViolacao, descricao: string }>>}
 */
export const CATEGORIAS_VIOLACAO = Object.freeze({
  // ── S4 — crítico: plataforma assume, tenant não encerra ──
  CSAM: Object.freeze({
    label: 'Abuso sexual infantil',
    gravidade: 'S4',
    descricao: 'Imagem, vídeo, texto ou link de abuso ou exploração sexual de menor.',
  }),
  ALICIAMENTO_MENOR: Object.freeze({
    label: 'Aliciamento de menor',
    gravidade: 'S4',
    descricao: 'Adulto buscando contato sexualizado, isolamento ou encontro com menor.',
  }),
  AUTOLESAO: Object.freeze({
    label: 'Suicídio e automutilação',
    gravidade: 'S4',
    descricao: 'Induzimento, instrução, desafio ou incentivo à autolesão.',
  }),
  TERRORISMO: Object.freeze({
    label: 'Terrorismo',
    gravidade: 'S4',
    descricao: 'Apologia, planejamento ou recrutamento.',
  }),
  TRAFICO_PESSOAS: Object.freeze({
    label: 'Tráfico de pessoas',
    gravidade: 'S4',
    descricao: 'Oferta, recrutamento ou exploração de pessoas.',
  }),
  ATO_ANTIDEMOCRATICO: Object.freeze({
    label: 'Ato antidemocrático',
    gravidade: 'S4',
    descricao: 'Conclamação a golpe ou ataque a instituições.',
  }),
  AMEACA_CRIVEL: Object.freeze({
    label: 'Ameaça crível à vida',
    gravidade: 'S4',
    descricao: 'Ameaça específica a pessoa identificável, com meio ou plano.',
  }),
  NCII: Object.freeze({
    label: 'Imagem íntima sem consentimento',
    gravidade: 'S4',
    descricao: 'Nudez sem consentimento, "pornografia de vingança", deepfake sexual.',
  }),

  // ── S3 — grave: bloqueio + fila do tenant + strike ──
  RACISMO: Object.freeze({
    label: 'Racismo e injúria racial',
    gravidade: 'S3',
    descricao: 'Ofensa por raça, cor, etnia ou procedência; código e emoji equivalentes.',
  }),
  ODIO_IDENTIDADE: Object.freeze({
    label: 'Ódio por identidade',
    gravidade: 'S3',
    descricao: 'Homofobia, transfobia, xenofobia, intolerância religiosa, capacitismo, misoginia.',
  }),
  VIOLENCIA_GENERO: Object.freeze({
    label: 'Violência de gênero',
    gravidade: 'S3',
    descricao: 'Ameaça, humilhação ou exposição de mulher em razão do gênero.',
  }),
  INCITACAO_VIOLENCIA: Object.freeze({
    label: 'Incitação a confronto',
    gravidade: 'S3',
    descricao: 'Convocação para briga entre torcidas, marcação de encontro, apologia a agressão.',
  }),
  ARMAS_ARTEFATOS: Object.freeze({
    label: 'Armas e artefatos',
    gravidade: 'S3',
    descricao: 'Oferta, exibição ou instrução de arma, sinalizador ou artefato incendiário.',
  }),
  DOXXING: Object.freeze({
    label: 'Exposição de dados',
    gravidade: 'S3',
    descricao: 'Endereço, telefone, trabalho ou rotina de terceiro; "cartaz" de rival.',
  }),
  ASSEDIO: Object.freeze({
    label: 'Assédio dirigido',
    gravidade: 'S3',
    descricao: 'Campanha coordenada contra pessoa, perseguição, humilhação repetida.',
  }),
  CONTEUDO_SEXUAL: Object.freeze({
    label: 'Conteúdo sexual explícito',
    gravidade: 'S3',
    descricao: 'Nudez e ato sexual explícito — a plataforma não é ambiente adulto.',
  }),
  FACCAO: Object.freeze({
    label: 'Vínculo com facção',
    gravidade: 'S3',
    descricao: 'Apologia, símbolo ou recrutamento de organização criminosa.',
  }),
  DROGAS: Object.freeze({
    label: 'Drogas ilícitas',
    gravidade: 'S3',
    descricao: 'Venda, oferta ou instrução de uso.',
  }),

  // ── S2 — moderado: retenção ou redução de alcance ──
  PROVOCACAO_AGRESSIVA: Object.freeze({
    label: 'Provocação além da linha',
    gravidade: 'S2',
    descricao: 'Rivalidade que descamba em desejo de dano ou deboche com tragédia.',
  }),
  PALAVRAO_PESADO: Object.freeze({
    label: 'Linguagem chula severa',
    gravidade: 'S2',
    descricao: 'Xingamento pesado sem alvo protegido, em superfície pública.',
  }),
  SPAM: Object.freeze({
    label: 'Spam e divulgação',
    gravidade: 'S2',
    descricao: 'Corrente, propaganda externa, repetição, link suspeito.',
  }),
  GOLPE: Object.freeze({
    label: 'Fraude e golpe',
    gravidade: 'S2',
    descricao: 'Rifa falsa, venda inexistente, phishing, cobrança fora do sistema.',
  }),
  DESINFORMACAO_DANOSA: Object.freeze({
    label: 'Desinformação com dano',
    gravidade: 'S2',
    descricao: 'Boato sobre segurança de evento ou informação falsa que pode causar tumulto.',
  }),
  IDENTIDADE_FALSA: Object.freeze({
    label: 'Falsidade de identidade',
    gravidade: 'S2',
    descricao: 'Passar-se por diretoria, por outra torcida ou pelo clube.',
  }),
  VIOLENCIA_GRAFICA: Object.freeze({
    label: 'Violência gráfica',
    gravidade: 'S2',
    descricao: 'Imagem chocante de briga, sangue ou corpo, sem apologia.',
  }),

  // ── S1 — leve: aviso ou contexto ──
  PALAVRAO_LEVE: Object.freeze({
    label: 'Palavrão comum',
    gravidade: 'S1',
    descricao: 'Linguagem informal de arquibancada sem alvo protegido.',
  }),
  OFF_TOPIC: Object.freeze({
    label: 'Fora do escopo',
    gravidade: 'S1',
    descricao: 'Conteúdo alheio ao propósito do canal.',
  }),
  BAIXA_QUALIDADE: Object.freeze({
    label: 'Baixa qualidade',
    gravidade: 'S1',
    descricao: 'Repetição, caixa alta excessiva, flood leve.',
  }),
})

/** @typedef {keyof typeof CATEGORIAS_VIOLACAO} CategoriaViolacao */

/**
 * Gravidade da categoria. Lança em código desconhecido de propósito: categoria
 * inválida virando `S0` silencioso é como uma denúncia S4 some da fila.
 *
 * @param {string} codigo
 * @returns {GravidadeViolacao}
 */
export function gravidadeDaCategoria(codigo) {
  const entrada = CATEGORIAS_VIOLACAO[/** @type {CategoriaViolacao} */ (codigo)]
  if (!entrada) throw new Error(`Categoria de violação desconhecida: ${codigo}`)
  return entrada.gravidade
}

/**
 * SLA de ação por gravidade (§1). `null` = sem prazo (S1 é aviso, S0 não é
 * violação).
 *
 * @type {Readonly<Record<GravidadeViolacao, number | null>>}
 */
export const SLA_HORAS_POR_GRAVIDADE = Object.freeze({
  S4: 2,
  S3: 24,
  S2: 72,
  S1: null,
  S0: null,
})

/**
 * Prazo absoluto de ação a partir de `agora`.
 *
 * @param {GravidadeViolacao} gravidade
 * @param {Date} [agora]
 * @returns {Date | null}
 */
export function prazoSlaDe(gravidade, agora = new Date()) {
  const horas = SLA_HORAS_POR_GRAVIDADE[gravidade]
  if (horas == null) return null
  return new Date(agora.getTime() + horas * 60 * 60 * 1000)
}

/**
 * S4 nunca é decisão do tenant (§4): escala sozinho para a fila da plataforma.
 *
 * @param {GravidadeViolacao} gravidade
 * @returns {boolean}
 */
export function escalaParaPlataforma(gravidade) {
  return gravidade === 'S4'
}

/**
 * O que a **pessoa** escolhe ao denunciar. Subconjunto curto de propósito: as
 * 28 categorias são régua de moderador, não menu de usuário — lista longa
 * empurra para "outro" e destrói o sinal. O complemento livre cobre o resto.
 *
 * @type {readonly { codigo: CategoriaViolacao, label: string }[]}
 */
export const CATEGORIAS_DENUNCIA_UI = Object.freeze([
  Object.freeze({ codigo: 'RACISMO', label: 'Racismo ou injúria racial' }),
  Object.freeze({ codigo: 'ODIO_IDENTIDADE', label: 'Ódio ou intolerância' }),
  Object.freeze({ codigo: 'INCITACAO_VIOLENCIA', label: 'Convocação para briga ou violência' }),
  Object.freeze({ codigo: 'ASSEDIO', label: 'Assédio ou perseguição' }),
  Object.freeze({ codigo: 'CONTEUDO_SEXUAL', label: 'Conteúdo sexual' }),
  Object.freeze({ codigo: 'CSAM', label: 'Conteúdo envolvendo menor de idade' }),
  Object.freeze({ codigo: 'GOLPE', label: 'Golpe ou fraude' }),
  Object.freeze({ codigo: 'SPAM', label: 'Spam ou divulgação' }),
])

/** @type {readonly string[]} */
export const CODIGOS_DENUNCIA_UI = Object.freeze(CATEGORIAS_DENUNCIA_UI.map((c) => c.codigo))

/**
 * @param {string} codigo
 * @returns {boolean}
 */
export function isCategoriaDenunciaUI(codigo) {
  return CODIGOS_DENUNCIA_UI.includes(codigo)
}

/**
 * Rótulo curto da categoria para a fila. Código desconhecido volta como ele
 * mesmo — a fila lê dado gravado no passado e não pode quebrar por isso.
 *
 * @param {string} codigo
 * @returns {string}
 */
export function labelCategoriaViolacao(codigo) {
  return CATEGORIAS_VIOLACAO[/** @type {CategoriaViolacao} */ (codigo)]?.label ?? codigo
}

/** @typedef {{ gravidade: GravidadeViolacao, prazoSla: Date | null, criadoEm: Date }} ItemFilaModeracao */

/**
 * Comparador da fila: **gravidade antes de data** (§2.5 da spec — item vencendo
 * SLA sobe, denúncia antiga leve não trava um S4 novo).
 *
 * 1. gravidade mais alta primeiro;
 * 2. `prazoSla` mais próximo (sem prazo vai por último);
 * 3. `criadoEm` mais antigo.
 *
 * @param {ItemFilaModeracao} a
 * @param {ItemFilaModeracao} b
 * @returns {number}
 */
export function ordenarPorPrioridade(a, b) {
  const pesoA = GRAVIDADES.indexOf(a.gravidade)
  const pesoB = GRAVIDADES.indexOf(b.gravidade)
  if (pesoA !== pesoB) return pesoB - pesoA

  const slaA = a.prazoSla ? new Date(a.prazoSla).getTime() : null
  const slaB = b.prazoSla ? new Date(b.prazoSla).getTime() : null
  if (slaA !== slaB) {
    if (slaA === null) return 1
    if (slaB === null) return -1
    return slaA - slaB
  }

  return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
}

/**
 * SLA estourado. Sem prazo nunca vence.
 *
 * @param {Date | null | undefined} prazoSla
 * @param {Date} [agora]
 * @returns {boolean}
 */
export function slaVencido(prazoSla, agora = new Date()) {
  if (!prazoSla) return false
  return new Date(prazoSla).getTime() < agora.getTime()
}
