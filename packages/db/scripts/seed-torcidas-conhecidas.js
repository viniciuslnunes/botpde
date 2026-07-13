/**
 * Seed do catálogo nacional de torcidas organizadas conhecidas
 * (`TorcidaConhecida`) + logos.
 *
 * Popula `TorcidaConhecida` a partir do dataset gerado por scraper
 * (`src/data/torcidas-conhecidas.js`, fonte: organizadasbrasil.com).
 * Resolve o clube de cada torcida contra `Afiliacao` (por nome+UF normalizados),
 * criando uma Afiliacao mínima quando o clube ainda não existe. Hospeda o logo
 * no Cloudinary (`torcida/catalogo/logos/<slug>`) e grava a URL no banco.
 *
 * NÃO confundir com `seed-torcidas-nacional.js`, que cria Tenants (torcidas
 * reais, associáveis) — este aqui só popula o catálogo de referência.
 * Depois rode `seed:torcidas-tenants` para criar os tenants vazios a partir
 * do catálogo já no banco.
 *
 * REQUER REDE — roda na máquina do usuário, não no sandbox de CI:
 *   pnpm --filter @torcida/db seed:torcidas-conhecidas
 *   pnpm --filter @torcida/db seed:torcidas-conhecidas -- --dry-run   (não grava/upload)
 *
 * Idempotente: upsert por slug; re-execução não duplica e preserva logos
 * Cloudinary já gravados. Sem CLOUDINARY_*: logos não são enviados (logoUrl null).
 */
import { PrismaClient } from '@prisma/client'
import { TORCIDAS_CONHECIDAS, TORCIDAS_CONHECIDAS_META } from '../src/data/torcidas-conhecidas.js'
import { normalizeNome, chaveMatch, gerarSlugUnico, saoMesmoClube } from '../src/data/afiliacoes-normalize.js'
import {
  loadEnvFiles,
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
  FOLDER_LOGOS,
} from './lib/cloudinary-admin.js'

loadEnvFiles()

const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Chave de dedup da TORCIDA: nome + UF + CLUBE. O clube é necessário porque
 * organizadas homônimas de clubes diferentes existem (ex.: "Galoucura" do Ituano
 * e do Atlético Sorocaba, ambas SP) — sem ele, uma sobrescreveria a outra.
 * @param {string | null | undefined} nome
 * @param {string | null | undefined} uf
 * @param {string | null | undefined} clube
 */
function chave(nome, uf, clube) {
  return `${normalizeNome(nome ?? '')}|${normalizeNome(uf ?? '')}|${normalizeNome(clube ?? '')}`
}

/**
 * Chave de casamento do CLUBE nome+UF. Usa `chaveMatch` (remove FC/EC/"futebol
 * clube"/"de"…) para casar "São Paulo Futebol Clube" ↔ "São Paulo" já existente
 * e evitar duplicar `Afiliacao` no seletor do onboarding. A UF separa homônimos.
 * @param {string | null | undefined} nome
 * @param {string | null | undefined} uf
 */
function chaveClube(nome, uf) {
  return `${chaveMatch(nome ?? '')}|${normalizeNome(uf ?? '')}`
}

// ── Derivação de nomes de exibição ──────────────────────────────────────────
// `nome` guarda o nome completo (fiel à fonte). `titulo` (torcida) / `apelido`
// (clube) guardam a versão curta/legível usada como destaque no onboarding.

const CONECTORES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'a', 'o', 'the'])

/**
 * Title Case, conectores minúsculos. Como a fonte vem toda em CAIXA ALTA não dá
 * para detectar siglas por caixa; só tratamos como sigla o nome de UMA palavra
 * curta (ex.: "TUP", "FJV", "CSA"), que fica em maiúsculas.
 */
function tituloCase(texto) {
  const palavras = texto.trim().split(/\s+/)
  if (palavras.length === 1 && palavras[0].length <= 4) {
    return palavras[0].toLocaleUpperCase('pt-BR')
  }
  return palavras
    .map((p, i) => {
      const lower = p.toLocaleLowerCase('pt-BR')
      if (i > 0 && CONECTORES.has(lower)) return lower
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
    })
    .join(' ')
}

// Prefixos administrativos genéricos das torcidas (mais longo primeiro).
const PREFIXOS_TORCIDA = [
  'torcida organizada uniformizada',
  'torcida uniformizada organizada',
  'torcida uniformizada',
  'torcida organizada',
  'movimento organizado',
  'torcida',
  'movimento',
]

/** Nome curto/legível da torcida: remove prefixo genérico + Title Case. */
function tituloTorcida(nome) {
  const base = nome.trim().replace(/\s+/g, ' ')
  const lower = base.toLocaleLowerCase('pt-BR')
  for (const pref of PREFIXOS_TORCIDA) {
    if (lower.startsWith(pref + ' ')) {
      const resto = base.slice(pref.length).trim()
      if (resto) return tituloCase(resto)
    }
  }
  return tituloCase(base)
}

// Sufixos/frases genéricas de tipo de clube (para derivar o apelido curto).
const TIPOS_CLUBE = [
  'futebol clube', 'esporte clube', 'esportivo clube', 'sport club', 'sport clube',
  'atletico clube', 'clube atletico', 'clube de futebol', 'clube de regatas',
  'associacao atletica', 'associacao desportiva', 'sociedade esportiva',
  'football club', 'futebol e regatas', 'social futebol clube', 'clube', 'fc', 'ec',
]

/** Apelido curto do clube: remove o tipo genérico (um sufixo e um prefixo). Null se nada sobra. */
function apelidoClube(nome) {
  let base = nome.trim().replace(/\s+/g, ' ')
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')
  // Um sufixo genérico (ex.: "… Futebol Clube", "… FC").
  for (const tipo of TIPOS_CLUBE) {
    if (semAcento(base).endsWith(' ' + tipo)) { base = base.slice(0, base.length - tipo.length).trim(); break }
  }
  // Um prefixo genérico (ex.: "Sociedade Esportiva …", "Clube de Regatas …").
  for (const tipo of TIPOS_CLUBE) {
    if (semAcento(base).startsWith(tipo + ' ')) { base = base.slice(tipo.length).trim(); break }
  }
  const curto = base.replace(/[-,]$/, '').trim()
  if (!curto || semAcento(curto) === semAcento(nome)) return null
  return tituloCase(curto)
}

/**
 * Envia logo remoto ao Cloudinary. Retorna secure_url ou null.
 * @param {string} logoUrl
 * @param {string} slug
 * @returns {Promise<string|null>}
 */
async function hospedarLogo(logoUrl, slug) {
  if (!getCloudinaryConfig()) return null
  if (DRY_RUN) return `https://res.cloudinary.com/dry-run/${FOLDER_LOGOS}/${slug}.png`
  try {
    return await uploadImageUrl(logoUrl, { folder: FOLDER_LOGOS, publicId: slug })
  } catch (err) {
    console.warn(`  ! falha Cloudinary (${slug}): ${err.message}`)
    return null
  }
}

async function main() {
  console.log(
    `Seed de torcidas conhecidas — ${TORCIDAS_CONHECIDAS.length} registros no dataset` +
      ` (gerado em ${TORCIDAS_CONHECIDAS_META.geradoEm}).`,
  )
  if (DRY_RUN) console.log('(dry-run: sem gravação no banco nem upload real)')
  if (!getCloudinaryConfig()) {
    console.warn('⚠ CLOUDINARY_* não configurado — logos não serão enviados (logoUrl null).')
  }

  // ── 1. Afiliações existentes, indexadas por nome|UF ─────────────────────────
  /** @type {Map<string, string>} chave nome|uf → afiliacao.id */
  const afiliacaoPorChave = new Map()
  /** @type {Set<string>} slugs de Afiliacao já usados */
  const slugsClube = new Set()
  /** @type {{id: string, nome: string, estado: string|null, slug: string|null}[]} */
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, slug: true },
    orderBy: { criadoEm: 'asc' },
  })
  for (const a of afiliacoes) {
    if (a.slug) slugsClube.add(a.slug)
    const k = chaveClube(a.nome, a.estado)
    if (!afiliacaoPorChave.has(k)) afiliacaoPorChave.set(k, a.id)
  }
  console.log(`  ${afiliacoes.length} afiliações já no banco.`)

  // ── 2. Torcidas conhecidas existentes (preserva slug + logo Cloudinary) ─────
  /** @type {Set<string>} slugs de TorcidaConhecida já usados */
  const slugsTorcida = new Set()
  /** @type {Map<string, string>} chave nome|uf → slug existente */
  const slugTorcidaPorChave = new Map()
  /** @type {Map<string, string|null>} slug → logoUrl existente */
  const logoPorSlug = new Map()
  /** @type {{slug: string, nome: string, uf: string|null, clubeNomeOriginal: string|null, logoUrl: string|null}[]} */
  const existentes = await db.torcidaConhecida.findMany({
    select: { slug: true, nome: true, uf: true, clubeNomeOriginal: true, logoUrl: true },
  })
  for (const t of existentes) {
    slugsTorcida.add(t.slug)
    logoPorSlug.set(t.slug, t.logoUrl)
    const k = chave(t.nome, t.uf, t.clubeNomeOriginal)
    if (!slugTorcidaPorChave.has(k)) slugTorcidaPorChave.set(k, t.slug)
  }
  console.log(`  ${existentes.length} torcidas conhecidas já no banco.`)

  let comLogo = 0
  let clubesCriados = 0
  for (const torcida of TORCIDAS_CONHECIDAS) {
    // ── Resolve a Afiliacao do clube ──────────────────────────────────────────
    /** @type {string | null} */
    let afiliacaoId = null
    if (torcida.clubeNomeOriginal) {
      const kClube = chaveClube(torcida.clubeNomeOriginal, torcida.uf)
      afiliacaoId = afiliacaoPorChave.get(kClube) ?? null
      if (!afiliacaoId) {
        const clubeRef = { nome: torcida.clubeNomeOriginal, estado: torcida.uf }
        const existente = afiliacoes.find((a) => saoMesmoClube(clubeRef, a))
        if (existente) {
          afiliacaoId = existente.id
          afiliacaoPorChave.set(kClube, afiliacaoId)
        }
      }
      if (!afiliacaoId) {
        clubesCriados += 1
        const slugClube = gerarSlugUnico(torcida.clubeNomeOriginal, torcida.uf, slugsClube)
        if (DRY_RUN) {
          afiliacaoId = `dry-run-${slugClube}`
        } else {
          const nova = await db.afiliacao.create({
            data: {
              nome: torcida.clubeNomeOriginal, // nome completo
              apelido: apelidoClube(torcida.clubeNomeOriginal), // curto p/ título
              cidade: torcida.cidade ?? null,
              estado: torcida.uf,
              slug: slugClube,
            },
            select: { id: true },
          })
          afiliacaoId = nova.id
        }
        afiliacaoPorChave.set(kClube, afiliacaoId)
      }
    }
    const chaveTorcida = chave(torcida.nome, torcida.uf, torcida.clubeNomeOriginal)
    const slug = slugTorcidaPorChave.get(chaveTorcida)
      ?? gerarSlugUnico(torcida.nome, torcida.uf, slugsTorcida)
    slugTorcidaPorChave.set(chaveTorcida, slug)

    // ── Logo (preserva Cloudinary já gravado; senão sobe o do dataset) ────────
    const logoExistente = logoPorSlug.get(slug)
    /** @type {string | null} */
    let logoUrl = logoExistente && isCloudinaryUrl(logoExistente) ? logoExistente : null
    if (!logoUrl && torcida.logoUrl) {
      logoUrl = await hospedarLogo(torcida.logoUrl, slug)
    }
    if (logoUrl) comLogo += 1

    if (DRY_RUN) {
      console.log(
        `  · ${torcida.nome} (${torcida.uf}) → slug=${slug}` +
          ` clube=${afiliacaoId ? 'sim' : '—'} logo=${logoUrl ? 'sim' : 'não'}`,
      )
      continue
    }

    const dados = {
      nome: torcida.nome, // nome completo (fiel à fonte)
      titulo: tituloTorcida(torcida.nome), // versão curta/legível
      afiliacaoId,
      clubeNomeOriginal: torcida.clubeNomeOriginal ?? null,
      fundacao: torcida.fundacao ?? null,
      sede: torcida.sede ?? null,
      subsedes: torcida.subsedes ?? null,
      lema: torcida.lema ?? null,
      siteOficial: torcida.siteOficial ?? null,
      cidade: torcida.cidade ?? null,
      uf: torcida.uf ?? null,
      logoUrl,
      fonteUrl: torcida.fonteUrl ?? null,
    }
    await db.torcidaConhecida.upsert({
      where: { slug },
      create: { slug, ...dados },
      update: dados,
    })
    logoPorSlug.set(slug, logoUrl)
  }

  console.log('\nResumo:')
  console.log(`  torcidas no dataset : ${TORCIDAS_CONHECIDAS.length}`)
  console.log(`  torcidas com logo   : ${comLogo}/${TORCIDAS_CONHECIDAS.length}`)
  console.log(`  clubes criados      : ${clubesCriados}`)
}

const db = new PrismaClient()

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
