/**
 * Auditoria funcional do CANAL RESTRITO (R5) contra o banco real.
 *
 * Por que ela existe: o `audit:regras` alerta que **nenhuma torcida semeada
 * tem par ancestor/descendant** — as Subsedes/PDEs são `Sede` filhas sem tenant
 * próprio. Como o canal restrito só existe em unidade **Caso B** (tenant
 * filho), o módulo inteiro ficava sem cobertura contra dado real: só teste
 * unitário sobre a primitiva pura e análise estática. Esta auditoria **semeia**
 * a forma Caso B e mede a malha de leitura de verdade.
 *
 * O que é medido: a camada de DERIVAÇÃO (`lib/isolamento.ts` +
 * `getTenantRelation`/`getVisibleTenantIds` + os conjuntos por `afiliacaoId`),
 * que é onde mora o risco. As Server Actions de transição já têm gate coberto
 * por `audit:dados` ("toda Server Action de /admin tem assertPermission") e
 * exigiriam vestir um owner no tenant fixture — custo alto para medir o que já
 * está medido.
 *
 * ⚠️ **Este arquivo MUTA o banco**: cria Tenant + Sede fixture (marcados
 * `[AUDIT-R5]`), liga/desliga a flag e cria `SolicitacaoReativacaoCanal`. Toda
 * reversão é registrada ANTES da mutação. As fixtures nascem vazias — sem
 * membros, sem Bar, sem posts — para que desfazer seja apagar, não reconstruir.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:canal-restrito
 */
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import { criarColetor } from './_harness'

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

const MARCA = '[AUDIT-R5]'

const { erro, alerta, ok, aoDesfazer, encerrar } = criarColetor()

type Db = typeof import('@torcida/db').db
let db: Db

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(async () => {
  await encerrar('AUDITORIA DO CANAL RESTRITO (R5)', 'auditoria-canal-restrito.txt')
})

// ── Fixture: a forma Caso B que o seed não tem ────────────────────────────

type Cenario = {
  /** Tenant raiz real e semeado (a Sede mãe). */
  maeId: string
  maeNome: string
  afiliacaoId: string
  /** Tenant fixture criado por esta auditoria (a unidade promovida). */
  filhaId: string
  /** Uma coirmã: segunda unidade Caso B sob a mesma mãe. */
  coirmaId: string
  /** Tenant raiz de OUTRA torcida do mesmo clube (vizinha na CN). */
  vizinhaId: string | null
}

let cenario: Cenario | null = null

/**
 * Monta o cenário sobre uma torcida real: mãe (semeada) + duas unidades em
 * tenant próprio penduradas na Sede raiz dela. `sedeId` apontando para a Sede
 * da mãe é o que faz `lib/hierarquia.ts` derivar ancestor/descendant — é
 * exatamente a forma que `promoverSedeAction` produz.
 */
async function montarCenario(): Promise<Cenario | null> {
  if (cenario) return cenario

  // A mãe precisa de `afiliacaoId` para os conjuntos por clube (CN, canais,
  // onboarding) terem o que medir.
  const raiz: { id: string; nome: string; afiliacaoId: string | null } | null =
    await db.tenant.findFirst({
      where: {
        afiliacaoId: { not: null },
        sedes: { some: { tipo: 'SEDE', ativa: true } },
      },
      select: { id: true, nome: true, afiliacaoId: true },
      orderBy: { id: 'asc' },
    })
  if (!raiz?.afiliacaoId) {
    alerta('cenario', 'Nenhum tenant raiz com afiliação e Sede ativa — auditoria não tem base.')
    return null
  }

  const sedeRaiz: { id: string } | null = await db.sede.findFirst({
    where: { tenantId: raiz.id, tipo: 'SEDE', ativa: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  if (!sedeRaiz) return null

  const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  async function criarUnidade(rotulo: string): Promise<string> {
    const tenant: { id: string } = await db.tenant.create({
      data: {
        slug: `audit-r5-${rotulo}-${sufixo}`,
        nome: `${MARCA} ${rotulo}`,
        plano: 'FREE',
        afiliacaoId: raiz!.afiliacaoId,
      },
      select: { id: true },
    })
    const sede: { id: string } = await db.sede.create({
      data: {
        tenantId: tenant.id,
        nome: `${MARCA} ${rotulo}`,
        tipo: 'SUBSEDE',
        sedeId: sedeRaiz!.id,
        ativa: true,
        cidade: 'Auditoria',
      },
      select: { id: true },
    })
    aoDesfazer(`remover unidade fixture ${rotulo} (${tenant.id})`, async () => {
      await db.solicitacaoReativacaoCanal.deleteMany({ where: { tenantId: tenant.id } })
      await db.auditLog.deleteMany({ where: { tenantId: tenant.id } })
      await db.sede.deleteMany({ where: { id: sede.id } })
      await db.tenant.deleteMany({ where: { id: tenant.id } })
    })
    return tenant.id
  }

  const filhaId = await criarUnidade('unidade-restrita')
  const coirmaId = await criarUnidade('unidade-coirma')

  const vizinha: { id: string } | null = await db.tenant.findFirst({
    where: { afiliacaoId: raiz.afiliacaoId, id: { notIn: [raiz.id, filhaId, coirmaId] } },
    select: { id: true },
    orderBy: { id: 'asc' },
  })

  cenario = {
    maeId: raiz.id,
    maeNome: raiz.nome,
    afiliacaoId: raiz.afiliacaoId,
    filhaId,
    coirmaId,
    vizinhaId: vizinha?.id ?? null,
  }
  return cenario
}

/** Liga/desliga a flag crua. A reversão já foi registrada em `criarUnidade`. */
async function definirRestrito(tenantId: string, restrito: boolean): Promise<void> {
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      canalRestrito: restrito,
      canalRestritoDesde: restrito ? new Date() : null,
    },
  })
}

const conjunto = (ids: string[]) => new Set(ids)

// ═══════════════════════════════════════════════════════════════════════════
// A. A FORMA CASO B EXISTE E A RELAÇÃO NASCE HIERÁRQUICA
// ═══════════════════════════════════════════════════════════════════════════

describe('cenário Caso B', () => {
  it('mãe e unidade promovida nascem ancestor/descendant', async () => {
    const AREA = 'r5/forma'
    const c = await montarCenario()
    if (!c) return

    const { getTenantRelation } = await import('@/lib/hierarquia')
    const [maeVeFilha, filhaVeMae] = await Promise.all([
      getTenantRelation(c.maeId, c.filhaId),
      getTenantRelation(c.filhaId, c.maeId),
    ])

    // Convenção: a relação descreve o que o ATOR é em relação ao alvo. A mãe é
    // `ancestor` do alvo (vê tudo); a filha é `descendant` (só o público).
    if (maeVeFilha === 'ancestor' && filhaVeMae === 'descendant') {
      ok(AREA, 'Unidade em tenant próprio nasce descendente da mãe (a árvore atravessa tenants)')
    } else {
      erro(
        AREA,
        `Forma Caso B não derivou hierarquia: mãe→filha=${maeVeFilha}, filha→mãe=${filhaVeMae}. ` +
          'Sem isso o resto da auditoria mede outra coisa.',
      )
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. R5.1 — A PRAÇA SOCIAL É CORTADA NOS DOIS SENTIDOS
// ═══════════════════════════════════════════════════════════════════════════

describe('R5.1 — corte simétrico da malha de interação', () => {
  it('com canal fechado, ninguém vê a unidade e a unidade não vê a praça', async () => {
    const AREA = 'r5/corte'
    const c = await montarCenario()
    if (!c) return

    await definirRestrito(c.filhaId, true)

    const { getTenantRelation } = await import('@/lib/hierarquia')
    const { isTenantRestrito } = await import('@/lib/isolamento')

    if (await isTenantRestrito(c.filhaId)) {
      ok(AREA, 'Estado efetivo acompanha a flag (sem solicitação pendente)')
    } else {
      erro(AREA, 'Flag ligada mas `isTenantRestrito` devolveu false — o corte não vale')
      return
    }

    const [maeVeFilha, filhaVeMae, coirmaVeFilha, filhaVeCoirma] = await Promise.all([
      getTenantRelation(c.maeId, c.filhaId),
      getTenantRelation(c.filhaId, c.maeId),
      getTenantRelation(c.coirmaId, c.filhaId),
      getTenantRelation(c.filhaId, c.coirmaId),
    ])

    if (maeVeFilha === 'unrelated') {
      ok(AREA, 'A Sede deixa de ver a unidade no fluxo social (alvo restrito vence o ancestral)')
    } else {
      erro(AREA, `Sede ainda enxerga a unidade restrita como "${maeVeFilha}"`)
    }

    if (filhaVeMae === 'unrelated') {
      ok(AREA, 'A unidade deixa de ver a Sede — fechar o canal é sair da praça, não só se esconder')
    } else {
      erro(AREA, `Unidade restrita ainda enxerga a Sede como "${filhaVeMae}" (R5.1 violada)`)
    }

    if (coirmaVeFilha === 'unrelated' && filhaVeCoirma === 'unrelated') {
      ok(AREA, 'Coirmãs somem nos dois sentidos')
    } else {
      erro(AREA, `Coirmã não foi cortada: coirmã→filha=${coirmaVeFilha}, filha→coirmã=${filhaVeCoirma}`)
    }

    const propria = await getTenantRelation(c.filhaId, c.filhaId)
    if (propria === 'self') {
      ok(AREA, 'A comunidade INTERNA fica intacta (`self` não é tocado)')
    } else {
      erro(AREA, `Unidade restrita perdeu a si mesma: relação própria = "${propria}"`)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. R5.1b — A CASCATA INSTITUCIONAL CONTINUA DESCENDO
// ═══════════════════════════════════════════════════════════════════════════

describe('R5.1b — comunicado e evento da Sede seguem chegando', () => {
  it('separa o recurso `comunidade` (cortado) de `comunicados`/`eventos` (mantidos)', async () => {
    const AREA = 'r5/cascata'
    const c = await montarCenario()
    if (!c) return

    await definirRestrito(c.filhaId, true)
    const { getVisibleTenantIds } = await import('@/lib/hierarquia')

    const [comunidade, comunicados, eventos] = await Promise.all([
      getVisibleTenantIds(c.filhaId, 'comunidade'),
      getVisibleTenantIds(c.filhaId, 'comunicados'),
      getVisibleTenantIds(c.filhaId, 'eventos'),
    ])

    if (!conjunto(comunidade).has(c.maeId)) {
      ok(AREA, 'Feed: a Sede sai do conjunto visível da unidade restrita')
    } else {
      erro(AREA, 'Feed da Sede continua visível à unidade restrita — R5.1 furada pelo recurso')
    }

    if (conjunto(comunicados).has(c.maeId)) {
      ok(AREA, 'Comunicados: a Sede PERMANECE no conjunto — isolamento não é secessão')
    } else {
      erro(
        AREA,
        'Comunicado oficial da Sede parou de chegar na unidade restrita — ' +
          'a separação `comunicados` × `comunidade` em RECURSO_SENSIBILIDADE não está valendo',
      )
    }

    if (conjunto(eventos).has(c.maeId)) {
      ok(AREA, 'Eventos: a agenda institucional da Sede continua descendo')
    } else {
      erro(AREA, 'Evento da Sede parou de chegar na unidade restrita (RECURSOS_CASCATA_INSTITUCIONAL)')
    }

    if (conjunto(comunidade).has(c.filhaId)) {
      ok(AREA, 'A unidade continua enxergando o próprio conteúdo')
    } else {
      erro(AREA, 'Unidade restrita perdeu o próprio conteúdo do conjunto visível')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C2. R5.1b — O COMUNICADO DA SEDE COMO *POST* NO FEED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O comunicado aparece em DOIS lugares: a lista (`fetchComunicadosBase`, coberta
 * acima pelo recurso `comunicados`) e o **card no feed**, que é um `Post`
 * INSTITUCIONAL único no tenant de quem publicou. Como o ancestral saiu do
 * conjunto do feed, esse card só volta pela cláusula
 * `orSomenteComunicadoOficial`, que precisa estar nos TRÊS pontos de leitura —
 * senão o card aparece e o permalink dá 404 (ou o contrário).
 */
describe('R5.1b — comunicado da Sede no feed da unidade isolada', () => {
  it('o card passa, o post comum não passa, e o permalink concorda com o feed', async () => {
    const AREA = 'r5/comunicado-feed'
    const c = await montarCenario()
    if (!c) return

    const autor: { id: string } | null = await db.user.findFirst({ select: { id: true } })
    if (!autor) {
      alerta(AREA, 'Nenhum User no banco — não dá para criar os posts fixture.')
      return
    }

    // O `where` exige `comunicadoOrigemId != null`: sem Announcement de origem o
    // post não é comunicado, é post comum.
    const comunicadoExistente: { id: string } | null = await db.announcement.findFirst({
      where: { tenantId: c.maeId },
      select: { id: true },
      orderBy: { publicadoEm: 'desc' },
    })

    async function garantirComunicadoOrigem(): Promise<{ id: string }> {
      if (comunicadoExistente) return comunicadoExistente
      const criado: { id: string } = await db.announcement.create({
        data: {
          tenantId: c!.maeId,
          titulo: `${MARCA} comunicado`,
          corpo: 'Fixture de auditoria.',
          autorId: autor!.id,
        },
        select: { id: true },
      })
      aoDesfazer(`remover Announcement fixture ${criado.id}`, async () => {
        await db.announcement.deleteMany({ where: { id: criado.id } })
      })
      return criado
    }

    const comunicadoOrigem: { id: string } = await garantirComunicadoOrigem()

    const postComunicado: { id: string } = await db.post.create({
      data: {
        tenantId: c.maeId,
        autorId: autor.id,
        conteudo: `${MARCA} card de comunicado`,
        tipo: 'INSTITUCIONAL',
        visibilidade: 'PUBLICO',
        oculto: false,
        comunicadoOrigemId: comunicadoOrigem.id,
      },
      select: { id: true },
    })
    const postComum: { id: string } = await db.post.create({
      data: {
        tenantId: c.maeId,
        autorId: autor.id,
        conteudo: `${MARCA} post comum da Sede`,
        tipo: 'MEMBRO',
        visibilidade: 'PUBLICO',
        oculto: false,
      },
      select: { id: true },
    })
    aoDesfazer('remover posts fixture do comunicado', async () => {
      await db.post.deleteMany({ where: { id: { in: [postComunicado.id, postComum.id] } } })
    })

    await definirRestrito(c.filhaId, true)

    const { resolveTenantIdsSomenteComunicado, getPostPorId } = await import('@/lib/feed')
    const { getFeedComunidade } = await import('@/lib/comunidade')

    const somente = await resolveTenantIdsSomenteComunicado(c.filhaId)
    if (conjunto(somente).has(c.maeId)) {
      ok(AREA, 'Com canal fechado, o ancestral entra na lista de "só comunicado"')
    } else {
      erro(AREA, 'resolveTenantIdsSomenteComunicado não devolveu a Sede — o card não teria como voltar')
    }

    const { posts } = await getFeedComunidade(c.filhaId, { takePosts: 100, userId: autor.id })
    const idsFeed = conjunto(posts.map((p) => p.id))

    if (idsFeed.has(postComunicado.id)) {
      ok(AREA, 'Feed: o card do comunicado da Sede chega na unidade isolada')
    } else {
      erro(AREA, 'Feed: o comunicado da Sede NÃO chega — a unidade isolada ficou sem a única voz externa')
    }
    if (!idsFeed.has(postComum.id)) {
      ok(AREA, 'Feed: post comum da Sede continua barrado (só o comunicado passa)')
    } else {
      erro(AREA, 'Feed: post COMUM da Sede vazou para a unidade isolada — R5.1 furada')
    }

    const [permalinkComunicado, permalinkComum] = await Promise.all([
      getPostPorId(postComunicado.id, c.filhaId, autor.id),
      getPostPorId(postComum.id, c.filhaId, autor.id),
    ])

    if (permalinkComunicado) {
      ok(AREA, 'Permalink do comunicado abre — feed e permalink concordam (sem 404 no card visível)')
    } else {
      erro(AREA, 'Card do comunicado aparece no feed mas o permalink dá 404 — os três pontos divergiram')
    }
    if (!permalinkComum) {
      ok(AREA, 'Permalink do post comum da Sede continua bloqueado')
    } else {
      erro(AREA, 'Permalink do post comum da Sede abriu na unidade isolada')
    }

    // Canal aberto: a exceção some (o ancestral volta pelo caminho normal).
    await definirRestrito(c.filhaId, false)
    if ((await resolveTenantIdsSomenteComunicado(c.filhaId)).length === 0) {
      ok(AREA, 'Com canal aberto a exceção se desliga — sem cláusula extra sobrando no `where`')
    } else {
      erro(AREA, 'A exceção do comunicado continua ativa com o canal aberto')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. ESTRUTURAL NUNCA É GATEADO (R5.3)
// ═══════════════════════════════════════════════════════════════════════════

describe('R5.3 — a Sede nunca perde a estrutura', () => {
  it('ancestrais, descendentes, lineage e worktree ignoram o canal restrito', async () => {
    const AREA = 'r5/estrutural'
    const c = await montarCenario()
    if (!c) return

    await definirRestrito(c.filhaId, true)

    const {
      getAncestorTenantIds,
      getDescendantTenantIds,
      getTorcidaLineageTenantIds,
      getTorcidaWorktree,
    } = await import('@/lib/hierarquia')

    const [ancestrais, descendentes, lineage, worktree] = await Promise.all([
      getAncestorTenantIds(c.filhaId),
      getDescendantTenantIds(c.maeId),
      getTorcidaLineageTenantIds(c.filhaId),
      getTorcidaWorktree(c.maeId),
    ])

    const checagens: [string, boolean, string][] = [
      [
        'getAncestorTenantIds',
        conjunto(ancestrais).has(c.maeId),
        'a unidade restrita precisa continuar sabendo quem é a Sede (espelho de membro, bloqueio herdado)',
      ],
      [
        'getDescendantTenantIds',
        conjunto(descendentes).has(c.filhaId),
        'a Sede precisa continuar listando a unidade (/admin/sedes, console R1)',
      ],
      [
        'getTorcidaLineageTenantIds',
        conjunto(lineage).has(c.maeId),
        'o lineage sustenta governança, não interação',
      ],
    ]
    for (const [nome, passou, porque] of checagens) {
      if (passou) ok(AREA, `${nome} ignora o isolamento (correto) — ${porque}`)
      else erro(AREA, `${nome} foi GATEADO pelo canal restrito: ${porque}`)
    }

    const idsWorktree = new Set(worktree.map((n) => n.tenantId).filter(Boolean))
    if (idsWorktree.has(c.filhaId)) {
      ok(AREA, 'getTorcidaWorktree continua mostrando a unidade restrita à Sede')
    } else {
      erro(AREA, 'Unidade restrita sumiu do worktree — a Sede perdeu a filha da estrutura')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. CONJUNTOS POR AFILIAÇÃO (os que não passam por getTenantRelation)
// ═══════════════════════════════════════════════════════════════════════════

describe('§3.4 — cortes por afiliação', () => {
  it('CN, onboarding e vitrine de canais deixam de listar a unidade restrita', async () => {
    const AREA = 'r5/afiliacao'
    const c = await montarCenario()
    if (!c) return

    const { getTenantIdsPorAfiliacao } = await import('@/lib/comunidade-contexto')
    const { getTorcidasPorAfiliacao } = await import('@/lib/onboarding')

    await definirRestrito(c.filhaId, false)
    const cnAberto = conjunto(await getTenantIdsPorAfiliacao(c.afiliacaoId))
    await definirRestrito(c.filhaId, true)
    const cnFechado = conjunto(await getTenantIdsPorAfiliacao(c.afiliacaoId))

    if (cnAberto.has(c.filhaId) && !cnFechado.has(c.filhaId)) {
      ok(AREA, 'Comunidade Nacional: a unidade entra com canal aberto e sai com canal fechado')
    } else if (!cnAberto.has(c.filhaId)) {
      alerta(
        AREA,
        'A unidade fixture não entrou na CN nem com canal aberto — o corte não pôde ser medido ' +
          '(getTenantIdsPorAfiliacao provavelmente exige mais que `afiliacaoId`).',
      )
    } else {
      erro(AREA, 'Unidade restrita continua na base da Comunidade Nacional')
    }

    const torcidas = await getTorcidasPorAfiliacao(c.afiliacaoId)
    const idsOnboarding = new Set(
      (torcidas as { id?: string; tenantId?: string }[]).map((t) => t.tenantId ?? t.id),
    )
    if (!idsOnboarding.has(c.filhaId)) {
      ok(AREA, 'Onboarding público não oferece a unidade restrita (R5.8 — entrada só por convite)')
    } else {
      erro(AREA, 'Unidade restrita ainda aparece no onboarding público')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. EXPIRAÇÃO DERIVADA NA LEITURA — a decisão-chave do módulo
// ═══════════════════════════════════════════════════════════════════════════

describe('§3.2 — expiração derivada não depende do cron', () => {
  it('prazo vencido reabre o canal na leitura, com a flag ainda `true` no banco', async () => {
    const AREA = 'r5/expiracao'
    const c = await montarCenario()
    if (!c) return

    await definirRestrito(c.filhaId, true)
    const { isTenantRestrito, PRAZO_REATIVACAO_DIAS, prazoReativacaoAPartirDe } = await import(
      '@/lib/isolamento'
    )

    // Pendente com prazo NO FUTURO: o canal segue fechado.
    const futura: { id: string } = await db.solicitacaoReativacaoCanal.create({
      data: {
        tenantId: c.filhaId,
        solicitanteTenantId: c.maeId,
        prazoEm: prazoReativacaoAPartirDe(new Date()),
        status: 'PENDENTE',
      },
      select: { id: true },
    })
    if (await isTenantRestrito(c.filhaId)) {
      ok(AREA, `Solicitação dentro do prazo (${PRAZO_REATIVACAO_DIAS} dias) mantém o canal fechado`)
    } else {
      erro(AREA, 'Solicitação ainda no prazo já reabriu o canal — a liderança perdeu o direito de responder')
    }

    // Mesma solicitação, prazo VENCIDO: reabre sem ninguém rodar nada.
    await db.solicitacaoReativacaoCanal.update({
      where: { id: futura.id },
      data: { prazoEm: new Date(Date.now() - 60_000) },
    })

    const flagCrua: { canalRestrito: boolean } | null = await db.tenant.findUnique({
      where: { id: c.filhaId },
      select: { canalRestrito: true },
    })

    if (!(await isTenantRestrito(c.filhaId))) {
      ok(
        AREA,
        `Prazo vencido reabriu o canal na LEITURA (flag no banco continua ${flagCrua?.canalRestrito}) — ` +
          'a regra sobrevive ao scheduler fora do ar',
      )
    } else {
      erro(AREA, 'Prazo vencido NÃO reabriu o canal — a reativação automática virou refém do cron')
    }

    const { getTenantRelation } = await import('@/lib/hierarquia')
    const relacao = await getTenantRelation(c.filhaId, c.maeId)
    if (relacao === 'descendant') {
      ok(AREA, 'Com o prazo vencido a malha inteira volta sozinha (relação de novo `descendant`)')
    } else {
      erro(AREA, `Prazo vencido mas a relação continua "${relacao}" — a volta não propagou`)
    }

    await db.solicitacaoReativacaoCanal.deleteMany({ where: { id: futura.id } })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. REABRIR DEVOLVE TUDO (§6)
// ═══════════════════════════════════════════════════════════════════════════

describe('§6 — reabrir o canal restaura a malha', () => {
  it('desligar a flag devolve relação, feed e CN sem nenhuma escrita de reparo', async () => {
    const AREA = 'r5/reabertura'
    const c = await montarCenario()
    if (!c) return

    const { getTenantRelation, getVisibleTenantIds } = await import('@/lib/hierarquia')
    const { getTenantIdsPorAfiliacao } = await import('@/lib/comunidade-contexto')

    await definirRestrito(c.filhaId, true)
    const fechado = {
      relacao: await getTenantRelation(c.filhaId, c.maeId),
      feed: conjunto(await getVisibleTenantIds(c.filhaId, 'comunidade')).has(c.maeId),
      cn: conjunto(await getTenantIdsPorAfiliacao(c.afiliacaoId)).has(c.filhaId),
    }

    await definirRestrito(c.filhaId, false)
    const aberto = {
      relacao: await getTenantRelation(c.filhaId, c.maeId),
      feed: conjunto(await getVisibleTenantIds(c.filhaId, 'comunidade')).has(c.maeId),
      cn: conjunto(await getTenantIdsPorAfiliacao(c.afiliacaoId)).has(c.filhaId),
    }

    if (fechado.relacao === 'unrelated' && aberto.relacao === 'descendant') {
      ok(AREA, 'Relação volta a `descendant` só desligando a flag')
    } else {
      erro(AREA, `Relação não voltou: fechado=${fechado.relacao}, aberto=${aberto.relacao}`)
    }

    if (!fechado.feed && aberto.feed) {
      ok(AREA, 'Feed da Sede reaparece para a unidade')
    } else {
      erro(AREA, `Feed não voltou (fechado=${fechado.feed}, aberto=${aberto.feed})`)
    }

    if (!fechado.cn && aberto.cn) {
      ok(AREA, 'Unidade volta à base da Comunidade Nacional')
    } else if (!aberto.cn) {
      alerta(AREA, 'Unidade não voltou à CN — ver o alerta de `r5/afiliacao` sobre a medição da base')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// H. R5.2 — SÓ UNIDADE PODE FECHAR
// ═══════════════════════════════════════════════════════════════════════════

describe('R5.2 — a Sede raiz não pode se isolar', () => {
  it('o critério do gate (ter ancestral) separa raiz de unidade', async () => {
    const AREA = 'r5/so-unidade'
    const c = await montarCenario()
    if (!c) return

    const { getAncestorTenantIds } = await import('@/lib/hierarquia')
    const [daRaiz, daUnidade] = await Promise.all([
      getAncestorTenantIds(c.maeId),
      getAncestorTenantIds(c.filhaId),
    ])

    if (daRaiz.length === 0) {
      ok(AREA, 'Sede raiz não tem ancestral — `assertEhUnidadeDaTorcida` recusa (gate de servidor)')
    } else {
      erro(AREA, `Sede raiz tem ${daRaiz.length} ancestral(is) — o gate de R5.2 deixaria a raiz fechar`)
    }
    if (daUnidade.length > 0) {
      ok(AREA, 'Unidade Caso B tem ancestral — o gate permite, como esperado')
    } else {
      erro(AREA, 'Unidade Caso B sem ancestral — o gate recusaria quem tem direito')
    }
  })
})
