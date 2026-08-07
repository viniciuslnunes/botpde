/**
 * Registry de áreas de atuação canônicas por departamento.
 * Semente de conhecimento do domínio (o que cada departamento pode oferecer),
 * consumida pelo seed `packages/db/scripts/seed-departamento-areas.js`.
 *
 * Área NÃO concede permissão — organiza gente e trabalho dentro do
 * departamento. RBAC continua em `Departamento.permissions/permissionsGestor`.
 * A torcida pode criar/renomear/desativar áreas próprias: isto é semente,
 * não trava.
 */

import { slugifyDepartamento } from './permissions.js'

/**
 * @typedef {{
 *   slug: string,
 *   nome: string,
 *   descricao: string,
 *   sazonal: boolean,
 *   icone: string,
 * }} DepartamentoAreaCanonica
 */

/**
 * @typedef {{
 *   deptoSlug: string,
 *   areas: readonly DepartamentoAreaCanonica[],
 * }} DepartamentoAreasCanonicasEntry
 */

/** @type {readonly DepartamentoAreasCanonicasEntry[]} */
export const DEPARTAMENTO_AREAS_CANONICAS = Object.freeze([
  {
    deptoSlug: 'social-e-eventos',
    areas: Object.freeze([
      {
        slug: 'campanha-do-agasalho',
        nome: 'Campanha do Agasalho',
        descricao:
          'Arrecadação e distribuição de roupas de frio e cobertores no inverno, em conjunto com subsedes e pontos de encontro.',
        sazonal: true,
        icone: 'shirt',
      },
      {
        slug: 'festa-das-criancas',
        nome: 'Festa das Crianças',
        descricao:
          'Organização da festa do Dia das Crianças na sede: brinquedos, lanche e recreação para os filhos da torcida.',
        sazonal: true,
        icone: 'gift',
      },
      {
        slug: 'pascoa',
        nome: 'Páscoa',
        descricao: 'Arrecadação e entrega de ovos de páscoa para as crianças ligadas à torcida.',
        sazonal: true,
        icone: 'egg',
      },
      {
        slug: 'natal',
        nome: 'Natal',
        descricao: 'Campanha de Natal solidário: presentes, ceia e ações de fim de ano na sede e subsedes.',
        sazonal: true,
        icone: 'gift',
      },
      {
        slug: 'doacao-de-sangue',
        nome: 'Doação de Sangue',
        descricao: 'Mutirões de doação de sangue em parceria com hemocentros, divulgados e organizados pela torcida.',
        sazonal: false,
        icone: 'heart-pulse',
      },
      {
        slug: 'dia-da-saude',
        nome: 'Dia da Saúde',
        descricao: 'Ação de saúde na sede: aferição de pressão, glicemia e orientação básica para associados.',
        sazonal: false,
        icone: 'stethoscope',
      },
      {
        slug: 'inclusao-digital',
        nome: 'Inclusão Digital',
        descricao: 'Aulas e oficinas de informática básica e uso de internet para associados que não têm acesso.',
        sazonal: false,
        icone: 'laptop',
      },
      {
        slug: 'corrida-de-rua',
        nome: 'Corrida de Rua',
        descricao: 'Organização de corridas/caminhadas da torcida, com inscrição, percurso e apoio no dia.',
        sazonal: false,
        icone: 'footprints',
      },
      {
        slug: 'parcerias-e-instituicoes',
        nome: 'Parcerias e instituições',
        descricao: 'Relacionamento com ONGs, asilos e instituições parceiras das ações sociais da torcida.',
        sazonal: false,
        icone: 'handshake',
      },
      {
        slug: 'datas-comemorativas',
        nome: 'Datas comemorativas',
        descricao: 'Ações pontuais em datas como Dia das Mães, Dia dos Pais e outras comemorações do calendário.',
        sazonal: false,
        icone: 'calendar-heart',
      },
    ]),
  },
  {
    deptoSlug: 'bateria',
    areas: Object.freeze([
      {
        slug: 'escolinha-da-bateria',
        nome: 'Escolinha da Bateria',
        descricao: 'Formação de novos ritmistas: aulas para crianças e iniciantes nos instrumentos da bateria.',
        sazonal: false,
        icone: 'drum',
      },
      {
        slug: 'ensaios',
        nome: 'Ensaios',
        descricao: 'Organização da agenda semanal de ensaios, presença e repertório da bateria.',
        sazonal: false,
        icone: 'music',
      },
      {
        slug: 'escala-de-jogo',
        nome: 'Escala de jogo',
        descricao: 'Definição de quem toca em cada jogo/evento e o posicionamento na arquibancada.',
        sazonal: false,
        icone: 'clipboard-list',
      },
      {
        slug: 'instrumentos',
        nome: 'Instrumentos',
        descricao: 'Controle de instrumentos da bateria (espelha Patrimônio): manutenção, empréstimo e reposição.',
        sazonal: false,
        icone: 'wrench',
      },
    ]),
  },
  {
    deptoSlug: 'caravanas',
    areas: Object.freeze([
      {
        slug: 'viagens',
        nome: 'Viagens',
        descricao: 'Planejamento das caravanas para jogos fora: destino, ônibus contratado e cronograma.',
        sazonal: false,
        icone: 'bus',
      },
      {
        slug: 'embarque',
        nome: 'Embarque',
        descricao: 'Organização do ponto de encontro, lista de embarque e check-in no dia da viagem.',
        sazonal: false,
        icone: 'map-pin',
      },
      {
        slug: 'financeiro-da-viagem',
        nome: 'Financeiro da viagem',
        descricao: 'Cobrança, controle de vagas pagas e prestação de contas de cada caravana.',
        sazonal: false,
        icone: 'wallet',
      },
    ]),
  },
  {
    deptoSlug: 'carnaval',
    areas: Object.freeze([
      {
        slug: 'barracao',
        nome: 'Barracão',
        descricao: 'Montagem de alegorias e fantasias no barracão: cronograma de obra e checklist de entrega.',
        sazonal: true,
        icone: 'warehouse',
      },
      {
        slug: 'alegorias-e-aderecos',
        nome: 'Alegorias e adereços',
        descricao: 'Criação e produção de alegorias, fantasias e adereços para o desfile.',
        sazonal: true,
        icone: 'sparkles',
      },
      {
        slug: 'ensaios-de-rua',
        nome: 'Ensaios de rua',
        descricao: 'Ensaios técnicos e de rua da bateria/comissão de frente para o desfile de carnaval.',
        sazonal: true,
        icone: 'drum',
      },
      {
        slug: 'cronograma',
        nome: 'Cronograma',
        descricao: 'Calendário geral do carnaval: prazos de fantasia, ensaios e concentração no dia do desfile.',
        sazonal: true,
        icone: 'calendar',
      },
    ]),
  },
  {
    deptoSlug: 'comunicacao',
    areas: Object.freeze([
      {
        slug: 'redes-sociais',
        nome: 'Redes sociais',
        descricao: 'Produção e publicação de conteúdo nas redes sociais oficiais da torcida.',
        sazonal: false,
        icone: 'share-2',
      },
      {
        slug: 'comunicados',
        nome: 'Comunicados',
        descricao: 'Redação e publicação de comunicados oficiais para a torcida na Comunidade.',
        sazonal: false,
        icone: 'megaphone',
      },
      {
        slug: 'moderacao',
        nome: 'Moderação',
        descricao: 'Moderação do mural e das conversas da Comunidade, aplicando as regras de convivência.',
        sazonal: false,
        icone: 'shield-check',
      },
      {
        slug: 'cobertura-de-jogo',
        nome: 'Cobertura de jogo',
        descricao: 'Fotos, vídeos e transmissão ao vivo da torcida nos jogos, dentro e fora de casa.',
        sazonal: false,
        icone: 'camera',
      },
    ]),
  },
  {
    deptoSlug: 'materiais-loja',
    areas: Object.freeze([
      {
        slug: 'catalogo',
        nome: 'Catálogo',
        descricao: 'Cadastro e atualização dos produtos oficiais vendidos pela torcida.',
        sazonal: false,
        icone: 'shirt',
      },
      {
        slug: 'estoque',
        nome: 'Estoque',
        descricao: 'Controle de estoque dos materiais: entrada, saída e reposição de itens.',
        sazonal: false,
        icone: 'package',
      },
      {
        slug: 'pedidos-e-entrega',
        nome: 'Pedidos e entrega',
        descricao: 'Separação, embalagem e entrega dos pedidos feitos na loja do portal.',
        sazonal: false,
        icone: 'truck',
      },
    ]),
  },
  {
    deptoSlug: 'financeiro',
    areas: Object.freeze([
      {
        slug: 'mensalidades',
        nome: 'Mensalidades',
        descricao: 'Cobrança e acompanhamento das mensalidades e planos de associação.',
        sazonal: false,
        icone: 'credit-card',
      },
      {
        slug: 'caixa-e-prestacao-de-contas',
        nome: 'Caixa e prestação de contas',
        descricao: 'Registro de entradas e saídas do caixa da torcida e relatórios de prestação de contas.',
        sazonal: false,
        icone: 'wallet',
      },
      {
        slug: 'cobranca',
        nome: 'Cobrança',
        descricao: 'Régua de cobrança de pendências financeiras junto aos associados.',
        sazonal: false,
        icone: 'receipt',
      },
    ]),
  },
  {
    deptoSlug: 'patrimonio',
    areas: Object.freeze([
      {
        slug: 'instrumentos',
        nome: 'Instrumentos',
        descricao: 'Inventário e manutenção dos instrumentos musicais da torcida.',
        sazonal: false,
        icone: 'drum',
      },
      {
        slug: 'bandeiroes-e-faixas',
        nome: 'Bandeirões e faixas',
        descricao: 'Guarda, manutenção e controle de uso dos bandeirões e faixas em jogos.',
        sazonal: false,
        icone: 'flag',
      },
      {
        slug: 'sede-e-mobiliario',
        nome: 'Sede e mobiliário',
        descricao: 'Zeladoria da sede: móveis, equipamentos e manutenção predial.',
        sazonal: false,
        icone: 'building',
      },
    ]),
  },
  {
    deptoSlug: 'bandeiras',
    areas: Object.freeze([
      {
        slug: 'acervo-e-guarda',
        nome: 'Acervo e guarda',
        descricao:
          'Guarda, conservação e conferência dos bandeirões, faixas e mastros — cada peça com responsável e local.',
        sazonal: false,
        icone: 'flag',
      },
      {
        slug: 'escala-de-jogo',
        nome: 'Escala de jogo',
        descricao:
          'Quem leva, estende e recolhe cada bandeira no jogo, com o horário de chegada na arquibancada.',
        sazonal: false,
        icone: 'clipboard-list',
      },
      {
        slug: 'confeccao-e-reforma',
        nome: 'Confecção e reforma',
        descricao:
          'Bandeira nova, remendo, pintura e troca de mastro — orçamento e prestação de contas via projeto.',
        sazonal: false,
        icone: 'scissors',
      },
      {
        slug: 'vistoria-e-liberacao',
        nome: 'Vistoria e liberação',
        descricao:
          'Medidas, mastro e autorização de entrada exigidas pelo clube e pela polícia, conferidas antes do jogo.',
        sazonal: false,
        icone: 'shield-check',
      },
    ]),
  },
  {
    deptoSlug: 'feminino',
    areas: Object.freeze([
      {
        slug: 'acoes-e-acolhimento',
        nome: 'Ações e acolhimento',
        descricao: 'Encontros e ações de acolhimento das mulheres da torcida, dentro e fora da sede.',
        sazonal: false,
        icone: 'heart',
      },
      {
        slug: 'presenca-nos-jogos',
        nome: 'Presença nos jogos',
        descricao: 'Organização da presença e mobilização das torcedoras nos jogos.',
        sazonal: false,
        icone: 'users',
      },
    ]),
  },
  {
    deptoSlug: 'diretoria',
    areas: Object.freeze([
      {
        slug: 'admissao',
        nome: 'Admissão',
        descricao: 'Análise e aprovação de novos sócios e torcedores na fila de admissão.',
        sazonal: false,
        icone: 'user-check',
      },
      {
        slug: 'governanca',
        nome: 'Governança',
        descricao: 'Estatuto, eleições e relacionamento entre Sede, subsedes e PDEs.',
        sazonal: false,
        icone: 'landmark',
      },
      {
        slug: 'juridico-e-conformidade',
        nome: 'Jurídico e conformidade',
        descricao: 'Acompanhamento jurídico da torcida e conformidade com a Lei Geral do Esporte e normas do estatuto.',
        sazonal: false,
        icone: 'scale',
      },
    ]),
  },
])

const BY_DEPTO_SLUG = new Map(DEPARTAMENTO_AREAS_CANONICAS.map((entry) => [entry.deptoSlug, entry.areas]))

/**
 * Áreas canônicas semeadas para um departamento — vazio se o slug não é conhecido.
 * @param {string} deptoSlug
 * @returns {readonly DepartamentoAreaCanonica[]}
 */
export function areasCanonicasDoDepartamento(deptoSlug) {
  return BY_DEPTO_SLUG.get(deptoSlug) ?? []
}

/**
 * Normaliza o nome de uma área para slug ASCII kebab-case — mesma regra de
 * `slugifyDepartamento` (minúsculas, sem acentos, hifens colapsados/aparados).
 * @param {string} nome
 * @returns {string}
 */
export function slugifyArea(nome) {
  return slugifyDepartamento(nome)
}
