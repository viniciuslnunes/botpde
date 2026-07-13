/**
 * Ranking Digital dos Clubes Brasileiros — IBOPE Repucom (offline).
 *
 * Métrica: soma de inscritos/seguidores nos perfis OFICIAIS em Facebook, X,
 * Instagram, YouTube e TikTok. NÃO é contagem de torcedores presenciais —
 * ver docs/data/torcedores-estimados.md.
 *
 * Referência principal: Jun/2026 (Cassio Zirpoli + IBOPE Repucom) e Out/2025 (ge).
 * Chave = `chaveGrupoClube(nome, uf)`.
 */
export const FONTE_IBOPE_BASE =
  'IBOPE Repucom — Ranking Digital dos Clubes Brasileiros (inscritos em 5 redes)'

/** Menor total publicado entre os 50 monitorados (Botafogo-PB, Jun/2026). */
export const MENOR_TOTAL_IBOPE_PUBLICADO = 471_612

/**
 * Clubes do Top 50 IBOPE sem total exato na edição de referência.
 * Recebem o piso publicado (menor do ranking) até coleta mensal preencher.
 */
export const CHAVES_IBOPE_TOP50_SEM_TOTAL = new Set([
  'goias|go',
  'juventude|rs',
  'ponte preta|sp',
  'bragantino|sp',
  'paysandu|pa',
  'vila nova|go',
  'america mineiro|mg',
  'criciuma|sc',
  'figueirense|sc',
  'londrina|pr',
  'guarani|sp',
  'portuguesa|sp',
  'operario|pr',
  'amazonas|am',
  'botafogo|sp',
])

/** @type {Array<{ chave: string, inscritos: number, posicao: number | null, edicao: string, fonte: string }>} */
export const IBOPE_RANKING_DIGITAL = [
  // Top 5 — Jun/2026 (Cassio Zirpoli / IBOPE Repucom)
  { chave: 'flamengo|rj', inscritos: 67_514_485, posicao: 1, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'corinthians|sp', inscritos: 43_067_162, posicao: 2, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'santos|sp', inscritos: 27_451_109, posicao: 3, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'palmeiras|sp', inscritos: 24_367_578, posicao: 4, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'sao paulo|sp', inscritos: 22_407_400, posicao: 5, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  // Top 6–20 — Out/2025 (ge / IBOPE Repucom)
  { chave: 'vasco da gama|rj', inscritos: 14_000_000, posicao: 6, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'gremio|rs', inscritos: 12_300_000, posicao: 7, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'atletico mineiro|mg', inscritos: 12_100_000, posicao: 8, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'cruzeiro|mg', inscritos: 11_200_000, posicao: 9, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'fluminense|rj', inscritos: 10_000_000, posicao: 10, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'internacional|rs', inscritos: 8_100_000, posicao: 11, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'botafogo|rj', inscritos: 6_800_000, posicao: 12, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'chapecoense|sc', inscritos: 6_000_000, posicao: 13, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'bahia|ba', inscritos: 5_558_749, posicao: 14, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'sport|pe', inscritos: 5_276_903, posicao: 15, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'vitoria|ba', inscritos: 4_247_675, posicao: 16, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'fortaleza|ce', inscritos: 4_243_993, posicao: 17, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'athletico paranaense|pr', inscritos: 4_000_000, posicao: 18, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  { chave: 'ceara|ce', inscritos: 3_834_726, posicao: 19, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'coritiba|pr', inscritos: 2_300_000, posicao: 20, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025)` },
  // 21–29 (parcial)
  { chave: 'remo|pa', inscritos: 1_900_000, posicao: 24, edicao: '2025-10', fonte: `${FONTE_IBOPE_BASE} (Out/2025; ge)` },
  { chave: 'santa cruz|pe', inscritos: 1_992_916, posicao: 24, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'ibis|pe', inscritos: 1_384_057, posicao: 26, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'mirassol|sp', inscritos: 1_000_000, posicao: 29, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'avai|sc', inscritos: 1_000_000, posicao: 29, edicao: '2025-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2025; marco 1 mi)` },
  // 31–49 — Jun/2026 (Cassio Zirpoli / NE)
  { chave: 'nautico|pe', inscritos: 932_355, posicao: 32, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'csa|al', inscritos: 807_257, posicao: 37, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'abc|rn', inscritos: 763_825, posicao: 39, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'sampaio correa|ma', inscritos: 757_705, posicao: 40, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'crb|al', inscritos: 747_811, posicao: 42, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'america natal|rn', inscritos: 698_052, posicao: 44, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'confianca|se', inscritos: 485_755, posicao: 48, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
  { chave: 'botafogo|pb', inscritos: 471_612, posicao: 49, edicao: '2026-06', fonte: `${FONTE_IBOPE_BASE} (Jun/2026)` },
]

/** @returns {Map<string, { inscritos: number, posicao: number | null, edicao: string, fonte: string }>} */
export function indiceIbopeDigital() {
  const map = new Map()
  for (const row of IBOPE_RANKING_DIGITAL) {
    map.set(row.chave, {
      inscritos: row.inscritos,
      posicao: row.posicao,
      edicao: row.edicao,
      fonte: row.fonte,
    })
  }
  return map
}
