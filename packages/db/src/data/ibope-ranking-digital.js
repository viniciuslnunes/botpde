/**
 * Ranking Digital dos Clubes Brasileiros — IBOPE Repucom (offline).
 *
 * Fonte editável: `ibope-ranking-digital.json` (coleta mensal via
 * `pnpm --filter @torcida/db coleta:ibope-ranking`).
 *
 * Métrica: soma de inscritos/seguidores nos perfis OFICIAIS em Facebook, X,
 * Instagram, YouTube e TikTok. NÃO é contagem de torcedores presenciais —
 * ver docs/data/torcedores-estimados.md.
 */
import dados from './ibope-ranking-digital.json' with { type: 'json' }

export const FONTE_IBOPE_BASE =
  'IBOPE Repucom — Ranking Digital dos Clubes Brasileiros (inscritos em 5 redes)'

/** Menor total publicado entre os 50 monitorados (Botafogo-PB, Jun/2026). */
export const MENOR_TOTAL_IBOPE_PUBLICADO = 471_612

/** @type {Set<string>} Clubes do Top 50 sem total exato — piso até coleta preencher. */
export const CHAVES_IBOPE_TOP50_SEM_TOTAL = new Set(dados.top50SemTotal ?? [])

function fonteEdicao(edicao) {
  const rotulo = edicao.replace('-', '/').replace(/^(\d{4})-(\d{2})$/, (_, y, m) => {
    const meses = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ]
    return `${meses[Number(m) - 1]}/${y}`
  })
  return `${FONTE_IBOPE_BASE} (${rotulo})`
}

/** @type {Array<{ chave: string, inscritos: number, posicao: number | null, edicao: string, fonte: string }>} */
export const IBOPE_RANKING_DIGITAL = (dados.clubes ?? []).map((row) => ({
  chave: row.chave,
  inscritos: row.inscritos,
  posicao: row.posicao ?? null,
  edicao: row.edicao,
  fonte: fonteEdicao(row.edicao),
}))

/** Posições 1–50 ainda sem clube mapeado na planilha. */
export function posicoesIbopeSemClube() {
  const comPosicao = IBOPE_RANKING_DIGITAL.filter((r) => r.posicao != null).map((r) => r.posicao)
  const faltantes = []
  for (let p = 1; p <= 50; p += 1) {
    if (!comPosicao.includes(p)) faltantes.push(p)
  }
  return faltantes
}

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
