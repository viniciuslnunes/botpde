/**
 * Widgets oficiais Sofascore (iframe embeds) contextualizados pelo clube (`Afiliacao.slug`)
 * ou pela divisão nacional (`Afiliacao.serie` → catálogo `SOFASCORE_COMPETICOES`).
 * Regras puras, testáveis sem dependência de Prisma/Next.
 *
 * Only official Sofascore iframe embeds — nunca scraping nem endpoint não documentado.
 */

export const WIDGET_TIPOS = ['fixtures', 'standings', 'topPlayers', 'powerRankings', 'player', 'cupTree']

export const WIDGET_CONTEXTOS = ['home', 'clube', 'campeonato', 'jogador', 'artigo', 'classificacao']

/** Séries do Brasileirão com tabela Sofascore nacional. */
export const SERIES_NACIONAIS = ['A', 'B', 'C', 'D']

/**
 * @typedef {Object} SofascoreWidgetConfig
 * @property {string} id identificador único do cadastro
 * @property {'fixtures'|'standings'|'topPlayers'|'powerRankings'|'player'|'cupTree'} tipo um de WIDGET_TIPOS
 * @property {string} titulo label exibido no heading do card
 * @property {string} afiliacaoSlug clube dono do widget (`Afiliacao.slug`) — obrigatório
 * @property {string} [competicaoSlug] competição específica (opcional)
 * @property {string} [jogadorId] jogador específico (opcional)
 * @property {('home'|'clube'|'campeonato'|'jogador'|'artigo'|'classificacao')[]} contextos onde esse widget pode aparecer
 * @property {number} prioridade menor = mais relevante
 * @property {boolean} ativo
 * @property {string} embedSrc URL do iframe oficial gerado pela Sofascore
 * @property {number} [alturaPx] altura do iframe em px (o embed oficial define uma altura própria por widget; usar o valor do snippet gerado, ex. `style="height:1123px"`)
 * @property {string} [creditoUrl] link de atribuição incluído no embed oficial (obrigatório mantê-lo — parte dos termos da Sofascore)
 * @property {string} [creditoTexto] texto de atribuição do embed oficial (ex. "Classificação fornecida por"), exibido junto ao `creditoUrl`
 */

/**
 * @typedef {Object} SofascoreCompeticaoConfig
 * @property {string} id
 * @property {'A'|'B'|'C'|'D'} serie
 * @property {string} competicaoSlug
 * @property {string} titulo
 * @property {boolean} ativo
 * @property {string} embedSrc
 * @property {number} [alturaPx]
 * @property {string} [creditoUrl]
 * @property {string} [creditoTexto]
 */

// ⚠️ CADASTRO DE EMBEDS OFICIAIS: gere a URL em https://widgets.sofascore.com
// (painel oficial da Sofascore, escolhendo o time/competição/jogador desejado)
// e cole em `embedSrc`. Nunca construir a URL manualmente a partir de IDs —
// só usar o HTML/URL de embed que a Sofascore gera oficialmente.
/** @type {SofascoreWidgetConfig[]} */
export const SOFASCORE_WIDGETS = [
  // Exemplo de cadastro (troque afiliacaoSlug e embedSrc pelos reais antes de ativar):
  // {
  //   id: 'exemplo-fixtures-clube-x',
  //   tipo: 'fixtures',
  //   titulo: 'Próximos jogos',
  //   afiliacaoSlug: 'clube-x',
  //   contextos: ['home', 'clube'],
  //   prioridade: 1,
  //   ativo: false,
  //   embedSrc: 'https://widgets.sofascore.com/embed/COLE_AQUI_A_URL_OFICIAL',
  // },

  // Corinthians (Afiliacao.slug = 'sport-club-corinthians-paulista-sp').
  // Fixtures e top players ficam `ativo: false` até embeds reais.
  // Classificação nacional: ver SOFASCORE_COMPETICOES (Série A) — não repetir
  // standings por clube.
  {
    id: 'corinthians-sp-fixtures',
    tipo: 'fixtures',
    titulo: 'Próximos jogos',
    afiliacaoSlug: 'sport-club-corinthians-paulista-sp',
    contextos: ['home', 'clube'],
    prioridade: 1,
    ativo: false,
    embedSrc: 'https://widgets.sofascore.com/embed/COLE_AQUI_A_URL_OFICIAL_FIXTURES_CORINTHIANS',
  },
  {
    id: 'corinthians-sp-top-players',
    tipo: 'topPlayers',
    titulo: 'Destaques do elenco',
    afiliacaoSlug: 'sport-club-corinthians-paulista-sp',
    contextos: ['clube', 'artigo'],
    prioridade: 3,
    ativo: false,
    embedSrc: 'https://widgets.sofascore.com/embed/COLE_AQUI_A_URL_OFICIAL_TOPPLAYERS_CORINTHIANS',
  },
]

/**
 * Tabelas nacionais por divisão (`Afiliacao.serie`).
 * Embeds oficiais do padrão Sofascore widgets (mesmo formato do painel),
 * validados com HTTP 200 em widgets.sofascore.com.
 *
 * Temporada 2026:
 * - A: tournament 83 / season 87678 (unique 325)
 * - B: tournament 1449 / season 89840 (unique 390)
 * - C: tournament 27213 / season 90642 (unique 1281)
 * - D: tournament 59487 / season 92447 (unique 10326) — fase de grupos (A1);
 *   a Série D não tem tabela única de 96 times no widget Sofascore.
 *
 * @type {SofascoreCompeticaoConfig[]}
 */
export const SOFASCORE_COMPETICOES = [
  {
    id: 'brasileirao-serie-a-2026',
    serie: 'A',
    competicaoSlug: 'brasileirao-serie-a-2026',
    titulo: 'Brasileirão Série A 2026',
    ativo: true,
    embedSrc:
      'https://widgets.sofascore.com/pt-BR/embed/tournament/83/season/87678/standings/Brasileiro%20Serie%20A%202026?widgetTitle=Brasileiro%20Serie%20A%202026&showCompetitionLogo=true',
    alturaPx: 1123,
    creditoUrl: 'https://www.sofascore.com/pt/football/tournament/brazil/brasileirao-serie-a/325#id:87678',
    creditoTexto: 'Classificação fornecida por',
  },
  {
    id: 'brasileirao-serie-b-2026',
    serie: 'B',
    competicaoSlug: 'brasileirao-serie-b-2026',
    titulo: 'Brasileirão Série B 2026',
    ativo: true,
    embedSrc:
      'https://widgets.sofascore.com/pt-BR/embed/tournament/1449/season/89840/standings/Brasileiro%20Serie%20B%202026?widgetTitle=Brasileiro%20Serie%20B%202026&showCompetitionLogo=true',
    alturaPx: 1123,
    creditoUrl: 'https://www.sofascore.com/pt/football/tournament/brazil/brasileirao-serie-b/390#id:89840',
    creditoTexto: 'Classificação fornecida por',
  },
  {
    id: 'brasileirao-serie-c-2026',
    serie: 'C',
    competicaoSlug: 'brasileirao-serie-c-2026',
    titulo: 'Brasileirão Série C 2026',
    ativo: true,
    embedSrc:
      'https://widgets.sofascore.com/pt-BR/embed/tournament/27213/season/90642/standings/Brasileiro%20Serie%20C%202026?widgetTitle=Brasileiro%20Serie%20C%202026&showCompetitionLogo=true',
    alturaPx: 1123,
    creditoUrl: 'https://www.sofascore.com/pt/football/tournament/brazil/brasileirao-serie-c/1281#id:90642',
    creditoTexto: 'Classificação fornecida por',
  },
  {
    id: 'brasileirao-serie-d-2026',
    serie: 'D',
    competicaoSlug: 'brasileirao-serie-d-2026',
    titulo: 'Brasileirão Série D 2026',
    ativo: true,
    // Fase de grupos — Sofascore não oferece tabela única das 96 equipes.
    // Embed do Grupo A1 (mesmo padrão do painel); crédito aponta para o torneio.
    embedSrc:
      'https://widgets.sofascore.com/pt-BR/embed/tournament/59487/season/92447/standings/Brasileiro%20Serie%20D%202026?widgetTitle=Brasileiro%20Serie%20D%202026&showCompetitionLogo=true',
    alturaPx: 700,
    creditoUrl: 'https://www.sofascore.com/pt/football/tournament/brazil/brasileirao-serie-d/10326#id:92447',
    creditoTexto: 'Classificação fornecida por',
  },
]

/**
 * Filtra widgets ativos do clube para um contexto. Retorna `[]` se `afiliacaoSlug`
 * for falsy — sem clube resolvido, nada é exibido (nunca widget genérico).
 *
 * `competicaoSlug`/`jogadorId` só filtram quando o chamador informa E o widget
 * define o campo; widget sem o campo é "do clube em geral" e passa. Nunca lança.
 *
 * @param {{
 *   contexto?: string,
 *   afiliacaoSlug?: string | null,
 *   competicaoSlug?: string | null,
 *   jogadorId?: string | null,
 *   limit?: number,
 *   widgets?: SofascoreWidgetConfig[],
 * }} [opts] `widgets` é injetável para testes; produção usa o default SOFASCORE_WIDGETS.
 * @returns {SofascoreWidgetConfig[]}
 */
export function getWidgetsForContexto({
  contexto,
  afiliacaoSlug,
  competicaoSlug,
  jogadorId,
  limit,
  widgets = SOFASCORE_WIDGETS,
} = {}) {
  try {
    if (!afiliacaoSlug) return []
    const filtrados = (widgets ?? []).filter((w) => {
      if (!w?.ativo) return false
      if (!Array.isArray(w.contextos) || !w.contextos.includes(/** @type {never} */ (contexto))) {
        return false
      }
      if (w.afiliacaoSlug !== afiliacaoSlug) return false
      if (competicaoSlug && w.competicaoSlug && w.competicaoSlug !== competicaoSlug) return false
      if (jogadorId && w.jogadorId && w.jogadorId !== jogadorId) return false
      return true
    })
    filtrados.sort((a, b) => a.prioridade - b.prioridade)
    return typeof limit === 'number' ? filtrados.slice(0, limit) : filtrados
  } catch {
    return []
  }
}

/**
 * Retorna a competição nacional ativa da divisão, ou `null` se a série não for
 * A/B/C/D ou se o cadastro estiver inativo.
 *
 * @param {string | null | undefined} serie
 * @param {{ competicoes?: SofascoreCompeticaoConfig[] }} [opts]
 * @returns {SofascoreCompeticaoConfig | null}
 */
export function getStandingsPorSerie(serie, { competicoes = SOFASCORE_COMPETICOES } = {}) {
  try {
    if (!serie || !SERIES_NACIONAIS.includes(/** @type {never} */ (serie))) return null
    const found = (competicoes ?? []).find((c) => c?.serie === serie && c.ativo)
    return found ?? null
  } catch {
    return null
  }
}

/**
 * Converte uma competição nacional no formato de widget consumido pelo frame.
 *
 * @param {SofascoreCompeticaoConfig} competicao
 * @returns {SofascoreWidgetConfig}
 */
function competicaoComoWidget(competicao) {
  return {
    id: competicao.id,
    tipo: 'standings',
    titulo: competicao.titulo,
    afiliacaoSlug: '',
    competicaoSlug: competicao.competicaoSlug,
    contextos: ['classificacao'],
    prioridade: 2,
    ativo: true,
    embedSrc: competicao.embedSrc,
    alturaPx: competicao.alturaPx,
    creditoUrl: competicao.creditoUrl,
    creditoTexto: competicao.creditoTexto,
  }
}

/**
 * Resolve widgets da página Classificação: widgets específicos do clube têm
 * prioridade; se não houver nenhum, usa a tabela nacional da divisão.
 * Sem clube (`afiliacaoSlug` falsy) retorna `[]` — nunca widget genérico solto.
 *
 * @param {{
 *   afiliacaoSlug?: string | null,
 *   serie?: string | null,
 *   widgets?: SofascoreWidgetConfig[],
 *   competicoes?: SofascoreCompeticaoConfig[],
 * }} [opts]
 * @returns {SofascoreWidgetConfig[]}
 */
export function resolverWidgetsClassificacao({
  afiliacaoSlug,
  serie,
  widgets = SOFASCORE_WIDGETS,
  competicoes = SOFASCORE_COMPETICOES,
} = {}) {
  try {
    if (!afiliacaoSlug) return []
    const doClube = getWidgetsForContexto({
      contexto: 'classificacao',
      afiliacaoSlug,
      widgets,
    })
    if (doClube.length > 0) return doClube
    const nacional = getStandingsPorSerie(serie, { competicoes })
    return nacional ? [competicaoComoWidget(nacional)] : []
  } catch {
    return []
  }
}
