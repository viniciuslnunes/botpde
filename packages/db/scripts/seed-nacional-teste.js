/**
 * Seed de teste em volume — lote NACIONAL (multi-clube).
 *
 * Complemento do lote Corinthians (seed-corinthians-teste*.js), que cobre a
 * operação **de um clube só** em profundidade. Este lote cobre o oposto: o
 * que só aparece quando existem **vários clubes ao mesmo tempo** na
 * plataforma — Comunidade Nacional comparativa, rivalidade entre clubes e
 * entre torcidas, alianças cross-clube e carga de feed com muitos tenants
 * publicando em paralelo.
 *
 * Recorte deliberadamente raso por torcida (2 unidades, 30 pessoas por
 * unidade) — profundidade operacional (bar, financeiro, patrimônio…) já é
 * testada no lote Corinthians e não precisa ser multiplicada por clube.
 *
 * Escopo: 10 clubes (as maiores torcidas do país por IBOPE, fora o
 * Corinthians) × 1 torcida real já cadastrada de cada.
 *
 * Convenção de marcação (lote próprio → reset independente; ver
 * docs/ops/plano-teste-volume-dados.md):
 *   - `User` sintético: e-mail `...@teste.nacional.torcida.app`,
 *     `nickname` com prefixo `teste_nac_`.
 *   - `Post`/`Evento` do seed: título com prefixo `[TESTE-NACIONAL] `.
 *   - `RivalidadeClube`/`RivalidadeTorcida`/`Alianca` não têm campo livre
 *     para marcador — são identificadas pelo par de clubes/torcidas do
 *     lote (ver reset-nacional-teste.js).
 *
 * Presidente sintético: estas torcidas existem no banco mas estão **sem
 * nenhum `UserRole`** (ninguém assumiu a torcida ainda). O seed cria um
 * presidente de teste por torcida para poder haver autoria institucional,
 * proposta de aliança e moderação.
 *
 * Idempotente por torcida: se já existe gente do lote, a torcida é pulada.
 *
 * Uso:
 *   pnpm --filter @torcida/db seed:nacional-teste
 *   FASES=1,4 pnpm --filter @torcida/db seed:nacional-teste
 */
import crypto from 'node:crypto'
import { db } from '../src/index.js'
import {
  ALIANCAS,
  CLUBE_CORINTHIANS,
  DOMINIO_TESTE,
  LOTE,
  MARCA,
  RIVALIDADES_CLUBE,
  TENANT_CORINTHIANS,
} from './lib/lote-nacional.js'

const PESSOAS_POR_UNIDADE = 30
const UNIDADES_POR_TORCIDA = 2
const GLOBAIS_POR_CLUBE = 25

const FASES = (process.env.FASES ?? '1,2,3,4,5,6')
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean)

const filtroUserTeste = { email: { endsWith: `@${DOMINIO_TESTE}` } }

// ── Utilitários ──────────────────────────────────────────────────────────
let seq = 0
function nextSeq() {
  seq += 1
  return seq
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickPonderado(opcoes) {
  const total = opcoes.reduce((s, [, p]) => s + p, 0)
  let r = Math.random() * total
  for (const [valor, peso] of opcoes) {
    if (r < peso) return valor
    r -= peso
  }
  return opcoes[opcoes.length - 1][0]
}

function embaralhar(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function diasAtras(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function diasAFrente(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
}

const PRIMEIROS_NOMES = [
  'João', 'Maria', 'José', 'Ana', 'Pedro', 'Paulo', 'Marcos', 'Lucas', 'Carlos', 'Fernanda',
  'Juliana', 'Camila', 'Rafael', 'Bruno', 'Gustavo', 'Larissa', 'Patrícia', 'Renata', 'Diego', 'Felipe',
  'Aline', 'Vanessa', 'Rodrigo', 'Fabio', 'Thiago', 'Cristina', 'Adriana', 'Sandra', 'Marcelo', 'Eduardo',
  'Beatriz', 'Gabriela', 'Leandro', 'Alexandre', 'Vinicius', 'Mateus', 'Daniela', 'Priscila', 'Roberto', 'Antonio',
]
const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
  'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
  'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
]

function gerarNome() {
  const primeiro = pick(PRIMEIROS_NOMES)
  const sobrenome = pick(SOBRENOMES)
  return { primeiro, sobrenome, nome: `${primeiro} ${sobrenome}` }
}

/** Base 700… — não colide com o lote Corinthians (900…). */
function gerarCpf(n) {
  const base = String(700000000 + n).padStart(9, '0')
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-00`
}

async function createManyBatched(model, rows, label, batchSize = 500) {
  let criados = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const res = await db[model].createMany({ data: rows.slice(i, i + batchSize), skipDuplicates: true })
    criados += res.count
  }
  if (rows.length) {
    const marca = criados === rows.length ? '✅' : '⚠️ '
    console.log(`  ${marca} ${label}: ${criados}/${rows.length} inseridos`)
  }
  return criados
}

// ── Conteúdo ─────────────────────────────────────────────────────────────
function templatesInstitucionais(torcida, clube) {
  return [
    `${torcida} confirma presença em massa no próximo jogo do ${clube}. Bora!`,
    `Horários de funcionamento da sede nesta semana — confira e apareça.`,
    `Caravana confirmada para o jogo fora de casa. Vagas limitadas.`,
    `Reunião aberta aos associados nesta semana na sede.`,
    `Nova remessa de produtos chegando na loja da ${torcida}.`,
    `Ensaio da bateria confirmado — todo mundo convidado.`,
    `Campanha de arrecadação de alimentos: traga sua doação na sede.`,
    `${clube} é nossa vida. ${torcida} presente em todos os cantos do país.`,
  ]
}

function templatesMembro(clube) {
  return [
    `Alguém mais vai pro jogo do ${clube} no fim de semana?`,
    `Que jogo ontem! ${clube} até o fim.`,
    `Chegando cedo na sede pro pré-jogo, quem vem?`,
    `Arquibancada cheia é outra coisa. ${clube} sempre.`,
    `Alguém sabe do ônibus da caravana?`,
    `Comprei a camisa nova, ficou perfeita.`,
    `Presente em mais um jogo. Vamo, ${clube}!`,
    `Clássico chegando e a ansiedade batendo.`,
  ]
}

// ── Contexto ─────────────────────────────────────────────────────────────
async function carregarContexto() {
  const contexto = []
  for (const item of LOTE) {
    const afiliacao = await db.afiliacao.findFirst({
      where: { slug: item.clube },
      select: { id: true, nome: true, slug: true },
    })
    if (!afiliacao) throw new Error(`Afiliação '${item.clube}' não encontrada.`)

    const tenant = await db.tenant.findFirst({
      where: { slug: item.tenant },
      select: { id: true, slug: true, nome: true },
    })
    if (!tenant) throw new Error(`Tenant '${item.tenant}' não encontrado.`)

    const sedes = await db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      select: { id: true, tipo: true, nome: true, cidade: true },
      // SEDE primeiro, para o recorte raso pegar sempre a sede principal.
      orderBy: [{ tipo: 'asc' }, { criadoEm: 'asc' }],
    })
    if (sedes.length === 0) throw new Error(`Tenant '${item.tenant}' sem unidade ativa.`)

    const memberRole = await db.role.findFirst({
      where: { tenantId: tenant.id, isSystem: true, nome: 'member' },
      select: { id: true },
    })
    const adminRole = await db.role.findFirst({
      where: { tenantId: tenant.id, isSystem: true, nome: 'admin' },
      select: { id: true },
    })
    const ownerRole = await db.role.findFirst({
      where: { tenantId: tenant.id, isSystem: true, nome: 'owner' },
      select: { id: true },
    })
    if (!memberRole || !adminRole || !ownerRole) {
      throw new Error(`Tenant '${item.tenant}' sem cargos de sistema owner/admin/member.`)
    }

    contexto.push({
      ...item,
      afiliacao,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantNome: tenant.nome,
      unidades: sedes.slice(0, UNIDADES_POR_TORCIDA),
      memberRoleId: memberRole.id,
      adminRoleId: adminRole.id,
      ownerRoleId: ownerRole.id,
      /** @type {string | null} */ presidenteUserId: null,
      /** @type {string[]} */ aprovadosUserIds: [],
    })
  }
  return contexto
}

// ── Fase 1: presidente sintético + pessoas por unidade ───────────────────
async function seedPessoas(contexto, resumo) {
  for (const t of contexto) {
    const jaTem = await db.saasMembro.count({ where: { tenantId: t.tenantId, user: filtroUserTeste } })
    if (jaTem > 0) {
      console.log(`  ↔  ${t.tenantSlug}: já semeada (${jaTem} pessoas) — pulando`)
      const presidente = await db.userRole.findFirst({
        where: { tenantId: t.tenantId, roleId: t.ownerRoleId, user: filtroUserTeste },
        select: { userId: true },
      })
      t.presidenteUserId = presidente?.userId ?? null
      const aprovados = await db.saasMembro.findMany({
        where: { tenantId: t.tenantId, status: 'APROVADO', user: filtroUserTeste },
        select: { userId: true },
      })
      t.aprovadosUserIds = aprovados.map((m) => m.userId)
      continue
    }

    const usersRows = []
    const membrosRows = []
    const roleRows = []
    const unidadePrincipal = t.unidades[0]

    // Presidente sintético — estas torcidas não têm nenhum UserRole real,
    // então sem ele não há autoria institucional nem proposta de aliança.
    const presidenteId = crypto.randomUUID()
    const nPres = nextSeq()
    const { nome: nomePres } = gerarNome()
    usersRows.push({
      id: presidenteId,
      email: `presidente.${slugify(t.tenantSlug)}@${DOMINIO_TESTE}`,
      nome: nomePres,
      nickname: `teste_nac_presidente_${nPres}`,
      criadoEm: new Date(),
    })
    membrosRows.push({
      id: crypto.randomUUID(),
      tenantId: t.tenantId,
      userId: presidenteId,
      tipo: 'SOCIO',
      nome: nomePres,
      status: 'APROVADO',
      cidade: unidadePrincipal.cidade ?? null,
      cpf: gerarCpf(nPres),
      sedeId: unidadePrincipal.id,
      aprovadoPorNome: 'Seed de teste (nacional)',
      aprovadoEm: new Date(),
    })
    roleRows.push({
      id: crypto.randomUUID(),
      userId: presidenteId,
      tenantId: t.tenantId,
      roleId: t.ownerRoleId,
    })
    t.presidenteUserId = presidenteId

    for (const unidade of t.unidades) {
      for (let i = 0; i < PESSOAS_POR_UNIDADE; i++) {
        const n = nextSeq()
        const { primeiro, sobrenome, nome } = gerarNome()
        const userId = crypto.randomUUID()
        const status = pickPonderado([['APROVADO', 85], ['PENDENTE', 10], ['REPROVADO', 5]])
        const aprovado = status === 'APROVADO'

        usersRows.push({
          id: userId,
          email: `${slugify(primeiro)}.${slugify(sobrenome)}.${n}@${DOMINIO_TESTE}`,
          nome,
          nickname: `teste_nac_${n}`,
          criadoEm: new Date(),
        })
        membrosRows.push({
          id: crypto.randomUUID(),
          tenantId: t.tenantId,
          userId,
          tipo: pickPonderado([['SOCIO', 55], ['TORCEDOR', 45]]),
          nome,
          status,
          cidade: unidade.cidade ?? pick(t.cidades),
          telefone: `${t.uf === 'SP' ? '11' : t.uf === 'RJ' ? '21' : t.uf === 'RS' ? '51' : '31'}9${String(10000000 + n).slice(0, 8)}`,
          cpf: gerarCpf(n),
          sedeId: unidade.id,
          aprovadoPorNome: aprovado ? 'Seed de teste (nacional)' : null,
          aprovadoEm: aprovado ? new Date() : null,
        })
        if (aprovado) {
          const cargo = pickPonderado([['member', 90], ['admin', 7], ['none', 3]])
          if (cargo !== 'none') {
            roleRows.push({
              id: crypto.randomUUID(),
              userId,
              tenantId: t.tenantId,
              roleId: cargo === 'admin' ? t.adminRoleId : t.memberRoleId,
            })
          }
          t.aprovadosUserIds.push(userId)
        }
      }
    }

    await createManyBatched('user', usersRows, `${t.tenantSlug}: users`)
    await createManyBatched('saasMembro', membrosRows, `${t.tenantSlug}: SaasMembro`)
    await createManyBatched('userRole', roleRows, `${t.tenantSlug}: UserRole`)
    resumo.users += usersRows.length
    resumo.saasMembro += membrosRows.length
    resumo.userRole += roleRows.length
    resumo.presidentes += 1
  }
}

// ── Fase 2: torcedores globais por clube (Comunidade Nacional) ───────────
async function seedTorcedoresGlobais(contexto, resumo) {
  for (const t of contexto) {
    const jaTem = await db.perfilTorcedor.count({
      where: { afiliacaoId: t.afiliacao.id, user: filtroUserTeste },
    })
    if (jaTem >= GLOBAIS_POR_CLUBE) {
      console.log(`  ↔  ${t.clube}: torcedores globais já semeados (${jaTem}) — pulando`)
      continue
    }

    const usersRows = []
    const perfisRows = []
    for (let i = 0; i < GLOBAIS_POR_CLUBE; i++) {
      const n = nextSeq()
      const { primeiro, sobrenome, nome } = gerarNome()
      const userId = crypto.randomUUID()
      usersRows.push({
        id: userId,
        email: `global.${slugify(primeiro)}.${slugify(sobrenome)}.${n}@${DOMINIO_TESTE}`,
        nome,
        nickname: `teste_nac_global_${n}`,
        criadoEm: new Date(),
      })
      perfisRows.push({
        id: crypto.randomUUID(),
        userId,
        afiliacaoId: t.afiliacao.id,
        regiao: pick(t.cidades),
        onboardingConcluidoEm: new Date(),
      })
    }
    await createManyBatched('user', usersRows, `${t.clube}: users globais`)
    await createManyBatched('perfilTorcedor', perfisRows, `${t.clube}: PerfilTorcedor`)
    resumo.users += usersRows.length
    resumo.perfilTorcedor += perfisRows.length
  }
}

// ── Fase 3: posts (peso em alcance nacional) ─────────────────────────────
async function seedPosts(contexto, resumo) {
  for (const t of contexto) {
    if (!t.presidenteUserId || t.aprovadosUserIds.length === 0) {
      console.log(`  ↔  ${t.tenantSlug}: sem presidente/membros — pulando posts`)
      continue
    }
    const jaTem = await db.post.count({
      where: { tenantId: t.tenantId, titulo: { startsWith: MARCA } },
    })
    if (jaTem > 0) {
      console.log(`  ↔  ${t.tenantSlug}: posts já semeados (${jaTem}) — pulando`)
      continue
    }

    const postsRows = []
    const inst = templatesInstitucionais(t.tenantNome, t.afiliacao.nome)
    for (let i = 0; i < 8; i++) {
      postsRows.push({
        id: crypto.randomUUID(),
        tenantId: t.tenantId,
        autorId: t.presidenteUserId,
        titulo: `${MARCA} Comunicado ${i + 1}`,
        conteudo: pick(inst),
        tipo: 'INSTITUCIONAL',
        visibilidade: 'PUBLICO',
        // Peso alto de propósito: o objetivo do lote é carregar a
        // Comunidade Nacional com vários clubes ao mesmo tempo.
        alcanceNacional: Math.random() < 0.4,
        criadoEm: diasAtras(Math.floor(Math.random() * 30)),
      })
    }

    const mem = templatesMembro(t.afiliacao.nome)
    for (const autorId of t.aprovadosUserIds.filter(() => Math.random() < 0.5)) {
      const visibilidade = pickPonderado([['PUBLICO', 70], ['TENANT', 25], ['PRIVADO', 5]])
      postsRows.push({
        id: crypto.randomUUID(),
        tenantId: t.tenantId,
        autorId,
        conteudo: pick(mem),
        tipo: 'MEMBRO',
        visibilidade,
        alcanceNacional: visibilidade === 'PUBLICO' && Math.random() < 0.3,
        criadoEm: diasAtras(Math.floor(Math.random() * 30)),
      })
    }

    await createManyBatched('post', postsRows, `${t.tenantSlug}: Post`)
    resumo.posts += postsRows.length
    resumo.postsNacionais += postsRows.filter((p) => p.alcanceNacional).length

    // Engajamento leve — o volume pesado de reação/comentário fica no lote
    // Corinthians; aqui basta o feed nacional não parecer morto.
    const reacoes = []
    const comentarios = []
    const tipos = ['CURTIR', 'FORCA', 'VAMOS', 'PRESENTE']
    for (const post of postsRows) {
      const reagentes = new Set(embaralhar(t.aprovadosUserIds).slice(0, 1 + Math.floor(Math.random() * 5)))
      for (const userId of reagentes) {
        reacoes.push({ id: crypto.randomUUID(), postId: post.id, userId, tipo: pick(tipos) })
      }
      for (let i = 0; i < Math.floor(Math.random() * 3); i++) {
        comentarios.push({
          id: crypto.randomUUID(),
          postId: post.id,
          autorId: pick(t.aprovadosUserIds),
          conteudo: pick(mem),
        })
      }
    }
    await createManyBatched('reacao', reacoes, `${t.tenantSlug}: Reacao`, 800)
    await createManyBatched('comentario', comentarios, `${t.tenantSlug}: Comentario`, 800)
    resumo.reacoes += reacoes.length
    resumo.comentarios += comentarios.length
  }
}

// ── Fase 4: rivalidades (clube × clube e torcida × torcida) ─────────────
async function seedRivalidades(contexto, resumo) {
  // Mapa slug → id, incluindo o Corinthians (já semeado pelo outro lote).
  const clubes = new Map(contexto.map((t) => [t.clube, t.afiliacao.id]))
  const corinthians = await db.afiliacao.findFirst({
    where: { slug: CLUBE_CORINTHIANS },
    select: { id: true },
  })
  if (corinthians) clubes.set(CLUBE_CORINTHIANS, corinthians.id)

  // Par canônico: sempre aId < bId (regra do schema).
  const rows = []
  for (const [slugA, slugB] of RIVALIDADES_CLUBE) {
    const idA = clubes.get(slugA)
    const idB = clubes.get(slugB)
    if (!idA || !idB) {
      console.log(`  ⚠️  rivalidade ignorada (clube fora do lote): ${slugA} × ${slugB}`)
      continue
    }
    const [a, b] = idA < idB ? [idA, idB] : [idB, idA]
    rows.push({ id: crypto.randomUUID(), afiliacaoAId: a, afiliacaoBId: b })
  }
  resumo.rivalidadesClube += await createManyBatched('rivalidadeClube', rows, 'RivalidadeClube (clássicos)')

  // Torcida × torcida: deriva dos clássicos entre as torcidas do lote.
  const tenantPorClube = new Map(contexto.map((t) => [t.clube, t.tenantId]))
  const corTenant = await db.tenant.findFirst({
    where: { slug: TENANT_CORINTHIANS },
    select: { id: true },
  })
  if (corTenant) tenantPorClube.set(CLUBE_CORINTHIANS, corTenant.id)

  const rowsTorcida = []
  for (const [slugA, slugB] of RIVALIDADES_CLUBE) {
    const idA = tenantPorClube.get(slugA)
    const idB = tenantPorClube.get(slugB)
    if (!idA || !idB) continue
    const [a, b] = idA < idB ? [idA, idB] : [idB, idA]
    rowsTorcida.push({ id: crypto.randomUUID(), tenantAId: a, tenantBId: b })
  }
  resumo.rivalidadesTorcida += await createManyBatched(
    'rivalidadeTorcida',
    rowsTorcida,
    'RivalidadeTorcida (derivada dos clássicos)',
  )
}

// ── Fase 5: alianças cross-clube ─────────────────────────────────────────
async function seedAliancas(contexto, resumo) {
  const porTenantSlug = new Map(contexto.map((t) => [t.tenantSlug, t]))
  for (const [slugOrigem, slugAliado, status] of ALIANCAS) {
    const origem = porTenantSlug.get(slugOrigem)
    const aliado = porTenantSlug.get(slugAliado)
    if (!origem || !aliado || !origem.presidenteUserId) {
      console.log(`  ⚠️  aliança ignorada: ${slugOrigem} → ${slugAliado}`)
      continue
    }
    const existente = await db.alianca.findFirst({
      where: { tenantOrigemId: origem.tenantId, tenantAliadoId: aliado.tenantId },
      select: { id: true },
    })
    if (existente) {
      console.log(`  ↔  aliança ${slugOrigem} → ${slugAliado} já existe — pulando`)
      continue
    }
    const confirmada = status === 'ATIVA' || status === 'ENCERRADA'
    await db.alianca.create({
      data: {
        tenantOrigemId: origem.tenantId,
        tenantAliadoId: aliado.tenantId,
        status,
        propostaPorId: origem.presidenteUserId,
        confirmadaPorId: confirmada ? aliado.presidenteUserId : null,
        confirmadaEm: confirmada ? diasAtras(Math.floor(Math.random() * 60) + 5) : null,
      },
    })
    resumo.aliancas += 1
    console.log(`  ✅ aliança ${status}: ${slugOrigem} → ${slugAliado}`)
  }
}

// ── Fase 6: eventos leves (Agenda por clube) ────────────────────────────
async function seedEventos(contexto, resumo) {
  for (const t of contexto) {
    if (!t.presidenteUserId) continue
    const jaTem = await db.evento.count({
      where: { tenantId: t.tenantId, titulo: { startsWith: MARCA } },
    })
    if (jaTem > 0) {
      console.log(`  ↔  ${t.tenantSlug}: eventos já semeados — pulando`)
      continue
    }
    for (let i = 0; i < 3; i++) {
      const evento = await db.evento.create({
        data: {
          tenantId: t.tenantId,
          tipo: pick(['GERAL', 'CARAVANA', 'ENSAIO']),
          titulo: `${MARCA} Evento ${i + 1} — ${t.tenantNome}`,
          descricao: `Evento de teste do lote nacional (${t.afiliacao.nome}).`,
          data: diasAFrente(3 + i * 12),
          local: 'Sede da torcida',
          sedeId: t.unidades[0].id,
          criadoPorId: t.presidenteUserId,
        },
        select: { id: true },
      })
      resumo.eventos += 1

      const inscritos = embaralhar(t.aprovadosUserIds).slice(
        0,
        Math.ceil(t.aprovadosUserIds.length * 0.3),
      )
      const rows = inscritos.map((userId) => ({
        id: crypto.randomUUID(),
        eventoId: evento.id,
        userId,
        status: 'CONFIRMADO',
      }))
      await createManyBatched('eventoRsvp', rows, `${t.tenantSlug}: RSVPs`, 500)
      resumo.rsvps += rows.length
    }
  }
}

// ── Pós-Fase 1: canais oficiais dos APROVADOS ────────────────────────────
async function garantirCanaisAprovados(contexto) {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const { dirname, resolve } = await import('node:path')
  const scriptsDir = dirname(fileURLToPath(import.meta.url))

  // Reutiliza os scripts canônicos também usados pelo seed Corinthians:
  // primeiro materializa os canais; depois aplica o backfill idempotente por
  // tenant. A regra de unidade + SEDE continua em um único lugar.
  console.log('  → garantindo canais oficiais das unidades...')
  execFileSync('node', [resolve(scriptsDir, 'ensure-canais-oficiais-unidades.js')], {
    stdio: 'inherit',
  })

  for (const tenant of contexto) {
    console.log(`  → repair-aprovado-canal-membro --tenant=${tenant.slug}`)
    execFileSync(
      'node',
      [resolve(scriptsDir, 'repair-aprovado-canal-membro.js'), `--tenant=${tenant.slug}`],
      { stdio: 'inherit' },
    )
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seed de teste em volume — lote NACIONAL (multi-clube)\n')
  console.log(`Fases selecionadas: ${FASES.join(', ')}`)

  const contexto = await carregarContexto()
  console.log(
    `${contexto.length} clubes · ${contexto.reduce((s, t) => s + t.unidades.length, 0)} unidades ` +
      `· ${PESSOAS_POR_UNIDADE} pessoas/unidade · ${GLOBAIS_POR_CLUBE} torcedores globais/clube\n`,
  )

  const resumo = {
    presidentes: 0,
    users: 0,
    saasMembro: 0,
    userRole: 0,
    perfilTorcedor: 0,
    posts: 0,
    postsNacionais: 0,
    reacoes: 0,
    comentarios: 0,
    rivalidadesClube: 0,
    rivalidadesTorcida: 0,
    aliancas: 0,
    eventos: 0,
    rsvps: 0,
  }

  const fases = [
    [
      '1',
      'presidente sintético + pessoas por unidade + canais oficiais',
      async () => {
        await seedPessoas(contexto, resumo)
        await garantirCanaisAprovados(contexto)
      },
    ],
    ['2', 'torcedores globais por clube', () => seedTorcedoresGlobais(contexto, resumo)],
    ['3', 'posts + engajamento (peso em alcance nacional)', () => seedPosts(contexto, resumo)],
    ['4', 'rivalidades clube × clube e torcida × torcida', () => seedRivalidades(contexto, resumo)],
    ['5', 'alianças cross-clube', () => seedAliancas(contexto, resumo)],
    ['6', 'eventos por clube', () => seedEventos(contexto, resumo)],
  ]

  for (const [num, titulo, fn] of fases) {
    if (!FASES.includes(num)) continue
    console.log(`\n── Fase ${num}: ${titulo} ──`)
    await fn()
  }

  console.log('\n🎉 Seed nacional concluído!\n')
  console.log('📊 Resumo:')
  for (const [chave, qtd] of Object.entries(resumo)) {
    if (qtd > 0) console.log(`   ${chave.padEnd(22)}: ${qtd}`)
  }
  console.log('\nReversão: pnpm --filter @torcida/db reset:nacional-teste -- --dry-run')
}

main()
  .catch((err) => {
    console.error('❌ Erro no seed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
