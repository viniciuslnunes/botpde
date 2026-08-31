/**
 * Torcedores por clube a partir de PESQUISA DE OPINIÃO — tier distinto de
 * "inscritos digitais" (IBOPE Repucom) e de contagem real na plataforma.
 *
 * Fonte primária: Datafolha, coleta em 22 e 23/07/2026, publicada em 01/08/2026.
 * 2.004 entrevistados de 16 anos ou mais, 139 municípios das 5 regiões,
 * margem de erro de ±2 pontos percentuais (95% de confiança). 22% declararam
 * não torcer por nenhum time; a Seleção Brasileira (2%) foi omitida por não ser
 * `Afiliacao`.
 *
 * Conversão para número absoluto: percentual x população brasileira de 16 anos
 * ou mais no Censo 2022 (IBGE) = 160.131.985 pessoas (203.080.756 residentes
 * menos 40.129.261 de 0 a 14 anos e 2.819.510 de 15 anos; agregado 9514,
 * variável 93, API servicodados.ibge.gov.br).
 *
 * ATENÇÃO: `dentroDaMargem: true` marca clube com 1% ou 2% — abaixo/na margem
 * de erro da pesquisa. O absoluto ali é ordem de grandeza, não medição; na UI,
 * preferir faixa ("cerca de 2 milhões") a número cheio.
 *
 * Atualização: a cada rodada Datafolha (costuma sair 1x/ano, no meio da
 * temporada). Trocar percentuais + datas e recalcular os absolutos.
 */

/** População brasileira de 16 anos ou mais — Censo 2022 (IBGE). */
export const BASE_POPULACIONAL_16_MAIS = 160131985

/** Metadados da rodada usada nesta tabela. */
export const DATAFOLHA_REFERENCIA = {
  coletaEm: '2026-07-22/2026-07-23',
  publicadoEm: '2026-08-01',
  entrevistados: 2004,
  municipios: 139,
  margemErroPontos: 2,
  semTimePercentual: 22,
}

/** @typedef {{ nome: string, uf: string, percentual: number, torcedores: number, dentroDaMargem: boolean }} TorcedorPesquisaSeed */

/** @type {TorcedorPesquisaSeed[]} */

export const TORCEDORES_PESQUISA = [
  { nome: "Flamengo", uf: "RJ", percentual: 22, torcedores: 35229037, dentroDaMargem: false },
  { nome: "Corinthians", uf: "SP", percentual: 14, torcedores: 22418478, dentroDaMargem: false },
  { nome: "Palmeiras", uf: "SP", percentual: 7, torcedores: 11209239, dentroDaMargem: false },
  { nome: "São Paulo FC", uf: "SP", percentual: 6, torcedores: 9607919, dentroDaMargem: false },
  { nome: "Cruzeiro", uf: "MG", percentual: 4, torcedores: 6405279, dentroDaMargem: false },
  { nome: "Vasco", uf: "RJ", percentual: 3, torcedores: 4803960, dentroDaMargem: false },
  { nome: "Grêmio", uf: "RS", percentual: 3, torcedores: 4803960, dentroDaMargem: false },
  { nome: "Atlético-MG", uf: "MG", percentual: 2, torcedores: 3202640, dentroDaMargem: true },
  { nome: "Internacional", uf: "RS", percentual: 2, torcedores: 3202640, dentroDaMargem: true },
  { nome: "Santos", uf: "SP", percentual: 2, torcedores: 3202640, dentroDaMargem: true },
  { nome: "Fluminense", uf: "RJ", percentual: 2, torcedores: 3202640, dentroDaMargem: true },
  { nome: "Bahia", uf: "BA", percentual: 1, torcedores: 1601320, dentroDaMargem: true },
  { nome: "Botafogo", uf: "RJ", percentual: 1, torcedores: 1601320, dentroDaMargem: true },
  { nome: "Vitória", uf: "BA", percentual: 1, torcedores: 1601320, dentroDaMargem: true },
  { nome: "Athletico-PR", uf: "PR", percentual: 1, torcedores: 1601320, dentroDaMargem: true },
  { nome: "Sport", uf: "PE", percentual: 1, torcedores: 1601320, dentroDaMargem: true },
  { nome: "Remo", uf: "PA", percentual: 1, torcedores: 1601320, dentroDaMargem: true },
]
