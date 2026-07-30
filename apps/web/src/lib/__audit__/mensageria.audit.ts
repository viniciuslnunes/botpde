/**
 * Auditoria de MENSAGERIA / DM — segregação, bloqueio e solicitação.
 *
 * É a camada onde a regra mais delicada do produto foi especificada e nunca
 * testada com dado: **sócio de torcida rival não fala com sócio de torcida
 * rival** (`spec-onboarding` §3.2). Numa plataforma de organizadas isso não é
 * preferência de UX — é anti-infiltração.
 *
 * Diferença de método para as rodadas anteriores: DM **não é Server Action**,
 * é route handler (`app/api/conversas/**`, `app/api/usuarios/[id]/bloqueio`).
 * Os handlers são chamados aqui como funções, com `Request` sintético e
 * `params` como Promise — o mesmo contrato que o Next usa. O gate real
 * (`assertUsuarioMensageria` → `auth()`) continua rodando.
 *
 * `BloqueioUsuario` está **zerado** no banco: o próprio fluxo cria o estado,
 * exercita as duas direções e remove no fim.
 *
 * ⚠️ **Este arquivo MUTA o banco.** Reversão registrada antes de cada mutação.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:mensageria
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

/**
 * As rotas de mensageria resolvem o tenant pelo HOST (`assertUsuarioMensageria`),
 * não pelo vínculo — sem request HTTP isso devolve null e todo handler recusa
 * com "Não autenticado.", o que passaria por recusa de regra se a auditoria não
 * distinguisse. `null` mantém o comportamento real fora de `comoTenant`.
 */
let tenantSimulado: import('@torcida/db').Tenant | null = null
vi.mock('@/lib/tenant', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant')>()
  return {
    ...real,
    getTenantFromHost: async () => tenantSimulado ?? (await real.getTenantFromHost()),
  }
})

const MARCA = '[AUDIT-DM]'

const { achados, erro, alerta, ok, aoDesfazer, encerrar } = criarColetor()

type Db = typeof import('@torcida/db').db
let db: Db
let comoUsuario: ReturnType<typeof criarAjudantes>['comoUsuario']

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
  ;({ comoUsuario } = criarAjudantes(
    db,
    (s) => {
      sessaoAtual = s
    },
    () => sessaoAtual,
  ))
})

afterAll(async () => {
  await encerrar('AUDITORIA DE MENSAGERIA (segregação, bloqueio, solicitação)', 'auditoria-mensageria.txt')
})

/** Fixa o tenant que as rotas enxergam como "o host atual". */
async function comoTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const anterior = tenantSimulado
  tenantSimulado = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenantSimulado) throw new Error(`Tenant ${tenantId} não encontrado`)
  try {
    return await fn()
  } finally {
    tenantSimulado = anterior
  }
}

// ── Sujeitos ─────────────────────────────────────────────────────────────

type Socio = { userId: string; tenantId: string; slug: string; afiliacaoId: string | null }

/** Sócio aprovado e canônico de um tenant, com a afiliação do tenant junto. */
async function socioDe(slug: string): Promise<Socio | null> {
  const tenant: { id: string; slug: string; afiliacaoId: string | null } | null =
    await db.tenant.findFirst({
      where: { slug },
      select: { id: true, slug: true, afiliacaoId: true },
    })
  if (!tenant) return null
  const membro: { userId: string } | null = await db.saasMembro.findFirst({
    where: {
      tenantId: tenant.id,
      status: 'APROVADO',
      tipo: 'SOCIO',
      espelhado: false,
      desligadoEm: null,
    },
    select: { userId: true },
    orderBy: { id: 'asc' },
  })
  if (!membro) return null
  return {
    userId: membro.userId,
    tenantId: tenant.id,
    slug: tenant.slug,
    afiliacaoId: tenant.afiliacaoId,
  }
}

// ═════════════════════════════════════════════════════════════════════════
// A. SEGREGAÇÃO POR RIVALIDADE — a regra que nunca foi testada com dado
// ═════════════════════════════════════════════════════════════════════════

describe('segregação: sócio de torcida rival não abre DM', () => {
  it('par sócio×sócio de torcidas rivais é bloqueado nos dois sentidos', async () => {
    const AREA = 'dm/rivalidade'
    const { saoRivais } = await import('@torcida/types')
    const { getTenantRelation } = await import('@/lib/hierarquia')
    const { avaliarAcessoDm, criarDmComSolicitacao } = await import('@/lib/mensageria')

    // Corinthians × Palmeiras: rivalidade clássica, e os dois lados têm
    // várias unidades — a forma que expõe o Achado 9.
    const a = await socioDe('camisa-12-corinthians')
    const b = await socioDe('mancha-alviverde')
    if (!a || !b) {
      alerta(AREA, 'Sem par de sócios em torcidas rivais conhecidas — segregação não exercitada')
      return
    }

    const relacao = await getTenantRelation(a.tenantId, b.tenantId)
    const relacaoInversa = await getTenantRelation(b.tenantId, a.tenantId)

    const [acessoAB, acessoBA] = await Promise.all([
      avaliarAcessoDm(a.userId, b.userId, a.tenantId),
      avaliarAcessoDm(b.userId, a.userId, b.tenantId),
    ])

    if (acessoAB === 'bloqueado' && acessoBA === 'bloqueado') {
      ok(
        AREA,
        `Sócio de ${a.slug} e sócio de ${b.slug} não abrem DM em nenhum sentido (relação ${relacao}/${relacaoInversa})`,
      )
    } else {
      const propagaAchado9 = !saoRivais(relacao) || !saoRivais(relacaoInversa)
      erro(
        AREA,
        `SEGREGAÇÃO FURADA: sócio de ${a.slug} → sócio de ${b.slug} = "${acessoAB}", inverso = "${acessoBA}". ` +
          `A relação computada foi ${relacao}/${relacaoInversa}. ` +
          (propagaAchado9
            ? 'A relação NÃO saiu como rival — `isParRivalSocio` depende de `getTenantRelation`, que é o Achado 9 (parte de um nó arbitrário da árvore em torcida com várias unidades). O bug de hierarquia se propaga até a anti-infiltração: sócios de organizadas rivais conseguem se falar.'
            : 'A relação saiu como rival, mas o gate não bloqueou — o defeito está em `isParRivalSocio`/`avaliarAcessoDm`, não na hierarquia.'),
      )
    }

    // Chamada real: mesmo que a avaliação erre, a criação tem de recusar.
    const rDm = await comoUsuario(a.userId, () =>
      tentativa(() =>
        criarDmComSolicitacao(
          a.userId,
          b.userId,
          a.tenantId,
          `${MARCA} tentativa de contato entre rivais`,
          [],
          a.tenantId,
        ),
      ),
    )
    if (rDm.ok) {
      const criada = rDm.valor as { id: string }
      aoDesfazer(`remover DM indevida entre rivais ${criada.id}`, async () => {
        await db.mensagemDireta.deleteMany({ where: { conversaId: criada.id } })
        await db.membroConversa.deleteMany({ where: { conversaId: criada.id } })
        await db.conversa.deleteMany({ where: { id: criada.id } })
      })
      erro(
        AREA,
        `Conversa DIRETA foi CRIADA entre sócios de torcidas rivais (${a.slug} × ${b.slug}) — a anti-infiltração não segura na escrita, só (talvez) na leitura`,
      )
    } else {
      ok(AREA, `Criação de DM entre rivais recusada: "${rDm.erro}"`)
    }
  })

  it('par do mesmo tenant conversa direto (contraste)', async () => {
    const AREA = 'dm/rivalidade'
    const { avaliarAcessoDm } = await import('@/lib/mensageria')

    const tenant: { id: string; slug: string } | null = await db.tenant.findFirst({
      where: { slug: 'camisa-12-corinthians' },
      select: { id: true, slug: true },
    })
    if (!tenant) return
    const dois: { userId: string }[] = await db.saasMembro.findMany({
      where: {
        tenantId: tenant.id,
        status: 'APROVADO',
        tipo: 'SOCIO',
        espelhado: false,
        desligadoEm: null,
      },
      select: { userId: true },
      orderBy: { id: 'asc' },
      take: 2,
    })
    if (dois.length < 2) {
      alerta(AREA, `Menos de 2 sócios em ${tenant.slug} — contraste não exercitado`)
      return
    }

    const acesso = await avaliarAcessoDm(dois[0].userId, dois[1].userId, tenant.id)
    if (acesso === 'direto') {
      ok(AREA, `Dois sócios da mesma torcida conversam direto (contraste com o par rival)`)
    } else {
      alerta(
        AREA,
        `Sócios da MESMA torcida não conversam direto (acesso "${acesso}") — o contraste perde valor; conferir se há bloqueio ou solicitação pendente entre eles`,
      )
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. BLOQUEIO DE USUÁRIO — o fluxo cria o estado que o banco não tem
// ═════════════════════════════════════════════════════════════════════════

describe('bloqueio: uma direção basta para calar as duas', () => {
  it('bloquear pela rota fecha a DM nos dois sentidos e desbloquear reabre', async () => {
    const AREA = 'dm/bloqueio'
    const { avaliarAcessoDm, podeConvidarParaGrupoChat } = await import('@/lib/mensageria')

    const tenant: { id: string; slug: string } | null = await db.tenant.findFirst({
      where: { slug: 'camisa-12-corinthians' },
      select: { id: true, slug: true },
    })
    if (!tenant) return
    const dois: { userId: string }[] = await db.saasMembro.findMany({
      where: {
        tenantId: tenant.id,
        status: 'APROVADO',
        tipo: 'SOCIO',
        espelhado: false,
        desligadoEm: null,
      },
      select: { userId: true },
      orderBy: { id: 'asc' },
      take: 2,
    })
    if (dois.length < 2) {
      alerta(AREA, 'Menos de 2 sócios para exercitar bloqueio')
      return
    }
    const [bloqueador, bloqueado] = dois.map((d) => d.userId)

    const antes = await avaliarAcessoDm(bloqueador, bloqueado, tenant.id)
    if (antes === 'bloqueado') {
      alerta(AREA, 'Par já estava bloqueado antes do teste — bloqueio não exercitado')
      return
    }

    aoDesfazer(`remover bloqueio ${bloqueador} → ${bloqueado}`, async () => {
      await db.bloqueioUsuario.deleteMany({
        where: { bloqueadorId: bloqueador, bloqueadoId: bloqueado },
      })
      await db.auditLog.deleteMany({
        where: {
          tenantId: tenant.id,
          acao: 'USUARIO_BLOQUEADO_MENSAGERIA',
          entidadeId: bloqueado,
          atorId: bloqueador,
        },
      })
    })

    const rota = await import('@/app/api/usuarios/[id]/bloqueio/route')
    const req = () => new Request('https://local.invalid/api/usuarios/x/bloqueio', { method: 'POST' })

    const resp = await comoTenant(tenant.id, () =>
      comoUsuario(bloqueador, () => rota.POST(req(), { params: Promise.resolve({ id: bloqueado }) })),
    )
    const corpo = (await resp.json()) as { ok?: boolean; error?: string }
    if (!corpo.ok) {
      erro(AREA, `Rota de bloqueio recusou: "${corpo.error}"`)
      return
    }

    const gravado: { id: string } | null = await db.bloqueioUsuario.findFirst({
      where: { bloqueadorId: bloqueador, bloqueadoId: bloqueado },
      select: { id: true },
    })
    if (gravado) ok(AREA, 'Bloqueio persistido pela rota')
    else erro(AREA, 'Rota devolveu ok mas o bloqueio não foi persistido')

    const log: number = await db.auditLog.count({
      where: { acao: 'USUARIO_BLOQUEADO_MENSAGERIA', entidadeId: bloqueado, atorId: bloqueador },
    })
    if (log > 0) ok(AREA, 'Bloqueio gravou AuditLog')
    else erro(AREA, 'Bloqueio não gravou AuditLog')

    // A regra que importa: quem bloqueia e quem foi bloqueado, ambos calados.
    const [depoisAB, depoisBA] = await Promise.all([
      avaliarAcessoDm(bloqueador, bloqueado, tenant.id),
      avaliarAcessoDm(bloqueado, bloqueador, tenant.id),
    ])
    if (depoisAB === 'bloqueado' && depoisBA === 'bloqueado') {
      ok(AREA, 'Bloqueio em UMA direção fecha a DM nas DUAS — quem foi bloqueado também não alcança')
    } else {
      erro(
        AREA,
        `Bloqueio não é bidirecional: bloqueador→bloqueado = "${depoisAB}", bloqueado→bloqueador = "${depoisBA}" — quem foi bloqueado ainda alcança quem bloqueou`,
      )
    }

    const convite = await podeConvidarParaGrupoChat(bloqueador, bloqueado, tenant.id)
    if (!convite) {
      ok(AREA, 'Bloqueio também impede convite para grupo de chat (não dá para contornar a DM pelo grupo)')
    } else {
      erro(
        AREA,
        'Usuário bloqueado ainda pode ser convidado para grupo de chat — o bloqueio é contornável pelo grupo',
      )
    }

    // Desbloqueio devolve o estado anterior.
    const respDel = await comoTenant(tenant.id, () =>
      comoUsuario(bloqueador, () =>
        rota.DELETE(req(), { params: Promise.resolve({ id: bloqueado }) }),
      ),
    )
    const corpoDel = (await respDel.json()) as { ok?: boolean; error?: string }
    const acessoFinal = await avaliarAcessoDm(bloqueador, bloqueado, tenant.id)
    if (corpoDel.ok && acessoFinal === antes) {
      ok(AREA, `Desbloqueio devolve o acesso ao estado anterior ("${antes}")`)
    } else {
      erro(
        AREA,
        `Desbloqueio não restaurou o acesso: antes "${antes}", depois "${acessoFinal}" (resposta ${JSON.stringify(corpoDel)})`,
      )
    }
  })

  it('ninguém bloqueia a si mesmo', async () => {
    const AREA = 'dm/bloqueio'
    const alvo: { userId: string; tenantId: string } | null = await db.saasMembro.findFirst({
      where: { status: 'APROVADO', tipo: 'SOCIO', espelhado: false, desligadoEm: null },
      select: { userId: true, tenantId: true },
      orderBy: { id: 'asc' },
    })
    if (!alvo) return

    const rota = await import('@/app/api/usuarios/[id]/bloqueio/route')
    const resp = await comoTenant(alvo.tenantId, () =>
      comoUsuario(alvo.userId, () =>
        rota.POST(new Request('https://local.invalid/x', { method: 'POST' }), {
          params: Promise.resolve({ id: alvo.userId }),
        }),
      ),
    )
    const corpo = (await resp.json()) as { ok?: boolean; error?: string }
    if (corpo.ok) {
      aoDesfazer('remover autobloqueio', async () => {
        await db.bloqueioUsuario.deleteMany({
          where: { bloqueadorId: alvo.userId, bloqueadoId: alvo.userId },
        })
      })
      erro(AREA, 'Usuário conseguiu bloquear a si mesmo — cria estado sem sentido na mensageria')
    } else if (/si mesmo/i.test(corpo.error ?? '')) {
      ok(AREA, `Autobloqueio recusado pela regra certa: "${corpo.error}"`)
    } else {
      // Recusar por autenticação passaria por conformidade sem testar nada.
      alerta(
        AREA,
        `Autobloqueio recusado por outro motivo ("${corpo.error}") — a regra do autobloqueio não foi exercitada`,
      )
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. SOLICITAÇÃO DE DM — e o que acontece depois de recusar
// ═════════════════════════════════════════════════════════════════════════

describe('solicitação: falar com sócio de outra torcida passa por aprovação', () => {
  it('recusar a solicitação fecha a porta em definitivo', async () => {
    const AREA = 'dm/solicitacao'
    const {
      avaliarAcessoDm,
      criarDmComSolicitacao,
      rejeitarSolicitacaoMensagem,
      findDmEntreUsuarios,
    } = await import('@/lib/mensageria')

    // Par que exige solicitação: mesmo clube, torcidas diferentes (co-irmãs,
    // não rivais) — é o caminho `destSocio && mesmoClube`.
    const a = await socioDe('camisa-12-corinthians')
    const b = await socioDe('torcida-fiel-macabra-sp')
    if (!a || !b) {
      alerta(AREA, 'Sem par de sócios do mesmo clube em torcidas distintas — solicitação não exercitada')
      return
    }

    const jaExiste = await findDmEntreUsuarios(a.userId, b.userId)
    if (jaExiste) {
      alerta(AREA, 'Par já tem DM — solicitação não exercitada (o teste precisa começar do zero)')
      return
    }

    const acesso = await avaliarAcessoDm(a.userId, b.userId, a.tenantId)
    if (acesso === 'bloqueado') {
      alerta(AREA, `Par do mesmo clube saiu "bloqueado" — conferir relação entre ${a.slug} e ${b.slug}`)
      return
    }
    if (acesso !== 'solicitacao') {
      alerta(
        AREA,
        `Par saiu como "${acesso}" e não "solicitacao" — sócio de outra torcida do mesmo clube está com acesso direto; conferir se é intencional`,
      )
      return
    }
    ok(AREA, `Falar com sócio de outra torcida do mesmo clube exige solicitação (${a.slug} → ${b.slug})`)

    // A reversão NÃO pode depender de `findDmEntreUsuarios`: ele filtra por
    // status ATIVO/PENDENTE, e depois da recusa os dois lados ficam REJEITADO
    // — a busca devolve null e a limpeza não apagaria nada. Localiza pelos
    // participantes, e remove também o BloqueioUsuario que a recusa cria.
    aoDesfazer(`remover DM de solicitação entre ${a.userId} e ${b.userId}`, async () => {
      const conversas: { id: string }[] = await db.conversa.findMany({
        where: {
          tipo: 'DIRETA',
          AND: [
            { membros: { some: { userId: a.userId } } },
            { membros: { some: { userId: b.userId } } },
          ],
        },
        select: { id: true },
      })
      const ids = conversas.map((c) => c.id)
      if (ids.length > 0) {
        await db.mensagemDireta.deleteMany({ where: { conversaId: { in: ids } } })
        await db.membroConversa.deleteMany({ where: { conversaId: { in: ids } } })
        await db.conversa.deleteMany({ where: { id: { in: ids } } })
      }
      await db.bloqueioUsuario.deleteMany({
        where: {
          OR: [
            { bloqueadorId: a.userId, bloqueadoId: b.userId },
            { bloqueadorId: b.userId, bloqueadoId: a.userId },
          ],
        },
      })
    })

    const criada = await comoUsuario(a.userId, () =>
      tentativa(() =>
        criarDmComSolicitacao(
          a.userId,
          b.userId,
          a.tenantId,
          `${MARCA} pedido de contato`,
          [],
          a.tenantId,
        ),
      ),
    )
    if (!criada.ok) {
      erro(AREA, `Criação da solicitação falhou: "${criada.erro}"`)
      return
    }

    const dm = await findDmEntreUsuarios(a.userId, b.userId)
    const statusDestino = dm?.membros.find((m) => m.userId === b.userId)?.status
    const statusOrigem = dm?.membros.find((m) => m.userId === a.userId)?.status
    if (statusDestino === 'PENDENTE' && statusOrigem === 'ATIVO') {
      ok(AREA, 'Solicitação nasce com destinatário PENDENTE e remetente ATIVO')
    } else {
      erro(AREA, `Solicitação com status inesperado: origem ${statusOrigem}, destino ${statusDestino}`)
    }

    // Recusa: a regra forte é que recusar não deixa insistir.
    if (!dm) return
    const rRejeita = await comoUsuario(b.userId, () =>
      tentativa(() => rejeitarSolicitacaoMensagem(dm.id, b.userId)),
    )
    if (!rRejeita.ok) {
      erro(AREA, `Destinatário não conseguiu recusar a solicitação: "${rRejeita.erro}"`)
      return
    }

    // Regra forte, não óbvia pelo nome da função: recusar **bloqueia** o
    // remetente (`rejeitarSolicitacaoMensagem` faz upsert em BloqueioUsuario).
    const bloqueioDaRecusa: { id: string } | null = await db.bloqueioUsuario.findFirst({
      where: { bloqueadorId: b.userId, bloqueadoId: a.userId },
      select: { id: true },
    })
    if (bloqueioDaRecusa) {
      ok(AREA, 'Recusar a solicitação também grava BloqueioUsuario — a recusa vale como bloqueio, não só como "não agora"')
    } else {
      alerta(
        AREA,
        'Recusa não gravou BloqueioUsuario — o fechamento depende só do status REJEITADO da conversa, que é mais frágil',
      )
    }

    const acessoDepois = await avaliarAcessoDm(a.userId, b.userId, a.tenantId)
    if (acessoDepois === 'bloqueado') {
      ok(AREA, 'Solicitação recusada fecha a porta: o remetente não consegue reabrir nem insistir')
    } else {
      erro(
        AREA,
        `Após RECUSA a solicitação voltou a "${acessoDepois}" — quem foi recusado pode insistir, e a recusa vira só um incômodo`,
      )
    }

    const rInsiste = await comoUsuario(a.userId, () =>
      tentativa(() =>
        criarDmComSolicitacao(
          a.userId,
          b.userId,
          a.tenantId,
          `${MARCA} insistindo depois da recusa`,
          [],
          a.tenantId,
        ),
      ),
    )
    if (rInsiste.ok) {
      erro(AREA, 'Remetente recusado conseguiu criar/reabrir a conversa mesmo assim')
    } else {
      ok(AREA, `Insistir após recusa é recusado: "${rInsiste.erro}"`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// D. ESCOPO — quem não é da conversa não entra nela
// ═════════════════════════════════════════════════════════════════════════

describe('escopo: conversa alheia não se lê nem se escreve', () => {
  it('não-membro é barrado ao ler e ao enviar', async () => {
    const AREA = 'dm/escopo'
    const { assertMembroConversa, assertPodeEnviarNaConversa } = await import('@/lib/mensageria')

    type ConversaLite = { id: string; tenantId: string | null }
    const dm: ConversaLite | null = await db.conversa.findFirst({
      where: { tipo: 'DIRETA' },
      select: { id: true, tenantId: true },
      orderBy: { id: 'asc' },
    })
    if (!dm) {
      alerta(AREA, 'Nenhuma DM no banco — escopo não exercitado')
      return
    }
    const membros: { userId: string }[] = await db.membroConversa.findMany({
      where: { conversaId: dm.id },
      select: { userId: true },
    })
    const forasteiro: { userId: string } | null = await db.saasMembro.findFirst({
      where: {
        status: 'APROVADO',
        espelhado: false,
        userId: { notIn: membros.map((m) => m.userId) },
      },
      select: { userId: true },
      orderBy: { id: 'asc' },
    })
    if (!forasteiro) {
      alerta(AREA, 'Sem usuário fora da conversa — escopo não exercitado')
      return
    }

    const rLer = await tentativa(() => assertMembroConversa(dm.id, forasteiro.userId))
    if (rLer.ok) {
      erro(AREA, 'Usuário que não é membro da conversa passou no gate de leitura — DM alheia exposta')
    } else {
      ok(AREA, `Não-membro barrado na leitura da conversa: "${rLer.erro}"`)
    }

    const rEnviar = await tentativa(() => assertPodeEnviarNaConversa(dm.id, forasteiro.userId))
    if (rEnviar.ok) {
      erro(AREA, 'Usuário que não é membro conseguiu passar no gate de envio — dá para escrever em DM alheia')
    } else {
      ok(AREA, `Não-membro barrado no envio: "${rEnviar.erro}"`)
    }
  })
})

describe('sanidade', () => {
  it('a auditoria produziu achados', () => {
    if (achados.length === 0) throw new Error('Nenhuma checagem rodou — auditoria inconclusiva')
  })
})
