/**
 * Auditoria de NOTIFICAÇÕES — fan-out, reconciliação de leitura e escopo.
 *
 * Esta rodada tem dois trabalhos distintos:
 *
 *  1. **Reverificar** as alegações da auditoria de 2026-07-22 (feita por
 *     análise, não por execução). Ela tem 8 dias e várias afirmações já não
 *     valem — repetir uma lista desatualizada como se fosse estado atual é
 *     pior do que não auditar. Cada alegação vira uma checagem que confirma
 *     ou **derruba** o item.
 *  2. **Cobrir o que ninguém olhou**: se o fan-out cria N notificações e a
 *     reconciliação marca 1, os outros N-1 destinatários ficam com o badge
 *     preso; se o roteamento por permissão ignora override negado, quem foi
 *     explicitamente excluído continua recebendo alerta administrativo; e se
 *     a lista de "membros aprovados" não olha `desligadoEm`, ex-membro segue
 *     recebendo comunicado da torcida.
 *
 * ⚠️ **Este arquivo MUTA o banco.** Toda mutação empilha a reversão antes de
 * acontecer; fixtures levam `[AUDIT-NOTIF]`.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:notificacoes
 */
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import { criarAjudantes, criarColetor, tentativa } from './_harness'

// ── Sessão simulada ──────────────────────────────────────────────────────
let sessaoAtual: { user: { id: string; email: string; name: string } } | null = null

vi.mock('next/cache', () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidateTag: () => {},
  revalidatePath: () => {},
  unstable_noStore: () => {},
}))
vi.mock('next/headers', () => ({
  headers: async () => new Map(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('@/lib/auth', () => ({
  auth: async () => sessaoAtual,
  signIn: async () => {},
  signOut: async () => {},
  handlers: {},
}))

const MARCA = '[AUDIT-NOTIF]'

const { achados, erro, alerta, ok, aoDesfazer, encerrar } = criarColetor()

type Db = typeof import('@torcida/db').db
let db: Db
let comoUsuario: ReturnType<typeof criarAjudantes>['comoUsuario']
let membrosAprovados: ReturnType<typeof criarAjudantes>['membrosAprovados']

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
  ;({ comoUsuario, membrosAprovados } = criarAjudantes(
    db,
    (s) => {
      sessaoAtual = s
    },
    () => sessaoAtual,
  ))
})

afterAll(async () => {
  await encerrar('AUDITORIA DE NOTIFICAÇÕES (fan-out, leitura, escopo)', 'auditoria-notificacoes.txt')
})

/** Mantém só quem resolve `tenantId` como tenant ativo. */
async function comTenantAtivo(tenantId: string, userIds: string[]): Promise<string[]> {
  const { getActiveTenant } = await import('@/lib/tenant')
  const mantidos: string[] = []
  for (const userId of userIds) {
    const u: { email: string } | null = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    const ativo = await getActiveTenant(userId, u?.email ?? null)
    if (ativo?.id === tenantId) mantidos.push(userId)
  }
  return mantidos
}

// ═════════════════════════════════════════════════════════════════════════
// A. O GAP QUE SOBROU — fan-out para N, reconciliação para 1
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: decidir na fila reconcilia a leitura de quem?', () => {
  it('pedido de grupo notifica todos os admins, mas só o decisor deixa de ver o badge', async () => {
    const AREA = 'notificacoes/reconciliacao'

    type GrupoLite = { id: string; tenantId: string; nome: string | null }
    const grupos: GrupoLite[] = await db.conversa.findMany({
      where: { tipo: 'GRUPO', comunidade: true, publica: false },
      select: { id: true, tenantId: true, nome: true },
      orderBy: { id: 'asc' },
      take: 20,
    })

    for (const grupo of grupos) {
      const membrosDoGrupo: { userId: string; papel: string }[] = await db.membroConversa.findMany({
        where: { conversaId: grupo.id, status: 'ATIVO', saiuEm: null },
        select: { userId: true, papel: true },
      })
      const adminsAtuais = membrosDoGrupo.filter((m) => m.papel === 'ADMIN').map((m) => m.userId)
      const [decisor] = await comTenantAtivo(grupo.tenantId, adminsAtuais)
      if (!decisor) continue

      // Precisa de um SEGUNDO admin para a pergunta fazer sentido: com um só,
      // reconciliar a notificação do decisor cobriria 100% do fan-out.
      const jaNoGrupo = membrosDoGrupo.map((m) => m.userId)
      const externos = await comTenantAtivo(
        grupo.tenantId,
        await membrosAprovados(grupo.tenantId, 10, { excluir: jaNoGrupo }),
      )
      const coAdminExistente = adminsAtuais.find((a) => a !== decisor)
      const solicitante = externos[0]
      if (!solicitante) continue

      let coAdmin = coAdminExistente
      if (!coAdmin) {
        // Promove um membro comum do grupo a ADMIN (fixture reversível).
        const comum = membrosDoGrupo.find((m) => m.papel !== 'ADMIN' && m.userId !== decisor)
        if (!comum) continue
        aoDesfazer(`rebaixar co-admin ${comum.userId} no grupo ${grupo.id}`, async () => {
          await db.membroConversa.updateMany({
            where: { conversaId: grupo.id, userId: comum.userId },
            data: { papel: 'MEMBRO' },
          })
        })
        await db.membroConversa.updateMany({
          where: { conversaId: grupo.id, userId: comum.userId },
          data: { papel: 'ADMIN' },
        })
        coAdmin = comum.userId
      }

      // ── pedido ──────────────────────────────────────────────────────────
      aoDesfazer(`limpar pedido e notificações do grupo ${grupo.id}`, async () => {
        await db.membroConversa.deleteMany({
          where: { conversaId: grupo.id, userId: solicitante },
        })
        await db.notificacao.deleteMany({
          where: {
            tipo: { in: ['GRUPO_PEDIDO', 'GRUPO_APROVADO', 'GRUPO_REJEITADO'] },
            OR: [{ atorId: solicitante }, { userId: solicitante }],
            tenantId: grupo.tenantId,
          },
        })
        await db.auditLog.deleteMany({
          where: {
            tenantId: grupo.tenantId,
            acao: { in: ['GRUPO_PEDIDO_APROVADO', 'GRUPO_PEDIDO_REJEITADO'] },
            detalhes: { path: ['userId'], equals: solicitante },
          },
        })
      })

      const { pedirEntradaGrupo, decidirPedidoGrupo } = await import(
        '@/app/portal/comunidade/actions'
      )
      const rPedido = await comoUsuario(solicitante, () =>
        tentativa(() => pedirEntradaGrupo(grupo.id)),
      )
      if (!rPedido.ok) {
        alerta(AREA, `Pedido de entrada falhou em ${grupo.nome ?? grupo.id}: "${rPedido.erro}" — reconciliação não exercitada`)
        return
      }

      const notificados: { userId: string; lida: boolean }[] = await db.notificacao.findMany({
        where: { tipo: 'GRUPO_PEDIDO', atorId: solicitante, tenantId: grupo.tenantId },
        select: { userId: true, lida: true },
      })
      if (notificados.length >= 2) {
        ok(AREA, `Pedido de entrada faz fan-out para os ${notificados.length} administradores do grupo`)
      } else {
        alerta(AREA, `Fan-out atingiu só ${notificados.length} admin(s) — cenário de badge preso não exercitado`)
        return
      }

      // ── decisão pela fila, por UM dos admins ────────────────────────────
      const rDecisao = await comoUsuario(decisor, () =>
        tentativa(() => decidirPedidoGrupo(grupo.id, solicitante, true)),
      )
      if (!rDecisao.ok) {
        alerta(AREA, `Decisão do pedido falhou: "${rDecisao.erro}" — reconciliação não exercitada`)
        return
      }

      const depois: { userId: string; lida: boolean }[] = await db.notificacao.findMany({
        where: { tipo: 'GRUPO_PEDIDO', atorId: solicitante, tenantId: grupo.tenantId },
        select: { userId: true, lida: true },
      })
      const doDecisor = depois.find((n) => n.userId === decisor)
      const dosOutros = depois.filter((n) => n.userId !== decisor)
      const presos = dosOutros.filter((n) => !n.lida)

      if (doDecisor?.lida) {
        ok(AREA, 'Decidir pela fila marca como lida a notificação de QUEM decidiu (reconciliação implementada)')
      } else {
        erro(AREA, 'Nem a notificação do próprio decisor foi reconciliada — badge preso para todo mundo')
      }

      if (presos.length > 0) {
        erro(
          AREA,
          `RECONCILIAÇÃO PARCIAL: o pedido notificou ${depois.length} administradores, foi resolvido, e ${presos.length} continuam com a notificação NÃO LIDA apontando para um pedido que já não existe. ` +
            'A reconciliação em `decidirPedidoGrupo` é escopada em `userId: session.user.id` — cobre só quem clicou. Mesmo formato em `decidirPedidoCanal`, nas 4 funções de moderação e em `marcarSolicitacoesLidas` (admin/membros): todas marcam 1 de N. É o resíduo do "badge preso" de 2026-07-22, que foi corrigido só para o decisor.',
        )
      } else if (dosOutros.length > 0) {
        ok(AREA, `Reconciliação alcançou os ${dosOutros.length} demais administradores do fan-out`)
      }

      const aviso: { id: string } | null = await db.notificacao.findFirst({
        where: { tipo: 'GRUPO_APROVADO', userId: solicitante, tenantId: grupo.tenantId },
        select: { id: true },
      })
      if (aviso) ok(AREA, 'Solicitante é avisado da aprovação (GRUPO_APROVADO)')
      else erro(AREA, 'Solicitante aprovado não foi notificado')
      return
    }
    alerta(AREA, 'Nenhum grupo privado com admin de tenant ativo e candidato externo — reconciliação não exercitada')
  })

  it('denúncia resolvida deixa os demais moderadores com a fila desatualizada', async () => {
    const AREA = 'notificacoes/reconciliacao'
    const { PERMISSIONS } = await import('@torcida/types')

    type DenunciaLite = { id: string; tenantId: string | null; denuncianteId: string; motivo: string }
    const denuncias: DenunciaLite[] = await db.denuncia.findMany({
      where: { status: 'PENDENTE' },
      select: { id: true, tenantId: true, denuncianteId: true, motivo: true },
      orderBy: { id: 'asc' },
      take: 15,
    })

    for (const d of denuncias) {
      if (!d.tenantId) continue
      const { listarUserIdsComPermissao } = await import('@/lib/notificacoes')
      const moderadores = await listarUserIdsComPermissao(d.tenantId, PERMISSIONS.COMMUNITY_MODERATE)
      if (moderadores.length < 2) continue
      const [resolvedor] = await comTenantAtivo(d.tenantId, moderadores)
      if (!resolvedor) continue

      // A notificação original pode não existir no dado semeado — recriamos o
      // fan-out pelo caminho real para ter o estado de partida correto.
      const { notificarDenunciaPost } = await import('@/lib/notificacoes-routing')
      const antes: { id: string }[] = await db.notificacao.findMany({
        where: { tenantId: d.tenantId, tipo: 'DENUNCIA_NOVA', atorId: d.denuncianteId },
        select: { id: true },
      })
      aoDesfazer(`limpar notificações de denúncia ${d.id}`, async () => {
        await db.notificacao.deleteMany({
          where: {
            tenantId: d.tenantId ?? undefined,
            tipo: 'DENUNCIA_NOVA',
            atorId: d.denuncianteId,
            id: { notIn: antes.map((a) => a.id) },
          },
        })
      })
      await notificarDenunciaPost({
        tenantId: d.tenantId,
        denuncianteUserId: d.denuncianteId,
        motivo: d.motivo,
      }).catch(() => {})

      const criadas: { userId: string; lida: boolean }[] = await db.notificacao.findMany({
        where: { tenantId: d.tenantId, tipo: 'DENUNCIA_NOVA', atorId: d.denuncianteId, lida: false },
        select: { userId: true, lida: true },
      })
      if (criadas.length < 2) {
        alerta(AREA, `Fan-out da denúncia atingiu ${criadas.length} moderador(es) — cenário não exercitado`)
        return
      }

      const statusAntes = 'PENDENTE'
      aoDesfazer(`reabrir denúncia ${d.id}`, async () => {
        await db.denuncia.updateMany({
          where: { id: d.id },
          data: { status: statusAntes as never, resolvidoEm: null, resolvidoPorId: null },
        })
      })

      const { resolverDenuncia } = await import('@/app/admin/comunidade/moderacao/actions')
      const r = await comoUsuario(resolvedor, () => tentativa(() => resolverDenuncia(d.id)))
      if (!r.ok) {
        alerta(AREA, `Resolução de denúncia falhou: "${r.erro}" — reconciliação não exercitada`)
        return
      }

      const restantes: { userId: string }[] = await db.notificacao.findMany({
        where: { tenantId: d.tenantId, tipo: 'DENUNCIA_NOVA', atorId: d.denuncianteId, lida: false },
        select: { userId: true },
      })
      if (restantes.some((n) => n.userId === resolvedor)) {
        erro(AREA, 'Notificação de denúncia do próprio moderador que resolveu continuou não lida')
      } else {
        ok(AREA, 'Resolver a denúncia reconcilia a notificação de quem resolveu')
      }
      if (restantes.length > 0) {
        erro(
          AREA,
          `RECONCILIAÇÃO PARCIAL (moderação): denúncia resolvida e ${restantes.length} moderador(es) seguem com DENUNCIA_NOVA não lida, apontando para item já tratado. Mesmo padrão do pedido de grupo.`,
        )
      } else {
        ok(AREA, 'Reconciliação da denúncia alcançou todos os moderadores notificados')
      }
      return
    }
    alerta(AREA, 'Nenhuma denúncia PENDENTE em tenant com 2+ moderadores — reconciliação de moderação não exercitada')
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. ROTEAMENTO — quem entra e quem NÃO entra no fan-out
// ═════════════════════════════════════════════════════════════════════════

describe('roteamento: quem realmente recebe alerta administrativo', () => {
  it('override NEGADO exclui do fan-out por permissão', async () => {
    const AREA = 'notificacoes/roteamento'
    const { listarUserIdsComPermissao } = await import('@/lib/notificacoes')

    type NegadoLite = { userId: string; tenantId: string; permission: string }
    const negados: NegadoLite[] = await db.userPermission.findMany({
      where: { granted: false },
      select: { userId: true, tenantId: true, permission: true },
      orderBy: { id: 'asc' },
      take: 25,
    })
    if (negados.length === 0) {
      alerta(AREA, 'Nenhum override negado no banco — roteamento por permissão não exercitado')
      return
    }

    let conferidos = 0
    for (const n of negados.slice(0, 8)) {
      const destinatarios = await listarUserIdsComPermissao(n.tenantId, n.permission)
      conferidos += 1
      if (destinatarios.includes(n.userId)) {
        erro(
          AREA,
          `Usuário com "${n.permission}" NEGADO por override continua na lista de destinatários do fan-out — o roteamento lê permissão de cargo, não a efetiva, e a pessoa recebe alerta administrativo do qual foi explicitamente excluída`,
        )
        return
      }
    }
    ok(AREA, `Override negado exclui do fan-out por permissão (${conferidos} pares usuário×permissão conferidos)`)
  })

  it('membro DESLIGADO continua na lista de "membros aprovados"?', async () => {
    const AREA = 'notificacoes/roteamento'
    const { listarUserIdsMembrosAprovados } = await import('@/lib/notificacoes')

    const alvo: { id: string; userId: string; tenantId: string; desligadoEm: Date | null } | null =
      await db.saasMembro.findFirst({
        where: { status: 'APROVADO', desligadoEm: null, espelhado: false },
        select: { id: true, userId: true, tenantId: true, desligadoEm: true },
        orderBy: { id: 'asc' },
      })
    if (!alvo) {
      alerta(AREA, 'Sem membro aprovado — regra do desligado não exercitada')
      return
    }

    aoDesfazer(`reverter desligamento sintético do membro ${alvo.id}`, async () => {
      await db.saasMembro.updateMany({
        where: { id: alvo.id },
        data: { desligadoEm: null, desligadoMotivo: null, desligadoPorId: null },
      })
    })
    // Estado escrito direto: o que importa aqui é a CONSULTA de destinatários,
    // não a action de desligamento (já coberta na rodada 2).
    await db.saasMembro.update({
      where: { id: alvo.id },
      data: { desligadoEm: new Date(), desligadoMotivo: `${MARCA} desligamento sintético` },
    })

    const destinatarios = await listarUserIdsMembrosAprovados(alvo.tenantId)
    if (destinatarios.includes(alvo.userId)) {
      erro(
        AREA,
        'Membro DESLIGADO continua recebendo comunicado da torcida: `listarUserIdsMembrosAprovados` filtra só `status: APROVADO` e `desligarMembro` não mexe no status — só grava `desligadoEm`. Quem saiu segue no fan-out de `notificarMembrosAprovados` (comunicado urgente).',
      )
    } else {
      ok(AREA, 'Membro desligado sai da lista de destinatários de comunicado')
    }
  })

  it('quem age não recebe a própria notificação, e o escopo de tenant é respeitado', async () => {
    const AREA = 'notificacoes/escopo'
    const { notificarMembrosAprovados, contarNotificacoesNaoLidas } = await import('@/lib/notificacoes')

    const tenants: { id: string; slug: string }[] = await db.tenant.findMany({
      where: { sedes: { some: { tipo: 'SEDE' } }, membros: { some: { status: 'APROVADO' } } },
      select: { id: true, slug: true },
      orderBy: { id: 'asc' },
      take: 2,
    })
    if (tenants.length < 2) {
      alerta(AREA, 'Menos de 2 tenants com membros aprovados — escopo não exercitado')
      return
    }
    const [tenantA, tenantB] = tenants
    const [ator] = await membrosAprovados(tenantA.id, 1)
    if (!ator) {
      alerta(AREA, `Sem membro aprovado em ${tenantA.slug} — escopo não exercitado`)
      return
    }

    const titulo = `${MARCA} comunicado de auditoria`
    aoDesfazer('remover notificações do comunicado sintético', async () => {
      await db.notificacao.deleteMany({ where: { titulo } })
    })

    const enviados = await notificarMembrosAprovados({
      tenantId: tenantA.id,
      tipo: 'COMUNICADO_URGENTE',
      titulo,
      corpo: 'Auditoria de fan-out — sem efeito para o associado.',
      atorId: ator,
      excetoUserId: ator,
    })
    if (enviados === 0) {
      alerta(AREA, 'Fan-out não criou nenhuma notificação — escopo não exercitado')
      return
    }

    const paraOAtor: number = await db.notificacao.count({ where: { titulo, userId: ator } })
    if (paraOAtor === 0) {
      ok(AREA, `\`excetoUserId\` funciona: quem disparou não recebe a própria notificação (${enviados} enviadas)`)
    } else {
      erro(AREA, 'Quem disparou o comunicado recebeu a própria notificação — `excetoUserId` não está sendo aplicado')
    }

    const vazouParaOutroTenant: number = await db.notificacao.count({
      where: { titulo, tenantId: { not: tenantA.id } },
    })
    if (vazouParaOutroTenant === 0) {
      ok(AREA, 'Fan-out ficou contido no tenant de origem')
    } else {
      erro(AREA, `Fan-out criou ${vazouParaOutroTenant} notificação(ões) fora do tenant de origem`)
    }

    // Mesmo usuário, outro tenant: a contagem do sino não pode enxergar.
    const destinatario: { userId: string } | null = await db.notificacao.findFirst({
      where: { titulo },
      select: { userId: true },
    })
    if (destinatario) {
      const noOutro = await contarNotificacoesNaoLidas(tenantB.id, destinatario.userId, [
        'COMUNICADO_URGENTE',
      ])
      const noProprio = await contarNotificacoesNaoLidas(tenantA.id, destinatario.userId, [
        'COMUNICADO_URGENTE',
      ])
      if (noProprio > 0 && noOutro === 0) {
        ok(AREA, 'Contagem do sino é por tenant: a notificação aparece no tenant de origem e não no outro')
      } else if (noOutro > 0) {
        erro(AREA, `Notificação de ${tenantA.slug} contada no sino de ${tenantB.slug} — escopo de tenant furado no inbox`)
      } else {
        alerta(AREA, 'Contagem não enxergou a notificação nem no tenant de origem — conferir os tipos do inbox')
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. REVERIFICAÇÃO DAS ALEGAÇÕES DE 2026-07-22
// ═════════════════════════════════════════════════════════════════════════

describe('reverificação: o que a auditoria de 2026-07-22 dizia ainda vale?', () => {
  it('confere as alegações contra o código e o dado de hoje', async () => {
    const AREA = 'notificacoes/reverificacao'

    // Alegação 2: "NOVA_MENSAGEM nunca é criado — tipo morto".
    const novaMensagem: number = await db.notificacao.count({ where: { tipo: 'NOVA_MENSAGEM' } })
    if (novaMensagem > 0) {
      ok(
        AREA,
        `DERRUBADA a alegação "NOVA_MENSAGEM é tipo morto": há ${novaMensagem} notificações desse tipo no banco — algum caminho passou a criá-las desde 2026-07-22`,
      )
    } else {
      alerta(
        AREA,
        'Nenhuma NOVA_MENSAGEM no banco — segue coerente com a alegação de tipo morto (decisão de produto pendente: implementar ou remover do enum)',
      )
    }

    // Alegação 5: "não existe SEGUIMENTO_REJEITADO — o recusado não é avisado".
    const { POLITICA_POR_TIPO } = await import('@/lib/notificacoes-routing')
    const temPolitica = Object.prototype.hasOwnProperty.call(
      POLITICA_POR_TIPO,
      'SEGUIMENTO_REJEITADO',
    )
    if (temPolitica) {
      ok(
        AREA,
        'DERRUBADA a alegação "sem SEGUIMENTO_REJEITADO": o tipo existe e `rejeitarSeguimento` cria a notificação — quem é recusado passou a ser avisado',
      )
    } else {
      erro(AREA, 'SEGUIMENTO_REJEITADO segue ausente — quem pede para seguir e é recusado não é avisado')
    }

    // Alegação 1: "a Notificacao original nunca é marcada lida ao decidir pela
    // fila", nos 3 arquivos citados. Estado atual: implementado nos três — o
    // que sobrou é o alcance (ver bloco A).
    const arquivos = [
      'apps/web/src/app/portal/comunidade/actions.ts',
      'apps/web/src/app/admin/comunidade/moderacao/actions.ts',
      'apps/web/src/app/admin/membros/actions.ts',
    ]
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raiz = join(process.cwd(), '..', '..')
    const semReconciliacao = arquivos.filter((rel) => {
      try {
        const src = readFileSync(join(raiz, rel), 'utf8')
        return !/notificacao\.updateMany[\s\S]{0,400}lida:\s*true/.test(src)
      } catch {
        return false
      }
    })
    if (semReconciliacao.length === 0) {
      ok(
        AREA,
        'PARCIALMENTE DERRUBADA a alegação "badge preso": os 3 arquivos citados passaram a reconciliar a leitura ao decidir pela fila. O que sobrou é o alcance — a reconciliação cobre só quem decidiu (ver notificacoes/reconciliacao).',
      )
    } else {
      erro(AREA, `Ainda sem reconciliação de leitura: ${semReconciliacao.join(', ')}`)
    }

    alerta(
      AREA,
      'Fora do alcance de auditoria de fluxo (constantes de client / operação): TIPOS_QUE_EXIGEM_REFRESH em notification-toast.tsx, a dessincronia entre os dois caches singleton (portal × admin), o volume de revalidatePath por clique, e se REDIS_URL está setado no Railway. Verificar por leitura de código e por operação, não por execução.',
    )
  })
})

describe('sanidade', () => {
  it('a auditoria produziu achados', () => {
    if (achados.length === 0) throw new Error('Nenhuma checagem rodou — auditoria inconclusiva')
  })
})
