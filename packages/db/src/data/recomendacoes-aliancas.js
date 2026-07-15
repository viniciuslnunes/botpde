/**
 * Recomendações de aliança — 1º corte: ~50 torcidas principais + núcleos dos
 * cinco blocos nacionais (`docs/knowledge/aliancas.md`).
 *
 * Fonte de verdade do produto para seed. O markdown continua mantido pelo
 * agente `aliancas-torcidas`.
 *
 * Regras:
 * - Rivais / blocos opostos NUNCA entram.
 * - Mesmo bloco ≠ aliança par a par transitiva: ALTA só com amizade bilateral
 *   amplamente documentada; núcleo de união formal → MEDIA (informativo).
 * - Só ALTA vira CTA automático quando o tenant sugerido existe.
 */

/** @typedef {'ALTA' | 'MEDIA' | 'BAIXA'} ConfiancaRecomendacaoSeed */

/**
 * @typedef {object} TorcidaRef
 * @property {string} slug — slug preferencial do Tenant
 * @property {string} nome — nome canônico
 * @property {string[]} [slugs] — slugs alternativos
 * @property {string[]} [nomes] — nomes alternativos para match
 * @property {string} [bloco] — união / independente (só documentação)
 */

/**
 * Corte principal: âncoras de `torcidas-brasil.js` + núcleo/alianças do mapa
 * Observatório/Trivela/Lance ainda não curadas em TORCIDAS_BRASIL.
 *
 * @type {Record<string, TorcidaRef>}
 */
export const TORCIDAS_PRINCIPAIS = {
  // ── Independentes / bilaterais históricas ───────────────────────────────
  gavioes: {
    slug: 'pde-gavioes-fiel',
    nome: 'Gaviões da Fiel',
    bloco: 'independente',
  },
  remocada: {
    slug: 'torcida-organizada-remista-pa',
    nome: 'Remoçada',
    slugs: ['remocada', 'camisa-33-remo', 'camisa-33', 'torcida-organizada-remista'],
    nomes: ['Remoçada', 'Torcida Organizada Remista', 'Camisa 33', 'Remista', 'Remocada'],
    bloco: 'bilateral',
  },
  furia_jovem_botafogo: {
    slug: 'furia-jovem-botafogo',
    nome: 'Fúria Jovem do Botafogo',
    nomes: ['Furia Jovem do Botafogo'],
    bloco: 'bilateral',
  },
  gavioes_alvinegros: {
    slug: 'torcida-gavioes-alvinegros-sc',
    nome: 'Gaviões Alvinegros',
    slugs: ['gavioes-alvinegros', 'gavioes-alvinegros-figueirense'],
    nomes: ['Gavioes Alvinegros'],
    bloco: 'bilateral',
  },

  // ── União Punho Cruzado (núcleo) ────────────────────────────────────────
  jovem_fla: {
    slug: 'torcida-jovem-flamengo',
    nome: 'Torcida Jovem do Flamengo',
    nomes: ['Torcida Jovem Fla', 'Jovem Fla'],
    bloco: 'punho_cruzado',
  },
  independente: {
    slug: 'tti-sao-paulo',
    nome: 'Torcida Tricolor Independente',
    nomes: ['Torcida Independente', 'Independente'],
    bloco: 'punho_cruzado',
  },
  dragoes_real: {
    slug: 'dragoes-da-real',
    nome: 'Dragões da Real',
    bloco: 'punho_cruzado',
  },
  camisa12_inter: {
    slug: 'camisa-12-inter',
    nome: 'Camisa 12',
    nomes: ['Camisa 12 do Internacional'],
    bloco: 'punho_cruzado',
  },
  mafia_azul: {
    slug: 'mafia-azul',
    nome: 'Máfia Azul',
    nomes: ['Mafia Azul'],
    bloco: 'punho_cruzado',
  },
  jovem_sport: {
    slug: 'torcida-jovem-do-sport-pe',
    nome: 'Torcida Jovem do Sport',
    nomes: ['Jovem do Sport', 'Torcida Jovem do Leão'],
    bloco: 'punho_cruzado',
  },
  pavilhao_independente: {
    slug: 'pavilhao-independente-cruzeiro',
    nome: 'Pavilhão Independente',
    bloco: 'punho_cruzado',
  },

  // ── União Dedo pro Alto (núcleo + âncoras) ──────────────────────────────
  mancha: {
    slug: 'mancha-alviverde',
    nome: 'Mancha Alviverde',
    nomes: ['Mancha Verde', 'Mancha Alvi-Verde'],
    bloco: 'dedo_pro_alto',
  },
  forca_jovem: {
    slug: 'forca-jovem-vasco',
    nome: 'Força Jovem do Vasco',
    nomes: ['Força Jovem', 'Forca Jovem do Vasco'],
    bloco: 'dedo_pro_alto',
  },
  galoucura: {
    slug: 'galoucura',
    nome: 'Galoucura',
    bloco: 'dedo_pro_alto',
  },
  inferno_coral: {
    slug: 'torcida-organizada-inferno-coral-pe',
    nome: 'Inferno Coral',
    slugs: ['inferno-coral', 'inferno-coral-pe'],
    bloco: 'dedo_pro_alto',
  },
  imperio_alviverde: {
    slug: 'imperio-alviverde',
    nome: 'Império Alviverde',
    nomes: ['Imperio Alviverde'],
    bloco: 'dedo_pro_alto',
  },
  mancha_azul_avai: {
    slug: 'torcida-organizada-mancha-azul-sc',
    nome: 'Mancha Azul',
    nomes: ['Mancha Azul do Avaí'],
    bloco: 'dedo_pro_alto',
  },
  bamor: {
    slug: 'torcida-organizada-bamor-ba',
    nome: 'Bamor',
    bloco: 'dedo_pro_alto',
  },
  cearamor: {
    slug: 'torcida-organizada-cearamor-ce',
    nome: 'Cearamor',
    bloco: 'dedo_pro_alto',
  },

  // ── União Punho Colado ──────────────────────────────────────────────────
  young_flu: {
    slug: 'young-flu',
    nome: 'Young Flu',
    bloco: 'punho_colado',
  },
  furia_independente: {
    slug: 'furia-independente-guarani',
    nome: 'Fúria Independente',
    nomes: ['Furia Independente'],
    bloco: 'punho_colado',
  },
  pavilhao_6: {
    slug: 'torcida-organizada-pavilhao-6-pa',
    nome: 'Pavilhão 6',
    nomes: ['Pavilhao 6'],
    bloco: 'punho_colado',
  },

  // ── Lado A / Lado B (NE) + bilaterais documentadas ──────────────────────
  leoes_tuf: {
    slug: 'leoes-da-t-u-f-torcida-uniformizada-do-fortaleza-ce',
    nome: 'Leões da TUF',
    slugs: ['leoes-da-tuf', 'trem-bala-fortaleza'],
    nomes: ['Leões da T.U.F', 'Leoes da TUF', 'Leões da T.u.f (torcida Uniformizada do Fortaleza)'],
    bloco: 'lado_a',
  },
  mancha_azul_csa: {
    slug: 'torcida-organizada-mancha-azul-al',
    nome: 'Mancha Azul',
    nomes: ['Mancha Azul do CSA'],
    bloco: 'lado_a',
  },

  // ── Bilaterais documentadas (Geral / TUP) ───────────────────────────────
  geral_gremio: {
    slug: 'geral-do-gremio',
    nome: 'Geral do Grêmio',
    nomes: ['Geral do Gremio'],
    bloco: 'bilateral',
  },
  tup: {
    slug: 'tup-palmeiras',
    nome: 'TUP — Torcida Uniformizada do Palmeiras',
    nomes: ['TUP', 'Torcida Uniformizada do Palmeiras'],
    bloco: 'bilateral',
  },

  // ── Demais âncoras TORCIDAS_BRASIL (cobertura do corte, poucas arestas) ─
  camisa12_corinthians: { slug: 'camisa-12-corinthians', nome: 'Camisa 12', bloco: 'independente' },
  pavilhao_nove: { slug: 'pavilhao-nove', nome: 'Pavilhão Nove', bloco: 'independente' },
  jovem_santos: { slug: 'torcida-jovem-santos', nome: 'Torcida Jovem do Santos', bloco: 'independente' },
  raca_rubro_negra: { slug: 'raca-rubro-negra', nome: 'Raça Rubro-Negra', bloco: 'independente' },
  forca_flu: { slug: 'forca-flu', nome: 'Força Flu', bloco: 'punho_colado' },
  seita_verde: { slug: 'seita-verde', nome: 'Seita Verde', bloco: 'independente' },
  jovem_gremio: { slug: 'torcida-jovem-gremio', nome: 'Torcida Jovem do Grêmio', bloco: 'dedo_pro_alto' },
  furia_caterva: { slug: 'furia-caterva', nome: 'Fúria Caterva', bloco: 'independente' },
  jovem_avai: { slug: 'torcida-jovem-avai', nome: 'Torcida Jovem do Avaí', bloco: 'independente' },
  jovem_figueirense: { slug: 'torcida-jovem-figueirense', nome: 'Torcida Jovem do Figueirense', bloco: 'independente' },
  inferno_verde: { slug: 'inferno-verde-goias', nome: 'Inferno Verde', bloco: 'independente' },
  falange_grena: { slug: 'falange-grena-caxias', nome: 'Falange Grená', bloco: 'independente' },
  raca_tricolor: { slug: 'raca-tricolor-paulista', nome: 'Raça Tricolor', bloco: 'punho_colado' },

  // ── Expansão ~50: âncoras Dedo / Lado B / GO / PR ───────────────────────
  forca_jovem_goias: {
    slug: 'forca-jovem-goias-go',
    nome: 'Força Jovem Goiás',
    nomes: ['Forca Jovem Goias'],
    bloco: 'dedo_pro_alto',
  },
  terror_tricolor: {
    slug: 'torcida-uniformizada-terror-tricolor-ba',
    nome: 'Terror Tricolor',
    nomes: ['Torcida Uniformizada Terror Tricolor'],
    bloco: 'lado_b',
  },
  faccao_paysandu: {
    slug: 'faccao-jovem-do-paysandu-pa',
    nome: 'Facção Jovem do Paysandu',
    nomes: ['Faccao Jovem do Paysandu', 'Facção Jovem'],
    bloco: 'lado_b',
  },
  tubaroes_fiel: {
    slug: 'tubaroes-da-fiel-ma',
    nome: 'Tubarões da Fiel',
    nomes: ['Tubaroes da Fiel'],
    bloco: 'dedo_pro_alto',
  },
  jovem_galo_treze: {
    slug: 'torcida-jovem-do-galo-pb',
    nome: 'Torcida Jovem do Galo',
    nomes: ['Jovem do Galo'],
    bloco: 'lado_a',
  },
  os_fanaticos: {
    slug: 'torcida-organizada-os-fanaticos-pr',
    nome: 'Os Fanáticos',
    nomes: ['Torcida Organizada Os Fanáticos'],
    bloco: 'independente',
  },
  comando_alvi_rubro: {
    slug: 'comando-alvi-rubro-al',
    nome: 'Comando Alvi-Rubro',
    nomes: ['Comando Alvi Rubro'],
    bloco: 'lado_b',
  },
}

const FONTE_MAPA =
  'Observatório Social do Futebol / Trivela / Lance! — Mapa das alianças (consulta 2026-07-10); docs/knowledge/aliancas.md'

/**
 * Arestas curadas (não-orientadas). Expandidas para as duas direções no export.
 *
 * @type {Array<{
 *   a: keyof typeof TORCIDAS_PRINCIPAIS,
 *   b: keyof typeof TORCIDAS_PRINCIPAIS,
 *   confianca: ConfiancaRecomendacaoSeed,
 *   fonte?: string,
 *   observacao: string,
 * }>}
 */
const ARESTAS = [
  // ── ALTA: amizades bilaterais/triláteras amplamente documentadas ────────
  {
    a: 'gavioes',
    b: 'remocada',
    confianca: 'ALTA',
    fonte:
      'Lance — Como se formam as alianças entre torcidas organizadas; MeuTimão; Peleja (consulta 2026-07-06)',
    observacao:
      'Aliança histórica amplamente citada. Única sugestão automática para Gaviões (independente dos blocos nacionais).',
  },
  {
    a: 'mancha',
    b: 'forca_jovem',
    confianca: 'ALTA',
    fonte: 'Lance! — amizade Mancha↔Força Jovem↔Galoucura desde início dos anos 1980 (consulta 2026-07-10)',
    observacao: 'Núcleo histórico da União Dedo pro Alto. Amizade pública e estável há décadas.',
  },
  {
    a: 'mancha',
    b: 'galoucura',
    confianca: 'ALTA',
    fonte: 'Lance! — trilátero Mancha↔Força Jovem↔Galoucura (consulta 2026-07-10)',
    observacao: 'Núcleo histórico da União Dedo pro Alto.',
  },
  {
    a: 'forca_jovem',
    b: 'galoucura',
    confianca: 'ALTA',
    fonte: 'Lance! — trilátero Mancha↔Força Jovem↔Galoucura (consulta 2026-07-10)',
    observacao: 'Núcleo histórico da União Dedo pro Alto.',
  },

  // ── MEDIA: mesmo núcleo Punho Cruzado (não transitivo além do mapa) ────
  ...paresNucleo(
    ['jovem_fla', 'independente', 'dragoes_real', 'camisa12_inter', 'mafia_azul', 'jovem_sport'],
    'MEDIA',
    'Mesmo núcleo documentado da União Punho Cruzado no mapa nacional — não implica ritual bilateral idêntico; confirme com a liderança.',
  ),
  // (Máfia Azul × Pavilhão Independente = mesmo Cruzeiro → co-irmã dinâmica, não aresta de bloco)

  // ── MEDIA: Dedo pro Alto — Inferno Coral + âncoras com o trilátero ─────
  ...ligarGrupo(
    'inferno_coral',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Inferno Coral no núcleo Dedo pro Alto (mapa Trivela/Lance). Confirme rituais locais antes de propor.',
  ),
  ...ligarGrupo(
    'imperio_alviverde',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Império Alviverde citada no bloco Dedo pro Alto. Confiança média (lista completa do mapa).',
  ),
  ...ligarGrupo(
    'mancha_azul_avai',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Mancha Azul (Avaí) citada no bloco Dedo pro Alto. Atenção a homônimos “Mancha Azul”.',
  ),
  ...ligarGrupo(
    'bamor',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Bamor citada no bloco Dedo pro Alto. Rivalidade local Bahia×Vitória é outro eixo — não misturar.',
  ),
  ...ligarGrupo(
    'cearamor',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Cearamor no Dedo pro Alto / Lado B. Nunca sugerir Leões da TUF (Lado A / clássico cearense).',
  ),
  {
    a: 'jovem_gremio',
    b: 'mancha',
    confianca: 'MEDIA',
    observacao: 'Torcida Jovem do Grêmio citada no bloco Dedo pro Alto (mapa). Confirme com a liderança.',
  },

  // ── MEDIA: Punho Colado ────────────────────────────────────────────────
  {
    a: 'young_flu',
    b: 'furia_independente',
    confianca: 'MEDIA',
    observacao: 'União Punho Colado (mapa Trivela). Confiança média na lista completa.',
  },
  {
    a: 'young_flu',
    b: 'pavilhao_6',
    confianca: 'MEDIA',
    observacao: 'Ambas no Punho Colado. Remoçada (bilateral Gaviões) é outro eixo do Remo — não confundir.',
  },
  {
    a: 'furia_independente',
    b: 'pavilhao_6',
    confianca: 'MEDIA',
    observacao: 'União Punho Colado (mapa).',
  },
  {
    a: 'young_flu',
    b: 'raca_tricolor',
    confianca: 'MEDIA',
    observacao: 'Raça Tricolor (Paulista) citada no Punho Colado.',
  },

  // ── MEDIA: Lado A / bilaterais NE ───────────────────────────────────────
  {
    a: 'remocada',
    b: 'leoes_tuf',
    confianca: 'MEDIA',
    fonte: 'Trivela; Dia e Noite da Bola; DOL — eixos bilaterais Norte/Nordeste (consulta 2026-07-10)',
    observacao: 'Eixo Remoçada ↔ Leões da TUF documentado na região. Confirme antes de proposta automática.',
  },
  {
    a: 'inferno_coral',
    b: 'mancha_azul_csa',
    confianca: 'MEDIA',
    observacao: 'Ambas no Lado A (NE). Nunca sugerir pares Lado A × Lado B.',
  },
  {
    a: 'inferno_coral',
    b: 'leoes_tuf',
    confianca: 'MEDIA',
    observacao: 'Ambas no Lado A (mapa NE).',
  },

  // ── MEDIA: Geral do Grêmio (fora de bloco / multi-amizades) ─────────────
  {
    a: 'geral_gremio',
    b: 'tup',
    confianca: 'MEDIA',
    fonte: 'barrabrava.net / torcedores.com (consulta 2026-07-10)',
    observacao: 'Amizade documentada Geral ↔ TUP. Confiança média (fonte secundária).',
  },
  {
    a: 'geral_gremio',
    b: 'galoucura',
    confianca: 'MEDIA',
    fonte: 'barrabrava.net / torcedores.com (consulta 2026-07-10)',
    observacao: 'Amizade documentada Geral ↔ Galoucura.',
  },
  {
    a: 'geral_gremio',
    b: 'imperio_alviverde',
    confianca: 'MEDIA',
    observacao: 'Amizade citada Geral ↔ Império Alviverde.',
  },
  {
    a: 'geral_gremio',
    b: 'furia_jovem_botafogo',
    confianca: 'MEDIA',
    observacao: 'Amizade citada Geral ↔ Fúria Jovem.',
  },
  {
    a: 'geral_gremio',
    b: 'forca_jovem',
    confianca: 'MEDIA',
    observacao: 'Amizade citada Geral ↔ Força Jovem Vasco.',
  },

  // ── BAIXA / MEDIA: Gaviões (redes sociais) ──────────────────────────────
  {
    a: 'gavioes',
    b: 'furia_jovem_botafogo',
    confianca: 'MEDIA',
    fonte: 'Redes sociais (TikTok/YouTube) — aliancas.md (consulta 2026-07-06)',
    observacao: 'Sem confirmação jornalística sólida. Requer confirmação do Presidente.',
  },
  {
    a: 'gavioes',
    b: 'gavioes_alvinegros',
    confianca: 'BAIXA',
    fonte: 'Redes sociais (TikTok) — aliancas.md (consulta 2026-07-06)',
    observacao: 'Sem fonte jornalística. Não sugerir sem confirmação do Presidente.',
  },

  // ── MEDIA: expansão Dedo / Lado A-B (sem cruzar lados opostos) ──────────
  ...ligarGrupo(
    'forca_jovem_goias',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Força Jovem Goiás citada no bloco Dedo pro Alto e em amizades com Geral do Grêmio.',
  ),
  {
    a: 'geral_gremio',
    b: 'forca_jovem_goias',
    confianca: 'MEDIA',
    observacao: 'Amizade citada Geral ↔ Força Jovem Goiás (fonte secundária).',
  },
  ...ligarGrupo(
    'tubaroes_fiel',
    ['mancha', 'forca_jovem', 'galoucura'],
    'MEDIA',
    'Tubarões da Fiel citada no bloco Dedo pro Alto (mapa).',
  ),
  {
    a: 'cearamor',
    b: 'terror_tricolor',
    confianca: 'MEDIA',
    observacao: 'Ambas no Lado B (NE). Nunca sugerir Lado A (ex.: Leões da TUF, Inferno Coral neste eixo).',
  },
  {
    a: 'cearamor',
    b: 'faccao_paysandu',
    confianca: 'MEDIA',
    fonte: 'Trivela; DOL — eixos Paysandu ↔ Ceará (consulta 2026-07-10)',
    observacao: 'Eixo Lado B documentado. Remoçada é rival estrutural do Paysandu — nunca sugerir cruzado.',
  },
  {
    a: 'terror_tricolor',
    b: 'faccao_paysandu',
    confianca: 'MEDIA',
    observacao: 'Lado B. Não cruzar com Remoçada / Lado A.',
  },
  {
    a: 'cearamor',
    b: 'comando_alvi_rubro',
    confianca: 'MEDIA',
    observacao: 'Comando Alvi-Rubro (CRB) no Lado B.',
  },
  {
    a: 'inferno_coral',
    b: 'jovem_galo_treze',
    confianca: 'MEDIA',
    observacao: 'Ambas no Lado A (mapa NE).',
  },
  {
    a: 'leoes_tuf',
    b: 'jovem_galo_treze',
    confianca: 'MEDIA',
    observacao: 'Lado A. Nunca Cearamor / Lado B.',
  },
]

/**
 * @param {(keyof typeof TORCIDAS_PRINCIPAIS)[]} ids
 * @param {ConfiancaRecomendacaoSeed} confianca
 * @param {string} observacao
 */
function paresNucleo(ids, confianca, observacao) {
  /** @type {typeof ARESTAS} */
  const out = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      out.push({ a: ids[i], b: ids[j], confianca, observacao, fonte: FONTE_MAPA })
    }
  }
  return out
}

/**
 * @param {keyof typeof TORCIDAS_PRINCIPAIS} centro
 * @param {(keyof typeof TORCIDAS_PRINCIPAIS)[]} outros
 * @param {ConfiancaRecomendacaoSeed} confianca
 * @param {string} observacao
 */
function ligarGrupo(centro, outros, confianca, observacao) {
  return outros.map((b) => ({
    a: centro,
    b,
    confianca,
    observacao,
    fonte: FONTE_MAPA,
  }))
}

/**
 * @param {keyof typeof TORCIDAS_PRINCIPAIS} id
 * @returns {{ tenantSlug: string, nomeSugerido: string, slugsSugeridos: string[], nomesAlternativos: string[] }}
 */
function refParaSeed(id) {
  const t = TORCIDAS_PRINCIPAIS[id]
  return {
    tenantSlug: t.slug,
    nomeSugerido: t.nome,
    slugsSugeridos: [t.slug, ...(t.slugs ?? [])],
    nomesAlternativos: t.nomes ?? [],
  }
}

/**
 * @typedef {object} RecomendacaoAliancaSeed
 * @property {string} tenantSlug
 * @property {string} nomeSugerido
 * @property {string[]} [slugsSugeridos]
 * @property {string[]} [nomesAlternativos]
 * @property {ConfiancaRecomendacaoSeed} confianca
 * @property {string} fonte
 * @property {string} [observacao]
 */

/** Expande arestas em recomendações A→B e B→A (idempotente no seed). */
function expandirArestas() {
  /** @type {RecomendacaoAliancaSeed[]} */
  const rows = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const edge of ARESTAS) {
    const left = TORCIDAS_PRINCIPAIS[edge.a]
    const right = TORCIDAS_PRINCIPAIS[edge.b]
    if (!left || !right) {
      throw new Error(`Aresta inválida: ${edge.a} → ${edge.b}`)
    }
    if (edge.a === edge.b) continue

    const fonte = edge.fonte ?? FONTE_MAPA
    const directions = [
      { from: edge.a, to: edge.b },
      { from: edge.b, to: edge.a },
    ]

    for (const { from, to } of directions) {
      const origem = refParaSeed(from)
      const alvo = refParaSeed(to)
      const key = `${origem.tenantSlug}::${alvo.nomeSugerido}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        tenantSlug: origem.tenantSlug,
        nomeSugerido: alvo.nomeSugerido,
        slugsSugeridos: alvo.slugsSugeridos,
        nomesAlternativos: alvo.nomesAlternativos,
        confianca: edge.confianca,
        fonte,
        observacao: edge.observacao,
      })
    }
  }

  return rows
}

/** @type {RecomendacaoAliancaSeed[]} */
export const RECOMENDACOES_ALIANCAS = expandirArestas()

/** Contagem auxiliar para logs / testes offline. */
export function resumoRecomendacoes() {
  const byConf = { ALTA: 0, MEDIA: 0, BAIXA: 0 }
  for (const r of RECOMENDACOES_ALIANCAS) byConf[r.confianca] += 1
  return {
    torcidasNoCorte: Object.keys(TORCIDAS_PRINCIPAIS).length,
    arestas: ARESTAS.length,
    recomendacoes: RECOMENDACOES_ALIANCAS.length,
    porConfianca: byConf,
  }
}
