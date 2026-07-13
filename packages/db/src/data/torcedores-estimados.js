/**
 * Estimativas públicas de torcedores por clube (offline).
 * Chave = `chaveGrupoClube(nome, uf)` — casamento com Afiliacao via seed.
 *
 * Fontes: Wikipedia PT, pesquisas IBOPE/Datafolha citadas em artigos esportivos
 * (valores aproximados; atualizar via seed, nunca em runtime).
 */
export const TORCEDORES_ESTIMADOS = [
  { chave: 'flamengo|rj', valor: 42_665_518, fonte: 'Wikipedia PT / IBOPE' },
  { chave: 'corinthians|sp', valor: 30_000_000, fonte: 'Wikipedia PT' },
  { chave: 'sao paulo|sp', valor: 16_000_000, fonte: 'Wikipedia PT' },
  { chave: 'palmeiras|sp', valor: 15_000_000, fonte: 'Wikipedia PT' },
  { chave: 'vasco da gama|rj', valor: 15_000_000, fonte: 'Wikipedia PT' },
  { chave: 'fluminense|rj', valor: 11_000_000, fonte: 'Wikipedia PT' },
  { chave: 'atletico mineiro|mg', valor: 10_000_000, fonte: 'Wikipedia PT' },
  { chave: 'cruzeiro|mg', valor: 9_000_000, fonte: 'Wikipedia PT' },
  { chave: 'santos|sp', valor: 8_000_000, fonte: 'Wikipedia PT' },
  { chave: 'gremio|rs', valor: 8_000_000, fonte: 'Wikipedia PT' },
  { chave: 'internacional|rs', valor: 6_000_000, fonte: 'Wikipedia PT' },
  { chave: 'bahia|ba', valor: 6_000_000, fonte: 'Wikipedia PT' },
  { chave: 'botafogo|rj', valor: 4_000_000, fonte: 'Wikipedia PT' },
  { chave: 'athletico paranaense|pr', valor: 2_500_000, fonte: 'Wikipedia PT' },
  { chave: 'america mineiro|mg', valor: 2_000_000, fonte: 'Wikipedia PT' },
  { chave: 'fortaleza|ce', valor: 2_000_000, fonte: 'Wikipedia PT' },
  { chave: 'ceara|ce', valor: 1_500_000, fonte: 'Wikipedia PT' },
  { chave: 'sport|pe', valor: 1_500_000, fonte: 'Wikipedia PT' },
  { chave: 'santa cruz|pe', valor: 1_500_000, fonte: 'Wikipedia PT' },
  { chave: 'vitoria|ba', valor: 1_200_000, fonte: 'Wikipedia PT' },
  { chave: 'coritiba|pr', valor: 1_000_000, fonte: 'Wikipedia PT' },
  { chave: 'nautico|pe', valor: 1_000_000, fonte: 'Wikipedia PT' },
  { chave: 'goias|go', valor: 800_000, fonte: 'Wikipedia PT' },
  { chave: 'ponte preta|sp', valor: 800_000, fonte: 'Wikipedia PT' },
  { chave: 'avai|sc', valor: 700_000, fonte: 'Wikipedia PT' },
  { chave: 'criciuma|sc', valor: 600_000, fonte: 'Wikipedia PT' },
  { chave: 'juventude|rs', valor: 600_000, fonte: 'Wikipedia PT' },
  { chave: 'atletico goianiense|go', valor: 500_000, fonte: 'Wikipedia PT' },
  { chave: 'crb|al', valor: 500_000, fonte: 'Wikipedia PT' },
  { chave: 'csa|al', valor: 400_000, fonte: 'Wikipedia PT' },
  { chave: 'paysandu|pa', valor: 400_000, fonte: 'Wikipedia PT' },
  { chave: 'remo|pa', valor: 400_000, fonte: 'Wikipedia PT' },
  { chave: 'vila nova|go', valor: 350_000, fonte: 'Wikipedia PT' },
  { chave: 'bragantino|sp', valor: 350_000, fonte: 'Wikipedia PT' },
  { chave: 'chapecoense|sc', valor: 300_000, fonte: 'Wikipedia PT' },
  { chave: 'figueirense|sc', valor: 250_000, fonte: 'Wikipedia PT' },
  { chave: 'abc|rn', valor: 200_000, fonte: 'Wikipedia PT' },
  { chave: 'america de natal|rn', valor: 200_000, fonte: 'Wikipedia PT' },
  { chave: 'operario|pr', valor: 150_000, fonte: 'Wikipedia PT' },
  { chave: 'londrina|pr', valor: 150_000, fonte: 'Wikipedia PT' },
  { chave: 'guarani|sp', valor: 150_000, fonte: 'Wikipedia PT' },
  { chave: 'portuguesa|sp', valor: 150_000, fonte: 'Wikipedia PT' },
  { chave: 'sao bernardo|sp', valor: 120_000, fonte: 'Wikipedia PT' },
  { chave: 'ituano|sp', valor: 100_000, fonte: 'Wikipedia PT' },
  { chave: 'mirassol|sp', valor: 80_000, fonte: 'Wikipedia PT' },
]

/** @returns {Map<string, { valor: number, fonte: string }>} */
export function indiceTorcedoresEstimados() {
  const map = new Map()
  for (const row of TORCEDORES_ESTIMADOS) {
    map.set(row.chave, { valor: row.valor, fonte: row.fonte })
  }
  return map
}
