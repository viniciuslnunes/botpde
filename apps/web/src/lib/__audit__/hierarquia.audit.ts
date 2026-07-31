/**
 * Auditoria de FLUXOS DE HIERARQUIA — Sede → Subsede → PDE.
 *
 * É a camada estrutural do produto e a que nenhuma rodada tocou: promover uma
 * unidade a tenant próprio, excluir uma unidade remanejando quem dependia
 * dela, e corrigir a unidade territorial de um membro. São as mutações mais
 * pesadas do sistema — `promoverSedeAction` cria um Tenant inteiro, com
 * governo próprio, e reposiciona a árvore.
 *
 * A pergunta que importa não é "a action rodou", é **a árvore continua
 * coerente depois**: a hierarquia é derivada de cadeias de `Sede.sedeId` que
 * atravessam tenants (`lib/hierarquia.ts`), então uma promoção que esqueça de
 * manter o elo deixa a Sede mãe sem enxergar a filha — governança perdida em
 * silêncio. Por isso todo fluxo aqui termina conferindo `resolveVisibility`
 * nos dois sentidos.
 *
 * ⚠️ **Este arquivo MUTA o banco**, incluindo criar e apagar Tenant. Toda
 * fixture leva `[AUDIT-HIER]` no nome e a reversão é registrada antes da
 * mutação. As fixtures são criadas vazias (sem membros, sem Bar, sem
 * histórico) justamente para que apagá-las seja seguro.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:hierarquia
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

const MARCA = '[AUDIT-HIER]'

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
  await encerrar('AUDITORIA DE HIERARQUIA (Sede → Subsede → PDE)', 'auditoria-hierarquia.txt')
})

// ── Contexto: quem pode mexer na estrutura ───────────────────────────────

type ContextoSede = {
  tenantId: string
  slug: string
  /** Presidente global: TORCIDA_GLOBAL_VIEW + o tenant tem Sede tipo SEDE. */
  presidente: string
  sedePrincipalId: string
}

/**
 * `assertPresidenteGlobal` exige `torcida:global_view` **e** que o tenant
 * tenha uma Sede `tipo: 'SEDE'`. Sem os dois, toda action de estrutura
 * recusa antes de chegar na regra — e a auditoria mediria o gate, não o
 * fluxo. Varre os tenants até achar um par completo.
 */
async function contextoSede(): Promise<ContextoSede | null> {
  const { PERMISSIONS, calculateEffectivePermissions, hasPermission } = await import('@torcida/types')
  const { getUserPermissionsInTenant, getActiveTenant } = await import('@/lib/tenant')
  const { isSuperAdminEmail } = await import('@/lib/tenant-context')

  // `orderBy` não é cosmético: sem ele o Postgres não garante ordem e cada
  // chamada podia cair num tenant diferente — a rodada anterior teve um
  // achado que só aparecia em metade das execuções por causa disso.
  const comSedePrincipal: { tenantId: string | null; id: string }[] = await db.sede.findMany({
    where: { tipo: 'SEDE', tenantId: { not: null }, ativa: true },
    select: { tenantId: true, id: true },
    orderBy: { id: 'asc' },
    take: 40,
  })

  for (const s of comSedePrincipal) {
    if (!s.tenantId) continue
    const tenant: { id: string; slug: string } | null = await db.tenant.findUnique({
      where: { id: s.tenantId },
      select: { id: true, slug: true },
    })
    if (!tenant) continue

    const candidatos: { userId: string }[] = await db.userRole.findMany({
      where: { tenantId: tenant.id },
      select: { userId: true },
      distinct: ['userId'],
      take: 30,
    })
    for (const c of candidatos) {
      const u: { email: string } | null = await db.user.findUnique({
        where: { id: c.userId },
        select: { email: true },
      })
      // Super admin passa por cima do gate e resolveria outro tenant ativo.
      if (isSuperAdminEmail(u?.email)) continue
      const bruto = await getUserPermissionsInTenant(c.userId, tenant.id)
      const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      if (!hasPermission(efetivas, PERMISSIONS.TORCIDA_GLOBAL_VIEW)) continue
      const ativo = await getActiveTenant(c.userId, u?.email ?? null)
      if (ativo?.id !== tenant.id) continue
      return { tenantId: tenant.id, slug: tenant.slug, presidente: c.userId, sedePrincipalId: s.id }
    }
  }
  return null
}

// ═════════════════════════════════════════════════════════════════════════
// A. PROMOÇÃO DE UNIDADE A TENANT (Caso B)
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: promover unidade a tenant próprio', () => {
  it('recusa promover Sede principal, unidade inativa e unidade de outro tenant', async () => {
    const AREA = 'hierarquia/promover-recusas'
    const ctx = await contextoSede()
    if (!ctx) {
      alerta(AREA, 'Nenhum tenant com Sede principal e presidente global — promoção não exercitada')
      return
    }

    const { promoverSedeAction } = await import('@/app/admin/(estrutura)/sedes/actions')

    // 1. Sede principal não pode ser promovida — ela já é o tenant.
    const rSede = await comoUsuario(ctx.presidente, () =>
      tentativa(() => promoverSedeAction(ctx.sedePrincipalId)),
    )
    if (rSede.ok) {
      erro(AREA, 'Sede principal foi promovida a tenant — a torcida ficaria com a raiz duplicada')
    } else if (/subsede|ponto de encontro/i.test(rSede.erro)) {
      ok(AREA, `Sede principal recusada na promoção: "${rSede.erro}"`)
    } else {
      alerta(AREA, `Promoção da Sede principal falhou por outro motivo: "${rSede.erro}"`)
    }

    // 2. Unidade inativa — fixture desligada de propósito.
    const inativa: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} PDE inativo`,
        tipo: 'PONTO_ENCONTRO',
        sedeId: ctx.sedePrincipalId,
        ativa: false,
      },
      select: { id: true },
    })
    aoDesfazer(`remover PDE inativo ${inativa.id}`, async () => {
      await db.sede.deleteMany({ where: { id: inativa.id } })
    })

    const rInativa = await comoUsuario(ctx.presidente, () =>
      tentativa(() => promoverSedeAction(inativa.id)),
    )
    if (rInativa.ok) {
      erro(AREA, 'Unidade INATIVA foi promovida a tenant — portal criado para unidade desligada')
    } else if (/ativa/i.test(rInativa.erro)) {
      ok(AREA, `Unidade inativa recusada na promoção: "${rInativa.erro}"`)
    } else {
      alerta(AREA, `Promoção de unidade inativa falhou por outro motivo: "${rInativa.erro}"`)
    }

    // 3. Unidade de outro tenant — escopo, não só permissão.
    const alheia: { id: string; tenantId: string | null } | null = await db.sede.findFirst({
      where: { tenantId: { not: null, notIn: [ctx.tenantId] }, tipo: 'PONTO_ENCONTRO' },
      select: { id: true, tenantId: true },
    })
    if (!alheia) {
      alerta(AREA, 'Sem PDE de outro tenant — escopo da promoção não exercitado')
      return
    }
    const rAlheia = await comoUsuario(ctx.presidente, () =>
      tentativa(() => promoverSedeAction(alheia.id)),
    )
    if (rAlheia.ok) {
      erro(AREA, 'Presidente promoveu unidade de OUTRA torcida — escopo de tenant furado na promoção')
    } else if (/não encontrada/i.test(rAlheia.erro)) {
      ok(AREA, `Unidade de outra torcida invisível para a promoção: "${rAlheia.erro}"`)
    } else {
      alerta(AREA, `Promoção cross-tenant falhou por outro motivo: "${rAlheia.erro}"`)
    }
  })

  it('promove PDE e o novo tenant nasce descendente da mãe, com governo próprio', async () => {
    const AREA = 'hierarquia/promover'
    const ctx = await contextoSede()
    if (!ctx) return

    // Fixture VAZIA: sem membros, sem Bar, sem histórico — para que desfazer
    // seja apagar, não reconstruir.
    const unidade: { id: string; nome: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} PDE promovivel`,
        tipo: 'PONTO_ENCONTRO',
        sedeId: ctx.sedePrincipalId,
        ativa: true,
        cidade: 'Auditoria',
      },
      select: { id: true, nome: true },
    })

    // A reversão descobre o tenant criado no momento da limpeza — na hora do
    // registro ele ainda não existe.
    aoDesfazer(`desfazer promoção de ${unidade.nome}`, async () => {
      const atual: { tenantId: string | null } | null = await db.sede.findUnique({
        where: { id: unidade.id },
        select: { tenantId: true },
      })
      const tenantCriado =
        atual?.tenantId && atual.tenantId !== ctx.tenantId ? atual.tenantId : null

      // Devolve a unidade à mãe ANTES de apagar o tenant novo: `Sede.tenantId`
      // é `onDelete: SetNull`, e apagar primeiro deixaria a Sede órfã.
      await db.sede.updateMany({ where: { id: unidade.id }, data: { tenantId: ctx.tenantId } })
      if (tenantCriado) {
        await db.tenant.deleteMany({ where: { id: tenantCriado } })
      }
      await db.sede.deleteMany({ where: { id: unidade.id } })
      await db.auditLog.deleteMany({
        where: { tenantId: ctx.tenantId, acao: 'SEDE_PROMOVIDA_TENANT', entidadeId: unidade.id },
      })
    })

    const { promoverSedeAction } = await import('@/app/admin/(estrutura)/sedes/actions')
    const r = await comoUsuario(ctx.presidente, () => tentativa(() => promoverSedeAction(unidade.id)))
    if (!r.ok) {
      // Distinguir "regra recusou" de "a action não consegue completar" — são
      // achados de natureza oposta e a mensagem do Prisma é inconfundível.
      if (/expired transaction|Transaction already closed|Transaction not found|Transaction API error|timeout for this transaction/i.test(r.erro)) {
        erro(
          AREA,
          'TRANSAÇÃO ESTOURA: promoverSedeParaTenant roda ~40 round-trips sequenciais dentro de uma interactive transaction SEM `timeout` configurado (default 5 s do Prisma). Só o seed de departamentos canônicos (10 deptos + 22 perfis, upserts em série) mediu 5,86 s daqui. A promoção não completa e faz rollback inteiro — mesma classe do bug já corrigido em 03d62a8 (timeout em decisão de membro). Fix barato: `{ timeout: 30_000 }` ou tirar o seed canônico de dentro da transação.',
        )
      } else {
        erro(AREA, `Promoção de PDE válido recusada: "${r.erro}"`)
      }
      return
    }

    const sedeDepois: { tenantId: string | null; sedeId: string | null } | null =
      await db.sede.findUnique({
        where: { id: unidade.id },
        select: { tenantId: true, sedeId: true },
      })
    const novoTenantId = sedeDepois?.tenantId
    if (!novoTenantId || novoTenantId === ctx.tenantId) {
      erro(AREA, 'Promoção reportou sucesso mas a unidade continua no tenant mãe')
      return
    }
    ok(AREA, 'Unidade promovida migrou para um tenant próprio')

    // O elo com a Sede mãe é o que sustenta a hierarquia inteira.
    if (sedeDepois.sedeId === ctx.sedePrincipalId) {
      ok(AREA, 'Unidade promovida manteve o elo `sedeId` com a Sede mãe (a árvore não se rompeu)')
    } else {
      erro(
        AREA,
        `Promoção rompeu o elo com a Sede mãe (sedeId ficou ${sedeDepois.sedeId}) — a torcida perde a filha da hierarquia`,
      )
    }

    // Governo próprio: cargos de sistema, owner vestido, departamentos.
    const { SYSTEM_ROLES } = await import('@torcida/types')
    const cargos: { nome: string; isSystem: boolean }[] = await db.role.findMany({
      where: { tenantId: novoTenantId, isSystem: true },
      select: { nome: true, isSystem: true },
    })
    const nomes = new Set(cargos.map((c) => c.nome))
    const esperados = [SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MEMBER]
    const faltando = esperados.filter((n) => !nomes.has(n))
    if (faltando.length === 0) {
      ok(AREA, 'Novo tenant nasceu com os 3 cargos de sistema (owner, admin, member)')
    } else {
      erro(AREA, `Novo tenant nasceu sem os cargos de sistema: ${faltando.join(', ')}`)
    }

    const ownerRole: { id: string } | null = await db.role.findFirst({
      where: { tenantId: novoTenantId, isSystem: true, nome: SYSTEM_ROLES.OWNER },
      select: { id: true },
    })
    const ownerVestido: number = ownerRole
      ? await db.userRole.count({ where: { tenantId: novoTenantId, roleId: ownerRole.id } })
      : 0
    if (ownerVestido > 0) {
      ok(AREA, 'Novo tenant já nasce com owner atribuído — a unidade não fica sem dono')
    } else {
      erro(AREA, 'Novo tenant ficou SEM owner — ninguém administra a unidade promovida')
    }

    const membroOwner: number = await db.saasMembro.count({
      where: { tenantId: novoTenantId, status: 'APROVADO' },
    })
    if (membroOwner > 0) {
      ok(AREA, 'Owner do novo tenant tem SaasMembro APROVADO (consegue usar o próprio portal)')
    } else {
      erro(AREA, 'Owner do novo tenant não tem vínculo APROVADO — seria barrado no próprio portal')
    }

    const departamentos: number = await db.departamento.count({ where: { tenantId: novoTenantId } })
    if (departamentos > 0) {
      ok(AREA, `Departamentos canônicos criados no novo tenant (${departamentos})`)
    } else {
      alerta(AREA, 'Novo tenant nasceu sem departamentos canônicos — conferir upsertDepartamentosCanonicos')
    }

    const log: number = await db.auditLog.count({
      where: { tenantId: ctx.tenantId, acao: 'SEDE_PROMOVIDA_TENANT', entidadeId: unidade.id },
    })
    if (log > 0) ok(AREA, 'Promoção gravou AuditLog no tenant mãe')
    else erro(AREA, 'Promoção não gravou AuditLog — mutação estrutural sem rastro')

    // ── O invariante que sustenta a governança ────────────────────────────
    // Chamado só AGORA: `getTenantRelation` é memoizado, consultar antes da
    // promoção envenenaria o cache com a árvore antiga.
    const { resolveVisibility } = await import('@/lib/hierarquia')
    const [maeVeRestrito, filhaVeRestrito, filhaVePublico] = await Promise.all([
      resolveVisibility(ctx.tenantId, novoTenantId, 'financeiro'),
      resolveVisibility(novoTenantId, ctx.tenantId, 'financeiro'),
      resolveVisibility(novoTenantId, ctx.tenantId, 'sedes'),
    ])

    if (maeVeRestrito) {
      ok(AREA, 'Sede mãe enxerga recurso RESTRITO da unidade promovida (relação de ancestral preservada)')
    } else {
      erro(
        AREA,
        'Sede mãe NÃO enxerga o financeiro da unidade promovida — a promoção criou um tenant fora da árvore e a torcida perdeu governança sobre a própria filha',
      )
    }
    if (!filhaVeRestrito) {
      ok(AREA, 'Unidade promovida NÃO enxerga o financeiro da mãe (descendente só vê o público)')
    } else {
      erro(AREA, 'Unidade promovida enxerga recurso RESTRITO da mãe — descendente com poder de ancestral')
    }
    if (filhaVePublico) {
      ok(AREA, 'Unidade promovida enxerga o público da mãe (sedes) — herança correta')
    } else {
      alerta(AREA, 'Unidade promovida não enxerga nem o público da mãe — conferir a cadeia de ancestrais')
    }
  })
})

describe('invariante: unidade em tenant próprio continua descendente da mãe', () => {
  /**
   * Verifica a **derivação da hierarquia** (`lib/hierarquia.ts`) sobre a forma
   * que a promoção produz, montada aqui à mão: um tenant novo cuja Sede
   * mantém `sedeId` apontando para a Sede mãe.
   *
   * Por que à mão: `promoverSedeAction` não completa (estouro de transação,
   * ver acima), e este é o invariante que sustenta a governança inteira —
   * deixá-lo sem cobertura porque outra coisa está quebrada seria perder o
   * ponto da rodada. O que **não** está coberto aqui é a action montar essa
   * forma; isso volta quando o timeout for corrigido.
   */
  /**
   * Monta a forma e devolve o veredito nos dois sentidos. `rotulo` distingue
   * as duas formas de torcida — é o contraste entre elas que localiza a causa.
   */
  async function medirVisibilidade(maeTenantId: string, raizSedeId: string) {
    const tenantFilho: { id: string } = await db.tenant.create({
      data: {
        slug: `audit-hier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nome: `${MARCA} unidade em tenant próprio`,
        plano: 'FREE',
      },
      select: { id: true },
    })
    const sedeFilha: { id: string } = await db.sede.create({
      data: {
        tenantId: tenantFilho.id,
        nome: `${MARCA} unidade promovida (simulada)`,
        tipo: 'SUBSEDE',
        sedeId: raizSedeId,
        ativa: true,
      },
      select: { id: true },
    })
    aoDesfazer(`remover tenant/sede do invariante (${tenantFilho.id})`, async () => {
      await db.sede.deleteMany({ where: { id: sedeFilha.id } })
      await db.tenant.deleteMany({ where: { id: tenantFilho.id } })
    })

    const { resolveVisibility } = await import('@/lib/hierarquia')
    const [maeVeRestrito, filhaVeRestrito, filhaVePublico] = await Promise.all([
      resolveVisibility(maeTenantId, tenantFilho.id, 'financeiro'),
      resolveVisibility(tenantFilho.id, maeTenantId, 'financeiro'),
      resolveVisibility(tenantFilho.id, maeTenantId, 'sedes'),
    ])
    return { maeVeRestrito, filhaVeRestrito, filhaVePublico }
  }

  it('mãe enxerga o restrito da filha; filha só o público da mãe', async () => {
    const AREA = 'hierarquia/invariante'
    const ctx = await contextoSede()
    if (!ctx) return

    // Duas formas de torcida. A diferença entre elas é o achado: com mais de
    // uma Sede no tenant, `getTenantRelationImpl` parte de um nó arbitrário.
    const raizesAlternativas: { tenantId: string; raizId: string; sedes: number }[] = []
    for (const tenantId of [ctx.tenantId]) {
      raizesAlternativas.push({
        tenantId,
        raizId: ctx.sedePrincipalId,
        sedes: await db.sede.count({ where: { tenantId } }),
      })
    }
    const multi: { tenantId: string | null; id: string } | null = await db.sede.findFirst({
      where: {
        tipo: 'SEDE',
        ativa: true,
        tenantId: { not: null, notIn: [ctx.tenantId] },
        tenant: { sedes: { some: { tipo: { not: 'SEDE' } } } },
      },
      select: { tenantId: true, id: true },
      orderBy: { id: 'asc' },
    })
    if (multi?.tenantId) {
      raizesAlternativas.push({
        tenantId: multi.tenantId,
        raizId: multi.id,
        sedes: await db.sede.count({ where: { tenantId: multi.tenantId } }),
      })
    }

    for (const forma of raizesAlternativas) {
      const rotulo = forma.sedes > 1 ? `torcida com ${forma.sedes} unidades` : 'torcida com 1 unidade'
      const v = await medirVisibilidade(forma.tenantId, forma.raizId)

      // Qual nó a derivação de relação realmente usou como ponto de partida.
      // Espelha `findSedeRaiz` (lib/hierarquia.ts): raiz SEDE, com `orderBy`
      // determinístico, e só então qualquer unidade do tenant.
      const ordem = [{ criadoEm: 'asc' as const }, { id: 'asc' as const }]
      const partidaRelation: { id: string; tipo: string } | null =
        (await db.sede.findFirst({
          where: { tenantId: forma.tenantId, tipo: 'SEDE' },
          select: { id: true, tipo: true },
          orderBy: ordem,
        })) ??
        (await db.sede.findFirst({
          where: { tenantId: forma.tenantId },
          select: { id: true, tipo: true },
          orderBy: ordem,
        }))
      const partiuDaRaiz = partidaRelation?.id === forma.raizId

      if (v.maeVeRestrito) {
        ok(AREA, `${rotulo}: Sede mãe enxerga o RESTRITO da unidade filha (relação de ancestral preservada)`)
      } else {
        erro(
          AREA,
          `${rotulo}: Sede mãe NÃO enxerga o financeiro da própria unidade filha, com o elo \`sedeId\` intacto. ` +
            `A derivação partiu de ${partidaRelation?.id} (${partidaRelation?.tipo}), raiz=${forma.raizId}, partiuDaRaiz=${partiuDaRaiz}. ` +
            (partiuDaRaiz
              ? 'Partiu da raiz — a causa NÃO é o nó de partida (Achado 9, corrigido por `findSedeRaiz`); investigue o elo `sedeId` e a sensibilidade do recurso.'
              : '`findSedeRaiz` não devolveu a raiz esperada — a varredura de descendentes começa no meio da árvore e não alcança a filha (regressão do Achado 9).'),
        )
      }
      if (!v.filhaVeRestrito) {
        ok(AREA, `${rotulo}: unidade filha NÃO enxerga o financeiro da mãe (descendente só vê o público)`)
      } else {
        erro(AREA, `${rotulo}: unidade filha enxerga RESTRITO da mãe — descendente com poder de ancestral`)
      }
      if (v.filhaVePublico) {
        ok(AREA, `${rotulo}: unidade filha enxerga o público da mãe (sedes) — herança correta`)
      } else {
        erro(AREA, `${rotulo}: unidade filha não enxerga nem o público da mãe — cadeia de ancestrais rompida`)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. EXCLUSÃO DE UNIDADE — remanejar, nunca apagar em cascata
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: excluir unidade remaneja quem dependia dela', () => {
  it('recusa destino inválido, unidade com filhos e unidade com dados do Bar', async () => {
    const AREA = 'hierarquia/excluir-recusas'
    const ctx = await contextoSede()
    if (!ctx) return

    const { excluirSede } = await import('@/app/admin/(estrutura)/sedes/actions')

    // 1. Origem = destino.
    const rMesma = await comoUsuario(ctx.presidente, () =>
      tentativa(() => excluirSede(ctx.sedePrincipalId, ctx.sedePrincipalId)),
    )
    if (rMesma.ok) {
      erro(AREA, 'Exclusão aceitou a própria unidade como destino do remanejamento')
    } else if (/diferente/i.test(rMesma.erro)) {
      ok(AREA, `Origem igual ao destino recusada: "${rMesma.erro}"`)
    } else {
      alerta(AREA, `Origem = destino falhou por outro motivo: "${rMesma.erro}"`)
    }

    // 2. Destino que não é Sede — sócio de PDE já conta na Sede, remanejar
    //    para baixo perderia a agregação.
    const pde: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} PDE destino inválido`,
        tipo: 'PONTO_ENCONTRO',
        sedeId: ctx.sedePrincipalId,
      },
      select: { id: true },
    })
    aoDesfazer(`remover PDE de destino ${pde.id}`, async () => {
      await db.sede.deleteMany({ where: { id: pde.id } })
    })

    const rDestino = await comoUsuario(ctx.presidente, () =>
      tentativa(() => excluirSede(ctx.sedePrincipalId, pde.id)),
    )
    if (rDestino.ok) {
      erro(AREA, 'Exclusão remanejou membros para um PDE — a contagem da Sede deixaria de agregar')
    } else if (/precisa ser uma Sede/i.test(rDestino.erro)) {
      ok(AREA, `Destino não-Sede recusado: "${rDestino.erro}"`)
    } else {
      alerta(AREA, `Destino não-Sede falhou por outro motivo: "${rDestino.erro}"`)
    }

    // 3. Presidente tentando excluir PDE — privilégio exclusivo do super-admin.
    const rPde = await comoUsuario(ctx.presidente, () =>
      tentativa(() => excluirSede(pde.id, ctx.sedePrincipalId)),
    )
    if (rPde.ok) {
      erro(AREA, 'Presidente excluiu um PDE — a regra reserva isso ao super-admin')
    } else if (/super-admin/i.test(rPde.erro)) {
      ok(AREA, `Presidente barrado ao excluir PDE: "${rPde.erro}"`)
    } else {
      alerta(AREA, `Exclusão de PDE pelo Presidente falhou por outro motivo: "${rPde.erro}"`)
    }

    // 4. Unidade com filha — precisa reatribuir antes.
    const paiComFilha: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} Sede duplicada com filha`,
        tipo: 'SEDE',
        ativa: true,
      },
      select: { id: true },
    })
    const filha: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} PDE filho`,
        tipo: 'PONTO_ENCONTRO',
        sedeId: paiComFilha.id,
      },
      select: { id: true },
    })
    aoDesfazer(`remover Sede duplicada e filha (${paiComFilha.id})`, async () => {
      await db.sede.deleteMany({ where: { id: filha.id } })
      await db.sede.deleteMany({ where: { id: paiComFilha.id } })
    })

    const rFilhos = await comoUsuario(ctx.presidente, () =>
      tentativa(() => excluirSede(paiComFilha.id, ctx.sedePrincipalId)),
    )
    if (rFilhos.ok) {
      erro(AREA, 'Unidade com filha foi excluída — as unidades filhas ficariam órfãs na árvore')
    } else if (/filha/i.test(rFilhos.erro)) {
      ok(AREA, `Unidade com filha recusada na exclusão: "${rFilhos.erro}"`)
    } else {
      alerta(AREA, `Exclusão com filha falhou por outro motivo: "${rFilhos.erro}"`)
    }
  })

  it('exclusão de Sede duplicada remaneja membros e eventos para o destino', async () => {
    const AREA = 'hierarquia/excluir'
    const ctx = await contextoSede()
    if (!ctx) return

    // Sede duplicada: a única forma de o Presidente poder excluir.
    const duplicada: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} Sede duplicada`,
        tipo: 'SEDE',
        ativa: true,
      },
      select: { id: true },
    })
    let removidaPelaAction = false
    aoDesfazer(`remover Sede duplicada ${duplicada.id}`, async () => {
      if (!removidaPelaAction) await db.sede.deleteMany({ where: { id: duplicada.id } })
      await db.auditLog.deleteMany({
        where: { tenantId: ctx.tenantId, acao: 'SEDE_EXCLUIDA', entidadeId: duplicada.id },
      })
    })

    // Um membro e um evento passam a depender dela — é o que deve ser remanejado.
    const membro: { id: string; sedeId: string | null } | null = await db.saasMembro.findFirst({
      where: { tenantId: ctx.tenantId, espelhado: false, status: 'APROVADO' },
      select: { id: true, sedeId: true },
    })
    if (!membro) {
      alerta(AREA, `Sem membro aprovado em ${ctx.slug} — remanejamento não exercitado`)
      return
    }
    const sedeOriginalDoMembro = membro.sedeId
    aoDesfazer(`devolver membro ${membro.id} à unidade original`, async () => {
      await db.saasMembro.updateMany({
        where: { id: membro.id },
        data: { sedeId: sedeOriginalDoMembro },
      })
    })
    await db.saasMembro.update({ where: { id: membro.id }, data: { sedeId: duplicada.id } })

    const evento: { id: string } = await db.evento.create({
      data: {
        tenantId: ctx.tenantId,
        titulo: `${MARCA} evento da sede duplicada`,
        tipo: 'GERAL',
        data: new Date(Date.now() + 5 * 24 * 3600_000),
        sedeId: duplicada.id,
      },
      select: { id: true },
    })
    aoDesfazer(`remover evento ${evento.id}`, async () => {
      await db.eventoRsvp.deleteMany({ where: { eventoId: evento.id } })
      await db.evento.deleteMany({ where: { id: evento.id } })
    })

    const { excluirSede } = await import('@/app/admin/(estrutura)/sedes/actions')
    const r = await comoUsuario(ctx.presidente, () =>
      tentativa(() => excluirSede(duplicada.id, ctx.sedePrincipalId)),
    )
    if (!r.ok) {
      erro(AREA, `Exclusão de Sede duplicada recusada: "${r.erro}"`)
      return
    }
    removidaPelaAction = true

    const aindaExiste: { id: string } | null = await db.sede.findUnique({
      where: { id: duplicada.id },
      select: { id: true },
    })
    if (aindaExiste) {
      erro(AREA, 'Exclusão reportou sucesso mas a unidade continua no banco')
      removidaPelaAction = false
    } else {
      ok(AREA, 'Sede duplicada removida')
    }

    const membroDepois: { sedeId: string | null } | null = await db.saasMembro.findUnique({
      where: { id: membro.id },
      select: { sedeId: true },
    })
    if (membroDepois?.sedeId === ctx.sedePrincipalId) {
      ok(AREA, 'Membro da unidade excluída foi remanejado para a Sede de destino (não ficou órfão)')
    } else {
      erro(
        AREA,
        `Membro não foi remanejado na exclusão (sedeId ficou ${membroDepois?.sedeId}) — sócio perdido da contagem territorial`,
      )
    }

    const eventoDepois: { sedeId: string | null } | null = await db.evento.findUnique({
      where: { id: evento.id },
      select: { sedeId: true },
    })
    if (eventoDepois?.sedeId === ctx.sedePrincipalId) {
      ok(AREA, 'Evento da unidade excluída foi remanejado para a Sede de destino')
    } else {
      erro(AREA, `Evento não foi remanejado (sedeId ficou ${eventoDepois?.sedeId})`)
    }

    const log: number = await db.auditLog.count({
      where: { tenantId: ctx.tenantId, acao: 'SEDE_EXCLUIDA', entidadeId: duplicada.id },
    })
    if (log > 0) ok(AREA, 'Exclusão gravou AuditLog com o destino e a contagem de remanejados')
    else erro(AREA, 'Exclusão não gravou AuditLog — mutação destrutiva sem rastro')
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. REATRIBUIÇÃO DA UNIDADE DO MEMBRO
// ═════════════════════════════════════════════════════════════════════════

describe('fluxo: corrigir a unidade territorial do membro', () => {
  it('recusa registro espelhado, unidade inativa e unidade de outra torcida', async () => {
    const AREA = 'hierarquia/reatribuir-recusas'
    const ctx = await contextoSede()
    if (!ctx) return

    const { PERMISSIONS, calculateEffectivePermissions, hasPermission } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')
    const bruto = await getUserPermissionsInTenant(ctx.presidente, ctx.tenantId)
    const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
    if (!hasPermission(efetivas, PERMISSIONS.MEMBERS_APPROVE)) {
      alerta(AREA, `Presidente de ${ctx.slug} não tem members:approve — reatribuição não exercitada`)
      return
    }

    const { reatribuirSedeMembro } = await import('@/app/admin/membros/actions')

    // 1. Registro espelhado — a fonte é a unidade de origem.
    const espelhado: { id: string } | null = await db.saasMembro.findFirst({
      where: { tenantId: ctx.tenantId, espelhado: true },
      select: { id: true },
    })
    if (espelhado) {
      const r = await comoUsuario(ctx.presidente, () =>
        tentativa(() => reatribuirSedeMembro(espelhado.id, ctx.sedePrincipalId)),
      )
      if (r.ok) {
        erro(AREA, 'Registro ESPELHADO foi reatribuído — a cópia divergiria da unidade de origem')
      } else if (/espelhado/i.test(r.erro)) {
        ok(AREA, `Registro espelhado recusado na reatribuição: "${r.erro}"`)
      } else {
        alerta(AREA, `Reatribuição de espelhado falhou por outro motivo: "${r.erro}"`)
      }
    } else {
      alerta(AREA, `Sem registro espelhado em ${ctx.slug} — regra do espelho não exercitada`)
    }

    const membro: { id: string; sedeId: string | null } | null = await db.saasMembro.findFirst({
      where: { tenantId: ctx.tenantId, espelhado: false, status: 'APROVADO' },
      select: { id: true, sedeId: true },
    })
    if (!membro) return

    // 2. Unidade inativa.
    const inativa: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} unidade desligada`,
        tipo: 'PONTO_ENCONTRO',
        sedeId: ctx.sedePrincipalId,
        ativa: false,
      },
      select: { id: true },
    })
    aoDesfazer(`remover unidade desligada ${inativa.id}`, async () => {
      await db.sede.deleteMany({ where: { id: inativa.id } })
    })

    const rInativa = await comoUsuario(ctx.presidente, () =>
      tentativa(() => reatribuirSedeMembro(membro.id, inativa.id)),
    )
    if (rInativa.ok) {
      erro(AREA, 'Membro foi alocado em unidade INATIVA — sócio some das contagens da torcida')
    } else if (/inativa|não encontrada/i.test(rInativa.erro)) {
      ok(AREA, `Unidade inativa recusada na reatribuição: "${rInativa.erro}"`)
    } else {
      alerta(AREA, `Reatribuição para unidade inativa falhou por outro motivo: "${rInativa.erro}"`)
    }

    // 3. Unidade de outra torcida.
    const alheia: { id: string } | null = await db.sede.findFirst({
      where: { tenantId: { not: null, notIn: [ctx.tenantId] }, ativa: true },
      select: { id: true },
    })
    if (alheia) {
      const rAlheia = await comoUsuario(ctx.presidente, () =>
        tentativa(() => reatribuirSedeMembro(membro.id, alheia.id)),
      )
      if (rAlheia.ok) {
        erro(AREA, 'Membro foi alocado em unidade de OUTRA torcida — vínculo territorial cross-tenant')
      } else if (/não encontrada|inativa/i.test(rAlheia.erro)) {
        ok(AREA, `Unidade de outra torcida recusada na reatribuição: "${rAlheia.erro}"`)
      } else {
        alerta(AREA, `Reatribuição cross-tenant falhou por outro motivo: "${rAlheia.erro}"`)
      }
    }
  })

  it('reatribuição válida move o membro e grava o diff no histórico', async () => {
    const AREA = 'hierarquia/reatribuir'
    const ctx = await contextoSede()
    if (!ctx) return

    const destino: { id: string } = await db.sede.create({
      data: {
        tenantId: ctx.tenantId,
        nome: `${MARCA} unidade de destino`,
        tipo: 'PONTO_ENCONTRO',
        sedeId: ctx.sedePrincipalId,
        ativa: true,
      },
      select: { id: true },
    })
    aoDesfazer(`remover unidade de destino ${destino.id}`, async () => {
      await db.sede.deleteMany({ where: { id: destino.id } })
    })

    const membro: { id: string; sedeId: string | null } | null = await db.saasMembro.findFirst({
      where: { tenantId: ctx.tenantId, espelhado: false, status: 'APROVADO' },
      select: { id: true, sedeId: true },
    })
    if (!membro) {
      alerta(AREA, `Sem membro aprovado em ${ctx.slug} — reatribuição não exercitada`)
      return
    }
    const original = membro.sedeId
    aoDesfazer(`devolver membro ${membro.id} à unidade original`, async () => {
      await db.saasMembro.updateMany({ where: { id: membro.id }, data: { sedeId: original } })
      await db.auditLog.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          acao: 'MEMBRO_SEDE_REATRIBUIDA',
          entidadeId: membro.id,
        },
      })
    })

    const { reatribuirSedeMembro } = await import('@/app/admin/membros/actions')
    const r = await comoUsuario(ctx.presidente, () =>
      tentativa(() => reatribuirSedeMembro(membro.id, destino.id)),
    )
    if (!r.ok) {
      erro(AREA, `Reatribuição válida recusada: "${r.erro}"`)
      return
    }

    const depois: { sedeId: string | null } | null = await db.saasMembro.findUnique({
      where: { id: membro.id },
      select: { sedeId: true },
    })
    if (depois?.sedeId === destino.id) {
      ok(AREA, 'Membro movido para a unidade de destino')
    } else {
      erro(AREA, `Membro não foi movido (sedeId ficou ${depois?.sedeId})`)
    }

    type LogLite = { detalhes: unknown }
    const log: LogLite | null = await db.auditLog.findFirst({
      where: { tenantId: ctx.tenantId, acao: 'MEMBRO_SEDE_REATRIBUIDA', entidadeId: membro.id },
      orderBy: { criadoEm: 'desc' },
      select: { detalhes: true },
    })
    const detalhes = log?.detalhes as
      | { sedeIdAntes?: string | null; sedeIdDepois?: string | null; alteracoes?: unknown[] }
      | undefined
    if (!log) {
      erro(AREA, 'Reatribuição não gravou AuditLog — mudança territorial sem rastro')
    } else if (detalhes?.sedeIdDepois === destino.id && Array.isArray(detalhes.alteracoes)) {
      ok(AREA, 'AuditLog da reatribuição traz o diff campo a campo (de → para), alimentando o histórico do cadastro')
    } else {
      alerta(AREA, `AuditLog gravado sem o diff esperado: ${JSON.stringify(detalhes)}`)
    }
  })
})

describe('sanidade', () => {
  it('a auditoria produziu achados', () => {
    if (achados.length === 0) throw new Error('Nenhuma checagem rodou — auditoria inconclusiva')
  })
})
