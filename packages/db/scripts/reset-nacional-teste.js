/**
 * Apaga todos os dados de teste gerados por seed-nacional-teste.js — e só
 * eles. Lote independente do lote Corinthians: rodar este reset **não**
 * afeta `reset:corinthians-teste` e vice-versa.
 *
 * Identificação:
 *   - `User` sintético: e-mail termina em `@teste.nacional.torcida.app`.
 *   - `Post`/`Evento` do seed: título começa com `[TESTE-NACIONAL] `.
 *   - `Alianca`: proposta por um presidente sintético do lote
 *     (`propostaPorId` entre os usuários de teste).
 *   - `RivalidadeClube`/`RivalidadeTorcida`: sem campo livre para marcador —
 *     identificadas pelos pares declarados em `lib/lote-nacional.js`, o
 *     mesmo módulo que o seed usa para criá-las.
 *
 * Ordem segura de FKs:
 *   Post (+ reações/comentários/denúncias em cascata)
 *   → Evento (+ RSVPs em cascata)
 *   → Alianca (propostaPor é obrigatório → precisa sair antes do User)
 *   → RivalidadeClube / RivalidadeTorcida
 *   → UserRole → SaasMembro → PerfilTorcedor → User
 *
 * Uso:
 *   pnpm --filter @torcida/db reset:nacional-teste -- --dry-run
 *   pnpm --filter @torcida/db reset:nacional-teste
 */
import { db } from '../src/index.js'
import {
  CLUBE_CORINTHIANS,
  DOMINIO_TESTE,
  LOTE,
  MARCA,
  RIVALIDADES_CLUBE,
  TENANT_CORINTHIANS,
} from './lib/lote-nacional.js'

const DRY_RUN = process.argv.includes('--dry-run')

const filtroUserTeste = { email: { endsWith: `@${DOMINIO_TESTE}` } }

/** Par canônico do schema: sempre aId < bId. */
function parCanonico(a, b) {
  return a < b ? [a, b] : [b, a]
}

/** Reconstrói os pares de rivalidade que o seed criou, como filtro `OR`. */
async function filtrosRivalidade() {
  const clubeSlugs = [...LOTE.map((l) => l.clube), CLUBE_CORINTHIANS]
  const tenantSlugs = [...LOTE.map((l) => l.tenant), TENANT_CORINTHIANS]

  const afiliacoes = await db.afiliacao.findMany({
    where: { slug: { in: clubeSlugs } },
    select: { id: true, slug: true },
  })
  const tenants = await db.tenant.findMany({
    where: { slug: { in: tenantSlugs } },
    select: { id: true, slug: true },
  })
  const idPorClube = new Map(afiliacoes.map((a) => [a.slug, a.id]))
  const tenantPorClube = new Map(
    LOTE.map((l) => [l.clube, tenants.find((t) => t.slug === l.tenant)?.id]).filter(([, id]) => id),
  )
  const corTenant = tenants.find((t) => t.slug === TENANT_CORINTHIANS)
  if (corTenant) tenantPorClube.set(CLUBE_CORINTHIANS, corTenant.id)

  const paresClube = []
  const paresTorcida = []
  for (const [slugA, slugB] of RIVALIDADES_CLUBE) {
    const idA = idPorClube.get(slugA)
    const idB = idPorClube.get(slugB)
    if (idA && idB) {
      const [a, b] = parCanonico(idA, idB)
      paresClube.push({ afiliacaoAId: a, afiliacaoBId: b })
    }
    const tA = tenantPorClube.get(slugA)
    const tB = tenantPorClube.get(slugB)
    if (tA && tB) {
      const [a, b] = parCanonico(tA, tB)
      paresTorcida.push({ tenantAId: a, tenantBId: b })
    }
  }
  return { paresClube, paresTorcida }
}

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Reset de dados de teste — lote NACIONAL\n`)

  const usuariosTeste = await db.user.findMany({ where: filtroUserTeste, select: { id: true } })
  const userIds = usuariosTeste.map((u) => u.id)
  console.log(`Usuários de teste encontrados: ${userIds.length}`)

  const { paresClube, paresTorcida } = await filtrosRivalidade()
  const contagens = {}

  // ── Posts (institucionais são de presidente sintético, mas o prefixo do
  //    título mantém a simetria com o lote Corinthians) ──────────────────
  const filtroPost = {
    OR: [{ autorId: { in: userIds } }, { titulo: { startsWith: MARCA } }],
  }
  const posts = await db.post.findMany({ where: filtroPost, select: { id: true } })
  const postIds = posts.map((p) => p.id)
  contagens.reacoes = await db.reacao.count({ where: { postId: { in: postIds } } })
  contagens.comentarios = await db.comentario.count({ where: { postId: { in: postIds } } })
  contagens.denuncias = await db.denuncia.count({ where: { postId: { in: postIds } } })
  contagens.posts = postIds.length

  // ── Eventos ──────────────────────────────────────────────────────────
  const eventos = await db.evento.findMany({
    where: { titulo: { startsWith: MARCA } },
    select: { id: true },
  })
  const eventoIds = eventos.map((e) => e.id)
  contagens.eventoRsvps = await db.eventoRsvp.count({ where: { eventoId: { in: eventoIds } } })
  contagens.eventos = eventoIds.length

  // ── Alianças e rivalidades ───────────────────────────────────────────
  contagens.aliancas = await db.alianca.count({ where: { propostaPorId: { in: userIds } } })
  contagens.rivalidadesClube =
    paresClube.length > 0 ? await db.rivalidadeClube.count({ where: { OR: paresClube } }) : 0
  contagens.rivalidadesTorcida =
    paresTorcida.length > 0 ? await db.rivalidadeTorcida.count({ where: { OR: paresTorcida } }) : 0

  // ── Identidade ───────────────────────────────────────────────────────
  contagens.userRoles = await db.userRole.count({ where: { userId: { in: userIds } } })
  contagens.saasMembros = await db.saasMembro.count({ where: { userId: { in: userIds } } })
  contagens.perfisTorcedor = await db.perfilTorcedor.count({ where: { userId: { in: userIds } } })
  contagens.users = userIds.length

  console.log('\n📊 Contagens (a apagar):')
  for (const [tabela, qtd] of Object.entries(contagens)) {
    console.log(`   ${tabela.padEnd(22)}: ${qtd}`)
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] Nada foi apagado. Rode sem --dry-run para executar de fato.')
    return
  }

  console.log('\n🗑  Apagando...')
  await db.post.deleteMany({ where: filtroPost }) // cascata: reação/comentário/denúncia/…
  await db.evento.deleteMany({ where: { titulo: { startsWith: MARCA } } }) // cascata: rsvps
  await db.alianca.deleteMany({ where: { propostaPorId: { in: userIds } } })
  if (paresClube.length > 0) await db.rivalidadeClube.deleteMany({ where: { OR: paresClube } })
  if (paresTorcida.length > 0) await db.rivalidadeTorcida.deleteMany({ where: { OR: paresTorcida } })
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } })
  await db.saasMembro.deleteMany({ where: { userId: { in: userIds } } })
  await db.perfilTorcedor.deleteMany({ where: { userId: { in: userIds } } })
  const usersApagados = await db.user.deleteMany({ where: filtroUserTeste })

  console.log(`\n✅ Reset concluído. ${usersApagados.count} usuários de teste removidos.`)
  console.log(
    'ℹ️  As torcidas do lote voltam a ficar sem nenhum UserRole (era o estado original — ninguém as assumiu ainda).',
  )
}

main()
  .catch((err) => {
    console.error('❌ Erro no reset:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
