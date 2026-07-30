/**
 * Auditoria de FLUXOS AVANÇADOS — regras de negócio que nenhuma rodada
 * anterior exercitou.
 *
 * `fluxos.audit.ts` cobre o núcleo já conhecido (admissão, loja, aliança,
 * publicação, departamentos, canais). Aqui entram **camadas novas**, todas
 * escolhidas por serem regra de produto escrita em algum lugar e nunca
 * verificada com o código rodando:
 *
 *   A. Eventos — capacidade, lista de espera, promoção automática e a
 *      distinção "check-in ≠ confirmação de presença".
 *   B. Bar — o dinheiro que volta: estorno, fiado e fechamento de caixa,
 *      com o espelho no livro-caixa. Inclui o override de permissão como
 *      chave que destrava o Achado 1.
 *   C. RBAC — escalada de privilégio por cargo customizado, imutabilidade
 *      dos cargos de sistema e a precedência do override negado.
 *   D. Grupos — ciclo de vida do convite e a regra do último administrador.
 *
 * ⚠️ **Este arquivo MUTA o banco.** Cada mutação empilha sua reversão em
 * `aoDesfazer` ANTES de acontecer; o `afterAll` desfaz na ordem inversa.
 * Fixtures criadas por esta auditoria levam o prefixo `[AUDIT-FLUXO]` para
 * serem reconhecíveis caso a limpeza não complete.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:fluxos-avancados
 */
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import { criarAjudantes, criarColetor, tentativa } from './_harness'

// ── Sessão simulada ──────────────────────────────────────────────────────
// Mesmo contrato de `fluxos.audit.ts`: `assertPermission` resolve o tenant
// pelo vínculo do usuário, então basta trocar quem está "logado".
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

const MARCA = '[AUDIT-FLUXO]'

const { achados, erro, alerta, ok, aoDesfazer, encerrar } = criarColetor()

type Db = typeof import('@torcida/db').db
let db: Db
let comoUsuario: ReturnType<typeof criarAjudantes>['comoUsuario']
let atorComPermissao: ReturnType<typeof criarAjudantes>['atorComPermissao']
let permissoesEfetivas: ReturnType<typeof criarAjudantes>['permissoesEfetivas']
let membrosAprovados: ReturnType<typeof criarAjudantes>['membrosAprovados']

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
  ;({ comoUsuario, atorComPermissao, permissoesEfetivas, membrosAprovados } = criarAjudantes(
    db,
    (s) => {
      sessaoAtual = s
    },
    () => sessaoAtual,
  ))
})

afterAll(async () => {
  await encerrar('AUDITORIA DE FLUXOS AVANÇADOS (regras ainda não cobertas)', 'auditoria-fluxos-avancados.txt')
})

// ── Utilidades locais ────────────────────────────────────────────────────

/**
 * Filtra `userIds` mantendo só quem resolve ESTE tenant como ativo. Actions do
 * portal (`responderRsvp`, grupos) chamam `getActiveTenant` — quem tem outro
 * tenant ativo agiria na torcida errada e produziria um achado falso.
 */
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

/** Tenant de teste com massa de membros — o mesmo usado pela rodada anterior. */
async function tenantPorSlug(slug: string): Promise<{ id: string; slug: string } | null> {
  return db.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } })
}

const SLUG_PRINCIPAL = 'camisa-12-corinthians'
const SLUG_OUTRO = 'pavilhao-nove'

// ═════════════════════════════════════════════════════════════════════════
// A. EVENTOS — capacidade, lista de espera e presença
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: lotação, lista de espera e promoção automática', () => {
  it('confirmar em evento lotado cai na espera; sair promove o próximo', async () => {
    const AREA = 'eventos/lotacao'
    const tenant = await tenantPorSlug(SLUG_PRINCIPAL)
    if (!tenant) return

    const candidatos = await membrosAprovados(tenant.id, 12)
    const atores = (await comTenantAtivo(tenant.id, candidatos)).slice(0, 3)
    if (atores.length < 3) {
      alerta(AREA, `Menos de 3 membros aprovados com tenant ativo ${tenant.slug} — lotação não exercitada`)
      return
    }
    const [userA, userB, userC] = atores

    // Fixture determinística: capacidade 1 força o teto na segunda confirmação.
    // Usar evento semeado seria não-determinístico (RSVP real muda a conta).
    const evento: { id: string } = await db.evento.create({
      data: {
        tenantId: tenant.id,
        titulo: `${MARCA} lotação capacidade 1`,
        tipo: 'GERAL',
        data: new Date(Date.now() + 7 * 24 * 3600_000),
        capacidade: 1,
        local: 'Auditoria',
      },
      select: { id: true },
    })
    aoDesfazer(`remover evento de lotação ${evento.id}`, async () => {
      await db.eventoRsvp.deleteMany({ where: { eventoId: evento.id } })
      await db.evento.delete({ where: { id: evento.id } })
    })

    const { responderRsvp } = await import('@/app/portal/eventos/actions')

    const rA = await comoUsuario(userA, () => tentativa(() => responderRsvp(evento.id, 'CONFIRMADO')))
    if (!rA.ok || rA.valor.ok !== true || rA.valor.status !== 'CONFIRMADO') {
      erro(AREA, `Primeiro a confirmar não ficou CONFIRMADO em evento com 1 vaga: ${JSON.stringify(rA)}`)
      return
    }
    ok(AREA, 'Primeiro a responder ocupa a única vaga e fica CONFIRMADO')

    const rB = await comoUsuario(userB, () => tentativa(() => responderRsvp(evento.id, 'CONFIRMADO')))
    if (rB.ok && rB.valor.ok === true && rB.valor.status === 'LISTA_ESPERA') {
      ok(AREA, 'Confirmar em evento lotado devolve LISTA_ESPERA em vez de estourar a capacidade')
    } else {
      erro(AREA, `Evento lotado aceitou confirmação além da capacidade: ${JSON.stringify(rB)}`)
    }

    // Vaga liberada → `promoverProximoDaEspera` deve puxar o mais antigo da fila.
    const rSaida = await comoUsuario(userA, () => tentativa(() => responderRsvp(evento.id, 'RECUSADO')))
    if (!rSaida.ok) {
      erro(AREA, `Confirmado não conseguiu recusar depois: "${rSaida.erro}"`)
      return
    }
    const statusB: { status: string } | null = await db.eventoRsvp.findUnique({
      where: { eventoId_userId: { eventoId: evento.id, userId: userB } },
      select: { status: true },
    })
    if (statusB?.status === 'CONFIRMADO') {
      ok(AREA, 'Saída de um confirmado promoveu automaticamente o primeiro da lista de espera')
    } else {
      erro(AREA, `Vaga liberada NÃO promoveu quem estava na espera (status ficou ${statusB?.status ?? 'sem RSVP'})`)
    }

    // Com a vaga já reocupada por B, promover manualmente não pode furar o teto.
    const rC = await comoUsuario(userC, () => tentativa(() => responderRsvp(evento.id, 'CONFIRMADO')))
    if (!rC.ok || rC.valor.ok !== true || rC.valor.status !== 'LISTA_ESPERA') {
      alerta(AREA, `Terceiro membro não entrou na espera como esperado: ${JSON.stringify(rC)} — promoção manual não exercitada`)
      return
    }

    const gestor = await atorComPermissao(
      tenant.id,
      (await import('@torcida/types')).PERMISSIONS.EVENTS_MANAGE,
    )
    if (!gestor) {
      alerta(AREA, `Ninguém com events:manage e tenant ativo ${tenant.slug} — promoção manual não exercitada`)
      return
    }

    const { promoverDaListaEspera } = await import('@/app/admin/eventos/actions')
    const rPromo = await comoUsuario(gestor, () =>
      tentativa(() => promoverDaListaEspera(evento.id, userC)),
    )
    if (rPromo.ok) {
      erro(AREA, 'promoverDaListaEspera confirmou alguém com a lotação já cheia — capacidade furada pelo admin')
    } else if (/lota/i.test(rPromo.erro)) {
      ok(AREA, `Promoção manual barrada com lotação cheia: "${rPromo.erro}"`)
    } else {
      alerta(AREA, `Promoção manual falhou por outro motivo: "${rPromo.erro}"`)
    }

    // Quem recusou não está na espera. A action checa lotação ANTES do estado
    // do RSVP, então sem abrir vaga o teste mediria a checagem errada.
    await db.evento.update({ where: { id: evento.id }, data: { capacidade: 10 } })
    const rPromoA = await comoUsuario(gestor, () =>
      tentativa(() => promoverDaListaEspera(evento.id, userA)),
    )
    if (rPromoA.ok) {
      erro(AREA, 'promoverDaListaEspera promoveu quem tinha RECUSADO — estado do RSVP não é conferido')
    } else if (/espera/i.test(rPromoA.erro)) {
      ok(AREA, `Promoção recusada para quem não está na lista de espera: "${rPromoA.erro}"`)
    } else {
      alerta(AREA, `Promoção de quem recusou falhou por outro motivo: "${rPromoA.erro}"`)
    }
  })

  it('RSVP recusa evento já encerrado e evento de outra torcida', async () => {
    const AREA = 'eventos/escopo'
    const tenant = await tenantPorSlug(SLUG_PRINCIPAL)
    const outro = await tenantPorSlug(SLUG_OUTRO)
    if (!tenant || !outro) return

    const atores = await comTenantAtivo(tenant.id, await membrosAprovados(tenant.id, 8))
    const ator = atores[0]
    if (!ator) {
      alerta(AREA, `Sem membro aprovado com tenant ativo ${tenant.slug} — escopo de RSVP não exercitado`)
      return
    }

    const passado: { id: string } = await db.evento.create({
      data: {
        tenantId: tenant.id,
        titulo: `${MARCA} evento encerrado`,
        tipo: 'GERAL',
        data: new Date(Date.now() - 30 * 24 * 3600_000),
      },
      select: { id: true },
    })
    aoDesfazer(`remover evento passado ${passado.id}`, async () => {
      await db.eventoRsvp.deleteMany({ where: { eventoId: passado.id } })
      await db.evento.delete({ where: { id: passado.id } })
    })

    const alheio: { id: string } = await db.evento.create({
      data: {
        tenantId: outro.id,
        titulo: `${MARCA} evento de outra torcida`,
        tipo: 'GERAL',
        data: new Date(Date.now() + 7 * 24 * 3600_000),
      },
      select: { id: true },
    })
    aoDesfazer(`remover evento de outro tenant ${alheio.id}`, async () => {
      await db.eventoRsvp.deleteMany({ where: { eventoId: alheio.id } })
      await db.evento.delete({ where: { id: alheio.id } })
    })

    const { responderRsvp } = await import('@/app/portal/eventos/actions')

    const rPassado = await comoUsuario(ator, () => tentativa(() => responderRsvp(passado.id, 'CONFIRMADO')))
    if (rPassado.ok) {
      erro(AREA, 'RSVP aceito em evento com data no passado — agenda aceita confirmação retroativa')
    } else if (/encerrad/i.test(rPassado.erro)) {
      ok(AREA, `Evento passado recusa RSVP: "${rPassado.erro}"`)
    } else {
      alerta(AREA, `RSVP em evento passado falhou por outro motivo: "${rPassado.erro}"`)
    }

    const rAlheio = await comoUsuario(ator, () => tentativa(() => responderRsvp(alheio.id, 'CONFIRMADO')))
    if (rAlheio.ok) {
      erro(AREA, 'Membro confirmou presença em evento de OUTRA torcida — escopo de tenant furado no RSVP')
    } else if (/não encontrado/i.test(rAlheio.erro)) {
      ok(AREA, `Evento de outra torcida invisível para o RSVP: "${rAlheio.erro}"`)
    } else {
      alerta(AREA, `RSVP cross-tenant falhou por outro motivo: "${rAlheio.erro}"`)
    }
  })

  it('check-in é independente do RSVP: registra presença de quem nunca confirmou', async () => {
    const AREA = 'eventos/checkin'
    const tenant = await tenantPorSlug(SLUG_PRINCIPAL)
    if (!tenant) return

    const gestor = await atorComPermissao(
      tenant.id,
      (await import('@torcida/types')).PERMISSIONS.EVENTS_MANAGE,
    )
    if (!gestor) {
      alerta(AREA, `Ninguém com events:manage e tenant ativo ${tenant.slug} — check-in não exercitado`)
      return
    }
    const [alvo] = await membrosAprovados(tenant.id, 1, { excluir: [gestor] })
    if (!alvo) {
      alerta(AREA, `Sem membro aprovado distinto do gestor em ${tenant.slug} — check-in não exercitado`)
      return
    }

    const evento: { id: string } = await db.evento.create({
      data: {
        tenantId: tenant.id,
        titulo: `${MARCA} check-in sem RSVP`,
        tipo: 'ENSAIO',
        data: new Date(Date.now() + 3 * 24 * 3600_000),
      },
      select: { id: true },
    })
    aoDesfazer(`remover evento de check-in ${evento.id}`, async () => {
      await db.eventoRsvp.deleteMany({ where: { eventoId: evento.id } })
      await db.auditLog.deleteMany({
        where: { entidade: 'EventoRsvp', entidadeId: evento.id, tenantId: tenant.id },
      })
      await db.evento.delete({ where: { id: evento.id } })
    })

    const { registrarCheckIn } = await import('@/app/admin/eventos/actions')
    const r = await comoUsuario(gestor, () => tentativa(() => registrarCheckIn(evento.id, alvo)))
    if (!r.ok) {
      erro(AREA, `Check-in de quem não confirmou falhou: "${r.erro}" — a regra documentada é upsert`)
      return
    }

    const rsvp: { status: string; checkedInAt: Date | null; checkedInPorId: string | null } | null =
      await db.eventoRsvp.findUnique({
        where: { eventoId_userId: { eventoId: evento.id, userId: alvo } },
        select: { status: true, checkedInAt: true, checkedInPorId: true },
      })
    if (rsvp?.checkedInAt && rsvp.status === 'CONFIRMADO' && rsvp.checkedInPorId === gestor) {
      ok(AREA, 'Check-in criou RSVP CONFIRMADO com carimbo de quem registrou, mesmo sem confirmação prévia')
    } else {
      erro(AREA, `Check-in não projetou o RSVP esperado: ${JSON.stringify(rsvp)}`)
    }

    const log: number = await db.auditLog.count({
      where: { tenantId: tenant.id, acao: 'EVENTO_CHECKIN', entidadeId: evento.id },
    })
    if (log > 0) ok(AREA, 'Check-in gravou AuditLog (EVENTO_CHECKIN)')
    else erro(AREA, 'Check-in não gravou AuditLog — mutação administrativa sem rastro')
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. BAR — o dinheiro que volta (estorno, fiado, caixa)
// ═════════════════════════════════════════════════════════════════════════

type ContextoBar = {
  tenantId: string
  slug: string
  operador: string
  sedeId: string
  /** Preenchido quando destravamos o operador por override — reversível. */
  overrideConcedido: boolean
}

/**
 * Monta um operador com `bar:manage` de verdade. O Achado 1 deixa o
 * Presidente sem a permissão na maioria das torcidas; aqui concedemos um
 * `UserPermission` override (revertido no fim) — o que, de quebra, exercita a
 * regra "override concede o que o cargo não dá".
 */
async function contextoBar(): Promise<ContextoBar | null> {
  const { PERMISSIONS } = await import('@torcida/types')
  const { resolveUnidadeBar } = await import('@/lib/bar')

  const tenantsComVenda: { tenantId: string }[] = await db.barVenda.groupBy({
    by: ['tenantId'],
    _count: true,
  })

  for (const { tenantId } of tenantsComVenda) {
    const tenant: { id: string; slug: string } | null = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true },
    })
    if (!tenant) continue

    // Preferir quem JÁ tem a permissão; só então destravar alguém por override.
    let operador = await atorComPermissao(tenantId, PERMISSIONS.BAR_MANAGE)
    let overrideConcedido = false

    if (!operador) {
      const candidato = await atorComPermissao(tenantId, PERMISSIONS.ROLES_MANAGE)
      if (!candidato) continue
      const jaTem: { id: string } | null = await db.userPermission.findFirst({
        where: { userId: candidato, tenantId, permission: PERMISSIONS.BAR_MANAGE },
        select: { id: true },
      })
      if (jaTem) continue
      const criado: { id: string } = await db.userPermission.create({
        data: { userId: candidato, tenantId, permission: PERMISSIONS.BAR_MANAGE, granted: true },
        select: { id: true },
      })
      aoDesfazer(`remover override bar:manage de ${candidato}`, async () => {
        await db.userPermission.deleteMany({ where: { id: criado.id } })
      })
      operador = candidato
      overrideConcedido = true
    }

    const unidade = await resolveUnidadeBar(tenantId, operador)
    if (!unidade) continue
    return { tenantId, slug: tenant.slug, operador, sedeId: unidade.id, overrideConcedido }
  }
  return null
}

describe('fluxo: estorno de venda do bar devolve estoque e espelha no caixa', () => {
  it('venda PAGA estornada volta ao estoque, gera DESPESA espelho e é idempotente', async () => {
    const AREA = 'bar/estorno'
    const ctx = await contextoBar()
    if (!ctx) {
      alerta(AREA, 'Nenhum tenant com venda de bar e operador elegível — estorno não exercitado')
      return
    }
    if (ctx.overrideConcedido) {
      ok(
        'rbac/override',
        `Override UserPermission(granted) destravou bar:manage em ${ctx.slug} onde o cargo de sistema não dá — confirma a chave do Achado 1`,
      )
    }

    type VendaLite = {
      id: string
      status: string
      total: unknown
      financeiroLancamentoId: string | null
      financeiroEstornoLancamentoId: string | null
      itens: { produtoId: string | null; quantidade: number }[]
    }
    const venda: VendaLite | null = await db.barVenda.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sedeId: ctx.sedeId,
        status: 'PAGA',
        metodoPagamento: { not: 'FIADO' },
        financeiroEstornoLancamentoId: null,
        itens: { some: { produtoId: { not: null } } },
      },
      select: {
        id: true,
        status: true,
        total: true,
        financeiroLancamentoId: true,
        financeiroEstornoLancamentoId: true,
        itens: { select: { produtoId: true, quantidade: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    if (!venda) {
      alerta(AREA, `Sem venda PAGA não-fiado na unidade de ${ctx.slug} — estorno não exercitado`)
      return
    }

    const produtoIds = venda.itens.map((i) => i.produtoId).filter((id): id is string => Boolean(id))
    const estoqueAntes = new Map<string, number>()
    for (const p of await db.barProduto.findMany({
      where: { id: { in: produtoIds } },
      select: { id: true, estoque: true },
    })) {
      estoqueAntes.set(p.id, p.estoque)
    }

    // Reversão registrada ANTES da mutação, com o estado já capturado.
    const snapshot = {
      status: venda.status,
      financeiroEstornoLancamentoId: venda.financeiroEstornoLancamentoId,
    }
    aoDesfazer(`reverter estorno da venda ${venda.id}`, async () => {
      const atual: { financeiroEstornoLancamentoId: string | null } | null =
        await db.barVenda.findUnique({
          where: { id: venda.id },
          select: { financeiroEstornoLancamentoId: true },
        })
      await db.barVenda.update({
        where: { id: venda.id },
        data: {
          status: snapshot.status as never,
          financeiroEstornoLancamentoId: snapshot.financeiroEstornoLancamentoId,
        },
      })
      if (atual?.financeiroEstornoLancamentoId && !snapshot.financeiroEstornoLancamentoId) {
        await db.financeiroLancamento.deleteMany({
          where: { id: atual.financeiroEstornoLancamentoId },
        })
      }
      await db.barMovimentacaoEstoque.deleteMany({
        where: { vendaId: venda.id, motivo: { contains: MARCA } },
      })
      for (const [produtoId, estoque] of estoqueAntes) {
        await db.barProduto.update({ where: { id: produtoId }, data: { estoque } })
      }
    })

    const { estornarVendaBar } = await import('@/app/admin/bar/actions')
    const r = await comoUsuario(ctx.operador, () =>
      tentativa(() => estornarVendaBar({ vendaId: venda.id, motivo: `${MARCA} auditoria de estorno` })),
    )
    if (!r.ok) {
      erro(AREA, `Estorno de venda PAGA recusado: "${r.erro}"`)
      return
    }

    const depois: { status: string; financeiroEstornoLancamentoId: string | null } | null =
      await db.barVenda.findUnique({
        where: { id: venda.id },
        select: { status: true, financeiroEstornoLancamentoId: true },
      })
    if (depois?.status === 'ESTORNADA') ok(AREA, 'Venda passou a ESTORNADA')
    else erro(AREA, `Venda não ficou ESTORNADA após o estorno (status ${depois?.status})`)

    let estoqueOk = true
    for (const item of venda.itens) {
      if (!item.produtoId) continue
      const atual: { estoque: number } | null = await db.barProduto.findUnique({
        where: { id: item.produtoId },
        select: { estoque: true },
      })
      const esperado = (estoqueAntes.get(item.produtoId) ?? 0) + item.quantidade
      if (atual?.estoque !== esperado) {
        estoqueOk = false
        erro(
          AREA,
          `Estoque do produto ${item.produtoId} não voltou: ${estoqueAntes.get(item.produtoId)} → ${atual?.estoque} (esperado ${esperado})`,
        )
      }
    }
    if (estoqueOk) ok(AREA, `Estorno devolveu ao estoque as ${venda.itens.length} linha(s) da venda`)

    // Espelho no livro-caixa só quando houve RECEITA — a regra está na action.
    if (venda.financeiroLancamentoId) {
      if (depois?.financeiroEstornoLancamentoId) {
        const lanc: { tipo: string; categoria: string } | null =
          await db.financeiroLancamento.findUnique({
            where: { id: depois.financeiroEstornoLancamentoId },
            select: { tipo: true, categoria: true },
          })
        if (lanc?.tipo === 'DESPESA' && lanc.categoria === 'BAR') {
          ok(AREA, 'Estorno espelhou DESPESA/BAR no livro-caixa, ligada à venda')
        } else {
          erro(AREA, `Lançamento de estorno com tipo/categoria inesperados: ${JSON.stringify(lanc)}`)
        }
      } else {
        erro(AREA, 'Venda tinha RECEITA no caixa mas o estorno não gerou a DESPESA espelho')
      }
    } else {
      ok(AREA, 'Venda sem RECEITA no caixa não gerou DESPESA espelho (regra do fiado em aberto)')
    }

    // Segunda chamada não pode duplicar DESPESA nem estoque.
    const estoqueApos = new Map<string, number>()
    for (const p of await db.barProduto.findMany({
      where: { id: { in: produtoIds } },
      select: { id: true, estoque: true },
    })) {
      estoqueApos.set(p.id, p.estoque)
    }
    const r2 = await comoUsuario(ctx.operador, () =>
      tentativa(() => estornarVendaBar({ vendaId: venda.id, motivo: `${MARCA} repetição` })),
    )
    const lancamentosEstorno: number = await db.financeiroLancamento.count({
      where: { tenantId: ctx.tenantId, observacao: { contains: `Estorno venda ${venda.id}` } },
    })
    let duplicouEstoque = false
    for (const p of await db.barProduto.findMany({
      where: { id: { in: produtoIds } },
      select: { id: true, estoque: true },
    })) {
      if (p.estoque !== estoqueApos.get(p.id)) duplicouEstoque = true
    }
    if (duplicouEstoque || lancamentosEstorno > 1) {
      erro(
        AREA,
        `Estorno repetido não é idempotente (lançamentos de estorno: ${lancamentosEstorno}, estoque alterado: ${duplicouEstoque})`,
      )
    } else if (r2.ok) {
      ok(AREA, 'Estorno repetido é idempotente: sem duplicar DESPESA nem devolver estoque de novo')
    } else {
      ok(AREA, `Estorno repetido recusado: "${r2.erro}"`)
    }
  })

  it('venda no fiado em aberto não pode ser estornada — o caminho é cancelar o fiado', async () => {
    const AREA = 'bar/fiado'
    const ctx = await contextoBar()
    if (!ctx) return

    const venda: { id: string } | null = await db.barVenda.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sedeId: ctx.sedeId,
        status: 'PAGA',
        metodoPagamento: 'FIADO',
        fiado: { status: { in: ['PENDENTE', 'VENCIDA'] } },
      },
      select: { id: true },
    })
    if (!venda) {
      alerta(AREA, `Sem venda no fiado em aberto na unidade de ${ctx.slug} — regra do fiado não exercitada`)
      return
    }

    const { estornarVendaBar } = await import('@/app/admin/bar/actions')
    const r = await comoUsuario(ctx.operador, () =>
      tentativa(() => estornarVendaBar({ vendaId: venda.id, motivo: `${MARCA} tentativa de estorno` })),
    )
    if (r.ok) {
      erro(
        AREA,
        'Fiado EM ABERTO foi estornado: gera DESPESA sem RECEITA correspondente e desequilibra o livro-caixa',
      )
    } else if (/fiado em aberto/i.test(r.erro)) {
      ok(AREA, `Fiado em aberto barrado no estorno com o encaminhamento certo: "${r.erro}"`)
    } else {
      alerta(AREA, `Estorno de fiado em aberto falhou por outro motivo: "${r.erro}"`)
    }
  })

  it('quitar fiado cria RECEITA no caixa e liga a venda ao lançamento', async () => {
    const AREA = 'bar/fiado'
    const ctx = await contextoBar()
    if (!ctx) return

    type FiadoLite = { id: string; vendaId: string; status: string; financeiroLancamentoId: string | null }
    const fiado: FiadoLite | null = await db.barFiado.findFirst({
      where: { tenantId: ctx.tenantId, sedeId: ctx.sedeId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      select: { id: true, vendaId: true, status: true, financeiroLancamentoId: true },
    })
    if (!fiado) {
      alerta(AREA, `Sem fiado pendente na unidade de ${ctx.slug} — quitação não exercitada`)
      return
    }

    const vendaAntes: { financeiroLancamentoId: string | null } | null = await db.barVenda.findUnique({
      where: { id: fiado.vendaId },
      select: { financeiroLancamentoId: true },
    })
    aoDesfazer(`reverter quitação do fiado ${fiado.id}`, async () => {
      const atual: { financeiroLancamentoId: string | null } | null = await db.barFiado.findUnique({
        where: { id: fiado.id },
        select: { financeiroLancamentoId: true },
      })
      await db.barFiado.update({
        where: { id: fiado.id },
        data: {
          status: fiado.status as never,
          pagoEm: null,
          metodoPagamentoQuitacao: null,
          financeiroLancamentoId: fiado.financeiroLancamentoId,
        },
      })
      await db.barVenda.update({
        where: { id: fiado.vendaId },
        data: { financeiroLancamentoId: vendaAntes?.financeiroLancamentoId ?? null },
      })
      if (atual?.financeiroLancamentoId && atual.financeiroLancamentoId !== fiado.financeiroLancamentoId) {
        await db.financeiroLancamento.deleteMany({ where: { id: atual.financeiroLancamentoId } })
      }
    })

    const form = new FormData()
    form.set('fiadoId', fiado.id)
    form.set('metodoPagamento', 'DINHEIRO')

    const { quitarFiadoBar } = await import('@/app/admin/bar/actions')
    const r = await comoUsuario(ctx.operador, () => tentativa(() => quitarFiadoBar({}, form)))
    if (!r.ok) {
      erro(AREA, `Quitação de fiado pendente recusada: "${r.erro}"`)
      return
    }

    const depois: { status: string; financeiroLancamentoId: string | null; pagoEm: Date | null } | null =
      await db.barFiado.findUnique({
        where: { id: fiado.id },
        select: { status: true, financeiroLancamentoId: true, pagoEm: true },
      })
    if (depois?.status !== 'PAGA' || !depois.pagoEm) {
      erro(AREA, `Fiado não ficou PAGA com data de pagamento: ${JSON.stringify(depois)}`)
      return
    }
    ok(AREA, 'Fiado quitado vira PAGA com data de pagamento e método registrado')

    const lanc: { tipo: string; categoria: string } | null = depois.financeiroLancamentoId
      ? await db.financeiroLancamento.findUnique({
          where: { id: depois.financeiroLancamentoId },
          select: { tipo: true, categoria: true },
        })
      : null
    if (lanc?.tipo === 'RECEITA' && lanc.categoria === 'BAR') {
      ok(AREA, 'Quitação lançou RECEITA/BAR no livro-caixa — só aí o dinheiro entra')
    } else {
      erro(AREA, `Quitação não gerou RECEITA/BAR no caixa: ${JSON.stringify(lanc)}`)
    }

    const vendaDepois: { financeiroLancamentoId: string | null } | null = await db.barVenda.findUnique({
      where: { id: fiado.vendaId },
      select: { financeiroLancamentoId: true },
    })
    if (vendaDepois?.financeiroLancamentoId === depois.financeiroLancamentoId) {
      ok(AREA, 'Venda do fiado passou a apontar para o lançamento da quitação (estorno futuro tem espelho)')
    } else {
      erro(AREA, 'Venda do fiado não foi ligada ao lançamento da quitação — estorno posterior ficaria sem DESPESA')
    }
  })

  it('fechar caixa com venda PIX pendente é barrado', async () => {
    const AREA = 'bar/caixa'
    const ctx = await contextoBar()
    if (!ctx) return

    const { getTurnoAbertoBar } = await import('@/lib/bar')
    const turno = await getTurnoAbertoBar(ctx.tenantId, ctx.sedeId)
    if (!turno) {
      alerta(AREA, `Sem turno aberto na unidade de ${ctx.slug} — fechamento de caixa não exercitado`)
      return
    }

    const pendentes: number = await db.barVenda.count({
      where: { tenantId: ctx.tenantId, sedeId: ctx.sedeId, turnoId: turno.id, status: 'PENDENTE' },
    })

    // Marco para a limpeza não tocar em notificação anterior à auditoria.
    const marcoTempo = new Date()
    const { fecharTurnoBar } = await import('@/app/admin/bar/actions')
    const r = await comoUsuario(ctx.operador, () =>
      tentativa(() =>
        fecharTurnoBar({ dinheiroContado: 0, sangria: 0, observacao: `${MARCA} tentativa de fechamento` }),
      ),
    )

    if (pendentes > 0) {
      if (r.ok) {
        erro(AREA, `Turno fechado com ${pendentes} venda(s) PIX pendente(s) — caixa fecha com dinheiro em trânsito`)
      } else if (/pendente/i.test(r.erro)) {
        ok(AREA, `Fechamento barrado por venda pendente: "${r.erro}"`)
      } else {
        alerta(AREA, `Fechamento falhou por outro motivo: "${r.erro}"`)
      }
      return
    }

    // Sem pendências, o turno realmente fecha — precisa ser revertido.
    if (r.ok) {
      aoDesfazer(`reabrir turno de caixa ${turno.id}`, async () => {
        await db.barCaixaTurno.update({
          where: { id: turno.id },
          data: {
            fechadoEm: null,
            // FK com relação declarada: `fechadoPorId: null` é argumento
            // desconhecido para o Prisma — tem de ser `disconnect`.
            fechadoPor: { disconnect: true },
            dinheiroContado: null,
            sangria: 0,
            observacao: null,
            dinheiroEsperado: null,
            diferenca: null,
            divergenciaAlta: false,
          },
        })
        await db.auditLog.deleteMany({
          where: { acao: 'BAR_TURNO_FECHADO', entidadeId: turno.id, tenantId: ctx.tenantId },
        })
        // O fechamento com divergência dispara fan-out de notificação.
        await db.notificacao.deleteMany({
          where: {
            tenantId: ctx.tenantId,
            tipo: 'BAR_TURNO_DIVERGENCIA',
            criadoEm: { gte: marcoTempo },
          },
        })
      })
      const fechado: { diferenca: unknown; divergenciaAlta: boolean } | null =
        await db.barCaixaTurno.findUnique({
          where: { id: turno.id },
          select: { diferenca: true, divergenciaAlta: true },
        })
      if (fechado?.divergenciaAlta) {
        ok(
          AREA,
          `Fechar com R$ 0 contado marcou divergenciaAlta (diferença ${String(fechado.diferenca)}) e disparou o alerta`,
        )
      } else {
        alerta(
          AREA,
          `Fechamento com R$ 0 contado NÃO marcou divergenciaAlta (diferença ${String(fechado?.diferenca)}) — conferir o limiar`,
        )
      }
    } else {
      alerta(AREA, `Turno sem pendências não fechou: "${r.erro}"`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. RBAC — escalada de privilégio e precedência de override
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: quem administra cargos pode se dar poder que não tem?', () => {
  it('roles:manage cria cargo com permissão que o próprio ator não possui', async () => {
    const AREA = 'rbac/escalada'
    const tenant = await tenantPorSlug(SLUG_PRINCIPAL)
    if (!tenant) return

    const { ALL_PERMISSIONS, PERMISSIONS, hasPermission } = await import('@torcida/types')

    // O ator precisa ter roles:manage e NÃO ter alguma outra permissão — um
    // owner com o pacote inteiro não consegue escalar nada e o teste seria
    // vazio. Varre os candidatos até achar um com lacuna real.
    type CandidatoLite = { userId: string }
    const candidatos: CandidatoLite[] = await db.userRole.findMany({
      where: { tenantId: tenant.id },
      select: { userId: true },
      distinct: ['userId'],
      take: 60,
    })

    let ator: string | null = null
    let cobicada: string | null = null
    const { getActiveTenant } = await import('@/lib/tenant')
    const { isSuperAdminEmail } = await import('@/lib/tenant-context')
    for (const c of candidatos) {
      const u: { email: string } | null = await db.user.findUnique({
        where: { id: c.userId },
        select: { email: true },
      })
      if (isSuperAdminEmail(u?.email)) continue
      const efetivas = await permissoesEfetivas(tenant.id, c.userId)
      if (!hasPermission(efetivas, PERMISSIONS.ROLES_MANAGE)) continue
      const lacuna = ALL_PERMISSIONS.find((p: string) => !hasPermission(efetivas, p))
      if (!lacuna) continue
      const ativo = await getActiveTenant(c.userId, u?.email ?? null)
      if (ativo?.id !== tenant.id) continue
      ator = c.userId
      cobicada = lacuna
      break
    }

    if (!ator || !cobicada) {
      alerta(
        AREA,
        `Sem ator com roles:manage, lacuna de permissão e tenant ativo ${tenant.slug} — escalada não exercitada`,
      )
      return
    }

    const nomeCargo = `${MARCA} cargo de escalada`
    const form = new FormData()
    form.set('nome', nomeCargo)
    form.set('cor', '#123456')
    form.append('permissions', cobicada)

    aoDesfazer(`remover cargo de escalada "${nomeCargo}"`, async () => {
      const criado: { id: string } | null = await db.role.findFirst({
        where: { tenantId: tenant.id, nome: nomeCargo },
        select: { id: true },
      })
      if (!criado) return
      await db.userRole.deleteMany({ where: { roleId: criado.id } })
      await db.role.delete({ where: { id: criado.id } })
      await db.auditLog.deleteMany({
        where: { tenantId: tenant.id, acao: 'ROLE_CRIADO', detalhes: { path: ['nome'], equals: nomeCargo } },
      })
    })

    const { criarRole } = await import('@/app/admin/(plataforma)/configuracoes/actions')
    const r = await comoUsuario(ator, () => tentativa(() => criarRole(form)))
    if (!r.ok) {
      ok(AREA, `criarRole recusou conceder "${cobicada}" a quem não tem: "${r.erro}"`)
      return
    }

    const criado: { id: string } | null = await db.role.findFirst({
      where: { tenantId: tenant.id, nome: nomeCargo },
      select: { id: true },
    })
    if (!criado) {
      erro(AREA, 'criarRole reportou sucesso mas o cargo não foi persistido')
      return
    }

    // Criar o cargo é meio caminho; a escalada só se consuma ao vestir o cargo.
    await db.userRole.create({ data: { userId: ator, tenantId: tenant.id, roleId: criado.id } })
    const depois = await permissoesEfetivas(tenant.id, ator)

    if (hasPermission(depois, cobicada)) {
      erro(
        AREA,
        `ESCALADA DE PRIVILÉGIO: quem tem roles:manage criou um cargo com "${cobicada}", vestiu, e passou a ter a permissão — criarRole não limita a concessão ao próprio conjunto efetivo do ator`,
      )
    } else {
      ok(AREA, `Cargo criado com "${cobicada}" não elevou o ator ao ser atribuído`)
    }
  })

  it('cargos de sistema são imutáveis pela edição e pela exclusão', async () => {
    const AREA = 'rbac/cargo-sistema'
    const tenant = await tenantPorSlug(SLUG_PRINCIPAL)
    if (!tenant) return

    const { PERMISSIONS } = await import('@torcida/types')
    const ator = await atorComPermissao(tenant.id, PERMISSIONS.ROLES_MANAGE)
    const sistema: { id: string; nome: string } | null = await db.role.findFirst({
      where: { tenantId: tenant.id, isSystem: true },
      select: { id: true, nome: true },
    })
    if (!ator || !sistema) {
      alerta(AREA, `Sem ator com roles:manage ou cargo de sistema em ${tenant.slug} — imutabilidade não exercitada`)
      return
    }

    const form = new FormData()
    form.set('nome', `${MARCA} tentativa de renomear`)
    form.set('cor', '#000000')
    form.append('permissions', PERMISSIONS.MEMBERS_VIEW)

    const { atualizarRole, excluirRole } = await import('@/app/admin/(plataforma)/configuracoes/actions')

    const rEdit = await comoUsuario(ator, () => tentativa(() => atualizarRole(sistema.id, form)))
    if (rEdit.ok) {
      erro(AREA, `Cargo de sistema "${sistema.nome}" foi EDITADO pelo fluxo real — pacote de permissões deixa de ser previsível`)
    } else if (/sistema/i.test(rEdit.erro)) {
      ok(AREA, `Edição de cargo de sistema barrada: "${rEdit.erro}"`)
    } else {
      alerta(AREA, `Edição de cargo de sistema falhou por outro motivo: "${rEdit.erro}"`)
    }

    const rDel = await comoUsuario(ator, () => tentativa(() => excluirRole(sistema.id)))
    if (rDel.ok) {
      erro(AREA, `Cargo de sistema "${sistema.nome}" foi EXCLUÍDO — torcida pode ficar sem Presidente`)
    } else if (/sistema/i.test(rDel.erro)) {
      ok(AREA, `Exclusão de cargo de sistema barrada: "${rDel.erro}"`)
    } else {
      alerta(AREA, `Exclusão de cargo de sistema falhou por outro motivo: "${rDel.erro}"`)
    }

    const aindaExiste: { nome: string } | null = await db.role.findUnique({
      where: { id: sistema.id },
      select: { nome: true },
    })
    if (aindaExiste?.nome !== sistema.nome) {
      erro(AREA, `Cargo de sistema ficou alterado após as tentativas: "${sistema.nome}" → "${aindaExiste?.nome}"`)
    }
  })

  it('override NEGADO vence o cargo e bloqueia a ação correspondente', async () => {
    const AREA = 'rbac/override'
    const { PERMISSIONS, hasPermission } = await import('@torcida/types')

    type NegadoLite = { userId: string; tenantId: string }
    const negados: NegadoLite[] = await db.userPermission.findMany({
      where: { permission: PERMISSIONS.COMMUNITY_POST, granted: false },
      select: { userId: true, tenantId: true },
      take: 25,
    })
    if (negados.length === 0) {
      alerta(AREA, 'Nenhum override negado de community:post no banco — precedência não exercitada')
      return
    }

    const { getActiveTenant } = await import('@/lib/tenant')
    for (const n of negados) {
      const efetivas = await permissoesEfetivas(n.tenantId, n.userId)
      if (hasPermission(efetivas, PERMISSIONS.COMMUNITY_POST)) {
        erro(
          AREA,
          `Override NEGADO de community:post não venceu o cargo para ${n.userId} — calculateEffectivePermissions ainda concede`,
        )
        return
      }
      const u: { email: string } | null = await db.user.findUnique({
        where: { id: n.userId },
        select: { email: true },
      })
      const ativo = await getActiveTenant(n.userId, u?.email ?? null)
      if (ativo?.id !== n.tenantId) continue

      ok(AREA, 'Override negado retira community:post do conjunto efetivo, vencendo o cargo')

      const { publicarPost } = await import('@/app/portal/comunidade/actions')

      /** Publica e devolve (mensagem do gate, id do post gravado). */
      const publicar = async (visibilidade: 'PUBLICO' | 'TENANT') => {
        const form = new FormData()
        form.set('conteudo', `${MARCA} publicação ${visibilidade} sob override negado`)
        form.set('visibilidade', visibilidade)
        const r = await comoUsuario(n.userId, () => publicarPost({}, form))
        const post: { id: string } | null = await db.post.findFirst({
          where: { autorId: n.userId, conteudo: { contains: `${MARCA} publicação ${visibilidade}` } },
          select: { id: true },
        })
        if (post) {
          aoDesfazer(`remover post ${visibilidade} da auditoria ${post.id}`, async () => {
            await db.postHashtag.deleteMany({ where: { postId: post.id } })
            await db.feedTimeline.deleteMany({ where: { postId: post.id } })
            await db.post.deleteMany({ where: { id: post.id } })
          })
        }
        return { mensagem: r.message ?? '', postId: post?.id ?? null }
      }

      // Caminho de sócio (visibilidade interna) — é o que o override remove.
      const interno = await publicar('TENANT')
      if (interno.postId) {
        erro(
          AREA,
          'Usuário com community:post NEGADO publicou post TENANT — o gate de publicação não lê o override',
        )
      } else {
        ok(AREA, `Override negado bloqueou a publicação interna (TENANT): "${interno.mensagem}"`)
      }

      // Caminho público: `assertAutorPublicacaoPost` tem fallback de torcedor,
      // então aqui o override pode NÃO ser a última palavra. Vale registrar
      // qual dos dois caminhos decidiu.
      const publico = await publicar('PUBLICO')
      if (publico.postId) {
        alerta(
          AREA,
          'Com community:post NEGADO o usuário ainda publicou post PÚBLICO: o gate cai no caminho de torcedor (podePublicarComoTorcedorFeed) e o override deixa de valer para o feed nacional — confirmar se é intencional',
        )
      } else if (/onboarding/i.test(publico.mensagem)) {
        alerta(
          AREA,
          `Publicação pública barrada pelo ONBOARDING, não pela permissão ("${publico.mensagem}") — o override não foi o que decidiu; cobertura inconclusiva neste usuário`,
        )
      } else {
        ok(AREA, `Override negado também bloqueou a publicação pública: "${publico.mensagem}"`)
      }
      return
    }
    alerta(AREA, 'Nenhum usuário com community:post negado resolve esse tenant como ativo — publicação não exercitada')
  })
})

// ═════════════════════════════════════════════════════════════════════════
// D. GRUPOS — ciclo de vida do convite e o último administrador
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: convite de grupo é revogável e o grupo nunca fica sem admin', () => {
  it('código gerado admite entrada; revogado deixa de admitir', async () => {
    const AREA = 'grupos/convite'
    type GrupoLite = { id: string; tenantId: string; codigoConvite: string | null }
    const grupos: GrupoLite[] = await db.conversa.findMany({
      where: { tipo: 'GRUPO', comunidade: true },
      select: { id: true, tenantId: true, codigoConvite: true },
      take: 15,
    })
    if (grupos.length === 0) {
      alerta(AREA, 'Nenhum grupo de comunidade no banco — convite não exercitado')
      return
    }

    for (const grupo of grupos) {
      const admin: { userId: string } | null = await db.membroConversa.findFirst({
        where: { conversaId: grupo.id, papel: 'ADMIN', status: 'ATIVO', saiuEm: null },
        select: { userId: true },
      })
      if (!admin) continue
      const [adminAtivo] = await comTenantAtivo(grupo.tenantId, [admin.userId])
      if (!adminAtivo) continue

      const jaMembros: { userId: string }[] = await db.membroConversa.findMany({
        where: { conversaId: grupo.id },
        select: { userId: true },
      })
      const forasteiros = await comTenantAtivo(
        grupo.tenantId,
        await membrosAprovados(grupo.tenantId, 10, { excluir: jaMembros.map((m) => m.userId) }),
      )
      if (forasteiros.length < 2) continue
      const [convidado, retardatario] = forasteiros

      const codigoOriginal = grupo.codigoConvite
      aoDesfazer(`restaurar convite e membros do grupo ${grupo.id}`, async () => {
        await db.membroConversa.deleteMany({
          where: { conversaId: grupo.id, userId: { in: [convidado, retardatario] } },
        })
        await db.conversa.update({
          where: { id: grupo.id },
          data: { codigoConvite: codigoOriginal },
        })
        await db.auditLog.deleteMany({
          where: { entidade: 'Conversa', entidadeId: grupo.id, acao: 'GRUPO_ENTRADA_CONVITE' },
        })
      })

      const { gerarCodigoConviteGrupo, entrarPorConviteGrupo, revogarCodigoConviteGrupo } =
        await import('@/app/portal/comunidade/actions')

      const rGera = await comoUsuario(adminAtivo, () => tentativa(() => gerarCodigoConviteGrupo(grupo.id)))
      if (!rGera.ok) {
        alerta(AREA, `Admin do grupo não gerou convite: "${rGera.erro}" — ciclo não exercitado`)
        return
      }
      const codigo = rGera.valor.codigo
      ok(AREA, 'Administrador do grupo gera código de convite')

      const rEntra = await comoUsuario(convidado, () => tentativa(() => entrarPorConviteGrupo(codigo)))
      const virouMembro: { papel: string; status: string } | null = await db.membroConversa.findFirst({
        where: { conversaId: grupo.id, userId: convidado, saiuEm: null },
        select: { papel: true, status: true },
      })
      if (rEntra.ok && virouMembro?.status === 'ATIVO' && virouMembro.papel === 'MEMBRO') {
        ok(AREA, 'Convite válido admite o convidado como MEMBRO (nunca como ADMIN)')
      } else {
        erro(AREA, `Entrada por convite válido não projetou membership de MEMBRO: ${JSON.stringify({ rEntra, virouMembro })}`)
      }

      // Um não-admin não pode gerar convite para o mesmo grupo.
      const rGeraNaoAdmin = await comoUsuario(convidado, () =>
        tentativa(() => gerarCodigoConviteGrupo(grupo.id)),
      )
      if (rGeraNaoAdmin.ok) {
        erro(AREA, 'Membro comum gerou código de convite — qualquer um pode abrir o grupo')
      } else {
        ok(AREA, `Membro comum barrado ao gerar convite: "${rGeraNaoAdmin.erro}"`)
      }

      const rRevoga = await comoUsuario(adminAtivo, () => tentativa(() => revogarCodigoConviteGrupo(grupo.id)))
      if (!rRevoga.ok) {
        alerta(AREA, `Revogação de convite falhou: "${rRevoga.erro}" — expiração não exercitada`)
        return
      }

      const rTarde = await comoUsuario(retardatario, () => tentativa(() => entrarPorConviteGrupo(codigo)))
      const entrouTarde: { id: string } | null = await db.membroConversa.findFirst({
        where: { conversaId: grupo.id, userId: retardatario, status: 'ATIVO', saiuEm: null },
        select: { id: true },
      })
      if (entrouTarde) {
        erro(AREA, 'Código REVOGADO ainda admitiu entrada no grupo — revogação não invalida o link')
      } else if (!rTarde.ok) {
        ok(AREA, `Código revogado deixa de admitir: "${rTarde.erro}"`)
      } else {
        erro(AREA, 'Entrada com código revogado retornou sucesso sem criar membership — resultado ambíguo')
      }
      return
    }
    alerta(AREA, 'Nenhum grupo com admin e 2 candidatos externos no mesmo tenant — convite não exercitado')
  })

  it('rebaixar o último administrador do grupo é recusado', async () => {
    const AREA = 'grupos/ultimo-admin'
    type GrupoLite = { id: string; tenantId: string }
    const grupos: GrupoLite[] = await db.conversa.findMany({
      where: { tipo: 'GRUPO', comunidade: true },
      select: { id: true, tenantId: true },
      take: 15,
    })

    for (const grupo of grupos) {
      const admins: { userId: string }[] = await db.membroConversa.findMany({
        where: { conversaId: grupo.id, papel: 'ADMIN', status: 'ATIVO', saiuEm: null },
        select: { userId: true },
      })
      if (admins.length !== 1) continue
      const [adminAtivo] = await comTenantAtivo(grupo.tenantId, [admins[0].userId])
      if (!adminAtivo) continue

      const { alterarPapelGrupo } = await import('@/app/portal/comunidade/actions')
      const r = await comoUsuario(adminAtivo, () =>
        tentativa(() => alterarPapelGrupo(grupo.id, adminAtivo, 'MEMBRO')),
      )

      const depois: { papel: string } | null = await db.membroConversa.findFirst({
        where: { conversaId: grupo.id, userId: adminAtivo, saiuEm: null },
        select: { papel: true },
      })
      if (depois?.papel !== 'ADMIN') {
        aoDesfazer(`restaurar papel ADMIN de ${adminAtivo} no grupo ${grupo.id}`, async () => {
          await db.membroConversa.updateMany({
            where: { conversaId: grupo.id, userId: adminAtivo },
            data: { papel: 'ADMIN' },
          })
        })
        erro(AREA, 'Único administrador se rebaixou a MEMBRO — grupo ficou órfão, sem quem administre')
      } else if (!r.ok) {
        ok(AREA, `Rebaixar o último administrador é recusado: "${r.erro}"`)
      } else {
        erro(AREA, 'Rebaixamento do último admin retornou sucesso sem efeito — resultado ambíguo')
      }
      return
    }
    alerta(AREA, 'Nenhum grupo com exatamente um admin de tenant ativo — regra do último admin não exercitada')
  })
})

describe('sanidade', () => {
  it('a auditoria produziu achados', () => {
    if (achados.length === 0) throw new Error('Nenhuma checagem rodou — auditoria inconclusiva')
  })
})
