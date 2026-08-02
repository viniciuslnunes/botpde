/**
 * Seed de dados de teste em volume — Corinthians (torcidas + afiliação).
 *
 * Popula as 6 torcidas reais do Corinthians (e suas Sedes/Subsedes/PDEs) com
 * pessoas, cargos, canais, posts, interações, eventos, salas de vídeo e
 * pedidos de loja sintéticos — para navegar o produto sob volume realista
 * antes de alimentar dados reais.
 *
 * Convenção de marcação (permite reset completo depois, ver
 * reset-corinthians-teste.js):
 *   - Todo `User` sintético usa e-mail `...@teste.corinthians.torcida.app`
 *     e `nickname` com prefixo `teste_`.
 *   - Toda `Conversa`/`Evento`/`SalaReuniao` criada pelo seed tem
 *     título/nome com prefixo `[TESTE-CORINTHIANS] `.
 *   - `Post` institucional (autor = owner real) também leva `[TESTE-CORINTHIANS] ` no
 *     título — é o único jeito de rastreá-lo sem depender do autor.
 *
 * Idempotente por unidade territorial: se já existir gente de teste numa
 * Sede/Subsede/PDE, a unidade é pulada.
 *
 * Após provisionar canais oficiais (Fase 4), a Fase 4b espelha a regra de
 * `vincularMembroCanaisAposAprovacao`: todo APROVADO entra no canal da
 * unidade e no da SEDE (`db:repair-aprovado-canal-membro`). Sem isso o
 * volume de teste mentiria sobre a regra de negócio.
 *
 * Uso:
 *   pnpm --filter @torcida/db seed:corinthians-teste
 *   pnpm --filter @torcida/db seed:corinthians-teste -- --so-canais
 *   pnpm --filter @torcida/db seed:corinthians-teste -- --so-historico
 */
import crypto from 'node:crypto'
import { db } from '../src/index.js'

const DOMINIO_TESTE = 'teste.corinthians.torcida.app'
const AFILIACAO_SLUG = 'sport-club-corinthians-paulista-sp'
const TENANT_SLUGS_REAIS = [
  'pde-gavioes-fiel',
  'camisa-12-corinthians',
  'pavilhao-nove',
  'estopim-da-fiel-sp',
  'torcida-fiel-macabra-sp',
  'torcida-organizada-coringao-chopp-sp',
]
const PESSOAS_POR_UNIDADE = 50
const TORCEDORES_GLOBAIS_EXTRA = 150
/** Marcador dos posts de torcedor na CN — permite reexecutar sem duplicar. */
const MARCA_CN = '[TESTE-CORINTHIANS-CN]'

// ── Utilitários ──────────────────────────────────────────────────────────
let seq = 0
function nextSeq() {
  seq += 1
  return seq
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** opcoes: [[valor, peso], ...] — pesos não precisam somar 100. */
function pickPonderado(opcoes) {
  const total = opcoes.reduce((s, [, p]) => s + p, 0)
  let r = Math.random() * total
  for (const [valor, peso] of opcoes) {
    if (r < peso) return valor
    r -= peso
  }
  return opcoes[opcoes.length - 1][0]
}

function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const PRIMEIROS_NOMES = [
  'João', 'Maria', 'José', 'Ana', 'Pedro', 'Paulo', 'Marcos', 'Lucas', 'Carlos', 'Fernanda',
  'Juliana', 'Camila', 'Rafael', 'Bruno', 'Gustavo', 'Larissa', 'Patrícia', 'Renata', 'Diego', 'Felipe',
  'Aline', 'Vanessa', 'Rodrigo', 'Fabio', 'Thiago', 'Cristina', 'Adriana', 'Sandra', 'Marcelo', 'Eduardo',
  'Beatriz', 'Gabriela', 'Leandro', 'Alexandre', 'Vinicius', 'Mateus', 'Daniela', 'Priscila', 'Roberto', 'Antonio',
  'Francisco', 'Sergio', 'Cesar', 'Wagner', 'Douglas', 'Elaine', 'Simone', 'Tatiane', 'Viviane', 'Igor',
]
const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
  'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
  'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
  'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira', 'Correia', 'Cavalcante', 'Melo', 'Pinto', 'Batista',
]

function gerarNome() {
  const primeiro = pick(PRIMEIROS_NOMES)
  const sobrenome = pick(SOBRENOMES)
  return { primeiro, sobrenome, nome: `${primeiro} ${sobrenome}` }
}

function gerarCpf(n) {
  const base = String(900000000 + n).padStart(9, '0')
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-00`
}

function gerarRg(n) {
  const base = String(800000000 + n).padStart(9, '0')
  return `${base.slice(0, 2)}.${base.slice(2, 5)}.${base.slice(5, 8)}-${base.slice(8, 9)}`
}

/**
 * Laudos de reprovação sintéticos. `categoria`/`pontos` usam o catálogo de
 * `@torcida/types` (CATEGORIAS_REPROVACAO / PONTOS_REPROVACAO) — é o que faz o
 * card de detalhes pintar a etapa certa de vermelho.
 */
const LAUDOS_SOCIO = [
  {
    categoria: 'DOCUMENTACAO',
    pontos: ['documento', 'residencia'],
    motivo:
      'A foto do documento está cortada nas bordas e o comprovante de residência tem mais de 90 dias. Reenvie os dois legíveis e dentro da validade.',
  },
  {
    categoria: 'DADOS_INCORRETOS',
    pontos: ['cpf', 'nascimento'],
    motivo:
      'O CPF informado não confere com o RG enviado e a data de nascimento está com dia e mês trocados. Corrija os dois campos antes de reenviar.',
  },
  {
    categoria: 'VINCULO_NAO_COMPROVADO',
    pontos: ['prova'],
    motivo:
      'O comprovante de vínculo é uma foto de arquibancada, que não prova associação. Envie carteirinha, recibo de mensalidade ou declaração da unidade.',
  },
  {
    categoria: 'DADOS_INCORRETOS',
    pontos: ['telefone', 'cep', 'numero'],
    motivo:
      'Telefone com um dígito faltando, CEP não localizado e número da residência em branco. Revise o endereço completo.',
  },
  {
    categoria: 'DUPLICIDADE',
    pontos: [],
    motivo:
      'Já existe um cadastro ativo com este CPF nesta torcida. Procure a secretaria para unificar os registros antes de abrir outro.',
    permiteReenvio: false,
  },
]

const LAUDOS_TORCEDOR = [
  {
    categoria: 'DADOS_INCORRETOS',
    pontos: ['nome', 'telefone'],
    motivo:
      'Nome incompleto (só o primeiro nome) e telefone sem DDD. Preencha o nome completo e um número válido para contato.',
  },
  {
    categoria: 'FORA_DE_PERFIL',
    pontos: [],
    motivo:
      'A unidade escolhida não atende a região informada no cadastro. Refaça a solicitação selecionando o ponto de encontro correto.',
  },
]

async function createManyBatched(model, rows, label, batchSize = 500) {
  let criados = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const lote = rows.slice(i, i + batchSize)
    const res = await db[model].createMany({ data: lote, skipDuplicates: true })
    criados += res.count
  }
  if (rows.length) {
    const marca = criados === rows.length ? '✅' : '⚠️ '
    console.log(`  ${marca} ${label}: ${criados}/${rows.length} inseridos`)
    if (criados !== rows.length) {
      console.warn(`     (${rows.length - criados} linha(s) ignorada(s) por skipDuplicates — verifique geração de chaves únicas)`)
    }
  }
  return criados
}

// ── Templates de conteúdo ────────────────────────────────────────────────
function templatesInstitucionais(torcidaNome) {
  return [
    `Fechou! ${torcidaNome} vai lotar o setor no próximo jogo em casa. Bora, Fiel!`,
    `Confira os horários de funcionamento da sede nesta semana. Corinthians sempre!`,
    `Nova caravana confirmada para o próximo jogo fora de casa — vagas limitadas, garanta a sua.`,
    `A ${torcidaNome} inaugura novos produtos na loja oficial. Vem conferir!`,
    `Bar da sede funcionando normalmente nos dias de jogo, com promoção pra quem chegar cedo.`,
    `Assembleia geral marcada — todo associado em dia pode participar e votar.`,
    `Recorde de presença no último jogo! Obrigado a quem também apareceu.`,
    `Manutenção na sede concluída — agora com espaço novo para os associados.`,
    `Ensaio da bateria nesta semana, todo mundo convidado a prestigiar.`,
    `Campanha de arrecadação de agasalhos para o inverno — traga sua doação na sede.`,
    `Vamo Corinthians! Confira a cobertura completa do último clássico.`,
    `Novo lote de carteirinhas de sócio já disponível para retirada.`,
  ]
}

function templatesMembro(unidadeNome) {
  return [
    `Alguém mais vai pro jogo esse fim de semana? Bora combinar!`,
    `Que jogaço ontem, Corinthians não decepciona. Vamo, Timão!`,
    `Passando pra avisar que tô chegando cedo na sede pro pré-jogo.`,
    `Saudade dos dias de vitória no Itaquerão. Fiel não abandona!`,
    `Alguém sabe se tem ônibus pra caravana desse fim de semana?`,
    `Boa tarde, ${unidadeNome}! Bora fortalecer a torcida.`,
    `Comprei minha camisa nova, chegou linda demais.`,
    `Corinthians é a maior paixão. Presente sempre que puder.`,
    `Marcando presença no próximo evento da torcida.`,
    `Que emoção ver a arquibancada cheia de novo.`,
  ]
}

function diasAtras(dias) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
}

function embaralhar(arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Get-or-create do tenant sintético da CN — mesmo slug reservado que
 * `getOrCreateComunidadeNacionalTenant` usa no web.
 */
async function ensureTenantSinteticoCn(afiliacao) {
  const slugReservado = `${afiliacao.slug ?? afiliacao.id}-nacional`
  const existente = await db.tenant.findFirst({
    where: { slug: slugReservado },
    select: { id: true, slug: true },
  })
  if (existente) return existente

  return db.tenant.create({
    data: {
      nome: `${afiliacao.nome} — Comunidade Nacional`,
      slug: slugReservado,
      afiliacaoId: afiliacao.id,
      sintetico: true,
      ativo: true,
    },
    select: { id: true, slug: true },
  })
}

/**
 * Fase 3b: posts de torcedor na Comunidade Nacional do Corinthians.
 *
 * A Fase 3 criava os 150 torcedores globais mas nenhum deles publicava, e o
 * lote nacional (`seed-nacional-teste.js`) exclui o Corinthians de propósito
 * — resultado: a CN do Timão só tinha post de sócio de organizada, e a cota
 * de torcedor do feed nacional não tinha o que servir. Aqui os globais e os
 * TORCEDOR APROVADO das unidades publicam no sintético, como
 * `publicarPostNacional` faz em produção.
 */
async function seedPostsTorcedoresCn(afiliacao, contexto, resumo) {
  const POSTS_MIN = 24
  const sintetico = await ensureTenantSinteticoCn(afiliacao)

  const jaTem = await db.post.count({
    where: { tenantId: sintetico.id, tipo: 'MEMBRO', titulo: { startsWith: MARCA_CN } },
  })
  if (jaTem >= POSTS_MIN) {
    console.log(`  ↔  Posts CN de torcedor já semeados (${jaTem}) — pulando`)
    return
  }

  const filtroUserTeste = { email: { endsWith: `@${DOMINIO_TESTE}` } }
  const [globais, torcedoresUnidade] = await Promise.all([
    db.perfilTorcedor.findMany({
      where: { afiliacaoId: afiliacao.id, user: filtroUserTeste },
      select: { userId: true },
    }),
    db.saasMembro.findMany({
      where: {
        tenantId: { in: contexto.map((t) => t.id) },
        tipo: 'TORCEDOR',
        status: 'APROVADO',
        user: filtroUserTeste,
      },
      select: { userId: true },
    }),
  ])

  const autores = [
    ...new Set([...globais.map((g) => g.userId), ...torcedoresUnidade.map((m) => m.userId)]),
  ]
  if (autores.length === 0) {
    console.log('  ↔  Sem torcedores de teste para publicar na CN — pulando')
    return
  }

  const textos = templatesMembro(afiliacao.nome)
  const autoresPost = embaralhar(autores)
  const postsRows = []
  for (let i = 0; i < POSTS_MIN - jaTem; i++) {
    postsRows.push({
      id: crypto.randomUUID(),
      tenantId: sintetico.id,
      autorId: autoresPost[i % autoresPost.length],
      titulo: `${MARCA_CN} Torcedor CN ${i + 1}`,
      conteudo: pick(textos),
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      // No sintético o Descobrir nacional já inclui por `tenant.sintetico`;
      // a flag reforça e cobre quem lê por `alcanceNacional`.
      alcanceNacional: true,
      // Espalhado no tempo: sem isso o balde de torcedor vira um bloco só.
      criadoEm: diasAtras(Math.floor(Math.random() * 30)),
    })
  }

  await createManyBatched('post', postsRows, 'Post CN torcedor')
  resumo.totais.posts += postsRows.length

  const reacoesRows = []
  const tiposReacao = ['CURTIR', 'FORCA', 'VAMOS', 'PRESENTE']
  for (const post of postsRows) {
    for (const userId of embaralhar(autores).slice(0, 1 + Math.floor(Math.random() * 4))) {
      reacoesRows.push({
        id: crypto.randomUUID(),
        postId: post.id,
        userId,
        tipo: pick(tiposReacao),
      })
    }
  }
  await createManyBatched('reacao', reacoesRows, 'Reação CN torcedor')
  resumo.totais.reacoes += reacoesRows.length
}

// ── Fase 0: contexto (tenants, sedes, afiliação) ─────────────────────────
async function carregarContexto() {
  const afiliacao = await db.afiliacao.findFirst({ where: { slug: AFILIACAO_SLUG } })
  if (!afiliacao) throw new Error(`Afiliação '${AFILIACAO_SLUG}' não encontrada.`)

  const tenants = await db.tenant.findMany({
    where: { slug: { in: TENANT_SLUGS_REAIS } },
    select: { id: true, slug: true, nome: true },
  })
  if (tenants.length !== TENANT_SLUGS_REAIS.length) {
    const achados = new Set(tenants.map((t) => t.slug))
    const faltando = TENANT_SLUGS_REAIS.filter((s) => !achados.has(s))
    throw new Error(`Tenant(s) não encontrado(s): ${faltando.join(', ')}`)
  }

  const contexto = []
  for (const tenant of tenants) {
    const sedes = await db.sede.findMany({
      where: { tenantId: tenant.id, tipo: { in: ['SEDE', 'SUBSEDE', 'PONTO_ENCONTRO'] }, ativa: true },
      select: { id: true, tipo: true, nome: true, cidade: true, estado: true },
      orderBy: { criadoEm: 'asc' },
    })
    const memberRole = await db.role.findFirst({ where: { tenantId: tenant.id, isSystem: true, nome: 'member' } })
    const adminRole = await db.role.findFirst({ where: { tenantId: tenant.id, isSystem: true, nome: 'admin' } })
    if (!memberRole || !adminRole) throw new Error(`Tenant '${tenant.slug}' sem cargos de sistema member/admin.`)

    // Autor institucional (posts/grupos/eventos/salas): owner → admin →
    // 1º SaasMembro aprovado → 1º usuário qualquer (mesmo fallback de
    // ensure-canais-oficiais-unidades.js — alguns tenants reais não têm
    // owner atribuído ainda).
    let autorInstitucionalId = (
      await db.userRole.findFirst({
        where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
        select: { userId: true },
      })
    )?.userId
    if (!autorInstitucionalId) {
      autorInstitucionalId = (
        await db.userRole.findFirst({
          where: { tenantId: tenant.id, role: { isSystem: true, nome: 'admin' } },
          select: { userId: true },
        })
      )?.userId
    }
    if (!autorInstitucionalId) {
      autorInstitucionalId = (
        await db.saasMembro.findFirst({
          where: { tenantId: tenant.id, status: 'APROVADO' },
          select: { userId: true },
          orderBy: { criadoEm: 'asc' },
        })
      )?.userId
    }
    if (!autorInstitucionalId) {
      autorInstitucionalId = (
        await db.userRole.findFirst({ where: { tenantId: tenant.id }, select: { userId: true } })
      )?.userId
    }
    if (!autorInstitucionalId) throw new Error(`Tenant '${tenant.slug}' sem nenhum usuário para autoria institucional.`)

    const autor = await db.user.findUnique({
      where: { id: autorInstitucionalId },
      select: { nome: true },
    })

    contexto.push({
      id: tenant.id,
      slug: tenant.slug,
      nome: tenant.nome,
      sedes,
      ownerUserId: autorInstitucionalId,
      ownerUserNome: autor?.nome?.trim() || 'Diretoria',
      memberRoleId: memberRole.id,
      adminRoleId: adminRole.id,
    })
  }

  return { afiliacao, contexto }
}

// ── Fase 1+2: pessoas por unidade + SaasMembro + UserRole ────────────────
async function seedPessoas(contexto, resumo) {
  const usersRows = []
  const membrosRows = []
  const roleRows = []
  const auditRows = []

  for (const tenant of contexto) {
    resumo.porTorcida[tenant.slug] ??= { users: 0, saasMembro: 0, posts: 0, eventos: 0, salas: 0, pedidos: 0 }

    for (const unidade of tenant.sedes) {
      const jaTemSeed = await db.saasMembro.count({
        where: { tenantId: tenant.id, sedeId: unidade.id, user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
      })
      if (jaTemSeed > 0) {
        console.log(`  ↔  ${tenant.slug} / ${unidade.nome}: já semeada (${jaTemSeed} pessoas) — pulando`)
        continue
      }

      for (let i = 1; i <= PESSOAS_POR_UNIDADE; i++) {
        const n = nextSeq()
        const { primeiro, sobrenome, nome } = gerarNome()
        const userId = crypto.randomUUID()
        const email = `${slugify(primeiro)}.${slugify(sobrenome)}.${n}@${DOMINIO_TESTE}`
        // Global (não fatia unidade.id): Sedes reais nem sempre usam UUID
        // como id (algumas têm ids legíveis tipo "pde-gavioes-..."), então
        // um prefixo curto colide entre unidades — usa o contador global `n`.
        const nickname = `teste_${slugify(tenant.slug)}_${n}`
        const tipo = pickPonderado([['SOCIO', 60], ['TORCEDOR', 40]])
        const status = pickPonderado([['APROVADO', 85], ['PENDENTE', 10], ['REPROVADO', 5]])
        const aprovado = status === 'APROVADO'
        const membroId = crypto.randomUUID()

        // Linha do tempo: solicitou, depois a diretoria decidiu. Sem isso a aba
        // Histórico do card fica vazia e o laudo de reprovação não existe.
        const solicitadoEm = new Date(Date.now() - (3 + Math.floor(Math.random() * 60)) * 86400_000)
        const decididoEm = new Date(solicitadoEm.getTime() + (1 + Math.floor(Math.random() * 3)) * 86400_000)
        const analisado = status !== 'PENDENTE'
        const laudo =
          status === 'REPROVADO' ? pick(tipo === 'SOCIO' ? LAUDOS_SOCIO : LAUDOS_TORCEDOR) : null

        usersRows.push({
          id: userId,
          email,
          nome,
          nickname,
          criadoEm: solicitadoEm,
        })

        membrosRows.push({
          id: membroId,
          tenantId: tenant.id,
          userId,
          tipo,
          nome,
          status,
          criadoEm: solicitadoEm,
          cidade: unidade.cidade ?? null,
          telefone: `119${String(10000000 + n).slice(0, 8)}`,
          cpf: gerarCpf(n),
          rg: gerarRg(n),
          sedeId: unidade.id,
          aprovadoPorId: analisado ? tenant.ownerUserId : null,
          aprovadoPorNome: analisado ? tenant.ownerUserNome : null,
          aprovadoEm: analisado ? decididoEm : null,
          ...(laudo
            ? {
                reprovadoEm: decididoEm,
                reprovadoPorId: tenant.ownerUserId,
                reprovadoPorNome: tenant.ownerUserNome,
                reprovadoCategoria: laudo.categoria,
                reprovadoMotivo: laudo.motivo,
                reprovadoPontos: laudo.pontos,
                reprovadoPermiteReenvio: laudo.permiteReenvio !== false,
              }
            : {}),
        })

        auditRows.push({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          atorId: userId,
          acao: 'CADASTRO_SOLICITADO',
          entidade: 'SaasMembro',
          entidadeId: membroId,
          criadoEm: solicitadoEm,
        })
        if (analisado) {
          auditRows.push({
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            atorId: tenant.ownerUserId,
            acao: aprovado ? 'MEMBRO_APROVADO' : 'MEMBRO_REPROVADO',
            entidade: 'SaasMembro',
            entidadeId: membroId,
            criadoEm: decididoEm,
            detalhes: laudo
              ? {
                  categoria: laudo.categoria,
                  motivo: laudo.motivo,
                  pontos: laudo.pontos,
                  permiteReenvio: laudo.permiteReenvio !== false,
                }
              : undefined,
          })
        }

        if (aprovado) {
          const cargo = pickPonderado([['member', 90], ['admin', 8], ['none', 2]])
          if (cargo !== 'none') {
            roleRows.push({
              id: crypto.randomUUID(),
              userId,
              tenantId: tenant.id,
              roleId: cargo === 'admin' ? tenant.adminRoleId : tenant.memberRoleId,
            })
          }
        }

        resumo.porTorcida[tenant.slug].users += 1
      }
    }
  }

  await createManyBatched('user', usersRows, 'Users (por unidade)')
  await createManyBatched('saasMembro', membrosRows, 'SaasMembro')
  await createManyBatched('userRole', roleRows, 'UserRole')
  await createManyBatched('auditLog', auditRows, 'AuditLog (solicitação + decisão)')

  resumo.totais.users += usersRows.length
  resumo.totais.saasMembro += membrosRows.length
  resumo.totais.userRole += roleRows.length
  resumo.totais.auditLog += auditRows.length
}

// ── Fase 2b: laudo de reprovação + histórico em quem já foi semeado ──────
/**
 * A Fase 1+2 pula unidade já semeada, então lotes criados antes do laudo de
 * reprovação existir ficariam sem motivo e com a aba Histórico vazia. Esta
 * fase completa só o que falta, e só em usuário sintético.
 */
async function backfillHistoricoMembrosTeste(contexto, resumo) {
  const auditRows = []
  let laudosGravados = 0

  for (const tenant of contexto) {
    const membros = await db.saasMembro.findMany({
      where: { tenantId: tenant.id, user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
      select: { id: true, userId: true, tipo: true, status: true, criadoEm: true, aprovadoEm: true, reprovadoMotivo: true },
    })
    if (membros.length === 0) continue

    const comAudit = await db.auditLog.findMany({
      where: { tenantId: tenant.id, entidade: 'SaasMembro', entidadeId: { in: membros.map((m) => m.id) } },
      select: { entidadeId: true, acao: true },
    })
    const jaTem = new Set(comAudit.map((a) => `${a.entidadeId}:${a.acao}`))

    for (const membro of membros) {
      const solicitadoEm = membro.criadoEm ?? new Date()
      const decididoEm = membro.aprovadoEm ?? new Date(solicitadoEm.getTime() + 86400_000)
      const aprovado = membro.status === 'APROVADO'
      const analisado = membro.status !== 'PENDENTE'

      if (membro.status === 'REPROVADO' && !membro.reprovadoMotivo) {
        const laudo = pick(membro.tipo === 'SOCIO' ? LAUDOS_SOCIO : LAUDOS_TORCEDOR)
        await db.saasMembro.update({
          where: { id: membro.id },
          data: {
            reprovadoEm: decididoEm,
            reprovadoPorId: tenant.ownerUserId,
            reprovadoPorNome: tenant.ownerUserNome,
            reprovadoCategoria: laudo.categoria,
            reprovadoMotivo: laudo.motivo,
            reprovadoPontos: laudo.pontos,
            reprovadoPermiteReenvio: laudo.permiteReenvio !== false,
            aprovadoPorNome: tenant.ownerUserNome,
            aprovadoEm: decididoEm,
          },
        })
        laudosGravados += 1
        if (!jaTem.has(`${membro.id}:MEMBRO_REPROVADO`)) {
          auditRows.push({
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            atorId: tenant.ownerUserId,
            acao: 'MEMBRO_REPROVADO',
            entidade: 'SaasMembro',
            entidadeId: membro.id,
            criadoEm: decididoEm,
            detalhes: {
              categoria: laudo.categoria,
              motivo: laudo.motivo,
              pontos: laudo.pontos,
              permiteReenvio: laudo.permiteReenvio !== false,
            },
          })
        }
      }

      if (!jaTem.has(`${membro.id}:CADASTRO_SOLICITADO`)) {
        auditRows.push({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          atorId: membro.userId,
          acao: 'CADASTRO_SOLICITADO',
          entidade: 'SaasMembro',
          entidadeId: membro.id,
          criadoEm: solicitadoEm,
        })
      }
      if (analisado && aprovado && !jaTem.has(`${membro.id}:MEMBRO_APROVADO`)) {
        auditRows.push({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          atorId: tenant.ownerUserId,
          acao: 'MEMBRO_APROVADO',
          entidade: 'SaasMembro',
          entidadeId: membro.id,
          criadoEm: decididoEm,
        })
      }
    }
  }

  if (laudosGravados > 0) console.log(`  ✅ Laudo de reprovação preenchido em ${laudosGravados} membro(s) que estavam sem motivo`)
  await createManyBatched('auditLog', auditRows, 'AuditLog (backfill de histórico)')
  resumo.totais.auditLog += auditRows.length
  if (laudosGravados === 0 && auditRows.length === 0) console.log('  ↔  Nada a completar — laudos e histórico já presentes')
}

// ── Fase 3: torcedores 100% globais (Comunidade Nacional) ────────────────
async function seedTorcedoresGlobais(afiliacao, resumo) {
  const jaTem = await db.user.count({
    where: { email: { startsWith: 'global.', endsWith: `@${DOMINIO_TESTE}` } },
  })
  if (jaTem >= TORCEDORES_GLOBAIS_EXTRA) {
    console.log(`  ↔  Torcedores globais: já semeados (${jaTem}) — pulando`)
    return
  }

  const usersRows = []
  const perfisRows = []
  for (let i = 1; i <= TORCEDORES_GLOBAIS_EXTRA; i++) {
    const n = nextSeq()
    const { primeiro, sobrenome, nome } = gerarNome()
    const userId = crypto.randomUUID()
    const email = `global.${slugify(primeiro)}.${slugify(sobrenome)}.${n}@${DOMINIO_TESTE}`
    const nickname = `teste_global_${n}`

    usersRows.push({ id: userId, email, nome, nickname, criadoEm: new Date() })
    perfisRows.push({
      id: crypto.randomUUID(),
      userId,
      afiliacaoId: afiliacao.id,
      regiao: pick(['São Paulo/SP', 'Guarulhos/SP', 'Santo André/SP', 'Osasco/SP', 'Campinas/SP']),
      onboardingConcluidoEm: new Date(),
    })
  }

  await createManyBatched('user', usersRows, 'Users (torcedores globais)')
  await createManyBatched('perfilTorcedor', perfisRows, 'PerfilTorcedor')

  resumo.totais.users += usersRows.length
  resumo.totais.perfilTorcedor += perfisRows.length
}

// ── Fase 4: garantir canais oficiais das unidades (reaproveita script) ───
async function garantirCanaisOficiais() {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const { dirname, resolve } = await import('node:path')
  const __dir = dirname(fileURLToPath(import.meta.url))
  const scriptPath = resolve(__dir, 'ensure-canais-oficiais-unidades.js')
  console.log('  → rodando ensure-canais-oficiais-unidades.js...')
  execFileSync('node', [scriptPath], { stdio: 'inherit' })
}

/**
 * Espelha `vincularMembroCanaisAposAprovacao` nos tenants do lote — a Fase 1+2
 * grava APROVADO via createMany (sem passar por `aprovarMembro`), então sem
 * esta fase o card de canais fica com 1–4 membros enquanto há centenas de
 * aprovados. Idempotente; também cobre lotes já semeados.
 */
async function vincularAprovadosCanaisOficiais(contexto) {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const { dirname, resolve } = await import('node:path')
  const __dir = dirname(fileURLToPath(import.meta.url))
  const scriptPath = resolve(__dir, 'repair-aprovado-canal-membro.js')
  for (const tenant of contexto) {
    console.log(`  → repair-aprovado-canal-membro --tenant=${tenant.slug}`)
    execFileSync('node', [scriptPath, `--tenant=${tenant.slug}`], { stdio: 'inherit' })
  }
}

// ── Fase 5: grupo público "Bate-papo geral" por torcida ──────────────────
async function seedGruposPublicos(contexto, resumo) {
  for (const tenant of contexto) {
    const nomeGrupo = `[TESTE-CORINTHIANS] Bate-papo geral — ${tenant.nome}`
    const existente = await db.conversa.findFirst({ where: { tenantId: tenant.id, nome: nomeGrupo } })
    if (existente) {
      console.log(`  ↔  ${tenant.slug}: grupo público já existe — pulando`)
      continue
    }

    const grupos = [
      { nome: nomeGrupo, descricao: 'Bate-papo geral da torcida — dados de teste.' },
    ]
    if (tenant.slug === 'pde-gavioes-fiel') {
      grupos.push({
        nome: `[TESTE-CORINTHIANS] Institucional — ${tenant.nome}`,
        descricao: 'Canal institucional extra para variedade — dados de teste.',
      })
    }

    for (const g of grupos) {
      const conversa = await db.conversa.create({
        data: {
          tipo: 'GRUPO',
          tenantId: tenant.id,
          nome: g.nome,
          descricao: g.descricao,
          publica: true,
          comunidade: true,
          somenteAdminPublica: false,
          criadoPorId: tenant.ownerUserId,
        },
        select: { id: true },
      })

      const membros = await db.saasMembro.findMany({
        where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
        select: { userId: true },
      })
      const amostra = membros.filter(() => Math.random() < 0.3)
      const membroRows = amostra.map((m) => ({
        id: crypto.randomUUID(),
        conversaId: conversa.id,
        userId: m.userId,
        papel: 'MEMBRO',
        status: 'ATIVO',
      }))
      await createManyBatched('membroConversa', membroRows, `MembroConversa (${g.nome})`)
      resumo.totais.conversas += 1
      resumo.totais.membroConversa += membroRows.length
      console.log(`  ✅ ${tenant.slug}: grupo "${g.nome}" (${membroRows.length} membros)`)
    }
  }
}

// ── Fase 6+7: posts, reações, comentários ─────────────────────────────────
async function seedPostsEInteracoes(contexto, resumo) {
  for (const tenant of contexto) {
    const membrosAprovados = await db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
      select: { userId: true },
    })
    if (membrosAprovados.length === 0) {
      console.log(`  ↔  ${tenant.slug}: sem membros de teste aprovados — pulando posts`)
      continue
    }
    const userIds = membrosAprovados.map((m) => m.userId)

    const postsRows = []

    // Institucionais — autor = owner real do tenant
    const qtdInstitucionais = 5 + Math.floor(Math.random() * 11) // 5–15
    const templatesInst = templatesInstitucionais(tenant.nome)
    for (let i = 0; i < qtdInstitucionais; i++) {
      postsRows.push({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        autorId: tenant.ownerUserId,
        titulo: `[TESTE-CORINTHIANS] Comunicado ${i + 1}`,
        conteudo: pick(templatesInst),
        tipo: 'INSTITUCIONAL',
        visibilidade: 'PUBLICO',
      })
    }

    // Membro — ~40% dos aprovados, 1–2 posts cada
    const autores = userIds.filter(() => Math.random() < 0.4)
    const templatesMem = templatesMembro(tenant.nome)
    for (const autorId of autores) {
      const qtd = Math.random() < 0.5 ? 1 : 2
      for (let i = 0; i < qtd; i++) {
        const visibilidade = pickPonderado([['PUBLICO', 60], ['TENANT', 30], ['PRIVADO', 10]])
        const alcanceNacional = visibilidade === 'PUBLICO' && Math.random() < 0.05
        postsRows.push({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          autorId,
          conteudo: pick(templatesMem),
          tipo: 'MEMBRO',
          visibilidade,
          alcanceNacional,
        })
      }
    }

    await createManyBatched('post', postsRows, 'Post', 500)
    resumo.totais.posts += postsRows.length
    resumo.porTorcida[tenant.slug].posts += postsRows.length

    // Interações — reações e comentários, autores aleatórios do tenant
    const reacoesRows = []
    const comentariosRows = []
    const tiposReacao = ['CURTIR', 'FORCA', 'VAMOS', 'PRESENTE']
    for (const post of postsRows) {
      const qtdReacoes = 2 + Math.floor(Math.random() * 5) // 2–6
      const reagentes = new Set()
      for (let i = 0; i < qtdReacoes; i++) {
        const userId = pick(userIds)
        if (reagentes.has(userId)) continue
        reagentes.add(userId)
        reacoesRows.push({
          id: crypto.randomUUID(),
          postId: post.id,
          userId,
          tipo: pick(tiposReacao),
        })
      }

      const qtdComentarios = Math.floor(Math.random() * 4) // 0–3
      for (let i = 0; i < qtdComentarios; i++) {
        comentariosRows.push({
          id: crypto.randomUUID(),
          postId: post.id,
          autorId: pick(userIds),
          conteudo: pick(templatesMem),
        })
      }
    }

    await createManyBatched('reacao', reacoesRows, 'Reacao', 800)
    await createManyBatched('comentario', comentariosRows, 'Comentario', 800)
    resumo.totais.reacoes += reacoesRows.length
    resumo.totais.comentarios += comentariosRows.length
  }
}

// ── Fase 8: eventos (Agenda) ───────────────────────────────────────────
async function seedEventos(contexto, resumo) {
  const tiposEvento = ['GERAL', 'GERAL', 'GERAL', 'CARAVANA', 'ENSAIO']
  for (const tenant of contexto) {
    const membrosAprovados = await db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
      select: { userId: true },
    })
    const userIds = membrosAprovados.map((m) => m.userId)
    const unidadesFilhas = tenant.sedes.filter((s) => s.tipo !== 'SEDE')

    const qtd = 3 + Math.floor(Math.random() * 4) // 3–6
    const eventos = []
    for (let i = 0; i < qtd; i++) {
      const diasNoFuturo = 1 + Math.floor(Math.random() * 60)
      const restrito = unidadesFilhas.length > 0 && Math.random() < 0.4
      eventos.push({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        tipo: pick(tiposEvento),
        titulo: `[TESTE-CORINTHIANS] Evento ${i + 1} — ${tenant.nome}`,
        descricao: 'Evento de teste gerado pelo seed de volume.',
        data: new Date(Date.now() + diasNoFuturo * 24 * 60 * 60 * 1000),
        local: restrito ? undefined : 'A definir',
        sedeId: restrito ? pick(unidadesFilhas).id : null,
        criadoPorId: tenant.ownerUserId,
      })
    }
    await createManyBatched('evento', eventos, 'Evento')
    resumo.totais.eventos += eventos.length
    resumo.porTorcida[tenant.slug].eventos += eventos.length

    if (userIds.length > 0) {
      const rsvpRows = []
      for (const evento of eventos) {
        const inscritos = userIds.filter(() => Math.random() < 0.25)
        for (const userId of inscritos) {
          rsvpRows.push({
            id: crypto.randomUUID(),
            eventoId: evento.id,
            userId,
            status: 'CONFIRMADO',
          })
        }
      }
      await createManyBatched('eventoRsvp', rsvpRows, 'EventoRsvp', 800)
      resumo.totais.eventoRsvp += rsvpRows.length
    }
  }
}

// ── Fase 9: salas de vídeo ─────────────────────────────────────────────
async function seedSalas(contexto, resumo) {
  for (const tenant of contexto) {
    const membrosAprovados = await db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
      select: { userId: true },
    })
    const userIds = membrosAprovados.map((m) => m.userId)

    const qtd = 1 + Math.floor(Math.random() * 2) // 1–2
    for (let i = 0; i < qtd; i++) {
      const sala = await db.salaReuniao.create({
        data: {
          tenantId: tenant.id,
          hostId: tenant.ownerUserId,
          titulo: `[TESTE-CORINTHIANS] Sala aberta ${i + 1} — ${tenant.nome}`,
          tipo: 'ABERTA',
          livekitRoomName: `teste-${slugify(tenant.slug)}-${crypto.randomUUID()}`,
          linkConvite: crypto.randomUUID(),
        },
        select: { id: true },
      })

      const participantes = userIds.filter(() => Math.random() < 0.15).slice(0, 8)
      const participanteRows = participantes.map((userId) => ({
        id: crypto.randomUUID(),
        salaId: sala.id,
        userId,
        papel: 'PARTICIPANTE',
      }))
      await createManyBatched('participanteReuniao', participanteRows, 'ParticipanteReuniao', 200)
      resumo.totais.salas += 1
      resumo.porTorcida[tenant.slug].salas += 1
      resumo.totais.participantesReuniao += participanteRows.length
    }
  }
}

// ── Fase 10: pedidos de loja (só pde-gavioes-fiel) ────────────────────
async function seedPedidosLoja(contexto, resumo) {
  const tenant = contexto.find((t) => t.slug === 'pde-gavioes-fiel')
  if (!tenant) return

  const produtos = await db.saasProduto.findMany({
    where: { tenantId: tenant.id, ativo: true },
    select: { id: true, nome: true, preco: true, tamanhos: true },
  })
  if (produtos.length === 0) {
    console.log('  ↔  pde-gavioes-fiel: sem catálogo semeado — pulando pedidos de loja')
    return
  }

  const membrosAprovados = await db.saasMembro.findMany({
    where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: `@${DOMINIO_TESTE}` } } },
    select: { userId: true },
  })
  const compradores = membrosAprovados.filter(() => Math.random() < 0.08) // ~8% viram compradores

  let pedidosCriados = 0
  for (const { userId } of compradores) {
    const produto = pick(produtos)
    const quantidade = 1 + Math.floor(Math.random() * 3)
    const precoUnit = Number(produto.preco.toString())
    const total = Number((precoUnit * quantidade).toFixed(2))
    const tamanho = produto.tamanhos.length > 0 ? pick(produto.tamanhos) : 'UN'

    const pedido = await db.saasPedido.create({
      data: {
        tenantId: tenant.id,
        userId,
        subtotal: total,
        desconto: 0,
        total,
        status: pick(['CONFIRMADO', 'ENTREGUE']),
        modalidadeEntrega: 'RETIRADA',
        itens: {
          create: [
            {
              produtoId: produto.id,
              produtoNome: produto.nome,
              tamanho,
              quantidade,
              precoUnit,
              total,
            },
          ],
        },
      },
      select: { id: true },
    })
    pedidosCriados += 1
    void pedido
  }

  resumo.totais.pedidos += pedidosCriados
  resumo.porTorcida[tenant.slug].pedidos += pedidosCriados
  console.log(`  ✅ pde-gavioes-fiel: ${pedidosCriados} pedidos de loja de teste`)
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seed de dados de teste — Corinthians\n')

  const { afiliacao, contexto } = await carregarContexto()
  const totalUnidades = contexto.reduce((s, t) => s + t.sedes.length, 0)
  console.log(`Afiliação: ${afiliacao.nome} · ${contexto.length} torcidas · ${totalUnidades} unidades territoriais\n`)

  const resumo = {
    totais: {
      users: 0, saasMembro: 0, userRole: 0, auditLog: 0, perfilTorcedor: 0,
      conversas: 0, membroConversa: 0, posts: 0, reacoes: 0, comentarios: 0,
      eventos: 0, eventoRsvp: 0, salas: 0, participantesReuniao: 0, pedidos: 0,
    },
    porTorcida: {},
  }

  // `--so-historico`: completa laudo/histórico de quem já foi semeado sem
  // gerar volume novo. Útil depois de uma mudança de schema como a reprovação
  // com justificativa.
  if (process.argv.includes('--so-historico')) {
    console.log('── Fase 2b (isolada): laudo de reprovação + histórico ──')
    await backfillHistoricoMembrosTeste(contexto, resumo)
    console.log(`\n🎉 Backfill concluído. AuditLog inseridos: ${resumo.totais.auditLog}\n`)
    return
  }

  // `--so-canais`: só garante oficiais + vínculo APROVADO→canais (unidade+SEDE).
  if (process.argv.includes('--so-canais')) {
    console.log('── Fase 4 (isolada): canais oficiais das unidades ──')
    await garantirCanaisOficiais()
    console.log('\n── Fase 4b (isolada): APROVADO → canal unidade + SEDE ──')
    await vincularAprovadosCanaisOficiais(contexto)
    console.log('\n🎉 Backfill de canais concluído.\n')
    return
  }

  // `--so-cn`: só os posts de torcedor na Comunidade Nacional. O lote inteiro
  // é caro e as outras fases já são idempotentes — esta é a que faltava para
  // a cota de torcedor do feed nacional ter o que servir.
  if (process.argv.includes('--so-cn')) {
    console.log('── Fase 3b (isolada): posts de torcedor na CN ──')
    await seedPostsTorcedoresCn(afiliacao, contexto, resumo)
    console.log(`\n🎉 CN concluída. Posts: ${resumo.totais.posts}, reações: ${resumo.totais.reacoes}\n`)
    return
  }

  console.log('── Fase 1+2: pessoas por unidade + cargos ──')
  await seedPessoas(contexto, resumo)

  console.log('\n── Fase 2b: laudo de reprovação + histórico (lotes antigos) ──')
  await backfillHistoricoMembrosTeste(contexto, resumo)

  console.log('\n── Fase 3: torcedores globais (Comunidade Nacional) ──')
  await seedTorcedoresGlobais(afiliacao, resumo)

  console.log('\n── Fase 3b: posts de torcedor na CN (tenant sintético) ──')
  await seedPostsTorcedoresCn(afiliacao, contexto, resumo)

  console.log('\n── Fase 4: canais oficiais das unidades ──')
  await garantirCanaisOficiais()

  console.log('\n── Fase 4b: APROVADO → canal unidade + SEDE ──')
  await vincularAprovadosCanaisOficiais(contexto)

  console.log('\n── Fase 5: grupos públicos por torcida ──')
  await seedGruposPublicos(contexto, resumo)

  console.log('\n── Fase 6+7: posts + interações ──')
  await seedPostsEInteracoes(contexto, resumo)

  console.log('\n── Fase 8: eventos (Agenda) ──')
  await seedEventos(contexto, resumo)

  console.log('\n── Fase 9: salas de vídeo ──')
  await seedSalas(contexto, resumo)

  console.log('\n── Fase 10: pedidos de loja (pde-gavioes-fiel) ──')
  await seedPedidosLoja(contexto, resumo)

  console.log('\n🎉 Seed concluído!\n')
  console.log('📊 Resumo geral:')
  for (const [tabela, qtd] of Object.entries(resumo.totais)) {
    console.log(`   ${tabela.padEnd(22)}: ${qtd}`)
  }
  console.log('\n📊 Resumo por torcida:')
  for (const [slug, dados] of Object.entries(resumo.porTorcida)) {
    console.log(`   ${slug.padEnd(38)} users=${dados.users} posts=${dados.posts} eventos=${dados.eventos} salas=${dados.salas} pedidos=${dados.pedidos}`)
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro no seed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
