/**
 * Apaga todos os dados de teste gerados por seed-corinthians-teste.js — e
 * só eles. Não toca em torcidas/sedes/usuários reais.
 *
 * Identificação:
 *   - `User` sintético: email termina em `@teste.corinthians.torcida.app`.
 *   - `Post`/`Evento`/`SalaReuniao`/`Conversa` do seed: título/nome começa
 *     com `[TESTE-CORINTHIANS] ` (cobre os posts institucionais, cujo autor é o owner
 *     real da torcida — não dá pra filtrar só por autor).
 *
 * Ordem segura de FKs (deleção explícita mesmo onde há cascade, para poder
 * reportar contagem em --dry-run):
 *   Post (+ comentários/reações/denúncias em cascata)
 *   → SaasPedido (+ itens em cascata)
 *   → Evento (+ EventoRsvp em cascata)
 *   → SalaReuniao (+ participantes em cascata)
 *   → Conversa (+ MembroConversa em cascata)
 *   → UserRole → SaasMembro → PerfilTorcedor → User
 *
 * Uso:
 *   pnpm --filter @torcida/db reset:corinthians-teste -- --dry-run
 *   pnpm --filter @torcida/db reset:corinthians-teste
 */
import { db } from '../src/index.js'

const DOMINIO_TESTE = 'teste.corinthians.torcida.app'
const DRY_RUN = process.argv.includes('--dry-run')

const filtroUserTeste = { email: { endsWith: `@${DOMINIO_TESTE}` } }

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Reset de dados de teste — Corinthians\n`)

  const usuariosTeste = await db.user.findMany({ where: filtroUserTeste, select: { id: true } })
  const userIds = usuariosTeste.map((u) => u.id)
  console.log(`Usuários de teste encontrados: ${userIds.length}`)

  const contagens = {}

  // ── Posts (institucionais têm autor real → filtra também por título) ───
  const filtroPost = {
    OR: [{ autorId: { in: userIds } }, { titulo: { startsWith: '[TESTE-CORINTHIANS]' } }],
  }
  const posts = await db.post.findMany({ where: filtroPost, select: { id: true } })
  const postIds = posts.map((p) => p.id)
  contagens.reacoes = await db.reacao.count({ where: { postId: { in: postIds } } })
  contagens.comentarios = await db.comentario.count({ where: { postId: { in: postIds } } })
  contagens.denuncias = await db.denuncia.count({ where: { postId: { in: postIds } } })
  contagens.posts = postIds.length

  // ── Loja ─────────────────────────────────────────────────────────────
  const pedidos = await db.saasPedido.findMany({ where: { userId: { in: userIds } }, select: { id: true } })
  const pedidoIds = pedidos.map((p) => p.id)
  contagens.pedidoItens = await db.saasPedidoItem.count({ where: { pedidoId: { in: pedidoIds } } })
  contagens.pedidos = pedidoIds.length

  // ── Eventos ──────────────────────────────────────────────────────────
  const eventos = await db.evento.findMany({ where: { titulo: { startsWith: '[TESTE-CORINTHIANS]' } }, select: { id: true } })
  const eventoIds = eventos.map((e) => e.id)
  contagens.eventoRsvps = await db.eventoRsvp.count({ where: { eventoId: { in: eventoIds } } })
  contagens.eventos = eventoIds.length

  // ── Salas de vídeo ───────────────────────────────────────────────────
  const salas = await db.salaReuniao.findMany({ where: { titulo: { startsWith: '[TESTE-CORINTHIANS]' } }, select: { id: true } })
  const salaIds = salas.map((s) => s.id)
  contagens.participantesReuniao = await db.participanteReuniao.count({ where: { salaId: { in: salaIds } } })
  contagens.salas = salaIds.length

  // ── Conversas ────────────────────────────────────────────────────────
  const conversas = await db.conversa.findMany({ where: { nome: { startsWith: '[TESTE-CORINTHIANS]' } }, select: { id: true } })
  const conversaIds = conversas.map((c) => c.id)
  contagens.membrosConversa = await db.membroConversa.count({ where: { conversaId: { in: conversaIds } } })
  contagens.conversas = conversaIds.length

  // ── Identidade ───────────────────────────────────────────────────────
  contagens.userRoles = await db.userRole.count({ where: { userId: { in: userIds } } })
  contagens.saasMembros = await db.saasMembro.count({ where: { userId: { in: userIds } } })
  contagens.perfisTorcedor = await db.perfilTorcedor.count({ where: { userId: { in: userIds } } })
  contagens.users = userIds.length

  console.log('\n📊 Contagens (a apagar):')
  for (const [tabela, qtd] of Object.entries(contagens)) {
    console.log(`   ${tabela.padEnd(20)}: ${qtd}`)
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] Nada foi apagado. Rode sem --dry-run para executar de fato.')
    return
  }

  console.log('\n🗑  Apagando...')
  await db.post.deleteMany({ where: filtroPost }) // cascata: comentário/reação/denúncia/enquete/hashtag/salvo/timeline
  await db.saasPedido.deleteMany({ where: { userId: { in: userIds } } }) // cascata: itens
  await db.evento.deleteMany({ where: { titulo: { startsWith: '[TESTE-CORINTHIANS]' } } }) // cascata: rsvps
  await db.salaReuniao.deleteMany({ where: { titulo: { startsWith: '[TESTE-CORINTHIANS]' } } }) // cascata: participantes/mensagens/enquetes
  await db.conversa.deleteMany({ where: { nome: { startsWith: '[TESTE-CORINTHIANS]' } } }) // cascata: membros
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } })
  await db.saasMembro.deleteMany({ where: { userId: { in: userIds } } })
  await db.perfilTorcedor.deleteMany({ where: { userId: { in: userIds } } })
  const usersApagados = await db.user.deleteMany({ where: filtroUserTeste })

  console.log(`\n✅ Reset concluído. ${usersApagados.count} usuários de teste removidos.`)
}

main()
  .catch((err) => {
    console.error('❌ Erro no reset:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
