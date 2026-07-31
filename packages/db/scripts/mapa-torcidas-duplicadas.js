/**
 * Mapeia tenants/catálogo duplicados **dentro do mesmo clube**.
 *
 * Homônimo entre clubes ≠ duplicata.
 * Variantes de prefixo no MESMO clube SÃO duplicata:
 *   "Torcida Tricolor Independente" ≈ "Tricolor Independente"
 *   "Torcida Jovem do Flamengo" ≈ "Jovem do Flamengo"
 * (mesma lógica de `tituloTorcida` do seed de TorcidaConhecida)
 *
 *   pnpm --filter @torcida/db exec node scripts/mapa-torcidas-duplicadas.js
 *
 * Somente leitura. Nenhuma deleção.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import {
  normalizeNome,
  saoMesmoClube,
  indiceAfiliacaoCanonica,
} from '../src/data/afiliacoes-normalize.js'

const db = new PrismaClient()
const __dir = dirname(fileURLToPath(import.meta.url))

/** Espelha PREFIXOS_TORCIDA de seed-torcidas-conhecidas.js (mais longo primeiro). */
const PREFIXOS_TORCIDA = [
  'torcida organizada uniformizada',
  'torcida uniformizada organizada',
  'torcida uniformizada',
  'torcida organizada',
  'movimento organizado',
  'torcida',
  'movimento',
]

/**
 * Chave de identidade da torcida dentro do clube:
 * normaliza, remove prefixo administrativo genérico, remove artigos.
 */
function chaveTorcida(nome) {
  let n = normalizeNome(nome)
  for (const pref of PREFIXOS_TORCIDA) {
    const p = normalizeNome(pref)
    if (n.startsWith(`${p} `)) {
      n = n.slice(p.length + 1)
      break
    }
  }
  n = n.replace(/^(os|as)\s+/, '')
  n = n
    .replace(/\b(da|de|do|das|dos|e|a|o|as|os)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // alvi-verde ≈ alviverde (hífen/espaço interno não distingue org)
  return n.replace(/[\s-]+/g, '')
}

function scoreUso(u) {
  return (
    u.aliancas * 100 +
    u.rivalidades * 100 +
    u.sedes * 50 +
    (u.sedesFilhas > 0 ? 30 : 0) +
    u.membros * 5 +
    u.socios * 3 +
    u.posts +
    u.recomendacoes * 10 +
    (u.temLogo ? 40 : 0) +
    (u.temCatalogo ? 10 : 0) +
    (u.ativo ? 1 : 0)
  )
}

function rotuloClube(af, fallback) {
  if (!af) return fallback || '(sem clube)'
  const nome = af.apelido || af.nome
  return af.estado ? `${nome} (${af.estado})` : nome
}

/**
 * @param {Array<{ id: string, nome: string, estado: string | null, apelido: string | null, slug: string | null }>} todas
 * @returns {Map<string, string>}
 */
function mapaCanonicoAfiliacao(todas) {
  const usados = new Set()
  /** @type {Map<string, string>} */
  const mapa = new Map()
  for (const a of todas) {
    if (usados.has(a.id)) continue
    const grupo = todas.filter((b) => !usados.has(b.id) && saoMesmoClube(a, b))
    for (const g of grupo) usados.add(g.id)
    const canon = grupo[indiceAfiliacaoCanonica(grupo)]
    for (const g of grupo) mapa.set(g.id, canon.id)
  }
  return mapa
}

async function main() {
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, apelido: true, slug: true },
  })
  const afiliacaoCanon = mapaCanonicoAfiliacao(afiliacoes)
  /** @type {Map<string, (typeof afiliacoes)[number]>} */
  const afiliacaoPorId = new Map(afiliacoes.map((a) => [a.id, a]))

  const tenants = await db.tenant.findMany({
    where: { sintetico: false },
    select: {
      id: true,
      slug: true,
      nome: true,
      ativo: true,
      logoUrl: true,
      afiliacaoId: true,
      torcidaConhecidaId: true,
      criadoEm: true,
      afiliacao: { select: { id: true, nome: true, estado: true, slug: true, apelido: true } },
      torcidaConhecida: {
        select: {
          id: true,
          nome: true,
          titulo: true,
          slug: true,
          uf: true,
          logoUrl: true,
          clubeNomeOriginal: true,
          afiliacaoId: true,
        },
      },
      _count: {
        select: {
          membros: true,
          socios: true,
          sedes: true,
          posts: true,
          aliancasOrigem: true,
          aliancasAliado: true,
          recomendacoes: true,
        },
      },
    },
    orderBy: { nome: 'asc' },
  })

  const tenantIds = tenants.map((t) => t.id)

  const [rivalA, rivalB, sedes] = await Promise.all([
    db.rivalidadeTorcida.groupBy({
      by: ['tenantAId'],
      where: { tenantAId: { in: tenantIds } },
      _count: { _all: true },
    }),
    db.rivalidadeTorcida.groupBy({
      by: ['tenantBId'],
      where: { tenantBId: { in: tenantIds } },
      _count: { _all: true },
    }),
    db.sede.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        id: true,
        tenantId: true,
        tipo: true,
        nome: true,
        sedeId: true,
        _count: { select: { filhos: true } },
      },
    }),
  ])

  const rivalMap = new Map()
  for (const r of rivalA) rivalMap.set(r.tenantAId, (rivalMap.get(r.tenantAId) ?? 0) + r._count._all)
  for (const r of rivalB) rivalMap.set(r.tenantBId, (rivalMap.get(r.tenantBId) ?? 0) + r._count._all)

  const sedesPorTenant = new Map()
  for (const s of sedes) {
    const lista = sedesPorTenant.get(s.tenantId) ?? []
    lista.push(s)
    sedesPorTenant.set(s.tenantId, lista)
  }

  const enriquecidos = tenants.map((t) => {
    const sedesT = sedesPorTenant.get(t.id) ?? []
    const temLogo = Boolean(t.logoUrl || t.torcidaConhecida?.logoUrl)
    const uso = {
      ativo: t.ativo,
      temCatalogo: Boolean(t.torcidaConhecidaId),
      temLogo,
      membros: t._count.membros,
      socios: t._count.socios,
      posts: t._count.posts,
      sedes: t._count.sedes,
      sedesFilhas: sedesT.reduce((acc, s) => acc + s._count.filhos, 0),
      aliancas: t._count.aliancasOrigem + t._count.aliancasAliado,
      rivalidades: rivalMap.get(t.id) ?? 0,
      recomendacoes: t._count.recomendacoes,
      tiposSede: Object.fromEntries(
        ['SEDE', 'SUBSEDE', 'PDE', 'PONTO_ENCONTRO'].map((tipo) => [
          tipo,
          sedesT.filter((s) => s.tipo === tipo).length,
        ]),
      ),
    }
    const clubeCanonId = t.afiliacaoId ? (afiliacaoCanon.get(t.afiliacaoId) ?? t.afiliacaoId) : null
    const clubeCanon = clubeCanonId ? afiliacaoPorId.get(clubeCanonId) : null
    return {
      id: t.id,
      slug: t.slug,
      nome: t.nome,
      ativo: t.ativo,
      chave: chaveTorcida(t.nome),
      criadoEm: t.criadoEm,
      afiliacaoId: t.afiliacaoId,
      clubeCanonId,
      clube: rotuloClube(clubeCanon ?? t.afiliacao),
      clubeRegistro: rotuloClube(t.afiliacao),
      catalogo: t.torcidaConhecida
        ? {
            id: t.torcidaConhecida.id,
            titulo: t.torcidaConhecida.titulo,
            nome: t.torcidaConhecida.nome,
            slug: t.torcidaConhecida.slug,
            clubeOriginal: t.torcidaConhecida.clubeNomeOriginal,
            uf: t.torcidaConhecida.uf,
            logoUrl: t.torcidaConhecida.logoUrl,
          }
        : null,
      uso,
      score: scoreUso(uso),
    }
  })

  /** @type {Map<string, typeof enriquecidos>} */
  const porClubeENome = new Map()
  for (const t of enriquecidos) {
    if (!t.clubeCanonId || !t.chave) continue
    const k = `${t.clubeCanonId}||${t.chave}`
    const lista = porClubeENome.get(k) ?? []
    lista.push(t)
    porClubeENome.set(k, lista)
  }

  const gruposDuplicados = [...porClubeENome.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([, lista]) => {
      const ordenados = [...lista].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.uso.membros !== a.uso.membros) return b.uso.membros - a.uso.membros
        if (a.uso.temLogo !== b.uso.temLogo) return a.uso.temLogo ? -1 : 1
        return a.slug.localeCompare(b.slug)
      })
      const manter = ordenados[0]
      const candidatosRemocao = ordenados.slice(1)
      const nomes = [...new Set(lista.map((t) => t.nome))]
      // Nome formal: preferir o do keeper (mais dados). Só sugere rename se
      // existir variante claramente mais completa no catálogo do keeper.
      const formal =
        manter.catalogo?.nome &&
        chaveTorcida(manter.catalogo.nome) === manter.chave &&
        manter.catalogo.nome.length > manter.nome.length
          ? manter.catalogo.nome
          : manter.nome
      const varianteNome = nomes.length > 1
      return {
        chave: manter.chave,
        clube: manter.clube,
        clubeCanonId: manter.clubeCanonId,
        nomes,
        varianteNome,
        nomeFormalSugerido: formal,
        renomearKeeper: varianteNome && manter.nome !== formal,
        total: lista.length,
        manterSugerido: {
          id: manter.id,
          slug: manter.slug,
          nome: manter.nome,
          clube: manter.clube,
          score: manter.score,
          uso: manter.uso,
        },
        candidatos: ordenados.map((t) => ({
          id: t.id,
          slug: t.slug,
          nome: t.nome,
          ativo: t.ativo,
          clube: t.clube,
          clubeRegistro: t.clubeRegistro,
          afiliacaoId: t.afiliacaoId,
          score: t.score,
          uso: t.uso,
          catalogo: t.catalogo,
          sugestao: t.id === manter.id ? 'MANTER' : 'CANDIDATA_REMOCAO_OU_MERGE',
        })),
        riscoFluxos: {
          aliancasEmDuplicatas: candidatosRemocao.reduce((a, t) => a + t.uso.aliancas, 0),
          rivalidadesEmDuplicatas: candidatosRemocao.reduce((a, t) => a + t.uso.rivalidades, 0),
          sedesEmDuplicatas: candidatosRemocao.reduce((a, t) => a + t.uso.sedes, 0),
          membrosEmDuplicatas: candidatosRemocao.reduce((a, t) => a + t.uso.membros, 0),
        },
      }
    })
    .sort((a, b) => {
      const riscoA =
        a.riscoFluxos.aliancasEmDuplicatas +
        a.riscoFluxos.rivalidadesEmDuplicatas +
        a.riscoFluxos.sedesEmDuplicatas +
        a.riscoFluxos.membrosEmDuplicatas
      const riscoB =
        b.riscoFluxos.aliancasEmDuplicatas +
        b.riscoFluxos.rivalidadesEmDuplicatas +
        b.riscoFluxos.sedesEmDuplicatas +
        b.riscoFluxos.membrosEmDuplicatas
      if (riscoB !== riscoA) return riscoB - riscoA
      if (b.manterSugerido.score !== a.manterSugerido.score) {
        return b.manterSugerido.score - a.manterSugerido.score
      }
      return a.clube.localeCompare(b.clube)
    })

  const clubeCanonIdsAfetados = new Set(gruposDuplicados.map((g) => g.clubeCanonId).filter(Boolean))

  const torcidasDosClubesAfetados = enriquecidos
    .filter((t) => t.clubeCanonId && clubeCanonIdsAfetados.has(t.clubeCanonId))
    .sort((a, b) => {
      const ca = a.clube.localeCompare(b.clube)
      if (ca !== 0) return ca
      return a.nome.localeCompare(b.nome)
    })

  /** @type {Map<string, typeof enriquecidos>} */
  const porClube = new Map()
  for (const t of torcidasDosClubesAfetados) {
    const lista = porClube.get(t.clube) ?? []
    lista.push(t)
    porClube.set(t.clube, lista)
  }

  const chavesDupPorClube = new Map()
  for (const g of gruposDuplicados) {
    const set = chavesDupPorClube.get(g.clube) ?? new Set()
    set.add(g.chave)
    chavesDupPorClube.set(g.clube, set)
  }

  const clubesAfetados = [...porClube.entries()]
    .map(([clube, lista]) => {
      const chavesDup = chavesDupPorClube.get(clube) ?? new Set()
      return {
        clube,
        totalTorcidas: lista.length,
        torcidasEmGruposDuplicados: lista.filter((t) => chavesDup.has(t.chave)).length,
        gruposDuplicados: [...chavesDup],
        torcidas: lista.map((t) => ({
          id: t.id,
          slug: t.slug,
          nome: t.nome,
          ativo: t.ativo,
          chave: t.chave,
          emGrupoDuplicado: chavesDup.has(t.chave),
          score: t.score,
          uso: t.uso,
          catalogo: t.catalogo
            ? {
                slug: t.catalogo.slug,
                titulo: t.catalogo.titulo,
                nome: t.catalogo.nome,
                clubeOriginal: t.catalogo.clubeOriginal,
              }
            : null,
        })),
      }
    })
    .sort(
      (a, b) =>
        b.torcidasEmGruposDuplicados - a.torcidasEmGruposDuplicados ||
        b.totalTorcidas - a.totalTorcidas,
    )

  // Catálogo: mesma chave (com strip de prefixo) no mesmo clube
  const catalogo = await db.torcidaConhecida.findMany({
    select: {
      id: true,
      nome: true,
      titulo: true,
      slug: true,
      uf: true,
      logoUrl: true,
      clubeNomeOriginal: true,
      afiliacaoId: true,
      ativa: true,
      afiliacao: { select: { id: true, nome: true, estado: true, apelido: true } },
      tenant: { select: { id: true, slug: true, ativo: true, nome: true } },
      _count: { select: { perfis: true } },
    },
  })

  /** @type {Map<string, typeof catalogo>} */
  const catPorClubeENome = new Map()
  for (const tc of catalogo) {
    // Usa titulo E nome — se dois registros colapsam na mesma chave, é dup
    const chave = chaveTorcida(tc.titulo || tc.nome)
    if (!chave || !tc.afiliacaoId) continue
    const clubeCanonId = afiliacaoCanon.get(tc.afiliacaoId) ?? tc.afiliacaoId
    const k = `${clubeCanonId}||${chave}`
    const lista = catPorClubeENome.get(k) ?? []
    lista.push(tc)
    catPorClubeENome.set(k, lista)
  }

  const catalogoDuplicado = [...catPorClubeENome.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([, lista]) => {
      const primeiro = lista[0]
      const clubeCanonId = primeiro.afiliacaoId
        ? (afiliacaoCanon.get(primeiro.afiliacaoId) ?? primeiro.afiliacaoId)
        : null
      const clubeCanon = clubeCanonId ? afiliacaoPorId.get(clubeCanonId) : null
      return {
        chave: chaveTorcida(primeiro.titulo || primeiro.nome),
        clube: rotuloClube(clubeCanon ?? primeiro.afiliacao, primeiro.clubeNomeOriginal),
        total: lista.length,
        entradas: lista.map((tc) => ({
          id: tc.id,
          slug: tc.slug,
          nome: tc.nome,
          titulo: tc.titulo,
          ativa: tc.ativa,
          temLogo: Boolean(tc.logoUrl),
          clube: rotuloClube(tc.afiliacao, tc.clubeNomeOriginal),
          clubeOriginal: tc.clubeNomeOriginal,
          temTenant: Boolean(tc.tenant),
          tenantSlug: tc.tenant?.slug ?? null,
          tenantNome: tc.tenant?.nome ?? null,
          perfis: tc._count.perfis,
        })),
      }
    })
    .sort((a, b) => b.total - a.total || a.clube.localeCompare(b.clube))

  const report = {
    geradoEm: new Date().toISOString(),
    criterio: {
      escopo:
        'Duplicata só no mesmo clube. Homônimo entre clubes ignorado. Variantes com/sem prefixo Torcida/Movimento/… colapsam na mesma chave (ex.: Torcida Tricolor Independente = Tricolor Independente).',
      chave:
        'normalizeNome + strip PREFIXOS_TORCIDA + strip artigos + colapsar hífen/espaço (alvi-verde ≈ alviverde)',
      score:
        'aliancas*100 + rivalidades*100 + sedes*50 + (filhas?30) + membros*5 + socios*3 + posts + recomendacoes*10 + logo*40 + catalogo*10 + ativo',
      manter:
        'maior score (dados dos fluxos + logo); empate: membros, logo, slug. Se nomes divergem, sugerir renomear o keeper para o nome formal (mais longo).',
    },
    resumo: {
      tenantsNaoSinteticos: enriquecidos.length,
      gruposNomeDuplicadoNoMesmoClube: gruposDuplicados.length,
      gruposComVarianteDeNome: gruposDuplicados.filter((g) => g.varianteNome).length,
      tenantsEmGruposDuplicados: gruposDuplicados.reduce((a, g) => a + g.total, 0),
      clubesAfetados: clubesAfetados.length,
      torcidasNosClubesAfetados: torcidasDosClubesAfetados.length,
      catalogoGruposDuplicadosNoMesmoClube: catalogoDuplicado.length,
    },
    gruposDuplicados,
    clubesAfetados,
    catalogoDuplicado,
  }

  const jsonPath = resolve(__dir, '../src/data/mapa-torcidas-duplicadas.json')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')

  const lines = []
  lines.push('# Mapa de torcidas duplicadas (mesmo clube + variantes de nome)')
  lines.push('')
  lines.push(`Gerado em: ${report.geradoEm}`)
  lines.push('')
  lines.push('## Critério')
  lines.push('')
  lines.push(
    'Duplicata = **mesmo clube** + mesma identidade após remover prefixos genéricos (`Torcida`, `Torcida Organizada`, `Movimento`, …) e colapsar hífen/espaço (`Mancha Alvi-verde` = `Mancha Alviverde`).',
  )
  lines.push('')
  lines.push(
    'Exemplo: `Torcida Jovem do Flamengo` / `Jovem do Flamengo`; `Mancha Alviverde` / `Mancha Alvi-verde`. Homônimo entre clubes **não** entra.',
  )
  lines.push('')
  lines.push(
    '**MANTER** = maior score (aliança/rivalidade/unidades/membros + logo). Se o keeper está com o nome curto, sugerimos **renomear** para o nome formal (mais longo), sem apagar o registro com dados.',
  )
  lines.push('')
  lines.push('## Resumo')
  lines.push('')
  lines.push(`- Tenants (não sintéticos): **${report.resumo.tenantsNaoSinteticos}**`)
  lines.push(
    `- Grupos duplicados no mesmo clube: **${report.resumo.gruposNomeDuplicadoNoMesmoClube}** (${report.resumo.tenantsEmGruposDuplicados} tenants)`,
  )
  lines.push(
    `- Desses, com variante de grafia/prefixo: **${report.resumo.gruposComVarianteDeNome}**`,
  )
  lines.push(`- Clubes afetados: **${report.resumo.clubesAfetados}**`)
  lines.push(
    `- Torcidas listadas nesses clubes (todas): **${report.resumo.torcidasNosClubesAfetados}**`,
  )
  lines.push(
    `- Catálogo duplicado no mesmo clube: **${report.resumo.catalogoGruposDuplicadosNoMesmoClube}**`,
  )
  lines.push('')

  lines.push('## 1. Grupos duplicados')
  lines.push('')

  for (const [i, g] of gruposDuplicados.entries()) {
    lines.push(
      `### ${i + 1}. ${g.clube} — “${g.nomes.join('” / “')}” (\`${g.chave}\`) — ${g.total} tenants`,
    )
    lines.push('')
    if (g.varianteNome) {
      lines.push(
        `> Variante de nome no mesmo clube. Nome formal sugerido: **${g.nomeFormalSugerido}**.${g.renomearKeeper ? ` O keeper hoje se chama “${g.manterSugerido.nome}” — renomear após merge.` : ''}`,
      )
      lines.push('')
    }
    lines.push(
      '| Sugestão | Slug | Nome | Score | Logo | Ali | Riv | Sedes | Membros | Posts | Catálogo |',
    )
    lines.push('|---|---|---|---:|:---:|---:|---:|---:|---:|---:|---|')
    for (const c of g.candidatos) {
      const cat = c.catalogo
        ? `\`${c.catalogo.slug}\`${c.catalogo.nome ? ` (${c.catalogo.nome})` : ''}`
        : '—'
      lines.push(
        `| **${c.sugestao}** | \`${c.slug}\` | ${c.nome} | ${c.score} | ${c.uso.temLogo ? 'sim' : 'não'} | ${c.uso.aliancas} | ${c.uso.rivalidades} | ${c.uso.sedes} | ${c.uso.membros} | ${c.uso.posts} | ${cat} |`,
      )
    }
    lines.push('')
    if (
      g.riscoFluxos.aliancasEmDuplicatas ||
      g.riscoFluxos.rivalidadesEmDuplicatas ||
      g.riscoFluxos.sedesEmDuplicatas ||
      g.riscoFluxos.membrosEmDuplicatas
    ) {
      lines.push(
        `Risco nas candidatas: ${g.riscoFluxos.aliancasEmDuplicatas} alianças, ${g.riscoFluxos.rivalidadesEmDuplicatas} rivalidades, ${g.riscoFluxos.sedesEmDuplicatas} sedes, ${g.riscoFluxos.membrosEmDuplicatas} membros — **merge/remanejar, não apagar cru**.`,
      )
      lines.push('')
    }
  }

  lines.push('## 2. Todas as torcidas dos clubes afetados')
  lines.push('')
  for (const cl of clubesAfetados) {
    lines.push(
      `### ${cl.clube} — ${cl.totalTorcidas} torcida(s) (${cl.torcidasEmGruposDuplicados} em grupo duplicado)`,
    )
    lines.push('')
    lines.push(
      '| Dup? | Slug | Nome | Chave | Score | Logo | Ali | Riv | Sedes | Membros | Catálogo |',
    )
    lines.push('|---|---|---|---|---:|:---:|---:|---:|---:|---:|---|')
    for (const t of cl.torcidas) {
      const cat = t.catalogo
        ? `\`${t.catalogo.slug}\`${t.catalogo.nome ? ` ← ${t.catalogo.nome}` : ''}`
        : '—'
      lines.push(
        `| ${t.emGrupoDuplicado ? '**SIM**' : 'não'} | \`${t.slug}\` | ${t.nome} | \`${t.chave}\` | ${t.score} | ${t.uso.temLogo ? 'sim' : 'não'} | ${t.uso.aliancas} | ${t.uso.rivalidades} | ${t.uso.sedes} | ${t.uso.membros} | ${cat} |`,
      )
    }
    lines.push('')
  }

  lines.push('## 3. Catálogo TorcidaConhecida duplicado (mesmo clube)')
  lines.push('')
  if (catalogoDuplicado.length === 0) {
    lines.push('_Nenhuma entrada de catálogo duplicada no mesmo clube com esta chave._')
    lines.push('')
  } else {
    for (const [i, g] of catalogoDuplicado.entries()) {
      lines.push(`### C${i + 1}. ${g.clube} — \`${g.chave}\` — ${g.total} entradas`)
      lines.push('')
      lines.push('| Slug | Nome | Título | Logo | Tenant | Perfis | Ativa |')
      lines.push('|---|---|---|:---:|---|---:|---|')
      for (const e of g.entradas) {
        lines.push(
          `| \`${e.slug}\` | ${e.nome} | ${e.titulo ?? '—'} | ${e.temLogo ? 'sim' : 'não'} | ${e.tenantSlug ? `\`${e.tenantSlug}\` (${e.tenantNome})` : '—'} | ${e.perfis} | ${e.ativa ? 'sim' : 'não'} |`,
        )
      }
      lines.push('')
    }
  }

  const mdPath = resolve(__dir, '../../../docs/ops/mapa-torcidas-duplicadas.md')
  writeFileSync(mdPath, lines.join('\n'), 'utf8')

  console.log(JSON.stringify(report.resumo, null, 2))
  console.log('JSON:', jsonPath)
  console.log('MD:', mdPath)
  console.log('\nGrupos:')
  for (const g of gruposDuplicados) {
    const rename = g.renomearKeeper ? ` renomear→"${g.nomeFormalSugerido}"` : ''
    console.log(
      ` - ${g.clube} / ${g.chave} x${g.total} manter=${g.manterSugerido.slug} (${g.manterSugerido.nome})${rename}`,
    )
    for (const c of g.candidatos) {
      console.log(
        `     [${c.sugestao}] ${c.slug} "${c.nome}" logo=${c.uso.temLogo} mem=${c.uso.membros} ali=${c.uso.aliancas} riv=${c.uso.rivalidades} sed=${c.uso.sedes}`,
      )
    }
  }
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
