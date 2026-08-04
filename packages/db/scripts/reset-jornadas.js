/**
 * Apaga o lote **jornadas** (`seed:jornadas`) — e só ele.
 *
 * Identificação, nesta ordem de confiança:
 *   - `User` do lote: e-mail termina em `@jornada.torcida.app`.
 *   - `Conversa` (canais temáticos criados pelo lote): `nome` começa com
 *     `[JORNADA]`.
 *   - `Post` do lote: autor do lote **ou** conteúdo com o marcador — os posts
 *     de mural de canal são do autor certo, mas o marcador cobre o caso de um
 *     usuário do lote ter sido promovido e publicado como diretoria.
 *
 * O que NÃO é revertido de propósito:
 *   - Os links de convite (`seed:convites-teste`) — são configuração da
 *     torcida, não dado do lote, e continuam válidos para navegar à mão.
 *   - Cargos concedidos a usuários **reais**: o lote só promove gente dele.
 *
 * Ordem segura de FKs (deleção explícita mesmo onde há cascade, para poder
 * reportar contagem em `--dry-run`):
 *   Reacao/Comentario/Denuncia → Post → MembroConversa → Conversa
 *   → Notificacao → AuditLog (ator do lote) → UserPermission
 *   → DepartamentoAreaMembro → DepartamentoGestor → UserDepartamento
 *   → UserRole → PerfilMembro → SaasSocio → SaasMembro (espelho antes da
 *     origem) → PerfilTorcedor → User
 *
 * Uso:
 *   pnpm --filter @torcida/db reset:jornadas -- --dry-run
 *   pnpm --filter @torcida/db reset:jornadas
 */
import { db } from '../src/index.js'

const DOMINIO = 'jornada.torcida.app'
const MARCA = '[JORNADA]'
const DRY_RUN = process.argv.includes('--dry-run')

const filtroUser = { email: { endsWith: `@${DOMINIO}` } }

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Reset do lote de jornadas\n`)

  const users = await db.user.findMany({ where: filtroUser, select: { id: true } })
  const userIds = users.map((u) => u.id)
  console.log(`Usuários do lote: ${userIds.length}`)
  if (userIds.length === 0 && !DRY_RUN) {
    console.log('Nada a apagar.')
    return
  }

  const canais = await db.conversa.findMany({
    where: { nome: { startsWith: MARCA } },
    select: { id: true },
  })
  const canalIds = canais.map((c) => c.id)

  // Áreas e projetos criados pelo lote. Sem isto, a segunda rodada colide em
  // "Já existe uma área com esse nome neste departamento" e a Fase 4 inteira
  // (membros de área, responsável, projeto, participantes) deixa de rodar —
  // foi exatamente o que aconteceu na rodada de 2026-08-04.
  const areas = await db.departamentoArea.findMany({
    where: { nome: { startsWith: MARCA } },
    select: { id: true },
  })
  const areaIds = areas.map((a) => a.id)
  const projetos = await db.projeto.findMany({
    where: { OR: [{ titulo: { startsWith: MARCA } }, { areaId: { in: areaIds } }] },
    select: { id: true },
  })
  const projetoIds = projetos.map((p) => p.id)

  const posts = await db.post.findMany({
    where: {
      OR: [
        { autorId: { in: userIds } },
        { conteudo: { startsWith: MARCA } },
        { conversaId: { in: canalIds } },
      ],
    },
    select: { id: true },
  })
  const postIds = posts.map((p) => p.id)

  const contagens = {
    reacoes: await db.reacao.count({ where: { postId: { in: postIds } } }),
    comentarios: await db.comentario.count({ where: { postId: { in: postIds } } }),
    denuncias: await db.denuncia.count({ where: { postId: { in: postIds } } }),
    posts: postIds.length,
    // MembroConversa some por dois motivos: o canal é do lote, ou a pessoa é.
    membroConversa: await db.membroConversa.count({
      where: { OR: [{ conversaId: { in: canalIds } }, { userId: { in: userIds } }] },
    }),
    conversas: canalIds.length,
    projetoParticipantes: await db.projetoParticipante.count({
      where: { projetoId: { in: projetoIds } },
    }),
    projetos: projetoIds.length,
    areaMembros: await db.departamentoAreaMembro.count({ where: { areaId: { in: areaIds } } }),
    areas: areaIds.length,
    notificacoes: await db.notificacao.count({ where: { userId: { in: userIds } } }),
    auditLogs: await db.auditLog.count({ where: { atorId: { in: userIds } } }),
    userPermissions: await db.userPermission.count({ where: { userId: { in: userIds } } }),
    userDepartamentos: await db.userDepartamento.count({ where: { userId: { in: userIds } } }),
    userRoles: await db.userRole.count({ where: { userId: { in: userIds } } }),
    perfisMembro: await db.perfilMembro.count({ where: { userId: { in: userIds } } }),
    socios: await db.saasSocio.count({ where: { userId: { in: userIds } } }),
    membros: await db.saasMembro.count({ where: { userId: { in: userIds } } }),
    perfisTorcedor: await db.perfilTorcedor.count({ where: { userId: { in: userIds } } }),
    users: userIds.length,
  }

  console.log('\nA apagar:')
  for (const [k, v] of Object.entries(contagens)) console.log(`   ${k.padEnd(20)}: ${v}`)

  if (DRY_RUN) {
    console.log('\n[dry-run] Nada foi apagado.')
    return
  }

  console.log('\nApagando...')
  await db.reacao.deleteMany({ where: { postId: { in: postIds } } })
  await db.comentario.deleteMany({ where: { postId: { in: postIds } } })
  await db.denuncia.deleteMany({ where: { postId: { in: postIds } } })
  await db.post.deleteMany({ where: { id: { in: postIds } } })

  await db.membroConversa.deleteMany({
    where: { OR: [{ conversaId: { in: canalIds } }, { userId: { in: userIds } }] },
  })
  await db.conversa.deleteMany({ where: { id: { in: canalIds } } })

  // Projeto antes de Área (`Projeto.areaId`), e ambos antes dos usuários.
  await db.projetoParticipante.deleteMany({ where: { projetoId: { in: projetoIds } } })
  // Lançamento rateado num projeto do lote: solta o vínculo em vez de apagar o
  // lançamento, que pode ser real (o rateio é opcional no financeiro).
  await db.financeiroLancamento.updateMany({
    where: { projetoId: { in: projetoIds } },
    data: { projetoId: null },
  })
  await db.evento.updateMany({
    where: { projetoId: { in: projetoIds } },
    data: { projetoId: null },
  })
  await db.projeto.deleteMany({ where: { id: { in: projetoIds } } })
  await db.departamentoAreaMembro.deleteMany({ where: { areaId: { in: areaIds } } })
  await db.departamentoArea.deleteMany({ where: { id: { in: areaIds } } })

  await db.notificacao.deleteMany({ where: { userId: { in: userIds } } })
  await db.auditLog.deleteMany({ where: { atorId: { in: userIds } } })

  await db.userPermission.deleteMany({ where: { userId: { in: userIds } } })
  await db.departamentoAreaMembro.deleteMany({ where: { userId: { in: userIds } } })
  await db.departamentoGestor.deleteMany({ where: { userId: { in: userIds } } })
  await db.userDepartamento.deleteMany({ where: { userId: { in: userIds } } })
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } })
  await db.perfilMembro.deleteMany({ where: { userId: { in: userIds } } })
  await db.saasSocio.deleteMany({ where: { userId: { in: userIds } } })

  // Espelho aponta para a origem (`membroOrigemId`): apagar a origem primeiro
  // deixaria a FK órfã.
  await db.saasMembro.deleteMany({
    where: { userId: { in: userIds }, membroOrigemId: { not: null } },
  })
  await db.saasMembro.deleteMany({ where: { userId: { in: userIds } } })

  await db.perfilTorcedor.deleteMany({ where: { userId: { in: userIds } } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })

  console.log('\n🎉 Lote de jornadas removido.')
  console.log('   Os links de convite continuam ativos (seed:convites-teste não é revertido).')
}

main()
  .catch((err) => {
    console.error('❌ Erro no reset:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
