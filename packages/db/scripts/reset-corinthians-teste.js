/**
 * Apaga todos os dados de teste gerados por seed-corinthians-teste.js e
 * seed-corinthians-teste-modulos.js — e só eles. Não toca em
 * torcidas/sedes/usuários reais.
 *
 * Identificação:
 *   - `User` sintético: email termina em `@teste.corinthians.torcida.app`.
 *   - `Post`/`Evento`/`SalaReuniao`/`Conversa` do seed: título/nome começa
 *     com `[TESTE-CORINTHIANS] ` (cobre os posts institucionais, cujo autor é o owner
 *     real da torcida — não dá pra filtrar só por autor).
 *   - `PatrimonioItem`/`FinanceiroLancamento`/`BarVenda`/`BarCaixaTurno`:
 *     `observacao` começa com `[TESTE-CORINTHIANS]` (criados por autor real;
 *     o marcador vai no único campo livre que não suja a UI com prefixo).
 *   - Catálogo de loja e de bar: `slug` com prefixo `teste-corinthians-`;
 *     cupons com código começando em `TESTE`.
 *
 * Ordem segura de FKs (deleção explícita mesmo onde há cascade, para poder
 * reportar contagem em --dry-run):
 *   Post (+ comentários/reações/denúncias em cascata)
 *   → Bar: movimentações → vendas (+ itens/fiado em cascata) → turnos
 *          → produtos → categorias
 *   → SaasPedido (+ itens em cascata) → SaasProduto → SaasCategoria → SaasCupom
 *   → Evento (+ EventoRsvp em cascata)
 *   → SalaReuniao (+ participantes em cascata)
 *   → Conversa (+ MembroConversa em cascata)
 *   → PatrimonioItem → FinanceiroLancamento
 *   → UserPermission → DepartamentoGestor → UserDepartamento
 *   → UserRole → SaasSocio → SaasMembro → PerfilTorcedor → User
 *
 * O que NÃO é revertido: o estoque dos produtos de bar reais do Gaviões, que
 * o seed decrementa ao registrar vendas. Para restaurar o catálogo demo:
 * `pnpm --filter @torcida/db seed:bar-gavioes`.
 *
 * Uso:
 *   pnpm --filter @torcida/db reset:corinthians-teste -- --dry-run
 *   pnpm --filter @torcida/db reset:corinthians-teste
 */
import { db } from '../src/index.js'

const DOMINIO_TESTE = 'teste.corinthians.torcida.app'
const MARCA = '[TESTE-CORINTHIANS]'
const SLUG_TESTE = 'teste-corinthians-'
const CUPOM_PREFIXO = 'TESTE'
const DRY_RUN = process.argv.includes('--dry-run')

const filtroUserTeste = { email: { endsWith: `@${DOMINIO_TESTE}` } }
const marcaObservacao = { observacao: { startsWith: MARCA } }
const marcaTitulo = { titulo: { startsWith: MARCA } }

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Reset de dados de teste — Corinthians\n`)

  const usuariosTeste = await db.user.findMany({ where: filtroUserTeste, select: { id: true } })
  const userIds = usuariosTeste.map((u) => u.id)
  console.log(`Usuários de teste encontrados: ${userIds.length}`)

  const contagens = {}

  // ── Posts (institucionais têm autor real → filtra também por título) ───
  const filtroPost = {
    OR: [{ autorId: { in: userIds } }, { titulo: { startsWith: MARCA } }],
  }
  const posts = await db.post.findMany({ where: filtroPost, select: { id: true } })
  const postIds = posts.map((p) => p.id)
  contagens.reacoes = await db.reacao.count({ where: { postId: { in: postIds } } })
  contagens.comentarios = await db.comentario.count({ where: { postId: { in: postIds } } })
  contagens.denuncias = await db.denuncia.count({ where: { postId: { in: postIds } } })
  contagens.posts = postIds.length

  // ── Bar (PDV) ────────────────────────────────────────────────────────
  const barCategorias = await db.barCategoria.findMany({
    where: { slug: { startsWith: SLUG_TESTE } },
    select: { id: true },
  })
  const barCategoriaIds = barCategorias.map((c) => c.id)
  const barProdutos = await db.barProduto.findMany({
    where: { categoriaId: { in: barCategoriaIds } },
    select: { id: true },
  })
  const barProdutoIds = barProdutos.map((p) => p.id)
  const barVendas = await db.barVenda.findMany({ where: marcaObservacao, select: { id: true } })
  const barVendaIds = barVendas.map((v) => v.id)
  const barTurnos = await db.barCaixaTurno.findMany({ where: marcaObservacao, select: { id: true } })
  const barTurnoIds = barTurnos.map((t) => t.id)

  contagens.barMovimentacoes = await db.barMovimentacaoEstoque.count({
    where: { OR: [{ produtoId: { in: barProdutoIds } }, { vendaId: { in: barVendaIds } }] },
  })
  contagens.barVendaItens = await db.barVendaItem.count({ where: { vendaId: { in: barVendaIds } } })
  contagens.barFiados = await db.barFiado.count({ where: { vendaId: { in: barVendaIds } } })
  contagens.barVendas = barVendaIds.length
  contagens.barTurnos = barTurnoIds.length
  contagens.barProdutos = barProdutoIds.length
  contagens.barCategorias = barCategoriaIds.length

  // ── Loja ─────────────────────────────────────────────────────────────
  const pedidos = await db.saasPedido.findMany({ where: { userId: { in: userIds } }, select: { id: true } })
  const pedidoIds = pedidos.map((p) => p.id)
  contagens.pedidoItens = await db.saasPedidoItem.count({ where: { pedidoId: { in: pedidoIds } } })
  contagens.pedidos = pedidoIds.length
  contagens.lojaProdutos = await db.saasProduto.count({ where: { slug: { startsWith: SLUG_TESTE } } })
  contagens.lojaCategorias = await db.saasCategoria.count({ where: { slug: { startsWith: SLUG_TESTE } } })
  contagens.lojaCupons = await db.saasCupom.count({ where: { codigo: { startsWith: CUPOM_PREFIXO } } })

  // ── Eventos ──────────────────────────────────────────────────────────
  const eventos = await db.evento.findMany({ where: marcaTitulo, select: { id: true } })
  const eventoIds = eventos.map((e) => e.id)
  contagens.eventoRsvps = await db.eventoRsvp.count({ where: { eventoId: { in: eventoIds } } })
  contagens.eventos = eventoIds.length

  // ── Salas de vídeo ───────────────────────────────────────────────────
  const salas = await db.salaReuniao.findMany({ where: marcaTitulo, select: { id: true } })
  const salaIds = salas.map((s) => s.id)
  contagens.participantesReuniao = await db.participanteReuniao.count({ where: { salaId: { in: salaIds } } })
  contagens.salas = salaIds.length

  // ── Conversas ────────────────────────────────────────────────────────
  const conversas = await db.conversa.findMany({ where: { nome: { startsWith: MARCA } }, select: { id: true } })
  const conversaIds = conversas.map((c) => c.id)
  contagens.membrosConversa = await db.membroConversa.count({ where: { conversaId: { in: conversaIds } } })
  contagens.conversas = conversaIds.length

  // ── Patrimônio e financeiro (autor real → marcador em observacao) ─────
  contagens.patrimonioItens = await db.patrimonioItem.count({ where: marcaObservacao })
  contagens.financeiroLancamentos = await db.financeiroLancamento.count({ where: marcaObservacao })

  // ── Identidade / RBAC ────────────────────────────────────────────────
  contagens.userPermissions = await db.userPermission.count({ where: { userId: { in: userIds } } })
  contagens.gestoresDepartamento = await db.departamentoGestor.count({ where: { userId: { in: userIds } } })
  contagens.userDepartamentos = await db.userDepartamento.count({ where: { userId: { in: userIds } } })
  contagens.userRoles = await db.userRole.count({ where: { userId: { in: userIds } } })
  contagens.saasSocios = await db.saasSocio.count({ where: { userId: { in: userIds } } })
  contagens.saasMembros = await db.saasMembro.count({ where: { userId: { in: userIds } } })
  contagens.perfisTorcedor = await db.perfilTorcedor.count({ where: { userId: { in: userIds } } })
  contagens.users = userIds.length

  // Auditoria dos cadastros de teste: `AuditLog.ator` é opcional, então apagar
  // o User só anula o ator e deixaria a linha órfã no histórico do tenant.
  const membrosTeste = await db.saasMembro.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  const membroIds = membrosTeste.map((m) => m.id)
  const sociosTeste = await db.saasSocio.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  const socioIds = sociosTeste.map((s) => s.id)
  const filtroAudit = {
    OR: [
      { entidade: 'SaasMembro', entidadeId: { in: membroIds } },
      { entidade: 'SaasSocio', entidadeId: { in: socioIds } },
    ],
  }
  contagens.auditLogs = await db.auditLog.count({ where: filtroAudit })

  console.log('\n📊 Contagens (a apagar):')
  for (const [tabela, qtd] of Object.entries(contagens)) {
    console.log(`   ${tabela.padEnd(24)}: ${qtd}`)
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] Nada foi apagado. Rode sem --dry-run para executar de fato.')
    return
  }

  console.log('\n🗑  Apagando...')
  await db.post.deleteMany({ where: filtroPost }) // cascata: comentário/reação/denúncia/enquete/hashtag/salvo/timeline

  // Bar: movimentações primeiro (venda/produto só fazem SetNull/Cascade
  // parcial), depois vendas (itens + fiado em cascata), turnos e catálogo.
  await db.barMovimentacaoEstoque.deleteMany({
    where: { OR: [{ produtoId: { in: barProdutoIds } }, { vendaId: { in: barVendaIds } }] },
  })
  await db.barVenda.deleteMany({ where: { id: { in: barVendaIds } } })
  await db.barCaixaTurno.deleteMany({ where: { id: { in: barTurnoIds } } })
  await db.barProduto.deleteMany({ where: { id: { in: barProdutoIds } } })
  await db.barCategoria.deleteMany({ where: { id: { in: barCategoriaIds } } })

  // Loja: pedidos antes dos produtos (SaasPedidoItem.produto é obrigatório).
  await db.saasPedido.deleteMany({ where: { userId: { in: userIds } } }) // cascata: itens
  await db.saasProduto.deleteMany({ where: { slug: { startsWith: SLUG_TESTE } } })
  await db.saasCategoria.deleteMany({ where: { slug: { startsWith: SLUG_TESTE } } })
  await db.saasCupom.deleteMany({ where: { codigo: { startsWith: CUPOM_PREFIXO } } })

  await db.evento.deleteMany({ where: marcaTitulo }) // cascata: rsvps
  await db.salaReuniao.deleteMany({ where: marcaTitulo }) // cascata: participantes/mensagens/enquetes
  await db.conversa.deleteMany({ where: { nome: { startsWith: MARCA } } }) // cascata: membros

  await db.patrimonioItem.deleteMany({ where: marcaObservacao })
  await db.financeiroLancamento.deleteMany({ where: marcaObservacao })

  await db.auditLog.deleteMany({ where: filtroAudit })
  await db.userPermission.deleteMany({ where: { userId: { in: userIds } } })
  await db.departamentoGestor.deleteMany({ where: { userId: { in: userIds } } })
  await db.userDepartamento.deleteMany({ where: { userId: { in: userIds } } })
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } })
  await db.saasSocio.deleteMany({ where: { userId: { in: userIds } } })
  await db.saasMembro.deleteMany({ where: { userId: { in: userIds } } })
  await db.perfilTorcedor.deleteMany({ where: { userId: { in: userIds } } })
  const usersApagados = await db.user.deleteMany({ where: filtroUserTeste })

  console.log(`\n✅ Reset concluído. ${usersApagados.count} usuários de teste removidos.`)
  console.log(
    'ℹ️  O estoque do bar real (Gaviões) não é restaurado — rode `pnpm --filter @torcida/db seed:bar-gavioes` se quiser o catálogo demo original.',
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
