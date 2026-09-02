/**
 * Complementa seed:noticias-praca — fases GE do feed:
 * - Partidas demo na afiliação do Corinthians (carrossel + sidebar)
 * - Vídeos curtos (YouTube Shorts / mp4) por tenant
 * - Blocos `relacionados` entre matérias irmãs
 * - Notícias de imprensa na CN (escopo nacional)
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:noticias-feed-demo
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:noticias-feed-demo -- --reset
 */
import { PrismaClient } from '@prisma/client'
import { assertNotProductionSeed, prepareSeedEnv } from './lib/seed-env.js'

if (!process.env.TORCIDA_ENV) process.env.TORCIDA_ENV = 'local'
assertNotProductionSeed('seed:noticias-feed-demo')
const { dbKind } = prepareSeedEnv({ scriptLabel: 'seed:noticias-feed-demo' })

if (dbKind !== 'local') {
  throw new Error('seed:noticias-feed-demo só grava em Postgres local.')
}

const db = new PrismaClient()
const RESET = process.argv.includes('--reset')

const GAVIOES_SLUG = 'pde-gavioes-fiel'
const AFILIACAO_SLUG = 'sport-club-corinthians-paulista-sp'
const ID_PREFIX = 'noticias-demo-'
const PARTIDA_PREFIX = 'partida-demo-noticias-'
const IMPRENSA_PREFIX = 'noticias-imprensa-demo-'

const YT_SHORTS = [
  'https://www.youtube.com/shorts/jNQXAC9IVRw',
  'https://www.youtube.com/shorts/9bZkp7q19f0',
  'https://www.youtube.com/shorts/kJQP7kiw5Fk',
]

const VIDEO_MP4 = 'https://res.cloudinary.com/demo/video/upload/dogs.mp4'

function emDias(dias, hora = 19) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(hora, 0, 0, 0)
  return d
}

function blocoRelacionados(itens) {
  return {
    tipo: 'relacionados',
    itens: itens.map(({ id, titulo }) => ({ artigoId: id, titulo })),
  }
}

async function afiliacaoCorinthians() {
  const row = await db.afiliacao.findFirst({
    where: { slug: AFILIACAO_SLUG },
    select: { id: true, nome: true },
  })
  if (!row) {
    throw new Error(`Afiliacao ${AFILIACAO_SLUG} não encontrada — rode seed de clubes.`)
  }
  return row
}

async function semearPartidas(afiliacaoId) {
  if (RESET) {
    const apagadas = await db.partida.deleteMany({
      where: { id: { startsWith: PARTIDA_PREFIX } },
    })
    if (apagadas.count) console.log(`  ↺  ${apagadas.count} partida(s) demo removidas`)
  }

  const jogos = [
    {
      id: `${PARTIDA_PREFIX}01`,
      adversario: 'Palmeiras',
      competicao: 'Brasileirão Série A',
      dataHora: emDias(5, 19),
      local: 'Neo Química Arena',
      mando: 'CASA',
      status: 'AGENDADA',
      placarCasa: null,
      placarFora: null,
    },
    {
      id: `${PARTIDA_PREFIX}02`,
      adversario: 'Flamengo',
      competicao: 'Copa do Brasil',
      dataHora: emDias(11, 21),
      local: 'Maracanã',
      mando: 'FORA',
      status: 'AGENDADA',
      placarCasa: null,
      placarFora: null,
    },
    {
      id: `${PARTIDA_PREFIX}03`,
      adversario: 'São Paulo',
      competicao: 'Brasileirão Série A',
      dataHora: emDias(18, 16),
      local: 'Neo Química Arena',
      mando: 'CASA',
      status: 'AGENDADA',
      placarCasa: null,
      placarFora: null,
    },
    {
      id: `${PARTIDA_PREFIX}04`,
      adversario: 'Santos',
      competicao: 'Paulistão',
      dataHora: emDias(1, 18),
      local: 'Vila Belmiro',
      mando: 'FORA',
      status: 'AGENDADA',
      placarCasa: null,
      placarFora: null,
    },
    {
      id: `${PARTIDA_PREFIX}05`,
      adversario: 'Cruzeiro',
      competicao: 'Brasileirão Série A',
      dataHora: emDias(-3, 20),
      local: 'Neo Química Arena',
      mando: 'CASA',
      status: 'ENCERRADA',
      placarCasa: 2,
      placarFora: 1,
    },
    {
      id: `${PARTIDA_PREFIX}06`,
      adversario: 'Grêmio',
      competicao: 'Brasileirão Série A',
      dataHora: emDias(-8, 19),
      local: 'Arena do Grêmio',
      mando: 'FORA',
      status: 'ENCERRADA',
      placarCasa: 1,
      placarFora: 1,
    },
  ]

  for (const j of jogos) {
    await db.partida.upsert({
      where: { id: j.id },
      create: { ...j, afiliacaoId },
      update: { ...j, afiliacaoId },
    })
  }
  console.log(`  ✅ ${jogos.length} partidas demo (${afiliacaoId})`)
}

async function enriquecerArtigosTenant(prefixo, tenantSlug, relacionamentos, videos) {
  const tenant = await db.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true },
  })
  if (!tenant) {
    console.warn(`  ⚠ tenant ${tenantSlug} não encontrado — pulando ${prefixo}`)
    return
  }

  const owner = await db.userRole.findFirst({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  const canal = await db.conversa.findFirst({
    where: { tenantId: tenant.id, canalOficial: true },
    select: { id: true },
  })

  for (const [chave, links] of Object.entries(relacionamentos)) {
    const id = `${ID_PREFIX}${prefixo}-${chave}`
    const artigo = await db.artigoPortal.findUnique({ where: { id }, select: { id: true, blocos: true } })
    if (!artigo) continue
    const blocos = Array.isArray(artigo.blocos) ? [...artigo.blocos] : []
    const semRelacionados = blocos.filter((b) => !b || b.tipo !== 'relacionados')
    semRelacionados.push(blocoRelacionados(links))
    await db.artigoPortal.update({
      where: { id },
      data: { blocos: semRelacionados },
    })
  }

  for (const video of videos) {
    const id = `${ID_PREFIX}${prefixo}-${video.chave}`
    const existente = await db.artigoPortal.findUnique({ where: { id }, select: { id: true } })
    const payload = {
      midiaUrls: [video.url],
      capaUrl: null,
      titulo: video.titulo,
      resumo: video.resumo,
      corpo: video.corpo,
      blocos: [
        { tipo: 'embed', url: video.url, duracaoSegundos: video.duracaoSegundos },
        { tipo: 'texto', texto: video.corpo },
      ],
      visitas: video.visitas ?? 12,
    }

    if (existente) {
      await db.artigoPortal.update({ where: { id }, data: payload })
      continue
    }

    if (!owner) continue

    await db.artigoPortal.create({
      data: {
        id,
        tenantId: tenant.id,
        autorId: owner.userId,
        conversaId: canal?.id ?? null,
        ...payload,
        origem: 'OFICIAL',
        status: 'PUBLICADO',
        gostei: 6,
        publicadoEm: emDias(-1, 14),
        criadoEm: emDias(-1, 14),
      },
    })
  }
  console.log(`  ✅ ${prefixo}: relacionados + ${videos.length} vídeo(s) curto(s)`)
}

async function semearImprensaNacional(afiliacaoId, curadorId) {
  if (RESET) {
    await db.noticia.deleteMany({ where: { id: { startsWith: IMPRENSA_PREFIX } } })
  }

  const capas = [
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1544620341-1adc1baa5c90?auto=format&fit=crop&w=800&q=80',
  ]

  const materias = [
    {
      id: `${IMPRENSA_PREFIX}01`,
      titulo: 'Corinthians completa 116 anos com foco na base',
      resumo: 'Clube reforça categorias de formação e projeta elenco para a próxima janela.',
      fonte: 'ge',
      visitas: 240,
      dias: 1,
    },
    {
      id: `${IMPRENSA_PREFIX}02`,
      titulo: 'Timão mira classificação na Copa do Brasil',
      resumo: 'Comissão técnica trabalha ajustes táticos antes do mata-mata.',
      fonte: 'ge',
      visitas: 188,
      dias: 2,
    },
    {
      id: `${IMPRENSA_PREFIX}03`,
      titulo: 'Fiel prepara caravana para o clássico',
      resumo: 'Torcidas organizadas confirmam pontos de encontro e horários de embarque.',
      fonte: 'meutimao',
      visitas: 96,
      dias: 0,
    },
  ]

  for (const [i, m] of materias.entries()) {
    const publicadoEm = emDias(-m.dias, 10)
    const url = `https://ge.globo.com/futebol/times/corinthians/noticias-demo-${i + 1}`
    await db.noticia.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        afiliacaoId,
        titulo: m.titulo,
        resumo: m.resumo,
        url,
        fonte: m.fonte,
        embedThumbnail: capas[i % capas.length],
        status: 'APROVADA',
        publicadoEm,
        visitas: m.visitas,
        curadoPorId: curadorId,
        criadoEm: publicadoEm,
      },
      update: {
        titulo: m.titulo,
        resumo: m.resumo,
        url,
        embedThumbnail: capas[i % capas.length],
        status: 'APROVADA',
        visitas: m.visitas,
        publicadoEm,
      },
    })
  }
  console.log(`  ✅ ${materias.length} notícias de imprensa (CN)`)
}

async function main() {
  const afiliacao = await afiliacaoCorinthians()
  await semearPartidas(afiliacao.id)

  const gavioes = await db.tenant.findUnique({
    where: { slug: GAVIOES_SLUG },
    select: { id: true },
  })
  const curador = gavioes
    ? await db.userRole.findFirst({
        where: { tenantId: gavioes.id, role: { isSystem: true, nome: 'owner' } },
        select: { userId: true },
      })
    : null

  if (curador?.userId) {
    await semearImprensaNacional(afiliacao.id, curador.userId)
  }

  const linksGavioes = {
    caravana: [
      { id: `${ID_PREFIX}gavioes-onibus`, titulo: 'Ônibus da sede — lista e horário' },
      { id: `${ID_PREFIX}gavioes-concentracao`, titulo: 'Concentração pré-jogo na sede' },
    ],
    assembleia: [{ id: `${ID_PREFIX}gavioes-portaria`, titulo: 'Portaria da sede no domingo' }],
    ensaio: [{ id: `${ID_PREFIX}gavioes-bateria`, titulo: 'Ensaio da bateria — surdo e caixa' }],
  }

  const videosGavioes = [
    {
      chave: 'short-ensaio',
      titulo: 'Ritmo do clássico no ensaio da Fiel',
      resumo: 'Surdo e caixa no barracão — 45 segundos.',
      corpo: 'Trecho do ensaio de ontem. O ritmo que sobe no setor.',
      url: YT_SHORTS[0],
      duracaoSegundos: 45,
      visitas: 31,
    },
    {
      chave: 'short-arquibancada',
      titulo: 'Faixa no barracão antes do jogo',
      resumo: 'Material pronto para subir no setor.',
      corpo: 'Costura final e teste de haste no barracão.',
      url: YT_SHORTS[1],
      duracaoSegundos: 38,
      visitas: 22,
    },
    {
      chave: 'short-onibus',
      titulo: 'Embarque da caravana — 5h30 em ponto',
      resumo: 'Lista fechada, ônibus na rodoviária.',
      corpo: 'Check-in e saída da caravana oficial da sede.',
      url: VIDEO_MP4,
      duracaoSegundos: 52,
      visitas: 18,
    },
  ]

  await enriquecerArtigosTenant('gavioes', GAVIOES_SLUG, linksGavioes, videosGavioes)

  const linksBaixada = {
    ponto: [{ id: `${ID_PREFIX}baixada-onibus`, titulo: 'Ônibus da PDE — horário e lista' }],
    onibus: [{ id: `${ID_PREFIX}baixada-faixa`, titulo: 'Faixa da Baixada no setor' }],
  }

  const videosBaixada = [
    {
      chave: 'short-churrasco',
      titulo: 'Churrasco pós-jogo na PDE',
      resumo: 'Baixada reunida depois do apito.',
      corpo: 'Clima na unidade de Praia Grande após a vitória.',
      url: YT_SHORTS[2],
      duracaoSegundos: 60,
      visitas: 14,
    },
  ]

  const pdeSlug =
    (await db.tenant.findFirst({
      where: { slug: { contains: 'fiel-baixada' } },
      select: { slug: true },
    }))?.slug ?? 'pde-fiel-baixada-praia-grande-praia-grande'

  await enriquecerArtigosTenant('baixada', pdeSlug, linksBaixada, videosBaixada)

  console.log('\nFeed demo pronto.')
  console.log('  Torcida/unidade: /portal/comunidade/noticias?escopo=torcida')
  console.log('  CN imprensa:     /portal/comunidade/noticias?escopo=nacional')
  console.log('  Rode antes:      pnpm --filter @torcida/db seed:noticias-praca')
}

main()
  .catch((err) => {
    console.error('❌', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
