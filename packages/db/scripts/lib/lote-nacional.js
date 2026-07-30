/**
 * Definição do lote de teste NACIONAL (multi-clube) — compartilhada entre
 * seed-nacional-teste.js e reset-nacional-teste.js.
 *
 * Mora num módulo próprio porque o reset precisa reconstruir exatamente os
 * mesmos pares de rivalidade/aliança que o seed criou: `RivalidadeClube`,
 * `RivalidadeTorcida` e `Alianca` não têm campo de texto livre para receber
 * o marcador do lote, então a identificação é pelo par de clubes/torcidas.
 * Duplicar as listas nos dois scripts faria o reset silenciosamente parar de
 * apagar o que o seed passou a criar.
 */

export const DOMINIO_TESTE = 'teste.nacional.torcida.app'
export const MARCA = '[TESTE-NACIONAL]'

/** Um clube por linha, com a torcida real (tenant) que recebe o seed. */
export const LOTE = [
  { clube: 'clube-de-regatas-flamengo-rj', tenant: 'torcida-jovem-flamengo', uf: 'RJ', cidades: ['Rio de Janeiro/RJ', 'Niterói/RJ', 'Nova Iguaçu/RJ'] },
  { clube: 'sociedade-esportiva-palmeiras-sp', tenant: 'mancha-alviverde', uf: 'SP', cidades: ['São Paulo/SP', 'Campinas/SP', 'Santo André/SP'] },
  { clube: 'sao-paulo-fc-sp', tenant: 'dragoes-da-real', uf: 'SP', cidades: ['São Paulo/SP', 'Osasco/SP', 'Guarulhos/SP'] },
  { clube: 'santos-sp', tenant: 'torcida-jovem-santos', uf: 'SP', cidades: ['Santos/SP', 'São Vicente/SP', 'Praia Grande/SP'] },
  { clube: 'gremio-foot-ball-porto-alegrense-rs', tenant: 'geral-do-gremio', uf: 'RS', cidades: ['Porto Alegre/RS', 'Caxias do Sul/RS'] },
  { clube: 'sport-club-internacional-rs', tenant: 'camisa-12-inter', uf: 'RS', cidades: ['Porto Alegre/RS', 'Canoas/RS'] },
  { clube: 'cruzeiro-mg', tenant: 'pavilhao-independente-cruzeiro', uf: 'MG', cidades: ['Belo Horizonte/MG', 'Contagem/MG'] },
  { clube: 'clube-atletico-mineiro-mg', tenant: 'galo-metal-torcida-organizada-mg', uf: 'MG', cidades: ['Belo Horizonte/MG', 'Betim/MG'] },
  { clube: 'fluminense-football-club-rj', tenant: 'young-flu', uf: 'RJ', cidades: ['Rio de Janeiro/RJ', 'São Gonçalo/RJ'] },
  { clube: 'botafogo-de-futebol-e-regatas-rj', tenant: 'furia-jovem-do-botafogo-rj', uf: 'RJ', cidades: ['Rio de Janeiro/RJ', 'Duque de Caxias/RJ'] },
]

/**
 * Clube já semeado pelo lote Corinthians. Não recebe gente nova aqui —
 * entra só no grafo de rivalidade, porque os clássicos paulistas são o par
 * mais óbvio para testar rivalidade entre clubes.
 */
export const CLUBE_CORINTHIANS = 'sport-club-corinthians-paulista-sp'
export const TENANT_CORINTHIANS = 'pde-gavioes-fiel'

/** Clássicos reais — pares de clubes (slug de `Afiliacao`). */
export const RIVALIDADES_CLUBE = [
  [CLUBE_CORINTHIANS, 'sociedade-esportiva-palmeiras-sp'],
  [CLUBE_CORINTHIANS, 'sao-paulo-fc-sp'],
  [CLUBE_CORINTHIANS, 'santos-sp'],
  ['sociedade-esportiva-palmeiras-sp', 'sao-paulo-fc-sp'],
  ['sociedade-esportiva-palmeiras-sp', 'santos-sp'],
  ['sao-paulo-fc-sp', 'santos-sp'],
  ['clube-de-regatas-flamengo-rj', 'fluminense-football-club-rj'],
  ['clube-de-regatas-flamengo-rj', 'botafogo-de-futebol-e-regatas-rj'],
  ['clube-de-regatas-flamengo-rj', 'sao-paulo-fc-sp'],
  ['fluminense-football-club-rj', 'botafogo-de-futebol-e-regatas-rj'],
  ['gremio-foot-ball-porto-alegrense-rs', 'sport-club-internacional-rs'],
  ['cruzeiro-mg', 'clube-atletico-mineiro-mg'],
]

/**
 * Alianças cross-clube — o produto permite aliança entre torcidas de clubes
 * diferentes; aqui com status variados para exercitar a tela de propostas.
 */
export const ALIANCAS = [
  ['geral-do-gremio', 'torcida-jovem-flamengo', 'ATIVA'],
  ['mancha-alviverde', 'galo-metal-torcida-organizada-mg', 'ATIVA'],
  ['dragoes-da-real', 'pavilhao-independente-cruzeiro', 'PENDENTE'],
  ['young-flu', 'camisa-12-inter', 'PENDENTE'],
  ['furia-jovem-do-botafogo-rj', 'torcida-jovem-santos', 'SUGERIDA'],
  ['torcida-jovem-flamengo', 'pavilhao-independente-cruzeiro', 'ENCERRADA'],
]
