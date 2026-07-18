/**
 * Seed do Bar Gaviões: categorias + produtos com imagem na SEDE principal
 * e amostra isolada na Subsede ABC (para provar isolamento por unidade).
 *
 *   pnpm --filter @torcida/db seed:bar-gavioes
 *   node packages/db/scripts/seed-bar-gavioes.js [slug]
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '../../..')

function loadEnvFiles() {
  for (const rel of ['packages/db/.env', 'apps/web/.env.local', 'apps/web/.env', '.env']) {
    const path = resolve(root, rel)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  }
}

loadEnvFiles()

const require = createRequire(join(__dir, '../package.json'))
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const SLUG = process.argv[2] ?? 'pde-gavioes-fiel'

/** Imagens Unsplash (livre uso) — bebidas / snacks de balcão. */
const CATALOGO_SEDE = [
  {
    categoria: 'bebidas',
    slug: 'cerveja-lata',
    nome: 'Cerveja lata 350ml',
    descricao: 'Lata gelada — marca do dia',
    preco: 8,
    custoMedio: 3.2,
    estoque: 120,
    estoqueMinimo: 24,
    destaque: true,
    ordem: 1,
    imagemUrl:
      'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'bebidas',
    slug: 'refrigerante-lata',
    nome: 'Refrigerante lata',
    descricao: 'Cola, guaraná ou limão',
    preco: 6,
    custoMedio: 2.5,
    estoque: 80,
    estoqueMinimo: 20,
    destaque: false,
    ordem: 2,
    imagemUrl:
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'bebidas',
    slug: 'agua-mineral',
    nome: 'Água mineral 500ml',
    preco: 4,
    custoMedio: 1.2,
    estoque: 100,
    estoqueMinimo: 30,
    destaque: false,
    ordem: 3,
    imagemUrl:
      'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'bebidas',
    slug: 'energetico',
    nome: 'Energético 250ml',
    preco: 12,
    custoMedio: 5,
    estoque: 40,
    estoqueMinimo: 10,
    destaque: true,
    ordem: 4,
    imagemUrl:
      'https://images.unsplash.com/photo-1622543925917-763c34f1f5f5?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'comidas',
    slug: 'pastel',
    nome: 'Pastel',
    descricao: 'Carne, queijo ou misto',
    preco: 10,
    custoMedio: 4,
    estoque: 50,
    estoqueMinimo: 15,
    destaque: true,
    ordem: 1,
    imagemUrl:
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'comidas',
    slug: 'hot-dog',
    nome: 'Hot dog',
    preco: 12,
    custoMedio: 5,
    estoque: 35,
    estoqueMinimo: 10,
    destaque: false,
    ordem: 2,
    imagemUrl:
      'https://images.unsplash.com/photo-1612392062798-2327366556d0?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'comidas',
    slug: 'batata-frita',
    nome: 'Porção de batata frita',
    preco: 18,
    custoMedio: 6,
    estoque: 25,
    estoqueMinimo: 8,
    destaque: false,
    ordem: 3,
    imagemUrl:
      'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'outros',
    slug: 'cigarro',
    nome: 'Cigarro (maço)',
    preco: 15,
    custoMedio: 11,
    estoque: 20,
    estoqueMinimo: 5,
    destaque: false,
    ordem: 1,
    imagemUrl:
      'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'outros',
    slug: 'gelo-saco',
    nome: 'Saco de gelo',
    preco: 10,
    custoMedio: 3,
    estoque: 15,
    estoqueMinimo: 4,
    destaque: false,
    ordem: 2,
    imagemUrl:
      'https://images.unsplash.com/photo-1560008581-09826d1de69e?w=600&h=600&fit=crop&q=80',
  },
]

const CATALOGO_SUBSEDE = [
  {
    categoria: 'bebidas',
    slug: 'cerveja-lata-abc',
    nome: 'Cerveja lata (ABC)',
    descricao: 'Estoque só da Subsede ABC — isolado da sede',
    preco: 7,
    custoMedio: 3,
    estoque: 48,
    estoqueMinimo: 12,
    destaque: true,
    ordem: 1,
    imagemUrl:
      'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop&q=80',
  },
  {
    categoria: 'bebidas',
    slug: 'agua-abc',
    nome: 'Água 500ml (ABC)',
    preco: 3.5,
    custoMedio: 1,
    estoque: 60,
    estoqueMinimo: 20,
    destaque: false,
    ordem: 2,
    imagemUrl:
      'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&h=600&fit=crop&q=80',
  },
]

const CATEGORIAS = [
  { slug: 'bebidas', nome: 'Bebidas', ordem: 1 },
  { slug: 'comidas', nome: 'Comidas', ordem: 2 },
  { slug: 'outros', nome: 'Outros', ordem: 3 },
]

async function upsertCatalogo({ tenantId, sedeId, sedeNome, catalogo }) {
  const catIds = {}
  for (const c of CATEGORIAS) {
    const row = await db.barCategoria.upsert({
      where: {
        tenantId_sedeId_slug: { tenantId, sedeId, slug: c.slug },
      },
      create: {
        tenantId,
        sedeId,
        slug: c.slug,
        nome: c.nome,
        ordem: c.ordem,
        ativo: true,
      },
      update: { nome: c.nome, ordem: c.ordem, ativo: true },
      select: { id: true, slug: true },
    })
    catIds[row.slug] = row.id
  }

  let n = 0
  for (const p of catalogo) {
    const existente = await db.barProduto.findFirst({
      where: { tenantId, sedeId, nome: p.nome },
      select: { id: true },
    })
    const data = {
      tenantId,
      sedeId,
      categoriaId: catIds[p.categoria] ?? null,
      nome: p.nome,
      descricao: p.descricao ?? null,
      preco: p.preco,
      custoMedio: p.custoMedio,
      estoque: p.estoque,
      estoqueMinimo: p.estoqueMinimo,
      imagemUrl: p.imagemUrl,
      ativo: true,
      destaque: p.destaque,
      ordem: p.ordem,
    }
    if (existente) {
      await db.barProduto.update({ where: { id: existente.id }, data })
    } else {
      await db.barProduto.create({ data })
    }
    n += 1
  }
  console.log(`  ${sedeNome}: ${n} produtos, ${CATEGORIAS.length} categorias`)
}

async function main() {
  const tenant = await db.tenant.findFirst({
    where: { slug: SLUG },
    select: { id: true, slug: true, nome: true },
  })
  if (!tenant) throw new Error(`Tenant ${SLUG} não encontrado`)

  const sede = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE', ativa: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true },
  })
  if (!sede) throw new Error('Nenhuma SEDE ativa no tenant')

  const subsede = await db.sede.findFirst({
    where: { id: 'subsede-gavioes-abc', tenantId: tenant.id, ativa: true },
    select: { id: true, nome: true },
  })

  console.log(`Seed Bar → ${tenant.nome} (${tenant.slug})`)
  await upsertCatalogo({
    tenantId: tenant.id,
    sedeId: sede.id,
    sedeNome: sede.nome,
    catalogo: CATALOGO_SEDE,
  })

  if (subsede) {
    await upsertCatalogo({
      tenantId: tenant.id,
      sedeId: subsede.id,
      sedeNome: subsede.nome,
      catalogo: CATALOGO_SUBSEDE,
    })
  } else {
    console.log('  (Subsede ABC não encontrada — só sede seedada)')
  }

  console.log('OK')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
