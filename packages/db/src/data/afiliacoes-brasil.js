/**
 * Dataset curado de clubes (Afiliacao) do Brasil, extraído de
 * `docs/knowledge/diretorio-nacional.md` — apenas os CLUBES citados
 * (não as torcidas organizadas), cobrindo as 5 regiões.
 *
 * Campos: { nome, apelido?, cidade, estado (UF) }.
 * `serie` e `escudoUrl` NÃO ficam aqui — são derivados no seed
 * (`seed-afiliacoes.js`) a partir do casamento com a API TheSportsDB.
 * `slug` é gerado no seed com garantia de unicidade.
 *
 * Fonte: diretório nacional (confiança média). Cidade/UF preenchidas com
 * a sede historicamente conhecida do clube; revisável.
 */

/** @typedef {{ nome: string, apelido?: string, cidade: string, estado: string }} ClubeCurado */

/** @type {ClubeCurado[]} */
export const AFILIACOES_BRASIL = [
  // ===================== SUDESTE =====================
  // -- São Paulo --
  { nome: 'Corinthians', apelido: 'Timão', cidade: 'São Paulo', estado: 'SP' },
  { nome: 'Palmeiras', apelido: 'Verdão', cidade: 'São Paulo', estado: 'SP' },
  { nome: 'São Paulo FC', apelido: 'Tricolor', cidade: 'São Paulo', estado: 'SP' },
  { nome: 'Santos', apelido: 'Peixe', cidade: 'Santos', estado: 'SP' },
  { nome: 'Portuguesa', apelido: 'Lusa', cidade: 'São Paulo', estado: 'SP' },
  { nome: 'Juventus', apelido: 'Moleque Travesso', cidade: 'São Paulo', estado: 'SP' },
  { nome: 'Ponte Preta', apelido: 'Macaca', cidade: 'Campinas', estado: 'SP' },
  { nome: 'Guarani', apelido: 'Bugre', cidade: 'Campinas', estado: 'SP' },
  { nome: 'Botafogo-SP', apelido: 'Pantera', cidade: 'Ribeirão Preto', estado: 'SP' },
  { nome: 'Comercial-SP', apelido: 'Bafo', cidade: 'Ribeirão Preto', estado: 'SP' },
  { nome: 'São Bento', cidade: 'Sorocaba', estado: 'SP' },
  { nome: 'Paulista', apelido: 'Galo do Japi', cidade: 'Jundiaí', estado: 'SP' },
  { nome: 'São Caetano', apelido: 'Azulão', cidade: 'São Caetano do Sul', estado: 'SP' },
  { nome: 'Santo André', apelido: 'Ramalhão', cidade: 'Santo André', estado: 'SP' },
  { nome: 'São José-SP', apelido: 'Águia do Vale', cidade: 'São José dos Campos', estado: 'SP' },
  // -- Rio de Janeiro --
  { nome: 'Flamengo', apelido: 'Mengão', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Vasco', apelido: 'Gigante da Colina', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Fluminense', apelido: 'Tricolor', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Botafogo', apelido: 'Fogão', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Bangu', apelido: 'Castor de Andaraí', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Olaria', apelido: 'Bagre', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Volta Redonda', apelido: 'Voltaço', cidade: 'Volta Redonda', estado: 'RJ' },
  { nome: 'Madureira', apelido: 'Tricolor Suburbano', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { nome: 'Macaé', cidade: 'Macaé', estado: 'RJ' },
  { nome: 'Boavista', apelido: 'Verdão de Saquarema', cidade: 'Saquarema', estado: 'RJ' },
  { nome: 'Nova Iguaçu', apelido: 'Laranja Mecânica', cidade: 'Nova Iguaçu', estado: 'RJ' },
  { nome: 'Resende', apelido: 'Gigante do Vale', cidade: 'Resende', estado: 'RJ' },
  { nome: 'Americano', cidade: 'Campos dos Goytacazes', estado: 'RJ' },
  { nome: 'Friburguense', cidade: 'Nova Friburgo', estado: 'RJ' },
  { nome: 'Cabofriense', cidade: 'Cabo Frio', estado: 'RJ' },
  { nome: 'Duque de Caxias', cidade: 'Duque de Caxias', estado: 'RJ' },
  { nome: 'São Cristóvão', cidade: 'Rio de Janeiro', estado: 'RJ' },
  // -- Minas Gerais --
  { nome: 'Atlético-MG', apelido: 'Galo', cidade: 'Belo Horizonte', estado: 'MG' },
  { nome: 'Cruzeiro', apelido: 'Raposa', cidade: 'Belo Horizonte', estado: 'MG' },
  { nome: 'América-MG', apelido: 'Coelho', cidade: 'Belo Horizonte', estado: 'MG' },
  { nome: 'Villa Nova', apelido: 'Leão do Bonfim', cidade: 'Nova Lima', estado: 'MG' },
  { nome: 'Tupi', apelido: 'Carijó', cidade: 'Juiz de Fora', estado: 'MG' },
  { nome: 'Uberlândia', apelido: 'Verdão do Triângulo', cidade: 'Uberlândia', estado: 'MG' },
  { nome: 'Ipatinga', cidade: 'Ipatinga', estado: 'MG' },
  { nome: 'URT', cidade: 'Patos de Minas', estado: 'MG' },
  { nome: 'Democrata', cidade: 'Governador Valadares', estado: 'MG' },
  // -- Espírito Santo --
  { nome: 'Desportiva Ferroviária', apelido: 'Grená', cidade: 'Cariacica', estado: 'ES' },
  { nome: 'Rio Branco-ES', apelido: 'Capa-Preta', cidade: 'Vitória', estado: 'ES' },
  { nome: 'Serra', cidade: 'Serra', estado: 'ES' },
  { nome: 'Estrela do Norte', cidade: 'Cachoeiro de Itapemirim', estado: 'ES' },
  { nome: 'Vitória-ES', cidade: 'Vitória', estado: 'ES' },

  // ===================== SUL =====================
  // -- Rio Grande do Sul --
  { nome: 'Grêmio', apelido: 'Tricolor', cidade: 'Porto Alegre', estado: 'RS' },
  { nome: 'Internacional', apelido: 'Colorado', cidade: 'Porto Alegre', estado: 'RS' },
  { nome: 'Juventude', apelido: 'Ju', cidade: 'Caxias do Sul', estado: 'RS' },
  { nome: 'Caxias', apelido: 'Grená', cidade: 'Caxias do Sul', estado: 'RS' },
  { nome: 'Brasil de Pelotas', apelido: 'Xavante', cidade: 'Pelotas', estado: 'RS' },
  { nome: 'Pelotas', apelido: 'Lobo', cidade: 'Pelotas', estado: 'RS' },
  { nome: 'Novo Hamburgo', apelido: 'Noia', cidade: 'Novo Hamburgo', estado: 'RS' },
  { nome: 'São José-RS', cidade: 'Porto Alegre', estado: 'RS' },
  // -- Santa Catarina --
  { nome: 'Avaí', apelido: 'Leão da Ilha', cidade: 'Florianópolis', estado: 'SC' },
  { nome: 'Figueirense', apelido: 'Furacão', cidade: 'Florianópolis', estado: 'SC' },
  { nome: 'Chapecoense', apelido: 'Verdão', cidade: 'Chapecó', estado: 'SC' },
  { nome: 'Criciúma', apelido: 'Tigre', cidade: 'Criciúma', estado: 'SC' },
  { nome: 'Joinville', apelido: 'JEC', cidade: 'Joinville', estado: 'SC' },
  { nome: 'Marcílio Dias', cidade: 'Itajaí', estado: 'SC' },
  { nome: 'Brusque', cidade: 'Brusque', estado: 'SC' },
  { nome: 'Metropolitano', cidade: 'Blumenau', estado: 'SC' },
  { nome: 'Tubarão', cidade: 'Tubarão', estado: 'SC' },
  { nome: 'Hercílio Luz', cidade: 'Tubarão', estado: 'SC' },
  // -- Paraná --
  { nome: 'Athletico-PR', apelido: 'Furacão', cidade: 'Curitiba', estado: 'PR' },
  { nome: 'Coritiba', apelido: 'Coxa', cidade: 'Curitiba', estado: 'PR' },
  { nome: 'Paraná Clube', apelido: 'Tricolor', cidade: 'Curitiba', estado: 'PR' },
  { nome: 'Londrina', apelido: 'Tubarão', cidade: 'Londrina', estado: 'PR' },
  { nome: 'Operário-PR', apelido: 'Fantasma', cidade: 'Ponta Grossa', estado: 'PR' },
  { nome: 'Maringá', cidade: 'Maringá', estado: 'PR' },
  { nome: 'Cascavel', cidade: 'Cascavel', estado: 'PR' },
  { nome: 'Rio Branco-PR', cidade: 'Paranaguá', estado: 'PR' },
  { nome: 'Iraty', cidade: 'Irati', estado: 'PR' },

  // ===================== NORDESTE =====================
  // -- Bahia --
  { nome: 'Bahia', apelido: 'Tricolor de Aço', cidade: 'Salvador', estado: 'BA' },
  { nome: 'Vitória', apelido: 'Leão da Barra', cidade: 'Salvador', estado: 'BA' },
  { nome: 'Fluminense de Feira', apelido: 'Touro do Sertão', cidade: 'Feira de Santana', estado: 'BA' },
  { nome: 'Itabuna', cidade: 'Itabuna', estado: 'BA' },
  { nome: 'Serrano-BA', cidade: 'Vitória da Conquista', estado: 'BA' },
  { nome: 'Atlético de Alagoinhas', apelido: 'Carcará', cidade: 'Alagoinhas', estado: 'BA' },
  { nome: 'Vitória da Conquista', cidade: 'Vitória da Conquista', estado: 'BA' },
  // -- Pernambuco --
  { nome: 'Sport', apelido: 'Leão', cidade: 'Recife', estado: 'PE' },
  { nome: 'Santa Cruz', apelido: 'Cobra Coral', cidade: 'Recife', estado: 'PE' },
  { nome: 'Náutico', apelido: 'Timbu', cidade: 'Recife', estado: 'PE' },
  { nome: 'Central', apelido: 'Patativa', cidade: 'Caruaru', estado: 'PE' },
  { nome: 'Salgueiro', apelido: 'Carcará do Sertão', cidade: 'Salgueiro', estado: 'PE' },
  { nome: 'América-PE', cidade: 'Recife', estado: 'PE' },
  { nome: 'Porto', cidade: 'Caruaru', estado: 'PE' },
  { nome: 'Petrolina', cidade: 'Petrolina', estado: 'PE' },
  // -- Ceará --
  { nome: 'Fortaleza', apelido: 'Leão do Pici', cidade: 'Fortaleza', estado: 'CE' },
  { nome: 'Ceará', apelido: 'Vovô', cidade: 'Fortaleza', estado: 'CE' },
  { nome: 'Ferroviário', apelido: 'Tubarão da Barra', cidade: 'Fortaleza', estado: 'CE' },
  { nome: 'Icasa', apelido: 'Verdão do Cariri', cidade: 'Juazeiro do Norte', estado: 'CE' },
  { nome: 'Guarany de Sobral', cidade: 'Sobral', estado: 'CE' },
  { nome: 'Crato', cidade: 'Crato', estado: 'CE' },
  // -- Rio Grande do Norte --
  { nome: 'ABC', apelido: 'Alvinegro', cidade: 'Natal', estado: 'RN' },
  { nome: 'América-RN', apelido: 'Mecão', cidade: 'Natal', estado: 'RN' },
  { nome: 'Potiguar', cidade: 'Mossoró', estado: 'RN' },
  { nome: 'Baraúnas', cidade: 'Mossoró', estado: 'RN' },
  { nome: 'Santa Cruz-RN', cidade: 'Natal', estado: 'RN' },
  { nome: 'Alecrim', cidade: 'Natal', estado: 'RN' },
  // -- Paraíba --
  { nome: 'Botafogo-PB', apelido: 'Belo', cidade: 'João Pessoa', estado: 'PB' },
  { nome: 'Campinense', apelido: 'Raposa', cidade: 'Campina Grande', estado: 'PB' },
  { nome: 'Treze', apelido: 'Galo', cidade: 'Campina Grande', estado: 'PB' },
  { nome: 'Auto Esporte', cidade: 'João Pessoa', estado: 'PB' },
  { nome: 'Sousa', apelido: 'Dinossauro', cidade: 'Sousa', estado: 'PB' },
  { nome: 'Nacional de Patos', cidade: 'Patos', estado: 'PB' },
  // -- Alagoas --
  { nome: 'CSA', apelido: 'Azulão', cidade: 'Maceió', estado: 'AL' },
  { nome: 'CRB', apelido: 'Galo', cidade: 'Maceió', estado: 'AL' },
  { nome: 'ASA', apelido: 'Alvinegro', cidade: 'Arapiraca', estado: 'AL' },
  // -- Sergipe --
  { nome: 'Confiança', apelido: 'Dragão', cidade: 'Aracaju', estado: 'SE' },
  { nome: 'Sergipe', apelido: 'Gafanhoto', cidade: 'Aracaju', estado: 'SE' },
  { nome: 'Itabaiana', apelido: 'Tremendão', cidade: 'Itabaiana', estado: 'SE' },
  // -- Maranhão --
  { nome: 'Sampaio Corrêa', apelido: 'Tricolor', cidade: 'São Luís', estado: 'MA' },
  { nome: 'Moto Club', apelido: 'Papão', cidade: 'São Luís', estado: 'MA' },
  { nome: 'Imperatriz', cidade: 'Imperatriz', estado: 'MA' },
  { nome: 'Maranhão AC', cidade: 'São Luís', estado: 'MA' },
  { nome: 'Bacabal', cidade: 'Bacabal', estado: 'MA' },
  // -- Piauí --
  { nome: 'River-PI', apelido: 'Galo Carijó', cidade: 'Teresina', estado: 'PI' },
  { nome: 'Flamengo-PI', cidade: 'Teresina', estado: 'PI' },
  { nome: '4 de Julho', cidade: 'Piripiri', estado: 'PI' },
  { nome: 'Parnahyba', cidade: 'Parnaíba', estado: 'PI' },

  // ===================== NORTE =====================
  // -- Pará --
  { nome: 'Remo', apelido: 'Leão Azul', cidade: 'Belém', estado: 'PA' },
  { nome: 'Paysandu', apelido: 'Papão', cidade: 'Belém', estado: 'PA' },
  { nome: 'Tuna Luso', apelido: 'Cruzmaltina', cidade: 'Belém', estado: 'PA' },
  { nome: 'Castanhal', apelido: 'Japiim', cidade: 'Castanhal', estado: 'PA' },
  { nome: 'São Raimundo-PA', cidade: 'Santarém', estado: 'PA' },
  { nome: 'Cametá', cidade: 'Cametá', estado: 'PA' },
  // -- Amazonas --
  { nome: 'Nacional-AM', apelido: 'Leão da Vila', cidade: 'Manaus', estado: 'AM' },
  { nome: 'São Raimundo-AM', cidade: 'Manaus', estado: 'AM' },
  { nome: 'Fast Clube', cidade: 'Manaus', estado: 'AM' },
  { nome: 'Rio Negro', cidade: 'Manaus', estado: 'AM' },
  { nome: 'América-AM', cidade: 'Manaus', estado: 'AM' },

  // ===================== CENTRO-OESTE =====================
  // -- Goiás --
  { nome: 'Goiás', apelido: 'Esmeraldino', cidade: 'Goiânia', estado: 'GO' },
  { nome: 'Vila Nova', apelido: 'Tigre', cidade: 'Goiânia', estado: 'GO' },
  { nome: 'Atlético-GO', apelido: 'Dragão', cidade: 'Goiânia', estado: 'GO' },
  { nome: 'Anapolina', apelido: 'Xata', cidade: 'Anápolis', estado: 'GO' },
  { nome: 'Anápolis FC', cidade: 'Anápolis', estado: 'GO' },
  { nome: 'Itumbiara', cidade: 'Itumbiara', estado: 'GO' },
  // -- Distrito Federal --
  { nome: 'Gama', apelido: 'Alviverde', cidade: 'Gama', estado: 'DF' },
  { nome: 'Brasiliense', apelido: 'Jacaré', cidade: 'Taguatinga', estado: 'DF' },
  { nome: 'Ceilândia EC', cidade: 'Ceilândia', estado: 'DF' },
  { nome: 'Sobradinho', cidade: 'Sobradinho', estado: 'DF' },
  { nome: 'Ceilandense', cidade: 'Ceilândia', estado: 'DF' },
  // -- Mato Grosso --
  { nome: 'Cuiabá', apelido: 'Dourado', cidade: 'Cuiabá', estado: 'MT' },
  { nome: 'Mixto', cidade: 'Cuiabá', estado: 'MT' },
  { nome: 'Operário-VG', cidade: 'Várzea Grande', estado: 'MT' },
  { nome: 'União', cidade: 'Rondonópolis', estado: 'MT' },
]

export default AFILIACOES_BRASIL
