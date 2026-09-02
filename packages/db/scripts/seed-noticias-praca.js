/**
 * Seed de teste — notícias da praça (ArtigoPortal) já ranqueadas.
 *
 * Alvos: Gaviões da Fiel, PDE FIEL BAIXADA (Caso B) e Camisa 12.
 * ~10 artigos por tenant, com visitas / votos / pin / recência espalhados
 * para conferir Mais vistas, Em alta e Recentes.
 *
 * Idempotente (IDs `noticias-demo-*`, sem dois-pontos — o App Router 404a
 * em `/noticias/noticias-demo:gavioes:assembleia`). Só Postgres local.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:noticias-praca
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:noticias-praca -- --reset
 */
import { PrismaClient } from '@prisma/client'
import { assertNotProductionSeed, prepareSeedEnv } from './lib/seed-env.js'

if (!process.env.TORCIDA_ENV) process.env.TORCIDA_ENV = 'local'
assertNotProductionSeed('seed:noticias-praca')
const { alvo, dbKind } = prepareSeedEnv({ scriptLabel: 'seed:noticias-praca' })

if (dbKind !== 'local') {
  throw new Error(
    `seed:noticias-praca só grava em Postgres localhost (agora: ${dbKind}, TORCIDA_ENV=${alvo}).\n` +
      'Confira DATABASE_URL em apps/web/.env.local — deve apontar para 127.0.0.1/localhost.',
  )
}

const db = new PrismaClient()
const RESET = process.argv.includes('--reset')
const ID_PREFIX = 'noticias-demo-'
const ID_PREFIX_LEGADO = 'noticias-demo:'

const GAVIOES_SLUG = 'pde-gavioes-fiel'
const CAMISA_SLUG = 'camisa-12-corinthians'
const PDE_SLUGS = ['pde-fiel-baixada-praia-grande-praia-grande', 'pde-fiel-baixada']
const PDE_SEDE_ID = 'pde-fiel-baixada'

/** @param {string} photoId */
function foto(photoId) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=80`
}

function horasAtras(horas) {
  return new Date(Date.now() - horas * 3_600_000)
}

function diasAtras(dias) {
  return new Date(Date.now() - dias * 24 * 3_600_000)
}

/**
 * @param {string} slug
 * @returns {Promise<{
 *   tenant: { id: string, slug: string, nome: string },
 *   ownerId: string,
 * } | null>}
 */
async function carregarAlvo(slug) {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, nome: true },
  })
  if (!tenant) return null
  return montarAlvo(tenant)
}

/**
 * @param {{ id: string, slug: string, nome: string }} tenant
 */
async function montarAlvo(tenant) {
  const ownerRole = await db.userRole.findFirst({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  const fallback = await db.saasMembro.findFirst({
    where: { tenantId: tenant.id, status: 'APROVADO' },
    select: { userId: true },
    orderBy: { criadoEm: 'asc' },
  })
  const ownerId = ownerRole?.userId ?? fallback?.userId
  if (!ownerId) {
    console.warn(`⚠ ${tenant.nome} (${tenant.slug}): sem owner nem sócio aprovado — pulando.`)
    return null
  }
  return { tenant, ownerId }
}

async function encontrarPdeBaixada(gavioesId) {
  for (const slug of PDE_SLUGS) {
    const alvoTenant = await carregarAlvo(slug)
    if (alvoTenant) return alvoTenant
  }

  const sede = await db.sede.findFirst({
    where: {
      OR: [
        { id: PDE_SEDE_ID },
        { nome: { equals: 'PDE FIEL BAIXADA', mode: 'insensitive' } },
        { nome: { contains: 'FIEL BAIXADA', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      nome: true,
      tenantId: true,
      tenant: { select: { id: true, slug: true, nome: true } },
    },
  })
  if (sede?.tenant) {
    if (sede.tenant.id === gavioesId) {
      console.warn(
        `⚠ PDE FIEL BAIXADA (${sede.id}) ainda é Caso A — mesmo tenant da Sede Gaviões.\n` +
          '   Artigo da unidade misturaria com o da torcida; pulando a PDE.',
      )
      return null
    }
    return montarAlvo(sede.tenant)
  }

  const porSlug = await db.tenant.findFirst({
    where: { slug: { contains: 'fiel-baixada' } },
    select: { id: true, slug: true, nome: true },
  })
  if (porSlug && porSlug.id !== gavioesId) return montarAlvo(porSlug)

  console.warn(
    '⚠ PDE FIEL BAIXADA não encontrada (slug Caso B ou Sede `pde-fiel-baixada`). Pulando.',
  )
  return null
}

/**
 * Canal oficial do tenant (elegível para notícia). Cria se faltar —
 * a PDE Baixada no lote de convites nasce sem mural.
 *
 * @param {{ id: string, nome: string }} tenant
 * @param {string} ownerId
 */
async function garantirCanalOficial(tenant, ownerId) {
  const existente = await db.conversa.findFirst({
    where: { tenantId: tenant.id, tipo: 'CANAL', canalOficial: true },
    select: { id: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (existente) return existente.id

  const canal = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: tenant.id,
      nome: tenant.nome,
      descricao: 'Canal oficial',
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: 'ALIADOS',
      somenteAdminPublica: false,
      publica: false,
      criadoPorId: ownerId,
    },
    select: { id: true },
  })
  console.log(`  · canal oficial criado: ${canal.id}`)
  return canal.id
}

/** @param {string} chave @param {string} titulo @param {string} resumo @param {string} corpo */
function noticia(chave, titulo, resumo, corpo, extra) {
  return { chave, titulo, resumo, corpo, ...extra }
}

/**
 * História intercalada (foto → texto → foto) pra leitura no detalhe.
 * @param {{ resumo: string, corpo: string, midias?: string[] }} item
 */
function blocosDaNoticia(item) {
  const midias = item.midias ?? []
  const blocos = []
  if (midias[0]) {
    blocos.push({ tipo: 'imagem', url: midias[0], legenda: item.resumo })
  }
  const paras = String(item.corpo)
    .split(/\n\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  paras.forEach((texto, i) => {
    blocos.push({ tipo: 'texto', texto })
    if (i === 0 && midias[1]) {
      blocos.push({ tipo: 'imagem', url: midias[1] })
    }
  })
  if (blocos.length === 0) {
    blocos.push({ tipo: 'texto', texto: item.resumo })
  }
  return blocos
}

const FOTOS = {
  onibus: foto('photo-1544620341-1adc1baa5c90'),
  arquibancada: foto('photo-1519892300165-cb5542fb47c7'),
  estadio: foto('photo-1574629810360-7efbbe195018'),
  assembleia: foto('photo-1431540015161-0bf868a2d407'),
  ensaio: foto('photo-1493225457124-a3eb161ffa5f'),
  comida: foto('photo-1555939594-58d7cb561ad1'),
}

const NOTICIAS_GAVIOES = [
  noticia(
    'assembleia',
    'Assembleia geral na sede — pauta e horário',
    'Associado em dia tem voz e voto. Pauta no mural da sede; portão fecha 19h.',
    'A assembleia geral ordinária é nesta quarta, no salão nobre da sede, a partir das 19h.\n\nPauta no mural: prestação de contas, calendário de caravana e reforma do barracão. Associado em dia tem voz e voto. Chega cedo — o portão fecha no horário.',
    {
      fixado: true,
      visitas: 86,
      gostei: 11,
      naoGostei: 1,
      quando: diasAtras(5),
      midias: [FOTOS.assembleia],
    },
  ),
  noticia(
    'caravana',
    'Caravana confirmada para o clássico — vagas no ônibus da sede',
    'Saída 5h30. Pix da vaquinha fecha hoje à noite. Sem vaga de última hora.',
    'Caravana pro clássico está confirmada. O ônibus da sede sai 5h30 em ponto. Quem já pagou confirma presença no canal; lista fecha quando lotar.\n\nPix da vaquinha fecha hoje à noite. Sem vaga de última hora na porta — se vai, confirma agora.',
    {
      visitas: 428,
      gostei: 19,
      naoGostei: 2,
      quando: diasAtras(8),
      midias: [FOTOS.onibus],
    },
  ),
  noticia(
    'bandeirao',
    'Bandeirão novo no barracão — precisa de braço nesta semana',
    'Costura e haste. Quem puder aparecer no barracão depois das 18h.',
    'O bandeirão novo já está no barracão. Falta costura na borda e gente pra haste no dia do jogo.\n\nQuem puder aparecer esta semana depois das 18h, marca no canal. Material de arquibancada não se faz sozinho.',
    {
      visitas: 312,
      gostei: 14,
      naoGostei: 1,
      quando: diasAtras(6),
      midias: [FOTOS.estadio],
    },
  ),
  noticia(
    'ensaio',
    'Ensaio da bateria amanhã — surdo e caixa, chega cedo',
    'Ritmo do clássico. Recruta de surdo e caixa: aparece no ensaio, não no setor.',
    'Ensaio da bateria amanhã na sede. Surdo e caixa, o ritmo do clássico. Quem é recruta aparece no ensaio — não chega direto no setor.\n\nPortão abre 19h. Leva água. Se chover, o combinado é o mesmo.',
    {
      visitas: 24,
      gostei: 38,
      naoGostei: 2,
      quando: horasAtras(2),
      midias: [FOTOS.ensaio, FOTOS.arquibancada],
    },
  ),
  noticia(
    'infantil',
    'Recruta do infantil no próximo jogo — encontro no portão 8',
    'Criança vai junto do responsável. Colete da Gaviões e documento.',
    'Infantil no próximo jogo: encontro no portão 8, duas horas antes do apito.\n\nCriança fica junto do responsável o tempo todo. Colete da Gaviões e documento. Sem se perder na saída.',
    {
      visitas: 8,
      gostei: 4,
      naoGostei: 0,
      quando: horasAtras(6),
      midias: [],
    },
  ),
  noticia(
    'concentracao',
    'Concentração pré-jogo na sede — saída às 14h com faixa',
    'Bandeirão e faixa na ordem combinada. Foto oficial de camisa preta.',
    'Concentração na sede às 14h. Bandeirão e faixa saem na ordem combinada — ninguém fura fila com material.\n\nFoto oficial da torcida antes de sair: todo mundo de camisa preta. Quem atrasar encontra o grupo no setor, não na porta da sede.',
    {
      visitas: 41,
      gostei: 22,
      naoGostei: 1,
      quando: horasAtras(16),
      midias: [FOTOS.arquibancada],
    },
  ),
  noticia(
    'jaqueta',
    'Loja: restock da jaqueta preta — tamanho G some rápido',
    'Retirada na sede. Socio em dia tem prioridade na fila.',
    'Entrou restock da jaqueta preta na loja da sede. Tamanho G some rápido — quem viu no último lote já sabe.\n\nRetirada no balcão. Sócio em dia tem prioridade na fila. Sem reserva por recado.',
    {
      visitas: 157,
      gostei: 9,
      naoGostei: 0,
      quando: diasAtras(3),
      midias: [FOTOS.arquibancada],
    },
  ),
  noticia(
    'agasalho',
    'Ação de agasalho na sede — doação até sexta',
    'Roupa limpa e em estado de uso. Entrega no barracão, não na portaria.',
    'Ação de agasalho até sexta. Roupa limpa e em estado de uso — a gente não é depósito de trapo.\n\nEntrega no barracão, em horário de expediente. A portaria não recebe doação avulsa no domingo.',
    {
      visitas: 91,
      gostei: 16,
      naoGostei: 0,
      quando: diasAtras(7),
      midias: [FOTOS.comida],
    },
  ),
  noticia(
    'portaria',
    'Portaria da sede no domingo — escala e combinado',
    'Quem está na escala chega 30 min antes. Sem celular na catraca.',
    'Escala da portaria no domingo já está no mural. Quem está na lista chega 30 minutos antes — o portão não espera.\n\nCombinado de sempre: documento na mão, sem celular na catraca, respeito com quem entra.',
    {
      visitas: 47,
      gostei: 5,
      naoGostei: 1,
      quando: diasAtras(12),
      midias: [],
    },
  ),
  noticia(
    'barracao',
    'Limpeza do barracão depois do ensaio — quem confirma',
    'Faixa no chão não fica. Vassoura, saco e 40 minutos de trabalho.',
    'Depois do ensaio de ontem o barracão ficou pra trás. Faixa no chão não fica — isso aqui é da Fiel.\n\nQuem puder aparecer hoje no fim da tarde: vassoura, saco e uns 40 minutos. Marca no canal.',
    {
      visitas: 6,
      gostei: 2,
      naoGostei: 0,
      quando: diasAtras(21),
      midias: [],
    },
  ),
]

const NOTICIAS_PDE = [
  noticia(
    'ponto',
    'Ponto de encontro na Praia Grande no próximo jogo',
    'Saída da PDE FIEL BAIXADA. Quem vem do Canto do Forte encontra no portão.',
    'No próximo jogo o ponto de encontro é na PDE FIEL BAIXADA, em Praia Grande. Quem vem do Canto do Forte encontra no portão da unidade.\n\nHorário no mural. Sem atraso: o ônibus não espera quem ficou no café.',
    {
      fixado: true,
      visitas: 74,
      gostei: 9,
      naoGostei: 0,
      quando: diasAtras(4),
      midias: [FOTOS.assembleia],
    },
  ),
  noticia(
    'onibus',
    'Ônibus da PDE sai 5h30 da rodoviária',
    'Lista fecha quando lotar. Pix da van extra só se estourar a lotação.',
    'Ônibus da PDE FIEL BAIXADA sai 5h30 da rodoviária de Praia Grande. Lista fecha quando lotar — confirma no canal da unidade.\n\nSe estourar, abre van extra. Pix da van só depois que a lista do ônibus fechar.',
    {
      visitas: 391,
      gostei: 17,
      naoGostei: 1,
      quando: diasAtras(9),
      midias: [FOTOS.onibus],
    },
  ),
  noticia(
    'faixa',
    'Faixa da Baixada no setor — ordem de entrada',
    'Material sobe junto. Ninguém fura com faixa no colo na catraca.',
    'Faixa da Baixada entra na ordem combinada. Material sobe junto do grupo — ninguém fura com faixa no colo na catraca.\n\nQuem leva a grande confirma hoje. Se chover, capa na faixa e nada no chão.',
    {
      visitas: 268,
      gostei: 12,
      naoGostei: 1,
      quando: diasAtras(6),
      midias: [FOTOS.estadio],
    },
  ),
  noticia(
    'churrasco',
    'Churrasco pós-jogo na PDE — leva o que puder',
    'Volta pra Praia Grande. Carne, carvão e gelo. Criança junto do responsável.',
    'Depois do jogo a PDE abre o churrasco na unidade. Leva o que puder: carne, carvão, gelo.\n\nCriança vai junto do responsável. Sem politicagem na mesa — é da Fiel da Baixada, ponto.',
    {
      visitas: 29,
      gostei: 34,
      naoGostei: 1,
      quando: horasAtras(3),
      midias: [FOTOS.comida],
    },
  ),
  noticia(
    'van',
    'Van extra se lotar o ônibus — lista no canal da PDE',
    'Só abre se o ônibus fechar. Nome e bairro pra encaixar a carona.',
    'Van extra só abre se o ônibus da PDE lotar. Quem ficou de fora deixa nome e bairro no canal — a gente encaixa.\n\nSem lista paralela no Whats de desconhecido. Combinado é aqui.',
    {
      visitas: 11,
      gostei: 5,
      naoGostei: 0,
      quando: horasAtras(5),
      midias: [],
    },
  ),
  noticia(
    'ensaio-pg',
    'Ensaio da bateria da Baixada na sexta',
    'Salão da PDE. Surdo e caixa. Recruta aparece no ensaio, não no setor.',
    'Ensaio da bateria da Baixada na sexta, no salão da PDE. Surdo e caixa — o mesmo ritmo da sede, com o sotaque da Praia Grande.\n\nRecruta aparece no ensaio. Portão 19h. Leva água.',
    {
      visitas: 38,
      gostei: 21,
      naoGostei: 1,
      quando: horasAtras(17),
      midias: [FOTOS.ensaio],
    },
  ),
  noticia(
    'agua',
    'Doação de água pro ônibus do clássico',
    'Gelo e garrafa lacrada. Entrega na PDE até quinta à noite.',
    'A PDE precisa de água e gelo pro ônibus do clássico. Garrafa lacrada — lata quente no colo não resolve.\n\nEntrega na unidade até quinta à noite. Quem puder, marca quantidade no canal.',
    {
      visitas: 142,
      gostei: 10,
      naoGostei: 0,
      quando: diasAtras(3),
      midias: [FOTOS.onibus],
    },
  ),
  noticia(
    'portaria-pg',
    'Portaria da PDE no sábado — escala da Baixada',
    'Quem está na lista chega 30 min antes. Documento na mão.',
    'Escala da portaria da PDE no sábado já saiu. Quem está na lista chega 30 minutos antes.\n\nDocumento na mão, respeito com quem entra. A unidade é pequena: bagunça na porta vira problema de todo mundo.',
    {
      visitas: 83,
      gostei: 7,
      naoGostei: 0,
      quando: diasAtras(8),
      midias: [],
    },
  ),
  noticia(
    'infantil-pg',
    'Infantil da Baixada: encontro no Canto do Forte',
    'Duas horas antes do ônibus. Colete e responsável junto o tempo todo.',
    'Infantil da PDE: encontro no Canto do Forte, duas horas antes do ônibus.\n\nCriança com colete e responsável o tempo todo. Sem se perder na rodoviária — o grupo sobe junto.',
    {
      visitas: 44,
      gostei: 6,
      naoGostei: 0,
      quando: diasAtras(11),
      midias: [],
    },
  ),
  noticia(
    'limpeza-pg',
    'Limpeza da PDE depois do ensaio — quem confirma',
    'Salão e pátio. Vassoura, saco e meia hora. Marca no canal.',
    'Depois do ensaio o salão da PDE ficou pra trás. Vassoura, saco e meia hora resolvem.\n\nQuem puder aparecer hoje no fim da tarde, marca no canal da unidade.',
    {
      visitas: 5,
      gostei: 2,
      naoGostei: 0,
      quando: diasAtras(19),
      midias: [],
    },
  ),
]

const NOTICIAS_CAMISA = [
  noticia(
    'posicionamento',
    'Posicionamento da Camisa 12 no clássico',
    'Porta 3, faixa na ordem combinada. Respeito no setor, porrada no campo.',
    'No clássico a Camisa 12 concentra na porta 3. Faixa na ordem combinada — ninguém fura com material.\n\nRespeito no setor, porrada no campo. Sem politicagem no fio e sem briga de ego com aliado.',
    {
      fixado: true,
      visitas: 79,
      gostei: 13,
      naoGostei: 1,
      quando: diasAtras(5),
      midias: [FOTOS.assembleia],
    },
  ),
  noticia(
    'porta3',
    'Concentração na porta 3 — horário e faixa',
    'Duas horas antes do apito. Foto oficial de camisa. Quem atrasar encontra no setor.',
    'Concentração na porta 3, duas horas antes do apito. Faixa grande sobe com o grupo.\n\nFoto oficial antes de entrar: camisa da Camisa 12. Quem atrasar encontra o grupo no setor, não na fila da porta.',
    {
      visitas: 405,
      gostei: 18,
      naoGostei: 2,
      quando: diasAtras(8),
      midias: [FOTOS.arquibancada],
    },
  ),
  noticia(
    'caravana-c12',
    'Caravana da Camisa 12 — vagas no ônibus',
    'Saída 6h. Pix fecha hoje. Sem vaga de última hora na garagem.',
    'Caravana da Camisa 12 confirmada. Ônibus sai 6h em ponto. Quem já pagou confirma no canal.\n\nPix fecha hoje à noite. Sem vaga de última hora na garagem.',
    {
      visitas: 298,
      gostei: 15,
      naoGostei: 1,
      quando: diasAtras(7),
      midias: [FOTOS.onibus],
    },
  ),
  noticia(
    'ensaio-c12',
    'Ensaio da bateria no salão — amanhã',
    'Surdo e caixa. Recruta aparece no ensaio. Portão 19h.',
    'Ensaio da bateria da Camisa 12 amanhã no salão. Surdo e caixa, o canto que não pode faltar no clássico.\n\nRecruta aparece no ensaio. Portão 19h. Leva água.',
    {
      visitas: 21,
      gostei: 36,
      naoGostei: 2,
      quando: horasAtras(2),
      midias: [FOTOS.ensaio],
    },
  ),
  noticia(
    'recruta',
    'Recruta nova na arquibancada — combinado de setor',
    'Quem é novo chega 30 min antes. Sem se perder na saída.',
    'Recruta nova na arquibancada: quem é novo chega 30 minutos antes e fica junto do grupo.\n\nSem se perder na saída. O setor da Camisa 12 não é passeio — é trabalho de torcida.',
    {
      visitas: 9,
      gostei: 4,
      naoGostei: 0,
      quando: horasAtras(7),
      midias: [],
    },
  ),
  noticia(
    'alianca',
    'Aliança com a Gaviões no clássico — combinado de faixa',
    'Irmandade na prática. Horário e ordem combinados com a Gaviões da Fiel.',
    'No clássico a Camisa 12 e a Gaviões da Fiel sobem com o combinado de faixa. Irmandade na prática, não no discurso.\n\nHorário e ordem já fechados com a Gaviões. Sem surpresa na porta.',
    {
      visitas: 46,
      gostei: 24,
      naoGostei: 1,
      quando: horasAtras(15),
      midias: [FOTOS.estadio],
    },
  ),
  noticia(
    'loja-c12',
    'Loja: camisa retrô da Camisa 12 — restock',
    'Retirada no balcão. Tamanho M e G somem primeiro.',
    'Entrou restock da camisa retrô na loja da Camisa 12. Tamanho M e G somem primeiro.\n\nRetirada no balcão. Sem reserva por recado. Sócio em dia tem prioridade.',
    {
      visitas: 163,
      gostei: 11,
      naoGostei: 0,
      quando: diasAtras(3),
      midias: [FOTOS.arquibancada],
    },
  ),
  noticia(
    'social',
    'Ação social no bairro — doação até sábado',
    'Alimento não perecível e agasalho limpo. Entrega na sede, não na portaria do jogo.',
    'Ação social da Camisa 12 até sábado. Alimento não perecível e agasalho limpo.\n\nEntrega na sede, em horário de expediente. A portaria do jogo não recebe doação avulsa.',
    {
      visitas: 88,
      gostei: 14,
      naoGostei: 0,
      quando: diasAtras(6),
      midias: [FOTOS.comida],
    },
  ),
  noticia(
    'assembleia-c12',
    'Assembleia da Camisa 12 — pauta no mural',
    'Quarta, 19h. Prestação de contas e calendário de caravana.',
    'Assembleia da Camisa 12 nesta quarta, 19h, no salão. Pauta no mural: prestação de contas e calendário de caravana.\n\nAssociado em dia tem voz e voto. Portão fecha no horário.',
    {
      visitas: 52,
      gostei: 8,
      naoGostei: 1,
      quando: diasAtras(13),
      midias: [FOTOS.assembleia],
    },
  ),
  noticia(
    'material',
    'Material de arquibancada — quem leva a faixa grande',
    'Confirma no canal. Faixa rasgada não sobe. Costura ainda esta semana.',
    'Precisa de gente pra levar a faixa grande no clássico. Quem confirma, marca no canal.\n\nFaixa rasgada não sobe. Costura ainda esta semana, no salão, depois do expediente.',
    {
      visitas: 7,
      gostei: 3,
      naoGostei: 0,
      quando: diasAtras(20),
      midias: [],
    },
  ),
]

/**
 * @param {string} prefixo
 * @param {{ tenant: { id: string, slug: string, nome: string }, ownerId: string }} alvoTenant
 * @param {typeof NOTICIAS_GAVIOES} itens
 */
async function semearTenant(prefixo, alvoTenant, itens) {
  const { tenant, ownerId } = alvoTenant
  const conversaId = await garantirCanalOficial(tenant, ownerId)

  if (RESET) {
    const apagados = await db.artigoPortal.deleteMany({
      where: { id: { startsWith: `${ID_PREFIX}${prefixo}-` } },
    })
    if (apagados.count) {
      console.log(`  ↺  ${tenant.nome}: ${apagados.count} artigo(s) resetados`)
    }
  }

  let criados = 0
  let atualizados = 0
  for (const item of itens) {
    const id = `${ID_PREFIX}${prefixo}-${item.chave}`
    const midiaUrls = item.midias ?? []
    const publicadoEm = item.quando
    const data = {
      tenantId: tenant.id,
      autorId: ownerId,
      conversaId,
      titulo: item.titulo,
      resumo: item.resumo,
      corpo: item.corpo,
      capaUrl: midiaUrls[0] ?? null,
      midiaUrls,
      blocos: blocosDaNoticia(item),
      origem: 'OFICIAL',
      status: 'PUBLICADO',
      fixado: Boolean(item.fixado),
      visitas: item.visitas,
      gostei: item.gostei,
      naoGostei: item.naoGostei,
      publicadoEm,
      criadoEm: publicadoEm,
    }

    const existente = await db.artigoPortal.findUnique({
      where: { id },
      select: { id: true },
    })
    if (existente) {
      await db.artigoPortal.update({ where: { id }, data })
      atualizados += 1
    } else {
      await db.artigoPortal.create({ data: { id, ...data } })
      criados += 1
    }
  }

  const ordenadosVistas = [...itens].sort((a, b) => {
    if (Boolean(a.fixado) !== Boolean(b.fixado)) return a.fixado ? -1 : 1
    return b.visitas - a.visitas
  })
  const agora = new Date()
  const ordenadosAlta = [...itens].sort((a, b) => {
    if (Boolean(a.fixado) !== Boolean(b.fixado)) return a.fixado ? -1 : 1
    const sa = scoreHotSimples(b, agora) - scoreHotSimples(a, agora)
    return sa
  })

  console.log(
    `  ✅ ${tenant.nome} (${tenant.slug}): ${criados} novas · ${atualizados} atualizadas · canal ${conversaId}`,
  )
  console.log(`     Mais vistas: ${ordenadosVistas.map((n) => `${n.titulo.split('—')[0].trim()} (${n.visitas})`).join(' · ')}`)
  console.log(`     Em alta:     ${ordenadosAlta.map((n) => n.titulo.split('—')[0].trim()).join(' · ')}`)
}

/** Espelho enxuto de `scoreHotTopico` só pro log do seed (sem importar types). */
function scoreHotSimples(t, agora) {
  const ageHours = Math.max(0, (agora.getTime() - t.quando.getTime()) / 3_600_000)
  const freshness = Math.max(0, 72 - ageHours) * 1.5
  const liquido = t.gostei - t.naoGostei * 2
  const mediaBoost = (t.midias?.length ?? 0) > 0 ? 2 : 0
  return freshness + Math.max(0, liquido) * 1.25 + mediaBoost + (t.fixado ? 12 : 0)
}

async function main() {
  const legado = await db.artigoPortal.deleteMany({
    where: { id: { startsWith: ID_PREFIX_LEGADO } },
  })
  if (legado.count) {
    console.log(
      `  ↺  ${legado.count} artigo(s) com id legado (dois-pontos) removidos — Next.js 404a nesse path`,
    )
  }

  const gavioes = await carregarAlvo(GAVIOES_SLUG)
  if (!gavioes) {
    throw new Error(`Tenant ${GAVIOES_SLUG} não encontrado. Rode o seed da Gaviões.`)
  }

  const [pde, camisa] = await Promise.all([
    encontrarPdeBaixada(gavioes.tenant.id),
    carregarAlvo(CAMISA_SLUG),
  ])
  if (!camisa) {
    console.warn(`⚠ Tenant ${CAMISA_SLUG} não encontrado — pulando Camisa 12.`)
  }

  console.log(`Gaviões: ${gavioes.tenant.nome}`)
  await semearTenant('gavioes', gavioes, NOTICIAS_GAVIOES)

  if (pde) {
    console.log(`PDE: ${pde.tenant.nome} (${pde.tenant.slug})`)
    await semearTenant('baixada', pde, NOTICIAS_PDE)
  }

  if (camisa) {
    console.log(`Camisa 12: ${camisa.tenant.nome}`)
    await semearTenant('camisa12', camisa, NOTICIAS_CAMISA)
  }

  console.log('\nNotícias de teste prontas.')
  console.log('  Ver: /portal/comunidade/noticias')
  console.log('  Pills: Mais vistas (default) · Em alta · Recentes')
  console.log('  Troca o tenant ativo pra ver cada praça isolada (Sede ≠ PDE ≠ Camisa 12).')
}

main()
  .catch((err) => {
    console.error('❌', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
