/**
 * Seed do brechó Gaviões: lojas P2P + anúncios de sócios de teste.
 * Não mistura com o catálogo oficial (`SaasProduto` / seed:loja-gavioes).
 *
 * Prefixo `[TESTE-BRECHO]` no título = idempotente e fácil de achar.
 * Precisa de sócios APROVADOS (rode `seed:gavioes-logins` antes).
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:brecho-gavioes
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:brecho-gavioes -- --reset
 */
import { PrismaClient } from '@prisma/client'
import { calcularScoreConfianca } from '../../types/src/brecho.js'
import { assertNotProductionSeed, prepareSeedEnv } from './lib/seed-env.js'

if (!process.env.TORCIDA_ENV) process.env.TORCIDA_ENV = 'local'
assertNotProductionSeed('seed:brecho-gavioes')
prepareSeedEnv({ scriptLabel: 'seed:brecho-gavioes' })

const db = new PrismaClient()

const TENANT_SLUG = process.env.TENANT_SLUG || 'pde-gavioes-fiel'
const MARCA = '[TESTE-BRECHO]'
const DOMINIO = 'teste.corinthians.torcida.app'

const FALLBACK_IMG = {
  CAMISA:
    'https://images.unsplash.com/photo-1522778119026-d647f0596c23?w=800&h=800&fit=crop&q=80',
  BERMUDA:
    'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&h=800&fit=crop&q=80',
  PATCH:
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=800&fit=crop&q=80',
  BANDEIRA_PESSOAL:
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&h=800&fit=crop&q=80',
  OUTRO:
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=800&fit=crop&q=80',
}

/**
 * @typedef {{
 *   email: string
 *   lojaNome: string
 *   lojaBio: string
 *   score?: { trocasConcluidas: number, contrapartesUnicas: number }
 *   anuncios: Array<{
 *     chave: string
 *     titulo: string
 *     descricao: string
 *     modalidade: 'TROCA' | 'DOACAO' | 'VENDA'
 *     categoria: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
 *     tamanho?: string
 *     preco?: number
 *     aceitoTroca?: string
 *     produtoSlug?: string
 *     status?: 'ATIVO' | 'OCULTO'
 *   }>
 * }} SpecVendedor
 */

/** @type {SpecVendedor[]} */
const VENDEDORES = [
  {
    email: `socio.gavioes@${DOMINIO}`,
    lojaNome: 'Brechó do Sócio',
    lojaBio: 'Camisa e patch que já foram pra muitos jogos. Encontro na sede.',
    anuncios: [
      {
        chave: 'camisa-lhp-usada',
        titulo: `${MARCA} Camisa LHP usada (G)`,
        descricao:
          'Camisa dry fit dos três Gaviões, usada em 4 jogos. Sem rasgo; estampa ainda boa. Retirada na sede.',
        modalidade: 'VENDA',
        categoria: 'CAMISA',
        tamanho: 'G',
        preco: 80,
        produtoSlug: 'camiseta-dry-fit-tres-gavioes',
      },
      {
        chave: 'patch-carnaval',
        titulo: `${MARCA} Patch Carnaval (troca)`,
        descricao:
          'Patch de carnaval, ainda com o plástico. Troco por patch de ensaio ou bandeirinha de mão.',
        modalidade: 'TROCA',
        categoria: 'PATCH',
        aceitoTroca: 'Patch de ensaio ou bandeirinha de mão',
      },
      {
        chave: 'bone-aba-branca',
        titulo: `${MARCA} Boné aba branca (oculto)`,
        descricao:
          'Anúncio oculto de propósito — aparece só em Minha loja, não no feed. Para testar status.',
        modalidade: 'VENDA',
        categoria: 'OUTRO',
        preco: 40,
        produtoSlug: 'bone-carnaval-aba-branca',
        status: 'OCULTO',
      },
    ],
  },
  {
    email: `membro.materiais-loja@${DOMINIO}`,
    lojaNome: 'Armário do Material',
    lojaBio: 'Peças pessoais — não é o estoque da loja oficial.',
    anuncios: [
      {
        chave: 'bermuda-voador',
        titulo: `${MARCA} Bermuda Voador (M)`,
        descricao:
          'Bermuda bordada, usei duas vezes no ensaio. Tamanho M. Troco por bermuda G ou vendo.',
        modalidade: 'VENDA',
        categoria: 'BERMUDA',
        tamanho: 'M',
        preco: 70,
        produtoSlug: 'bermuda-voador-bordada',
      },
      {
        chave: 'bandeirinha-mao',
        titulo: `${MARCA} Bandeirinha de mão`,
        descricao:
          'Bandeirinha pessoal de mão, não é bandeirão do patrimônio. Doação: pega quem quiser, combinamos na sede.',
        modalidade: 'DOACAO',
        categoria: 'BANDEIRA_PESSOAL',
      },
    ],
  },
  {
    email: `gestor.materiais-loja@${DOMINIO}`,
    lojaNome: 'Cantinho da Loja',
    lojaBio: 'Já fechei umas trocas na sede. Score de demo para a aba Confiáveis.',
    score: { trocasConcluidas: 6, contrapartesUnicas: 5 },
    anuncios: [
      {
        chave: 'moletom-all-black',
        titulo: `${MARCA} Moletom all black (M)`,
        descricao:
          'Moletom os de preto, pouco uso. Preço pedido é informativo — acerto no chat, sem PIX pela plataforma.',
        modalidade: 'VENDA',
        categoria: 'CAMISA',
        tamanho: 'M',
        preco: 90,
        produtoSlug: 'moletom-all-black',
      },
    ],
  },
  {
    email: `membro.bateria@${DOMINIO}`,
    lojaNome: 'Brechó da Bateria',
    lojaBio: 'Sobra de ensaio. Só peça pessoal.',
    anuncios: [
      {
        chave: 'regata-proibicao',
        titulo: `${MARCA} Regata Proibição (P)`,
        descricao: 'Regata retrô, tamanho P ficou pequeno. Troco por P/M de outra alusiva.',
        modalidade: 'TROCA',
        categoria: 'CAMISA',
        tamanho: 'P',
        aceitoTroca: 'Regata ou camisa P/M de alusiva',
        produtoSlug: 'regata-proibicao-simbolo-retro',
      },
    ],
  },
]

/** @param {string} tenantId */
async function resolverTenantRaizId(tenantId) {
  let atual =
    (await db.sede.findFirst({
      where: { tenantId, tipo: 'SEDE' },
      select: { id: true, tenantId: true, sedeId: true },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    })) ??
    (await db.sede.findFirst({
      where: { tenantId },
      select: { id: true, tenantId: true, sedeId: true },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    }))
  if (!atual) return tenantId

  let raiz = tenantId
  for (let i = 0; i < 10 && atual?.sedeId; i++) {
    const pai = await db.sede.findUnique({
      where: { id: atual.sedeId },
      select: { id: true, tenantId: true, sedeId: true },
    })
    if (!pai) break
    raiz = pai.tenantId
    atual = pai
  }
  return raiz
}

/**
 * @param {string} tenantId
 * @param {string | undefined} slug
 * @param {string} categoria
 */
async function imagensDoAnuncio(tenantId, slug, categoria) {
  if (slug) {
    const produto = await db.saasProduto.findFirst({
      where: { tenantId, slug },
      select: { imagensUrl: true },
    })
    const urls = (produto?.imagensUrl ?? []).filter((u) => typeof u === 'string' && u.startsWith('http'))
    if (urls.length > 0) return urls.slice(0, 4)
  }
  return [FALLBACK_IMG[categoria] ?? FALLBACK_IMG.OUTRO]
}

async function main() {
  const reset = process.argv.includes('--reset')
  const tenant = await db.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, slug: true, nome: true },
  })
  if (!tenant) {
    throw new Error(`Tenant "${TENANT_SLUG}" não encontrado. Rode db:seed primeiro.`)
  }

  const raizId = await resolverTenantRaizId(tenant.id)
  console.log(`🧺 Seed brechó → ${tenant.nome} (${tenant.slug}) · raiz=${raizId === tenant.id ? 'este' : raizId}`)

  if (reset) {
    const apagados = await db.brechoAnuncio.deleteMany({
      where: { tenantId: raizId, titulo: { startsWith: MARCA } },
    })
    console.log(`  --reset: ${apagados.count} anúncio(s) de teste apagados`)
  }

  let lojas = 0
  let anuncios = 0
  let pulados = 0

  for (const spec of VENDEDORES) {
    const user = await db.user.findUnique({
      where: { email: spec.email },
      select: { id: true, nome: true, email: true },
    })
    if (!user) {
      console.warn(`  ⚠ sem login ${spec.email} — rode seed:gavioes-logins`)
      pulados += 1
      continue
    }

    const socio = await db.saasMembro.findFirst({
      where: {
        userId: user.id,
        tenantId: { in: [tenant.id, raizId] },
        tipo: 'SOCIO',
        status: 'APROVADO',
        desligadoEm: null,
      },
      select: { tenantId: true },
    })
    if (!socio) {
      console.warn(`  ⚠ ${spec.email} não é sócio APROVADO neste tenant`)
      pulados += 1
      continue
    }

    const scoreInput = spec.score ?? { trocasConcluidas: 0, contrapartesUnicas: 0 }
    const score = calcularScoreConfianca({
      trocasConcluidas: scoreInput.trocasConcluidas,
      contrapartesUnicas: scoreInput.contrapartesUnicas,
    })

    await db.brechoLoja.upsert({
      where: { tenantId_userId: { tenantId: raizId, userId: user.id } },
      create: {
        tenantId: raizId,
        userId: user.id,
        nome: spec.lojaNome,
        bio: spec.lojaBio,
        trocasConcluidas: scoreInput.trocasConcluidas,
        contrapartesUnicas: scoreInput.contrapartesUnicas,
        scoreConfianca: score,
      },
      update: {
        nome: spec.lojaNome,
        bio: spec.lojaBio,
        trocasConcluidas: scoreInput.trocasConcluidas,
        contrapartesUnicas: scoreInput.contrapartesUnicas,
        scoreConfianca: score,
        ativa: true,
        congeladaEm: null,
        congeladaPorId: null,
      },
    })
    lojas += 1

    const loja = await db.brechoLoja.findUnique({
      where: { tenantId_userId: { tenantId: raizId, userId: user.id } },
      select: { id: true },
    })
    if (!loja) continue

    for (const item of spec.anuncios) {
      const imagensUrl = await imagensDoAnuncio(tenant.id, item.produtoSlug, item.categoria)
      const data = {
        titulo: item.titulo,
        descricao: item.descricao,
        modalidade: item.modalidade,
        categoria: item.categoria,
        tamanho: item.tamanho ?? null,
        preco: item.preco ?? null,
        aceitoTroca: item.aceitoTroca ?? null,
        imagensUrl,
        status: item.status ?? 'ATIVO',
      }

      const existente = await db.brechoAnuncio.findFirst({
        where: { tenantId: raizId, vendedorId: user.id, titulo: item.titulo },
        select: { id: true },
      })
      if (existente) {
        await db.brechoAnuncio.update({ where: { id: existente.id }, data })
      } else {
        await db.brechoAnuncio.create({
          data: {
            tenantId: raizId,
            lojaId: loja.id,
            vendedorId: user.id,
            origemTenantId: socio.tenantId,
            ...data,
          },
        })
      }
      anuncios += 1
    }

    console.log(`  ✅ ${spec.lojaNome} · ${spec.email} · ${spec.anuncios.length} anúncio(s)`)
  }

  if (lojas === 0) {
    throw new Error(
      'Nenhum sócio de teste encontrado. Rode:\n' +
        '  TORCIDA_ENV=local pnpm --filter @torcida/db seed:gavioes-logins',
    )
  }

  console.log(`\nPronto: ${lojas} loja(s), ${anuncios} anúncio(s), ${pulados} vendedor(es) pulado(s).`)
  console.log('Portal: /portal/loja/brecho  (entre como socio.gavioes@teste.corinthians.torcida.app · senha m1k43l3n)')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
