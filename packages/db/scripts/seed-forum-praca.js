/**
 * Seed de teste — fórum da praça (CN do Corinthians + Gaviões da Fiel).
 *
 * Idempotente: títulos com prefixo `[TESTE-FORUM]`. Reexecutar não duplica
 * se já houver o volume mínimo em cada âncora.
 *
 * Uso:
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:forum-praca
 */
import crypto from 'node:crypto'
import { db } from '../src/index.js'
import { assertNotProductionSeed } from './lib/seed-env.js'

assertNotProductionSeed('seed:forum-praca')

const MARCA = '[TESTE-FORUM]'
const AFILIACAO_SLUG = 'sport-club-corinthians-paulista-sp'
const GAVIOES_SLUG = 'pde-gavioes-fiel'
const TOPICOS_POR_ANCORA = 48
const MIN_PARA_PULAR = 40

const ASSUNTOS_GAVIOES = [
  'Ensaio da bateria no sábado — quem confirma presença?',
  'Bandeirão novo: precisa de braço no barracão essa semana',
  'Caravana pro próximo jogo: vaga na van da sede',
  'Camisa 12 no setor: combinado de horário na porta 3',
  'Material de arquibancada: quem leva a faixa grande?',
  'Churrasco pós-jogo na sede — leva o que puder',
  'Recruta da bateria: surdo e caixa, aparece no ensaio',
  'Pix da vaquinha do ônibus: fecha hoje à noite',
  'Setor da Fiel: encontro 2h antes do apito',
  'Quem vai de trem? Combinar no Brás',
  'Foto oficial da torcida: todo mundo de camisa preta',
  'Sede fecha cedo na quarta por causa da assembleia',
  'Precisa de gente na portaria da sede no domingo',
  'Loja: restock da jaqueta — tamanho G some rápido',
  'Bar da sede: quem fecha o caixa depois do ensaio?',
  'Infantil no próximo jogo: encontro no portão 8',
  'Aliança com a Camisa 12 no clássico: combinado de faixa',
  'Manto da semana: qual a estampa que vai na arquibancada?',
  'Som da bateria no treino: precisa de mais surdo',
  'Limpeza do barracão depois do ensaio de ontem',
  'Faixa “Aqui é Corinthians” rasgou — quem costura?',
  'Sorteio da camisa no grupo: confirma o número',
  'Jogo fora: quem sobe no ônibus das 6h',
  'Sede precisa de doação de água pro ensaio',
]

const ASSUNTOS_CN = [
  'Palpite pro próximo clássico: como vocês veem o meio-campo?',
  'Quem vai no estádio no domingo? Combina o encontro',
  'Melhor gol da temporada até agora — o de vocês',
  'Escalação dos sonhos: 4-3-3 ou 4-2-3-1?',
  'Torcida mista no interior: relatos da viagem',
  'Memória: o jogo que te fez Corinthians',
  'Camisa 9: quem deveria ser titular?',
  'Fora de casa: dica de bar perto do estádio',
  'Canto da Fiel: qual o refrão que não pode faltar',
  'Juiz do último jogo: o que vocês acharam',
  'Base: quem acompanhou o sub-20 no fim de semana',
  'Mulherada na arquibancada: encontro antes do jogo',
  'Nostalgia: 2012 ainda é o pico pra vocês?',
  'Contratação: o que falta no elenco agora',
  'TV: onde vocês vão assistir se não for no estádio',
  'Hino antes do apito: todo mundo de pé',
  'Rivalidade: o clássico que mais pesa pra você',
  'Craque da rodada: quem brilhou de preto e branco',
  'Arquibancada: setor preferido e por quê',
  'Viagem de longe: quem vem de outro estado',
  'Primeiro jogo no estádio: conta aí',
  'Camisa retrô vs atual: qual vocês vestem no jogo',
  'Técnico: o que precisa mudar no treino',
  'Fiel em casa: como receber o visitante no próximo',
]

const CORPOS = [
  'Bora, Fiel. Quem puder aparecer, chega cedo que a fila anda.\n\nMarca aqui se vai.',
  'Não é só papo: precisa de gente de verdade. Confirma aqui pra gente organizar.',
  'Quem foi no último já sabe o ritmo. Quem é novo, chega 30 min antes.',
  'Se chover, o combinado é o mesmo. Leva capa e não deixa a faixa no chão.',
  'Pode trazer criança, mas fica junto do grupo. Sem se perder na saída.',
  'Quem tiver foto, manda depois no tópico. A memória fica aqui.',
  'Sem politicagem no fio. É sobre o time e a arquibancada.',
  'Se alguém precisar de carona, deixa o bairro. A gente encaixa.',
  'Vai ser apertado. Chega cedo ou perde o encontro.',
  'Isso aqui é da Fiel. Respeito no tópico, porrada no campo.',
]

function pick(arr, i) {
  return arr[i % arr.length]
}

function diasAtras(dias) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
}

async function createManyBatched(model, rows, label, batchSize = 200) {
  let criados = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const lote = rows.slice(i, i + batchSize)
    const res = await db[model].createMany({ data: lote, skipDuplicates: true })
    criados += res.count
  }
  if (rows.length) {
    console.log(`  ${criados === rows.length ? '✅' : '⚠️ '} ${label}: ${criados}/${rows.length}`)
  }
  return criados
}

async function autoresDoTenant(tenantId) {
  const membros = await db.saasMembro.findMany({
    where: { tenantId, status: 'APROVADO' },
    select: { userId: true },
    take: 120,
  })
  return [...new Set(membros.map((m) => m.userId))]
}

async function autoresDaCn(afiliacaoId, tenantIds) {
  const [globais, membros] = await Promise.all([
    db.perfilTorcedor.findMany({
      where: { afiliacaoId },
      select: { userId: true },
      take: 80,
    }),
    tenantIds.length
      ? db.saasMembro.findMany({
          where: { tenantId: { in: tenantIds }, status: 'APROVADO' },
          select: { userId: true },
          take: 80,
        })
      : Promise.resolve([]),
  ])
  return [...new Set([...globais.map((g) => g.userId), ...membros.map((m) => m.userId)])]
}

async function midiasAmostra(tenantId) {
  const posts = await db.post.findMany({
    where: { tenantId, midiaUrls: { isEmpty: false } },
    select: { midiaUrls: true },
    take: 12,
    orderBy: { criadoEm: 'desc' },
  })
  return posts.map((p) => p.midiaUrls).filter((m) => m.length > 0)
}

async function semearAncora({
  label,
  escopoForum,
  tenantId,
  afiliacaoId,
  autores,
  assuntos,
  midias,
}) {
  const whereMarca = {
    titulo: { startsWith: MARCA },
    ...(escopoForum === 'CLUBE' ? { afiliacaoId, escopo: 'CLUBE' } : { tenantId, escopo: 'TORCIDA' }),
  }
  const ja = await db.forumTopico.count({ where: whereMarca })
  if (ja >= MIN_PARA_PULAR) {
    console.log(`  ↔  ${label}: já tem ${ja} tópicos — pulando`)
    if (midias.length) {
      const semMidia = await db.forumTopico.findMany({
        where: { ...whereMarca, midiaUrls: { isEmpty: true } },
        select: { id: true },
        take: 16,
      })
      let atualizados = 0
      for (let i = 0; i < semMidia.length; i += 2) {
        await db.forumTopico.update({
          where: { id: semMidia[i].id },
          data: { midiaUrls: pick(midias, i) },
        })
        atualizados += 1
      }
      if (atualizados) {
        console.log(`  🖼  ${label}: ${atualizados} tópicos receberam mídia de amostra`)
      }
    }
    return
  }
  if (autores.length === 0) {
    console.warn(`  ⚠️  ${label}: nenhum autor APROVADO — pulando`)
    return
  }

  const topicos = []
  const respostas = []
  const votos = []
  const eventosScore = []
  const saldoPorAutor = new Map()

  function bumpSaldo(userId, campo, peso) {
    const atual = saldoPorAutor.get(userId) ?? {
      userId,
      topicos: 0,
      respostas: 0,
      score: 0,
    }
    atual[campo] += 1
    atual.score += peso
    saldoPorAutor.set(userId, atual)
  }

  for (let i = 0; i < TOPICOS_POR_ANCORA; i++) {
    const autorId = autores[i % autores.length]
    const tituloBase = pick(assuntos, i)
    const corpo = `${tituloBase}\n\n${pick(CORPOS, i + 3)}`
    const id = crypto.randomUUID()
    const criadoEm = diasAtras((i % 40) + 1)
    const visitas = i % 7 === 0 ? 80 + (i % 40) : 3 + (i % 18)
    const gostei = i % 5 === 0 ? 8 + (i % 12) : i % 3
    const naoGostei = i % 11 === 0 ? 2 : 0
    const midiaUrls = i % 6 === 0 && midias.length ? pick(midias, i) : []

    topicos.push({
      id,
      escopo: escopoForum,
      tenantId: escopoForum === 'TORCIDA' ? tenantId : null,
      afiliacaoId: escopoForum === 'CLUBE' ? afiliacaoId : null,
      autorId,
      titulo: `${MARCA} ${tituloBase}`,
      corpo,
      midiaUrls,
      visitas,
      respostasCount: 0,
      gostei,
      naoGostei,
      fixado: i === 0 || i === 1,
      status: 'VISIVEL',
      criadoEm,
      atualizadoEm: criadoEm,
    })
    bumpSaldo(autorId, 'topicos', 3)
    eventosScore.push({
      id: crypto.randomUUID(),
      userId: autorId,
      escopoChave: escopoForum === 'CLUBE' ? `a:${afiliacaoId}` : `t:${tenantId}`,
      sinal: 'topico',
      peso: 3,
      origemTipo: 'ForumTopico',
      origemId: id,
      criadoEm,
    })

    const nRespostas = i % 4 === 0 ? 0 : 1 + (i % 5)
    for (let r = 0; r < nRespostas; r++) {
      const respAutor = autores[(i + r + 1) % autores.length]
      const respId = crypto.randomUUID()
      respostas.push({
        id: respId,
        topicoId: id,
        autorId: respAutor,
        conteudo: pick(
          [
            'Eu vou. Marca aí.',
            'Fechou. Chego cedo.',
            'Pode contar comigo.',
            'Boa. A Fiel aparece.',
            'Topo. Levo mais dois.',
            'Não rola pra mim, mas força aí.',
          ],
          i + r,
        ),
        criadoEm: new Date(criadoEm.getTime() + (r + 1) * 36e5),
      })
      bumpSaldo(respAutor, 'respostas', 2)
      eventosScore.push({
        id: crypto.randomUUID(),
        userId: respAutor,
        escopoChave: escopoForum === 'CLUBE' ? `a:${afiliacaoId}` : `t:${tenantId}`,
        sinal: 'resposta',
        peso: 2,
        origemTipo: 'ForumResposta',
        origemId: respId,
        criadoEm: new Date(criadoEm.getTime() + (r + 1) * 36e5),
      })
    }
    topicos[topicos.length - 1].respostasCount = nRespostas

    if (gostei > 0) {
      const votante = autores[(i + 2) % autores.length]
      if (votante !== autorId) {
        votos.push({
          id: crypto.randomUUID(),
          userId: votante,
          alvoTipo: 'TOPICO',
          alvoId: id,
          valor: 1,
          criadoEm,
        })
      }
    }
  }

  await createManyBatched('forumTopico', topicos, `${label}: tópicos`)
  await createManyBatched('forumResposta', respostas, `${label}: respostas`)
  await createManyBatched('pracaVoto', votos, `${label}: votos`)
  await createManyBatched('forumScoreEvento', eventosScore, `${label}: score eventos`)

  const chave = escopoForum === 'CLUBE' ? `a:${afiliacaoId}` : `t:${tenantId}`
  for (const s of saldoPorAutor.values()) {
    await db.forumScoreSaldo.upsert({
      where: { userId_escopoChave: { userId: s.userId, escopoChave: chave } },
      create: {
        userId: s.userId,
        escopoChave: chave,
        tenantId: escopoForum === 'TORCIDA' ? tenantId : null,
        afiliacaoId: escopoForum === 'CLUBE' ? afiliacaoId : null,
        score: s.score,
        topicos: s.topicos,
        respostas: s.respostas,
      },
      update: {
        score: { increment: s.score },
        topicos: { increment: s.topicos },
        respostas: { increment: s.respostas },
      },
    })
  }
  console.log(`  ✅ ${label}: ranking (${saldoPorAutor.size} autores)`)
}

async function main() {
  const [gavioes, afiliacao] = await Promise.all([
    db.tenant.findFirst({
      where: { slug: GAVIOES_SLUG },
      select: { id: true, nome: true, afiliacaoId: true },
    }),
    db.afiliacao.findFirst({
      where: { slug: AFILIACAO_SLUG },
      select: { id: true, nome: true, slug: true },
    }),
  ])

  if (!gavioes) {
    throw new Error(`Tenant ${GAVIOES_SLUG} não encontrado. Rode o seed da Gaviões / Corinthians.`)
  }
  if (!afiliacao) {
    throw new Error(`Afiliação ${AFILIACAO_SLUG} não encontrada.`)
  }

  const [autoresGavioes, autoresCn, midiasGavioes] = await Promise.all([
    autoresDoTenant(gavioes.id),
    autoresDaCn(afiliacao.id, [gavioes.id]),
    midiasAmostra(gavioes.id),
  ])

  console.log(`Gaviões: ${autoresGavioes.length} autores · CN: ${autoresCn.length} autores`)

  await semearAncora({
    label: 'Gaviões da Fiel',
    escopoForum: 'TORCIDA',
    tenantId: gavioes.id,
    afiliacaoId: null,
    autores: autoresGavioes,
    assuntos: ASSUNTOS_GAVIOES,
    midias: midiasGavioes,
  })

  await semearAncora({
    label: 'CN Corinthians',
    escopoForum: 'CLUBE',
    tenantId: null,
    afiliacaoId: afiliacao.id,
    autores: autoresCn.length ? autoresCn : autoresGavioes,
    assuntos: ASSUNTOS_CN,
    midias: midiasGavioes,
  })

  console.log('Fórum de teste pronto.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
