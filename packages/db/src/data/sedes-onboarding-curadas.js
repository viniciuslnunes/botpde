/**
 * Subsedes e pontos de encontro curados para o passo Unidade do onboarding.
 * Fontes: sites oficiais, organizadasbrasil.com, diretório nacional (docs/knowledge).
 */
import { GAVIOES_SUBSEDES_OFICIAIS } from './gavioes-subsedes-oficiais.js'
/** @typedef {'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'} TipoSedeCurada */

/**
 * @typedef {{
 *   id: string
 *   nome: string
 *   tipo: TipoSedeCurada
 *   cidade?: string | null
 *   estado?: string | null
 *   endereco?: string | null
 *   parentId?: string
 *   fonte?: string
 * }} UnidadeCurada
 */

/**
 * @typedef {{
 *   tenantSlugs: string[]
 *   tenantNomes?: string[]
 *   unidades: UnidadeCurada[]
 * }} SedesTenantCuradas
 */

/** @type {SedesTenantCuradas[]} */
export const SEDES_ONBOARDING_CURADAS = [
  {
    tenantSlugs: ['pde-gavioes-fiel'],
    tenantNomes: ['Gaviões'],
    unidades: GAVIOES_SUBSEDES_OFICIAIS,
  },
  {
    tenantSlugs: ['camisa-12-corinthians'],
    unidades: [
      {
        id: 'subsede-camisa12-grande-sp',
        nome: 'Grande São Paulo',
        tipo: 'SUBSEDE',
        cidade: 'São Paulo',
        estado: 'SP',
        fonte: 'Sede nacional no Pari — núcleos metropolitanos',
      },
      {
        id: 'pde-camisa12-zona-leste',
        nome: 'Zona Leste',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'São Paulo',
        estado: 'SP',
        parentId: 'subsede-camisa12-grande-sp',
      },
      {
        id: 'pde-camisa12-abc',
        nome: 'ABC Paulista',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'São Bernardo do Campo',
        estado: 'SP',
        parentId: 'subsede-camisa12-grande-sp',
      },
    ],
  },
  {
    tenantSlugs: ['pavilhao-nove'],
    unidades: [
      {
        id: 'subsede-p9-zona-norte',
        nome: 'Zona Norte',
        tipo: 'SUBSEDE',
        cidade: 'São Paulo',
        estado: 'SP',
        fonte: 'Sede Vila dos Remédios — núcleo zona norte',
      },
      {
        id: 'pde-p9-vila-remedios',
        nome: 'Vila dos Remédios',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'São Paulo',
        estado: 'SP',
        endereco: 'Avenida dos Remédios, 90',
        parentId: 'subsede-p9-zona-norte',
        fonte: 'organizadasbrasil.com — Pavilhão Nove',
      },
    ],
  },
  {
    tenantSlugs: [
      'torcida-organizada-coringao-chopp-sp',
      'torcida-organizada-coringao-chopp',
      'coringao-chopp',
    ],
    tenantNomes: ['Coringão Chopp', 'CORINGÃO CHOPP'],
    unidades: [
      {
        id: 'subsede-coringao-barris',
        nome: 'Barris',
        tipo: 'SUBSEDE',
        cidade: 'São Bernardo do Campo',
        estado: 'SP',
        fonte: 'organizadasbrasil.com — subsedes: Barris',
      },
      {
        id: 'pde-coringao-sbc-centro',
        nome: 'São Bernardo — Centro',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'São Bernardo do Campo',
        estado: 'SP',
        endereco: 'Rua Moinho Fabrini, 50',
        parentId: 'subsede-coringao-barris',
        fonte: 'Sede nacional Coringão Chopp',
      },
    ],
  },
  {
    tenantSlugs: ['estopim-da-fiel-sp', 'estopim-da-fiel'],
    tenantNomes: ['Estopim', 'ESTOPIM', 'Estopim da Fiel'],
    unidades: [
      {
        id: 'subsede-estopim-grande-abc',
        nome: 'Grande ABC',
        tipo: 'SUBSEDE',
        cidade: 'Diadema',
        estado: 'SP',
        fonte: 'Sede Diadema — núcleo ABC',
      },
      {
        id: 'pde-estopim-diadema',
        nome: 'Diadema — Centro',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'Diadema',
        estado: 'SP',
        endereco: 'Rua São Jorge, 154',
        parentId: 'subsede-estopim-grande-abc',
        fonte: 'organizadasbrasil.com — Estopim da Fiel',
      },
    ],
  },
  {
    tenantSlugs: ['torcida-fiel-macabra-sp', 'torcida-fiel-macabra', 'fiel-macabra'],
    tenantNomes: ['Fiel Macabra', 'FIEL MACABRA'],
    unidades: [
      {
        id: 'subsede-macabra-bauru',
        nome: 'Bauru e região',
        tipo: 'SUBSEDE',
        cidade: 'Bauru',
        estado: 'SP',
        fonte: 'Sede Bauru — interior paulista',
      },
      {
        id: 'pde-macabra-vila-ipiranga',
        nome: 'Vila Ipiranga',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'Bauru',
        estado: 'SP',
        endereco: 'Rua Nicolau Delgallo, 18-18',
        parentId: 'subsede-macabra-bauru',
        fonte: 'organizadasbrasil.com — Fiel Macabra',
      },
    ],
  },
  {
    tenantSlugs: ['mancha-alviverde'],
    tenantNomes: ['Mancha Alviverde'],
    unidades: [
      {
        id: 'subsede-mancha-campinas',
        nome: 'Campinas',
        tipo: 'SUBSEDE',
        cidade: 'Campinas',
        estado: 'SP',
        fonte: 'Wikipédia / estrutura nacional Mancha Alviverde',
      },
      {
        id: 'subsede-mancha-brasilia',
        nome: 'Brasília',
        tipo: 'SUBSEDE',
        cidade: 'Brasília',
        estado: 'DF',
        fonte: 'Wikipédia / estrutura nacional Mancha Alviverde',
      },
      {
        id: 'subsede-mancha-curitiba',
        nome: 'Curitiba',
        tipo: 'SUBSEDE',
        cidade: 'Curitiba',
        estado: 'PR',
        fonte: 'Wikipédia / estrutura nacional Mancha Alviverde',
      },
    ],
  },
  {
    tenantSlugs: ['torcida-jovem-flamengo'],
    tenantNomes: ['Torcida Jovem', 'Jovem Fla'],
    unidades: [
      {
        id: 'subsede-jovemfla-pelotao-central',
        nome: 'Pelotão Central',
        tipo: 'SUBSEDE',
        cidade: 'Rio de Janeiro',
        estado: 'RJ',
        fonte: 'lojajovemfla.com.br/pelotoes — Tijuca, Maracanã, Grajaú',
      },
      {
        id: 'subsede-jovemfla-primeiro-pelotao',
        nome: '1º Pelotão — Zona Sul',
        tipo: 'SUBSEDE',
        cidade: 'Rio de Janeiro',
        estado: 'RJ',
        fonte: 'lojajovemfla.com.br/pelotoes — Copacabana, Laranjeiras, Leblon',
      },
      {
        id: 'subsede-jovemfla-brasilia',
        nome: 'Pelotão Brasília',
        tipo: 'SUBSEDE',
        cidade: 'Brasília',
        estado: 'DF',
        fonte: 'lojajovemfla.com.br — presença nacional',
      },
      {
        id: 'subsede-jovemfla-bh',
        nome: 'Pelotão Belo Horizonte',
        tipo: 'SUBSEDE',
        cidade: 'Belo Horizonte',
        estado: 'MG',
        fonte: 'lojajovemfla.com.br — presença nacional',
      },
    ],
  },
  {
    tenantSlugs: ['galoucura'],
    tenantNomes: ['Galoucura'],
    unidades: [
      {
        id: 'subsede-galoucura-interior-mg',
        nome: 'Interior de Minas',
        tipo: 'SUBSEDE',
        estado: 'MG',
        fonte: 'Estrutura regional — torcida nacional Atlético-MG',
      },
    ],
  },
  {
    tenantSlugs: ['geral-do-gremio'],
    tenantNomes: ['Geral do Grêmio'],
    unidades: [
      {
        id: 'subsede-geral-serra',
        nome: 'Serra Gaúcha',
        tipo: 'SUBSEDE',
        cidade: 'Caxias do Sul',
        estado: 'RS',
        fonte: 'organizadasbrasil.com — núcleos regionais',
      },
    ],
  },
]
