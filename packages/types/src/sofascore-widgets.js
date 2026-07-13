/**
 * Widgets oficiais Sofascore (iframe embeds) contextualizados pelo clube (`Afiliacao.slug`).
 * Regras puras, testáveis sem dependência de Prisma/Next.
 *
 * Only official Sofascore iframe embeds — nunca scraping nem endpoint não documentado.
 */

export const WIDGET_TIPOS = ['fixtures', 'standings', 'topPlayers', 'powerRankings', 'player', 'cupTree']

export const WIDGET_CONTEXTOS = ['home', 'clube', 'campeonato', 'jogador', 'artigo']

/**
 * @typedef {Object} SofascoreWidgetConfig
 * @property {string} id identificador único do cadastro
 * @property {'fixtures'|'standings'|'topPlayers'|'powerRankings'|'player'|'cupTree'} tipo um de WIDGET_TIPOS
 * @property {string} titulo label exibido no heading do card
 * @property {string} afiliacaoSlug clube dono do widget (`Afiliacao.slug`) — obrigatório
 * @property {string} [competicaoSlug] competição específica (opcional)
 * @property {string} [jogadorId] jogador específico (opcional)
 * @property {('home'|'clube'|'campeonato'|'jogador'|'artigo')[]} contextos onde esse widget pode aparecer
 * @property {number} prioridade menor = mais relevante
 * @property {boolean} ativo
 * @property {string} embedSrc URL do iframe oficial gerado pela Sofascore
 * @property {number} [alturaPx] altura do iframe em px (o embed oficial define uma altura própria por widget; usar o valor do snippet gerado, ex. `style="height:1123px"`)
 * @property {string} [creditoUrl] link de atribuição incluído no embed oficial (obrigatório mantê-lo — parte dos termos da Sofascore)
 * @property {string} [creditoTexto] texto de atribuição do embed oficial (ex. "Classificação fornecida por"), exibido junto ao `creditoUrl`
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

  // Corinthians (Afiliacao.slug = 'sport-club-corinthians-paulista-sp', confirmado
  // via query direta em produção — o nome curto "Corinthians" do seed
  // AFILIACOES_BRASIL não é a fonte do dado real, que usa o nome oficial longo).
  // Piloto do módulo (torcida demo Gaviões da Fiel). Fixtures e top players ficam
  // `ativo: false` até alguém gerar os embeds reais em https://widgets.sofascore.com
  // e colar em `embedSrc`; depois é só trocar o placeholder e marcar `ativo: true`.
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
    id: 'corinthians-sp-standings',
    tipo: 'standings',
    titulo: 'Classificação',
    afiliacaoSlug: 'sport-club-corinthians-paulista-sp',
    competicaoSlug: 'brasileirao-serie-a-2026',
    contextos: ['home', 'clube'],
    prioridade: 2,
    ativo: true,
    // Embed oficial colado do painel Sofascore (torneio 83 / temporada 87678 —
    // Brasileiro Série A 2026). Altura e atribuição vêm do snippet oficial.
    embedSrc:
      'https://widgets.sofascore.com/pt-BR/embed/tournament/83/season/87678/standings/Brasileiro%20Serie%20A%202026?widgetTitle=Brasileiro%20Serie%20A%202026&showCompetitionLogo=true',
    alturaPx: 1123,
    creditoUrl: 'https://www.sofascore.com/pt/football/tournament/brazil/brasileirao-serie-a/325#id:87678',
    creditoTexto: 'Classificação fornecida por',
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
