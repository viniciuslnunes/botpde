/**
 * Rivalidades entre clubes (`RivalidadeClube`) — dataset curado, offline.
 *
 * Para que serve: `RivalidadeClube` é o que faz o isolamento por rivalidade
 * funcionar (`tenantsAreRivais` / `rivaisEntre` em `apps/web/src/lib/hierarquia.ts`).
 * Sem o par gravado, torcidas de clubes rivais se enxergam normalmente.
 *
 * Critério (importante — isto NÃO é "lista de clássicos"):
 * - ENTRA rivalidade intraestadual (mesma cidade ou mesmo estado), que é a que
 *   se traduz em conflito real entre torcidas organizadas.
 * - NÃO entra clássico interestadual (Flamengo x São Paulo, Corinthians x
 *   Cruzeiro...): é rivalidade de calendário/mídia, e usá-la no isolamento
 *   apagaria boa parte da malha nacional de interação sem ganho de segurança.
 * - Cada par aparece uma única vez; a ordem A/B não tem significado.
 *
 * Casamento com `Afiliacao`: `a`/`b` estão grafados exatamente como o catálogo
 * (`saas_afiliacoes.nome`) + UF. Par cujo clube não existe no catálogo foi
 * descartado na geração (112 pares) — ver `docs/data/auditoria-catalogo-clubes.md`.
 *
 * Fontes: pt.wikipedia "Lista de clássicos de futebol do Brasil",
 * "Lista de clássicos de futebol de São Paulo (estado)",
 * "Lista de clássicos de futebol de Minas Gerais" e os artigos de cada clássico
 * (Fla-Flu, Clássico dos Milhões, Derby Paulista, Majestoso, Choque-Rei...).
 * Consulta: 2026-08-27. Confiança: alta nos pares com nome de clássico, média
 * nos pares de interior sem nome.
 *
 * Ética: rivalidade é dado sensível. Uso permitido = isolamento de UX/dados e
 * moderação. Nunca derivar ranking de inimizade nem sugerir confronto
 * (`docs/knowledge/README.md`, protocolo de manutenção item 4).
 */

/** @typedef {{ uf: string, a: string, b: string, classico: string|null, escopo: 'MUNICIPAL'|'ESTADUAL', isola: boolean }} RivalidadeClubeSeed */

/** @type {RivalidadeClubeSeed[]} */

export const RIVALIDADES_CLUBES = [
  // -- AL --
  { uf: "AL", a: "Centro Sportivo Alagoano", b: "ASA", classico: "CSA x ASA", escopo: "ESTADUAL", isola: true },
  { uf: "AL", a: "Clube de Regatas Brasil", b: "ASA", classico: "CRB x ASA", escopo: "ESTADUAL", isola: true },
  { uf: "AL", a: "Clube de Regatas Brasil", b: "Centro Sportivo Alagoano", classico: "Clássico das Multidões", escopo: "MUNICIPAL", isola: true },
  // -- AM --
  { uf: "AM", a: "Nacional-AM", b: "Fast Clube", classico: "Pai-Filho", escopo: "MUNICIPAL", isola: true },
  { uf: "AM", a: "Rio Negro", b: "Fast Clube", classico: "Clássico da Elite", escopo: "MUNICIPAL", isola: true },
  { uf: "AM", a: "Rio Negro", b: "Nacional-AM", classico: "Rio-nal", escopo: "MUNICIPAL", isola: true },
  { uf: "AM", a: "Rio Negro", b: "São Raimundo-AM", classico: null, escopo: "MUNICIPAL", isola: true },
  { uf: "AM", a: "São Raimundo-AM", b: "Fast Clube", classico: null, escopo: "MUNICIPAL", isola: true },
  { uf: "AM", a: "São Raimundo-AM", b: "Nacional-AM", classico: null, escopo: "MUNICIPAL", isola: true },
  // -- BA --
  { uf: "BA", a: "Bahia", b: "Esporte Clube Ypiranga", classico: "Clássico do Povo", escopo: "MUNICIPAL", isola: true },
  { uf: "BA", a: "Bahia", b: "Vitória", classico: "Ba-Vi", escopo: "MUNICIPAL", isola: true },
  { uf: "BA", a: "Fluminense de Feira", b: "Atlético de Alagoinhas", classico: "Clássico do Sertão", escopo: "ESTADUAL", isola: true },
  { uf: "BA", a: "Vitória", b: "Esporte Clube Ypiranga", classico: null, escopo: "MUNICIPAL", isola: true },
  // -- CE --
  { uf: "CE", a: "Ceará Sporting Clube", b: "Ferroviário Atlético Clube", classico: "Clássico da Paz", escopo: "MUNICIPAL", isola: true },
  { uf: "CE", a: "Fortaleza", b: "Ceará Sporting Clube", classico: "Clássico-Rei", escopo: "MUNICIPAL", isola: true },
  { uf: "CE", a: "Fortaleza", b: "Ferroviário Atlético Clube", classico: "Clássico das Cores", escopo: "MUNICIPAL", isola: true },
  // -- GO --
  { uf: "GO", a: "Anápolis FC", b: "Asociação Atlética Anapolina", classico: "Clássico da Manchester", escopo: "MUNICIPAL", isola: true },
  { uf: "GO", a: "Atlético Clube Goianiense", b: "Itumbiara", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "GO", a: "Atlético Clube Goianiense", b: "Vila Nova", classico: "Atlético-GO versus Vila Nova", escopo: "MUNICIPAL", isola: true },
  { uf: "GO", a: "Goiás", b: "Atlético Clube Goianiense", classico: "Clássico do Equilíbrio", escopo: "MUNICIPAL", isola: true },
  { uf: "GO", a: "Goiás", b: "Itumbiara", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "GO", a: "Goiás", b: "Vila Nova", classico: "Derby do Cerrado", escopo: "MUNICIPAL", isola: true },
  // -- MA --
  { uf: "MA", a: "Moto Club", b: "Maranhão Atlético Clube", classico: "Maremoto", escopo: "MUNICIPAL", isola: true },
  { uf: "MA", a: "Sampaio Corrêa", b: "Maranhão Atlético Clube", classico: "Samará", escopo: "MUNICIPAL", isola: true },
  { uf: "MA", a: "Sampaio Corrêa", b: "Moto Club", classico: "Superclássico", escopo: "MUNICIPAL", isola: true },
  // -- MG --
  { uf: "MG", a: "América-MG", b: "Clube Atlético Mineiro", classico: "América x Atlético", escopo: "MUNICIPAL", isola: true },
  { uf: "MG", a: "América-MG", b: "Cruzeiro", classico: "América x Cruzeiro", escopo: "MUNICIPAL", isola: true },
  { uf: "MG", a: "América-MG", b: "Villa Nova", classico: "América x Villa Nova", escopo: "ESTADUAL", isola: true },
  { uf: "MG", a: "Clube Atlético Mineiro", b: "Cruzeiro", classico: "Clássico Mineiro", escopo: "MUNICIPAL", isola: true },
  { uf: "MG", a: "Clube Atlético Mineiro", b: "Villa Nova", classico: "Atlético x Villa Nova", escopo: "ESTADUAL", isola: true },
  { uf: "MG", a: "Cruzeiro", b: "Villa Nova", classico: "Cruzeiro x Villa Nova", escopo: "ESTADUAL", isola: true },
  { uf: "MG", a: "Esporte Clube Mamoré", b: "URT", classico: "Mamoré x URT", escopo: "MUNICIPAL", isola: true },
  // -- PA --
  { uf: "PA", a: "Paysandu Sport Club", b: "Tuna Luso Brasileira", classico: "Pa-Tu", escopo: "MUNICIPAL", isola: true },
  { uf: "PA", a: "Remo", b: "Paysandu Sport Club", classico: "Re-Pa ou Clássico-Rei da Amazônia", escopo: "MUNICIPAL", isola: true },
  { uf: "PA", a: "Remo", b: "Tuna Luso Brasileira", classico: "Re-Tu", escopo: "MUNICIPAL", isola: true },
  // -- PB --
  { uf: "PB", a: "Botafogo-PB", b: "Auto Esporte", classico: "Botauto", escopo: "MUNICIPAL", isola: true },
  { uf: "PB", a: "Campinense", b: "Botafogo-PB", classico: "Clássico Emoção", escopo: "ESTADUAL", isola: true },
  { uf: "PB", a: "Treze", b: "Botafogo-PB", classico: "Clássico Tradição", escopo: "ESTADUAL", isola: true },
  { uf: "PB", a: "Treze", b: "Campinense", classico: "Clássico dos Maiorais", escopo: "MUNICIPAL", isola: true },
  // -- PE --
  { uf: "PE", a: "Central Sport Club", b: "Porto", classico: "Clássico Matuto", escopo: "MUNICIPAL", isola: true },
  { uf: "PE", a: "Santa Cruz", b: "Clube Náutico Capiberibe", classico: "Clássico das Emoções", escopo: "MUNICIPAL", isola: true },
  { uf: "PE", a: "Sport Club do Recife", b: "Clube Náutico Capiberibe", classico: "Clássico dos Clássicos", escopo: "MUNICIPAL", isola: true },
  { uf: "PE", a: "Sport Club do Recife", b: "Santa Cruz", classico: "Clássico das Multidões", escopo: "MUNICIPAL", isola: true },
  // -- PI --
  { uf: "PI", a: "Flamengo-PI", b: "Parnahyba Sport Club", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "PI", a: "River-PI", b: "Flamengo-PI", classico: "Rivengo", escopo: "MUNICIPAL", isola: true },
  { uf: "PI", a: "River-PI", b: "Parnahyba Sport Club", classico: null, escopo: "ESTADUAL", isola: false },
  // -- RJ --
  { uf: "RJ", a: "Botafogo de Futebol e Regatas", b: "Club de Regatas Vasco da Gama", classico: "Clássico da Amizade", escopo: "ESTADUAL", isola: true },
  { uf: "RJ", a: "Botafogo de Futebol e Regatas", b: "Clube de Regatas Flamengo", classico: "Clássico da Rivalidade", escopo: "MUNICIPAL", isola: true },
  { uf: "RJ", a: "Botafogo de Futebol e Regatas", b: "Fluminense Football Club", classico: "Clássico Vovô", escopo: "ESTADUAL", isola: true },
  { uf: "RJ", a: "Clube de Regatas Flamengo", b: "Club de Regatas Vasco da Gama", classico: "Clássico dos Milhões", escopo: "ESTADUAL", isola: true },
  { uf: "RJ", a: "Clube de Regatas Flamengo", b: "Fluminense Football Club", classico: "Fla-Flu", escopo: "ESTADUAL", isola: true },
  { uf: "RJ", a: "Fluminense Football Club", b: "Club de Regatas Vasco da Gama", classico: "Clássico dos Gigantes", escopo: "MUNICIPAL", isola: true },
  // -- RN --
  { uf: "RN", a: "ABC", b: "Alecrim", classico: null, escopo: "MUNICIPAL", isola: true },
  { uf: "RN", a: "ABC", b: "América Futebol Clube de Natal", classico: "Clássico-Rei", escopo: "MUNICIPAL", isola: true },
  { uf: "RN", a: "América Futebol Clube de Natal", b: "Alecrim", classico: null, escopo: "MUNICIPAL", isola: true },
  { uf: "RN", a: "Associacao Cultural e Desportiva Potiguar", b: "Baraúnas", classico: null, escopo: "MUNICIPAL", isola: true },
  // -- RS --
  { uf: "RS", a: "Grêmio", b: "Juventude", classico: "Gre-Ju", escopo: "ESTADUAL", isola: true },
  { uf: "RS", a: "Grêmio", b: "Sport Club Internacional", classico: "Grenal", escopo: "MUNICIPAL", isola: true },
  { uf: "RS", a: "Sport Club Internacional", b: "Juventude", classico: "Juve-Nal", escopo: "ESTADUAL", isola: true },
  // -- SC --
  { uf: "SC", a: "Avaí", b: "Chapecoense", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SC", a: "Avaí", b: "Figueirense", classico: "Clássico de Florianópolis", escopo: "MUNICIPAL", isola: true },
  { uf: "SC", a: "Criciúma", b: "Joinville", classico: "Clássico do Interior", escopo: "ESTADUAL", isola: true },
  { uf: "SC", a: "Figueirense", b: "Criciúma", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SC", a: "Figueirense", b: "Joinville", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SC", a: "Metropolitano", b: "Brusque", classico: null, escopo: "ESTADUAL", isola: false },
  // -- SE --
  { uf: "SE", a: "Club Sportivo Sergipe", b: "Itabaiana", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SE", a: "Confiança", b: "Club Sportivo Sergipe", classico: "Sergipe x Confiança, Ser-Con ou Derby Sergipano", escopo: "MUNICIPAL", isola: true },
  { uf: "SE", a: "Confiança", b: "Itabaiana", classico: null, escopo: "ESTADUAL", isola: false },
  // -- SP --
  { uf: "SP", a: "Corinthians", b: "São Paulo FC", classico: "Majestoso", escopo: "MUNICIPAL", isola: true },
  { uf: "SP", a: "Corinthians", b: "Sociedade Esportiva Palmeiras", classico: "Derby Paulista", escopo: "MUNICIPAL", isola: true },
  { uf: "SP", a: "Esporte Clube XV de Piracicaba", b: "Clube Atlético Sorocaba", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Guarani", b: "Associação Atlética Portuguesa", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Guarani", b: "São Paulo FC", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Guarani", b: "Sociedade Esportiva Palmeiras", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Paulista Futebol Clube", b: "Ituano Futebol Clube", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Ponte Preta", b: "Associação Atlética Portuguesa", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Ponte Preta", b: "Corinthians", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Ponte Preta", b: "São Caetano", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Santos", b: "Associação Atlética Portuguesa", classico: null, escopo: "MUNICIPAL", isola: true },
  { uf: "SP", a: "Santos", b: "Corinthians", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Santos", b: "São Paulo FC", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Santos", b: "Sociedade Esportiva Palmeiras", classico: null, escopo: "ESTADUAL", isola: false },
  { uf: "SP", a: "Sociedade Esportiva Palmeiras", b: "São Paulo FC", classico: "Choque-Rei", escopo: "MUNICIPAL", isola: true },
]
