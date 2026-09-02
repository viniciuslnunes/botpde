/**
 * Semeia a linha do tempo da Memória com eventos, posts, fatos atrasados
 * e presença (check-in + opt-in) — para testar os três recortes.
 *
 * Alvos: Gaviões da Fiel e Camisa 12 (não existe "Aviões da Fiel" no
 * catálogo; Camisa 12 é a outra organizada grande do mesmo clube).
 *
 * Idempotente (IDs `memoria-demo-*`). Só Postgres local.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:memoria-demo
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:memoria-demo -- --reset
 */
import { PrismaClient } from '@prisma/client'
import { assertNotProductionSeed, prepareSeedEnv } from './lib/seed-env.js'

if (!process.env.TORCIDA_ENV) process.env.TORCIDA_ENV = 'local'
assertNotProductionSeed('seed:memoria-demo')
const { alvo, dbKind } = prepareSeedEnv({ scriptLabel: 'seed:memoria-demo' })

if (dbKind !== 'local') {
  throw new Error(
    `seed:memoria-demo só grava em Postgres localhost (agora: ${dbKind}, TORCIDA_ENV=${alvo}).\n` +
      'Confira DATABASE_URL em apps/web/.env.local — deve apontar para 127.0.0.1/localhost.',
  )
}

const db = new PrismaClient()
const RESET = process.argv.includes('--reset')

/** @param {string} photoId */
function foto(photoId) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=80`
}

function hojeSp() {
  const now = new Date()
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return { year: sp.getUTCFullYear(), month: sp.getUTCMonth() + 1, day: sp.getUTCDate() }
}

/** @param {{ year: number, month: number, day: number }} parts @param {number} n */
function addDays(parts, n) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0))
  d.setUTCDate(d.getUTCDate() + n)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** Início do dia civil SP como Instant UTC (UTC−3 fixo). */
function inicioDiaUtc(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 3, 0, 0, 0))
}

/** @param {{ year: number, month: number, day: number }} parts @param {number} hora @param {number} [minuto=0] */
function instanteSp(parts, hora, minuto = 0) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hora + 3, minuto, 0, 0))
}

/**
 * @param {string} slug
 * @returns {Promise<{
 *   tenant: { id: string, slug: string, nome: string, afiliacaoId: string | null },
 *   ownerId: string,
 *   autores: string[],
 * } | null>}
 */
async function carregarAlvo(slug) {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, nome: true, afiliacaoId: true },
  })
  if (!tenant) {
    console.warn(`⚠ tenant '${slug}' não encontrado — pulando.`)
    return null
  }

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
    console.warn(`⚠ tenant '${slug}' sem owner nem membro aprovado — pulando.`)
    return null
  }

  const membros = await db.saasMembro.findMany({
    where: { tenantId: tenant.id, status: 'APROVADO' },
    select: { userId: true },
    take: 8,
    orderBy: { criadoEm: 'asc' },
  })
  const autores = [...new Set([ownerId, ...membros.map((m) => m.userId)])]
  return { tenant, ownerId, autores }
}

/**
 * @param {string} prefixo
 * @param {{ tenant: { id: string, slug: string, nome: string, afiliacaoId: string | null }, ownerId: string, autores: string[] }} alvo
 * @param {Array<{
 *   chave: string
 *   tipo: 'GERAL' | 'CARAVANA' | 'ENSAIO'
 *   titulo: string
 *   descricao: string
 *   local: string
 *   dias: number
 *   hora: number
 *   fotoUrl?: string
 *   capacidade?: number
 *   checkIns?: number
 * }>} eventos
 * @param {Array<{
 *   chave: string
 *   dias: number
 *   hora: number
 *   conteudo: string
 *   tipo: 'MEMBRO' | 'INSTITUCIONAL'
 *   alcanceNacional?: boolean
 *   imagemUrl?: string
 *   autorOffset?: number
 * }>} posts
 * @param {Array<{
 *   chave: string
 *   dias: number
 *   conteudo: string
 *   status: 'APROVADA' | 'PENDENTE'
 *   visibilidade?: 'PUBLICO' | 'TENANT'
 *   eventoChave?: string
 *   autorOffset?: number
 * }>} fatos
 */
async function semearAcervoCurado(alvo) {
  const hoje = hojeSp()
  const diaChurrasco = inicioDiaUtc(addDays(hoje, -14))
  const diaConcentracao = inicioDiaUtc(addDays(hoje, -21))

  await db.memoriaMarco.upsert({
    where: { tenantId_dia: { tenantId: alvo.tenant.id, dia: diaChurrasco } },
    create: {
      tenantId: alvo.tenant.id,
      autorId: alvo.ownerId,
      dia: diaChurrasco,
      titulo: 'Churrasco institucional da sede',
      descricao: 'Marco demo — dia de confraternização pós-jogo no acervo.',
    },
    update: {
      titulo: 'Churrasco institucional da sede',
      descricao: 'Marco demo — dia de confraternização pós-jogo no acervo.',
      autorId: alvo.ownerId,
    },
  })

  const capId = 'memoria-demo-cap-temporada'
  await db.memoriaCapitulo.upsert({
    where: { id: capId },
    create: {
      id: capId,
      tenantId: alvo.tenant.id,
      titulo: 'Temporada demo',
      slug: 'temporada-demo',
      descricao: 'Capítulo de teste com dias do seed memoria-demo.',
      ativo: true,
    },
    update: {
      titulo: 'Temporada demo',
      slug: 'temporada-demo',
      descricao: 'Capítulo de teste com dias do seed memoria-demo.',
      ativo: true,
    },
  })

  await db.memoriaCapituloDia.deleteMany({ where: { capituloId: capId } })
  const diasCap = [
    { dia: diaChurrasco, ordem: 0 },
    { dia: diaConcentracao, ordem: 1 },
  ]
  for (const row of diasCap) {
    await db.memoriaCapituloDia.create({
      data: {
        capituloId: capId,
        dia: row.dia,
        ordem: row.ordem,
      },
    })
  }
}

async function semearAlvo(prefixo, alvo, eventos, posts, fatos) {
  const hoje = hojeSp()
  const autor = (offset = 0) => alvo.autores[offset % alvo.autores.length] ?? alvo.ownerId

  /** @type {Map<string, string>} */
  const eventoIds = new Map()

  for (const ev of eventos) {
    const id = `${prefixo}-ev-${ev.chave}`
    const dia = addDays(hoje, ev.dias)
    const data = instanteSp(dia, ev.hora)
    eventoIds.set(ev.chave, id)
    await db.evento.upsert({
      where: { id },
      update: {
        titulo: ev.titulo,
        descricao: ev.descricao,
        fotoUrl: ev.fotoUrl ?? null,
        data,
        local: ev.local,
        tipo: ev.tipo,
        capacidade: ev.capacidade ?? null,
        sedeId: null,
      },
      create: {
        id,
        tenantId: alvo.tenant.id,
        titulo: ev.titulo,
        descricao: ev.descricao,
        fotoUrl: ev.fotoUrl ?? null,
        data,
        local: ev.local,
        tipo: ev.tipo,
        capacidade: ev.capacidade ?? null,
        sedeId: null,
        criadoPorId: alvo.ownerId,
      },
    })

    const nCheck = ev.checkIns ?? 0
    const checkUsers = alvo.autores.slice(0, Math.max(nCheck, 0))
    for (const userId of checkUsers) {
      await db.eventoRsvp.upsert({
        where: { eventoId_userId: { eventoId: id, userId } },
        update: {
          status: 'CONFIRMADO',
          checkedInAt: instanteSp(dia, ev.hora + 1),
          checkedInPorId: alvo.ownerId,
        },
        create: {
          eventoId: id,
          userId,
          status: 'CONFIRMADO',
          checkedInAt: instanteSp(dia, ev.hora + 1),
          checkedInPorId: alvo.ownerId,
        },
      })
      await db.perfilMembro.upsert({
        where: { userId_tenantId: { userId, tenantId: alvo.tenant.id } },
        update: { memoriaPresencaVisivel: true },
        create: { userId, tenantId: alvo.tenant.id, memoriaPresencaVisivel: true },
      })
    }
    console.log(`  ✅ evento ${ev.tipo} — ${ev.titulo}`)
  }

  for (const p of posts) {
    const id = `${prefixo}-post-${p.chave}`
    const dia = addDays(hoje, p.dias)
    await db.post.upsert({
      where: { id },
      update: {
        conteudo: p.conteudo,
        tipo: p.tipo,
        visibilidade: 'PUBLICO',
        alcanceNacional: Boolean(p.alcanceNacional),
        imagemUrl: p.imagemUrl ?? null,
        criadoEm: instanteSp(dia, p.hora),
      },
      create: {
        id,
        tenantId: alvo.tenant.id,
        autorId: autor(p.autorOffset ?? 0),
        conteudo: p.conteudo,
        tipo: p.tipo,
        visibilidade: 'PUBLICO',
        alcanceNacional: Boolean(p.alcanceNacional),
        imagemUrl: p.imagemUrl ?? null,
        criadoEm: instanteSp(dia, p.hora),
      },
    })
    console.log(`  ✅ post — ${p.conteudo.slice(0, 48)}…`)
  }

  for (const f of fatos) {
    const id = `${prefixo}-fato-${f.chave}`
    const dia = addDays(hoje, f.dias)
    const eventoId = f.eventoChave ? (eventoIds.get(f.eventoChave) ?? null) : null
    const aprovado = f.status === 'APROVADA'
    await db.memoriaFato.upsert({
      where: { id },
      update: {
        conteudo: f.conteudo,
        dia: inicioDiaUtc(dia),
        visibilidade: f.visibilidade ?? 'PUBLICO',
        status: f.status,
        eventoId,
        aprovadoPorId: aprovado ? alvo.ownerId : null,
        decididoEm: aprovado ? instanteSp(dia, 12) : null,
        motivoRejeicao: null,
      },
      create: {
        id,
        tenantId: alvo.tenant.id,
        autorId: autor(f.autorOffset ?? 1),
        conteudo: f.conteudo,
        dia: inicioDiaUtc(dia),
        visibilidade: f.visibilidade ?? 'PUBLICO',
        status: f.status,
        eventoId,
        aprovadoPorId: aprovado ? alvo.ownerId : null,
        decididoEm: aprovado ? instanteSp(dia, 12) : null,
      },
    })
    console.log(`  ✅ fato ${f.status} — ${f.conteudo.slice(0, 48)}…`)
  }
}

async function ligarPostAoJogo(alvo) {
  if (!alvo.tenant.afiliacaoId) return
  const partida = await db.partida.findFirst({
    where: {
      afiliacaoId: alvo.tenant.afiliacaoId,
      status: 'ENCERRADA',
      dataHora: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { dataHora: 'desc' },
    select: { id: true, dataHora: true, adversario: true },
  })
  if (!partida) return

  const sp = new Date(partida.dataHora.getTime() - 3 * 60 * 60 * 1000)
  const parts = { year: sp.getUTCFullYear(), month: sp.getUTCMonth() + 1, day: sp.getUTCDate() }
  const id = `memoria-demo-${alvo.tenant.slug.slice(0, 12)}-post-jogo`
  await db.post.upsert({
    where: { id },
    update: {
      conteudo: `Que jogo. ${partida.adversario} sentiu a Fiel o tempo inteiro. Quem tava na arquibancada não esquece.`,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      alcanceNacional: true,
      criadoEm: instanteSp(parts, 22, 40),
    },
    create: {
      id,
      tenantId: alvo.tenant.id,
      autorId: alvo.ownerId,
      conteudo: `Que jogo. ${partida.adversario} sentiu a Fiel o tempo inteiro. Quem tava na arquibancada não esquece.`,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      alcanceNacional: true,
      criadoEm: instanteSp(parts, 22, 40),
    },
  })
  console.log(`  ✅ post no dia do jogo × ${partida.adversario}`)
}

async function resetDemo() {
  console.log('🧹 apagando lote memoria-demo…')
  await db.memoriaFato.deleteMany({ where: { id: { startsWith: 'memoria-demo-' } } })
  await db.post.deleteMany({ where: { id: { startsWith: 'memoria-demo-' } } })
  await db.evento.deleteMany({ where: { id: { startsWith: 'memoria-demo-' } } })
}

async function main() {
  console.log('🌱 Memória demo (Gaviões + Camisa 12)…\n')
  if (RESET) await resetDemo()

  const gavioes = await carregarAlvo('pde-gavioes-fiel')
  if (gavioes) {
    console.log(`· ${gavioes.tenant.nome}`)
    await semearAlvo(
      'memoria-demo-gavioes',
      gavioes,
      [
        {
          chave: 'caravana-nqa',
          tipo: 'CARAVANA',
          titulo: 'Caravana — Neo Química Arena',
          descricao: 'Embarque no barracão às 11h. Carteirinha na mão. Ônibus volta depois do apito.',
          local: 'Barracão → Neo Química Arena',
          dias: -7,
          hora: 11,
          fotoUrl: foto('photo-1544620341-1adc1baa5c90'),
          capacidade: 48,
          checkIns: 4,
        },
        {
          chave: 'ensaio',
          tipo: 'ENSAIO',
          titulo: 'Ensaio da Bateria',
          descricao: 'Ritmo do próximo clássico. Quem toca no jogo precisa estar.',
          local: 'Barracão — área de ensaio',
          dias: -1,
          hora: 20,
          fotoUrl: foto('photo-1519892300165-cb5542fb47c7'),
          capacidade: 80,
          checkIns: 3,
        },
        {
          chave: 'churrasco',
          tipo: 'GERAL',
          titulo: 'Churrasco pós-jogo na sede',
          descricao: 'Aberto a associado e convidado. Caixa da próxima caravana.',
          local: 'Sede — área externa',
          dias: -14,
          hora: 13,
          fotoUrl: foto('photo-1555939594-58d7cb561ad1'),
          capacidade: 120,
          checkIns: 5,
        },
        {
          chave: 'concentracao',
          tipo: 'GERAL',
          titulo: 'Concentração pré-clássico',
          descricao: 'Saída da sede às 14h. Bandeirão e faixa na ordem combinada.',
          local: 'Sede',
          dias: -21,
          hora: 14,
          fotoUrl: foto('photo-1574629810360-7efbbe195018'),
          capacidade: 200,
        },
        {
          chave: 'assembleia',
          tipo: 'GERAL',
          titulo: 'Assembleia geral ordinária',
          descricao: 'Pauta no mural. Associado em dia tem voz e voto.',
          local: 'Salão nobre',
          dias: -45,
          hora: 19,
          fotoUrl: foto('photo-1431540015161-0bf868a2d407'),
          capacidade: 150,
        },
        {
          chave: 'caravana-fora',
          tipo: 'CARAVANA',
          titulo: 'Caravana fora de casa',
          descricao: 'Viagem longa. Check-in com documento e carteirinha.',
          local: 'Rodoviária / estádio',
          dias: -60,
          hora: 6,
          fotoUrl: foto('photo-1544620341-1adc1baa5c90'),
          capacidade: 52,
          checkIns: 2,
        },
      ],
      [
        {
          chave: 'caravana',
          dias: -7,
          hora: 18,
          tipo: 'MEMBRO',
          conteudo: 'Ônibus lotado e a Fiel cantando o caminho inteiro. Isso aqui é casa.',
          imagemUrl: foto('photo-1544620341-1adc1baa5c90'),
          autorOffset: 1,
        },
        {
          chave: 'ensaio',
          dias: -1,
          hora: 22,
          tipo: 'MEMBRO',
          conteudo: 'Bateria ensaiou até tarde. O próximo clássico já tem o ritmo pronto.',
          imagemUrl: foto('photo-1519892300165-cb5542fb47c7'),
        },
        {
          chave: 'churrasco',
          dias: -14,
          hora: 16,
          tipo: 'MEMBRO',
          conteudo: 'Sede lotada no churrasco. Quem passou ontem ainda tá com a voz rouca.',
        },
        {
          chave: 'nacional',
          dias: -21,
          hora: 21,
          tipo: 'MEMBRO',
          alcanceNacional: true,
          conteudo: 'A Nação inteira sentiu esse gol. Do barracão à arquibancada, uma só voz.',
          imagemUrl: foto('photo-1574629810360-7efbbe195018'),
        },
        {
          chave: 'comunicado',
          dias: -3,
          hora: 10,
          tipo: 'INSTITUCIONAL',
          conteudo: 'Escala de bandeiras no próximo jogo sai amanhã no mural. Quem assumiu faixa confirma presença com o departamento.',
        },
      ],
      [
        {
          chave: 'caravana',
          dias: -7,
          conteudo: 'A chuva no embarque não atrapalhou. Barracão lotado às 10h e o ônibus saiu em ponto.',
          status: 'APROVADA',
          eventoChave: 'caravana-nqa',
          autorOffset: 1,
        },
        {
          chave: 'rua',
          dias: -30,
          conteudo: 'Noite em que a bateria ensaiou na rua. Quem passou na porta parou. 2019 voltou por uma hora.',
          status: 'APROVADA',
          autorOffset: 2,
        },
        {
          chave: 'fila',
          dias: -2,
          conteudo: 'Aquele corredor lotado antes do portão abrir. Queria deixar registrado — a foto não cabia no mural na hora.',
          status: 'PENDENTE',
          autorOffset: 1,
        },
      ],
    )
    await ligarPostAoJogo(gavioes)
    await semearAcervoCurado(gavioes)
  }

  const camisa = await carregarAlvo('camisa-12-corinthians')
  if (camisa) {
    console.log(`\n· ${camisa.tenant.nome}`)
    await semearAlvo(
      'memoria-demo-camisa12',
      camisa,
      [
        {
          chave: 'ensaio',
          tipo: 'ENSAIO',
          titulo: 'Ensaio da bateria — Camisa 12',
          descricao: 'Ensaio aberto a quem toca no próximo jogo em casa.',
          local: 'Sede Camisa 12',
          dias: -5,
          hora: 19,
          fotoUrl: foto('photo-1493225457124-a3eb161ffa5f'),
          capacidade: 60,
          checkIns: 2,
        },
        {
          chave: 'caravana',
          tipo: 'CARAVANA',
          titulo: 'Caravana do clássico',
          descricao: 'Saída da sede às 12h. Vaga inclui ônibus ida e volta.',
          local: 'Sede → estádio',
          dias: -10,
          hora: 12,
          fotoUrl: foto('photo-1574629810360-7efbbe195018'),
          capacidade: 44,
          checkIns: 3,
        },
      ],
      [
        {
          chave: 'nacional',
          dias: -8,
          hora: 20,
          tipo: 'MEMBRO',
          alcanceNacional: true,
          conteudo: 'Do outro lado da arquibancada a Camisa 12 também tava inteira. A Fiel não se divide no grito.',
        },
        {
          chave: 'ensaio',
          dias: -5,
          hora: 21,
          tipo: 'MEMBRO',
          conteudo: 'Ensaio pesado hoje. Quem for no sábado já sabe o recado.',
        },
      ],
      [
        {
          chave: 'caravana',
          dias: -10,
          conteudo: 'Ônibus da Camisa 12 chegou junto com o da Gaviões. Irmandade na prática, não no discurso.',
          status: 'APROVADA',
          eventoChave: 'caravana',
        },
      ],
    )
  }

  console.log('\n🎉 Memória demo pronta.')
  console.log('   Ver: /portal/memoria  ·  fila: /admin/comunidade/memoria')
  console.log('   Recortes: Unidade · Torcida · Clube  ·  filtros Jogo / Evento / Publicação')
}

main()
  .catch((err) => {
    console.error('❌', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
