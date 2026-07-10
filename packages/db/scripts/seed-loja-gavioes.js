/**
 * Seed da loja Gaviões: categorias, cupom EUSOUGAVIAO e catálogo representativo.
 * Imagens são re-hospedadas no Cloudinary quando CLOUDINARY_* estiver configurado.
 *
 *   pnpm --filter @torcida/db seed:loja-gavioes
 *   pnpm --filter @torcida/db seed:loja-gavioes -- --force-images
 *   pnpm --filter @torcida/db seed:loja-gavioes -- --add-verso
 */
import crypto from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '../..')

/** Carrega .env do monorepo (db + web) para Cloudinary no seed. */
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

const db = new PrismaClient()

const TENANT_SLUG = 'pde-gavioes-fiel'

const CATEGORIAS = [
  { slug: 'masculino', nome: 'Masculino', ordem: 1 },
  { slug: 'feminino', nome: 'Feminino', ordem: 2 },
  { slug: 'infantil', nome: 'Infantil', ordem: 3 },
  { slug: 'acessorios', nome: 'Acessórios', ordem: 4 },
]

/** Catálogo curado a partir de lojagavioes.com.br (jul/2026). */
const PRODUTOS = [
  { slug: 'bone-tactel-lhp', nome: 'Boné tactel LHP', preco: 70, marca: 'FT7', categoria: 'acessorios', tamanhos: ['UN'], destaque: false, vtexPath: '/bone-tactel-lhp/p' },
  { slug: 'bone-boxe', nome: 'Boné Boxe', preco: 70, marca: 'LAMP', categoria: 'acessorios', tamanhos: ['UN'], destaque: false, vtexPath: '/bone-boxe/p' },
  { slug: 'bermuda-voador-bordada', nome: 'Bermuda Voador bordada', preco: 110, marca: 'TOCHINHA', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/bermuda-voador-bordada/p' },
  { slug: 'camiseta-dry-fit-tres-gavioes', nome: 'Camiseta dry fit três Gaviões', preco: 140, marca: 'ESCUDETTO', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/camiseta-dry-fit-tres-gavioes/p' },
  { slug: 'calca-letreiro-protetor', nome: 'Calça letreiro Protetor', preco: 160, marca: 'TONHÃO', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/calca-letreiro-protetor/p' },
  { slug: 'calca-letreiro-voador', nome: 'Calça letreiro Voador', preco: 160, marca: 'TONHÃO', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/calca-letreiro/p' },
  { slug: 'regata-proibicao-simbolo-retro', nome: 'Regata Proibição simbolo retrô', preco: 100, marca: 'TONHÃO', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/regata-proibicao-simbolo-retro/p' },
  { slug: 'proibicao-plus-size-simbolo-retro', nome: 'Proibição Plus Size simbolo retrô', preco: 110, marca: 'TONHÃO', categoria: 'masculino', tamanhos: ['G1', 'G2', 'G3'], destaque: false, vtexPath: '/proibicao-plus-size-simbolo-retro/p' },
  { slug: 'bermuda-basquete-lhp', nome: 'Bermuda basquete lhp', preco: 110, marca: 'TOCHINHA', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/bermuda-basquete-lhp/p' },
  { slug: 'bobojaco-redinha-lhp', nome: 'Bobojaco Redinha LHP', preco: 400, marca: 'TOCHINHA', categoria: 'masculino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/bobojaco-redinha-lhp/p' },
  { slug: 'bone-carnaval-aba-branca', nome: 'Boné Carnaval aba branca', preco: 80, marca: 'FT7', categoria: 'acessorios', tamanhos: ['UN'], destaque: true, descricao: 'Boné perfeito e confortável para o dia a dia', vtexPath: '/bone-carnaval-aba-branca/p' },
  { slug: 'bone-noite-gira-ogum', nome: 'Boné É noite de Gira na casa de Ogum', preco: 80, marca: 'FT7', categoria: 'acessorios', tamanhos: ['UN'], destaque: true, vtexPath: '/bone-e-noite-de-gira-na-casa-de-ogum/p' },
  { slug: 'bone-brilho-carnaval', nome: 'Boné de Brilho Carnaval', preco: 80, marca: 'FT7', categoria: 'acessorios', tamanhos: ['UN'], destaque: true, vtexPath: '/bone-de-brilho-carnaval/p' },
  { slug: 'bone-gavioes-carnaval', nome: 'Boné Gaviões Carnaval', preco: 80, marca: 'FT7', categoria: 'acessorios', tamanhos: ['UN'], destaque: true, vtexPath: '/bone-gavioes-carnaval/p' },
  { slug: 'alusiva-procedimento', nome: 'Alusiva Procedimento', preco: 45, precoOriginal: 60, marca: 'AMOR PRINT', categoria: 'feminino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/alusiva-procedimento/p' },
  { slug: 'alusiva-humildade', nome: 'Alusiva Humildade', preco: 45, precoOriginal: 60, marca: 'AMOR PRINT', categoria: 'feminino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/alusiva-humildade/p' },
  { slug: 'moletom-all-black', nome: 'Moletom os de preto all black', preco: 150, precoOriginal: 180, marca: 'AMOR PRINT', categoria: 'feminino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/moletom-os-de-preto-all-black/p' },
  { slug: 'corta-vento-voador', nome: 'Corta vento Voador Bordado', preco: 200, precoOriginal: 220, marca: 'AMOR PRINT', categoria: 'feminino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/corta-vento-voador-bordado/p' },
  { slug: 'legging-voador', nome: 'Calça Legging voador preta e branca', preco: 100, precoOriginal: 120, marca: 'AMOR PRINT', categoria: 'feminino', tamanhos: ['P', 'M', 'G', 'GG'], destaque: false, vtexPath: '/calca-legging-voador-preta-e-branca/p' },
  { slug: 'camiseta-infantil-gaviao', nome: 'Camiseta Infantil Gavião', preco: 55, marca: 'SAPEKA KIDS', categoria: 'infantil', tamanhos: ['2', '4', '6', '8', '10'], destaque: false, vtexPath: '/camiseta-infantil-gaviao/p', fallbackVtexPath: '/camiseta-dry-fit-tres-gavioes/p' },
]

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return null
  return { cloudName, apiKey, apiSecret }
}

function signCloudinary(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex')
}

async function uploadToCloudinary(imageUrl, publicId, config) {
  const timestamp = Math.round(Date.now() / 1000)
  const folder = 'torcida/loja-gavioes'
  const params = { folder, public_id: publicId, timestamp, overwrite: 'true' }
  const signature = signCloudinary(params, config.apiSecret)

  const body = new URLSearchParams()
  body.set('file', imageUrl)
  body.set('api_key', config.apiKey)
  body.set('timestamp', String(timestamp))
  body.set('signature', signature)
  body.set('folder', folder)
  body.set('public_id', publicId)
  body.set('overwrite', 'true')

  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: 'POST',
    body,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cloudinary upload failed: ${err}`)
  }
  const data = await res.json()
  return data.secure_url
}

function normalizeImageUrl(url) {
  if (!url) return url
  if (url.startsWith('//')) url = `https:${url}`
  const cdn = url.match(/cdn-cgi\/image\/[^/]+\/(https:\/\/gavioes\.jetassets\.com\.br\/[^\s"']+)/i)
  if (cdn?.[1]) url = cdn[1]
  const direct = url.match(/https:\/\/gavioes\.jetassets\.com\.br\/(?:produto(?:\/multifotos)?\/[^\s"']+)/i)
  if (direct?.[0]) return direct[0]
  return url
}

function imageSortScore(u) {
  if (/_H\.(jpg|jpeg|png|webp)$/i.test(u)) return 0
  if (/_D\.(jpg|jpeg|png|webp)$/i.test(u) && !/multifotos/i.test(u)) return 0
  if (/_A\.(jpg|jpeg|png|webp)$/i.test(u)) return 1
  if (/_DM\.(jpg|jpeg|png|webp)$/i.test(u) || /multifotos/i.test(u)) return 1
  if (/_E\.(jpg|jpeg|png|webp)$/i.test(u)) return 2
  return 3
}

function sortProductImages(urls) {
  return [...urls].sort((a, b) => imageSortScore(a) - imageSortScore(b))
}

const JET_API_DETAIL = '111d873e-0fb6-4e48-88af-082c64b65e66/a6a84796-6d14-40bc-91c4-2782b906b442'
const JET_API_MAIN_SECONDARY = '111d873e-0fb6-4e48-88af-082c64b65e66/123e4567-e89b-12d3-a456-426614174000'

function slugFromVtexPath(vtexPath) {
  return vtexPath.replace(/^\/+/, '').replace(/\/p\/?$/, '')
}

async function jetApiPost(request, params) {
  const res = await fetch('https://www.lojagavioes.com.br/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://www.lojagavioes.com.br',
      Referer: 'https://www.lojagavioes.com.br/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ request, params, json: null }),
  })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Frente/verso via API Jet (main-image + alternate-image dos cards). */
async function fetchJetMainSecondaryImages(vtexPath) {
  const slug = slugFromVtexPath(vtexPath)
  const detail = await jetApiPost(JET_API_DETAIL, `${slug}?`)
  if (!detail?.idProduct) return []

  const list = await jetApiPost(JET_API_MAIN_SECONDARY, `${detail.idProduct}/main-secondary`)
  const urls = []

  if (Array.isArray(list) && list.length > 0) {
    const first = list[0]
    if (first?.mainImage?.trim()) urls.push(normalizeImageUrl(first.mainImage))
    if (first?.secondaryImage?.trim()) urls.push(normalizeImageUrl(first.secondaryImage))
  }

  if (urls.length === 0) {
    if (detail.mainImage?.trim()) urls.push(normalizeImageUrl(detail.mainImage))
    if (detail.alternativeImage?.trim()) urls.push(normalizeImageUrl(detail.alternativeImage))
  }

  return sortProductImages([...new Set(urls.filter(Boolean))])
}

/** Frente/verso: cards VTEX (main-image + alternate-image) ou assets jet no HTML. */
function extractProductImagesFromHtml(html) {
  const urls = []

  const main = html.match(/class=["']main-image["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i)
  const alternate = html.match(/class=["']alternate-image["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i)
  if (main?.[1]) urls.push(normalizeImageUrl(main[1]))
  if (alternate?.[1]) urls.push(normalizeImageUrl(alternate[1]))
  if (urls.length > 0) return sortProductImages([...new Set(urls)])

  const found = [...html.matchAll(/(?:https?:)?\/\/gavioes\.jetassets\.com\.br\/[^\s"'<>]+/gi)].map((m) =>
    normalizeImageUrl(m[0].startsWith('//') ? `https:${m[0]}` : m[0]),
  )
  return sortProductImages([...new Set(found)])
}

function isVersoImageUrl(url) {
  return /_A\.|_DM\.|multifotos|_E\./i.test(normalizeImageUrl(url))
}

function pickVersoUrl(sources, frente) {
  const frenteNorm = normalizeImageUrl(frente)
  for (const src of sources) {
    const norm = normalizeImageUrl(src)
    if (!norm || norm === frenteNorm) continue
    if (isVersoImageUrl(norm)) return norm
  }
  return null
}

async function fetchProductImagesForProduct(produto) {
  let sources = await fetchProductImages(produto.vtexPath)
  if (sources.length === 0 && produto.fallbackVtexPath) {
    sources = await fetchProductImages(produto.fallbackVtexPath)
  }
  return sources
}

async function fetchProductImages(vtexPath) {
  const fromJetApi = await fetchJetMainSecondaryImages(vtexPath)
  if (fromJetApi.length > 0) return fromJetApi.slice(0, 4)

  const pageUrl = `https://www.lojagavioes.com.br${vtexPath}`
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!res.ok) {
      console.warn(`  ⚠️  HTTP ${res.status} ao buscar ${vtexPath}`)
      return []
    }
    const html = await res.text()
    const fromPage = extractProductImagesFromHtml(html)
    if (fromPage.length > 0) return fromPage.slice(0, 4)

    const ogPatterns = [
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
    ]
    for (const re of ogPatterns) {
      const m = html.match(re)
      if (m?.[1]) return [normalizeImageUrl(m[1].replace(/&amp;/g, '&'))]
    }

    const jet = html.match(/https:\/\/gavioes\.jetassets\.com\.br\/[^"'\s<>]+/i)
    if (jet?.[0]) return [normalizeImageUrl(jet[0])]

    const vtex = html.match(/https:\/\/[^"'\s<>]*vtexassets\.com\/[^"'\s<>]+/i)
    if (vtex?.[0]) return [normalizeImageUrl(vtex[0])]

    return []
  } catch (e) {
    console.warn(`  ⚠️  Falha ao buscar imagem (${vtexPath}):`, e instanceof Error ? e.message : e)
    return []
  }
}

function estoqueFake(tamanhos) {
  const keys = tamanhos.length === 0 || (tamanhos.length === 1 && tamanhos[0] === 'UN') ? ['UN'] : tamanhos
  return Object.fromEntries(keys.map((t, i) => [t, 8 + (i % 5)]))
}

async function addVersoToExistingProducts(tenant, cloudinary) {
  console.log('🔄 Adicionando verso (alternate-image) aos produtos existentes...')

  let atualizados = 0
  let jaComVerso = 0
  let semVerso = 0

  for (const p of PRODUTOS) {
    const existente = await db.saasProduto.findFirst({
      where: { tenantId: tenant.id, slug: p.slug },
      select: { imagensUrl: true },
    })

    if (!existente?.imagensUrl?.length) {
      console.warn(`  ⚠️  Sem imagem local: ${p.nome}`)
      continue
    }

    if (existente.imagensUrl.length >= 2) {
      const versoAtual = existente.imagensUrl[1]
      if (versoAtual && isVersoImageUrl(versoAtual)) {
        jaComVerso++
        continue
      }
      // Verso inválido (_H/_D) ou placeholder — tenta corrigir
      if (versoAtual && !isVersoImageUrl(versoAtual)) {
        console.log(`  🔁 Corrigindo verso inválido: ${p.nome}`)
      }
    }

    const sources = await fetchProductImagesForProduct(p)
    const frente = existente.imagensUrl[0]
    const verso = pickVersoUrl(sources, frente)

    if (!verso) {
      if (existente.imagensUrl.length >= 2 && !isVersoImageUrl(existente.imagensUrl[1])) {
        await db.saasProduto.update({
          where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } },
          data: { imagensUrl: [frente] },
        })
        console.log(`  ↩️  Verso inválido removido: ${p.nome}`)
      } else {
        semVerso++
        console.warn(`  ⚠️  Verso não encontrado: ${p.nome}`)
      }
      continue
    }

    let imagensUrl = [frente, verso]
    if (cloudinary) {
      try {
        imagensUrl = [frente, await uploadToCloudinary(verso, `${p.slug}-verso`, cloudinary)]
      } catch (e) {
        console.warn(`  ⚠️  Cloudinary verso falhou (${p.slug}):`, e.message)
      }
    }

    await db.saasProduto.update({
      where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } },
      data: { imagensUrl },
    })
    atualizados++
    console.log(`  ✅ Verso adicionado: ${p.nome}`)
  }

  console.log(
    `\n🎉 ${atualizados} produtos com verso novo · ${jaComVerso} já tinham · ${semVerso} sem verso no site`,
  )
}

async function main() {
  console.log('🛒 Seed loja Gaviões...')

  const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG } })
  if (!tenant) {
    throw new Error(`Tenant "${TENANT_SLUG}" não encontrado. Rode db:seed primeiro.`)
  }

  const cloudinary = getCloudinaryConfig()
  if (!cloudinary) {
    console.warn('⚠️  CLOUDINARY_* não configurado — imagens externas VTEX serão usadas.')
  }

  const addVerso = process.argv.includes('--add-verso')
  if (addVerso) {
    await addVersoToExistingProducts(tenant, cloudinary)
    return
  }

  const catMap = {}
  for (const c of CATEGORIAS) {
    const cat = await db.saasCategoria.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      update: { nome: c.nome, ordem: c.ordem },
      create: { tenantId: tenant.id, ...c },
    })
    catMap[c.slug] = cat.id
    console.log(`  ✅ Categoria: ${c.nome}`)
  }

  await db.saasCupom.upsert({
    where: { tenantId_codigo: { tenantId: tenant.id, codigo: 'EUSOUGAVIAO' } },
    update: { ativo: true, primeiraCompra: true, tipo: 'PERCENTUAL', valor: 10 },
    create: {
      tenantId: tenant.id,
      codigo: 'EUSOUGAVIAO',
      tipo: 'PERCENTUAL',
      valor: 10,
      primeiraCompra: true,
      ativo: true,
    },
  })
  console.log('  ✅ Cupom EUSOUGAVIAO (10% primeira compra)')

  const forceImages = process.argv.includes('--force-images')

  let ok = 0
  let comImagem = 0
  for (const p of PRODUTOS) {
    const existente = await db.saasProduto.findFirst({
      where: { tenantId: tenant.id, slug: p.slug },
      select: { imagensUrl: true },
    })

    const temCloudinary = existente?.imagensUrl?.some((u) => u.includes('res.cloudinary.com')) ?? false
    let imagensUrl = temCloudinary && !forceImages ? existente.imagensUrl : []

    const precisaBuscar = forceImages || imagensUrl.length === 0

    if (precisaBuscar) {
      let sources = await fetchProductImagesForProduct(p)
      sources = sources ?? []
      if (sources.length === 0) {
        console.warn(`  ⚠️  Sem imagem: ${p.nome}`)
      } else if (cloudinary) {
        try {
          imagensUrl = []
          for (let i = 0; i < sources.length; i++) {
            const id = sources.length > 1 ? `${p.slug}-${i}` : p.slug
            imagensUrl.push(await uploadToCloudinary(sources[i], id, cloudinary))
          }
          console.log(`  🖼️  Cloudinary (${imagensUrl.length}): ${p.slug}`)
        } catch (e) {
          console.warn(`  ⚠️  Upload Cloudinary falhou (${p.slug}):`, e.message)
          imagensUrl = sources.map(normalizeImageUrl)
        }
      } else {
        imagensUrl = sources.map(normalizeImageUrl)
      }
    }

    if (imagensUrl.length > 0) comImagem++

    const tamanhos = p.tamanhos.map((t) => (t === 'UN' ? 'UN' : t))
    const semTamanho = tamanhos.length === 1 && tamanhos[0] === 'UN'

    await db.saasProduto.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } },
      update: {
        nome: p.nome,
        descricao: p.descricao ?? null,
        preco: p.preco,
        precoOriginal: p.precoOriginal ?? null,
        marca: p.marca,
        categoriaId: catMap[p.categoria],
        destaque: p.destaque ?? false,
        tamanhos: semTamanho ? [] : tamanhos,
        estoque: estoqueFake(semTamanho ? ['UN'] : tamanhos),
        imagensUrl,
        ativo: true,
      },
      create: {
        tenantId: tenant.id,
        slug: p.slug,
        nome: p.nome,
        descricao: p.descricao ?? null,
        preco: p.preco,
        precoOriginal: p.precoOriginal ?? null,
        marca: p.marca,
        categoriaId: catMap[p.categoria],
        destaque: p.destaque ?? false,
        tamanhos: semTamanho ? [] : tamanhos,
        estoque: estoqueFake(semTamanho ? ['UN'] : tamanhos),
        imagensUrl,
        ativo: true,
      },
    })
    ok++
    console.log(`  ✅ Produto: ${p.nome}`)
  }

  console.log(`\n🎉 ${ok} produtos seedados para ${tenant.nome} (${comImagem} com imagem)`)
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
