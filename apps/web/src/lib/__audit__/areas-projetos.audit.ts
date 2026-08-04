/**
 * Auditoria: ÁREAS DE ATUAÇÃO e PROJETOS — os dois módulos mais novos
 * (2026-08-03) e os únicos sem nenhuma cobertura até aqui.
 *
 * Nenhuma auditoria existente toca `DepartamentoArea`,
 * `DepartamentoAreaMembro`, `Projeto` ou `ProjetoParticipante` — a varredura
 * por modelo devolve zero em todos os `*.audit.ts`. E o que eles introduzem é
 * exatamente a classe de coisa que precisa de rede: **novas relações
 * pessoa↔escopo que se parecem com cargo mas não podem conceder poder**.
 *
 * A regra canônica (CLAUDE.md, `ARCHITECTURE.md` §5.15/§5.16) é curta e
 * fácil de furar por engano numa refatoração:
 *
 *   - Área **não concede permissão**. RBAC continua no `Departamento`.
 *   - `papel: RESPONSAVEL` é accountability, não poder. Quem gere é
 *     `canManageDepartamento` (gestor do depto ou `roles:manage`).
 *   - Projeto **também não concede permissão**. `responsavelId` e
 *     `ProjetoParticipante` são rótulo.
 *   - Gasto realizado do projeto é **derivado** da soma das `DESPESA` com
 *     `projetoId` — nunca um número digitado.
 *
 * Cinco blocos:
 *   A. Área não concede permissão (banco inteiro, não amostra).
 *   B. `resolverAreasDepartamento` — a regra pura confrontada com o banco.
 *   C. Projeto não concede permissão.
 *   D. Dinheiro do projeto é derivado, e não atravessa tenant.
 *   E. Gates das Server Actions reais recusam quem não gere o departamento.
 *
 * Os blocos A–D são somente leitura. O bloco E chama actions que **recusam**
 * — nada é criado, então não há o que reverter.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:areas-projetos
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// ── Sessão e contexto simulados ──────────────────────────────────────────
// As actions de departamento resolvem o tenant por `getTenantFromHost()`, que
// lê subdomínio → cookie → TENANT_SLUG. No harness não há host, então o
// cookie é a alavanca: `comoUsuarioNoTenant` troca sessão e cookie juntos,
// que é exatamente o par que o portal real carrega.
let sessaoAtual: { user: { id: string; email: string; name: string } } | null = null
let cookieTenantSlug: string | null = null

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
  cookies: async () => ({
    get: (nome: string) =>
      nome === 'torcida_ctx' && cookieTenantSlug ? { value: cookieTenantSlug } : undefined,
    set: () => {},
    delete: () => {},
  }),
}))
vi.mock('@/lib/auth', () => ({
  auth: async () => sessaoAtual,
  signIn: async () => {},
  signOut: async () => {},
  handlers: {},
}))

type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const achados: Achado[] = []
const erro = (area: string, msg: string) => void achados.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => void achados.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => void achados.push({ nivel: 'ok', area, msg })

type Db = typeof import('@torcida/db').db
let db: Db

/** Permissões que caracterizam poder de gestão — nenhuma pode vir de área/projeto. */
const PERMISSOES_DE_GESTAO = [
  'roles:manage',
  'settings:manage',
  'members:approve',
  'members:reject',
  'finance:manage',
  'store:manage',
  'bar:manage',
  'channels:manage',
  'community:manage',
]

async function comoUsuarioNoTenant<T>(
  userId: string,
  tenantSlug: string,
  fn: () => Promise<T>,
): Promise<T> {
  const user: { id: string; email: string | null; nome: string | null } | null =
    await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, nome: true },
    })
  if (!user) throw new Error(`Usuário ${userId} não encontrado`)
  const sessaoAnterior = sessaoAtual
  const cookieAnterior = cookieTenantSlug
  sessaoAtual = { user: { id: user.id, email: user.email ?? '', name: user.nome ?? 'Auditoria' } }
  cookieTenantSlug = tenantSlug
  try {
    return await fn()
  } finally {
    sessaoAtual = sessaoAnterior
    cookieTenantSlug = cookieAnterior
  }
}

/** Executa e devolve o erro em vez de propagar (actions ora lançam, ora devolvem). */
async function recusou(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    const r = await fn()
    if (r && typeof r === 'object') {
      const obj = r as { error?: string }
      if (obj.error) return obj.error
    }
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

async function permissoesEfetivas(userId: string, tenantId: string): Promise<string[]> {
  const { calculateEffectivePermissions } = await import('@torcida/types')
  const { getUserPermissionsInTenant } = await import('@/lib/tenant')
  const bruto = await getUserPermissionsInTenant(userId, tenantId)
  return calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
}

/** Quem tem poder legítimo de gerir o departamento: gestor dele ou `roles:manage`. */
async function podeGerirDepartamento(
  userId: string,
  tenantId: string,
  departamentoId: string,
): Promise<boolean> {
  const { canManageDepartamento } = await import('@torcida/types')
  const efetivas = await permissoesEfetivas(userId, tenantId)
  const gestao: { departamentoId: string }[] = await db.departamentoGestor.findMany({
    where: { userId, departamento: { tenantId } },
    select: { departamentoId: true },
  })
  return canManageDepartamento(
    efetivas,
    gestao.map((g) => g.departamentoId),
    departamentoId,
  )
}

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(() => {
  const linhas: string[] = ['', '══════ AUDITORIA: ÁREAS DE ATUAÇÃO E PROJETOS ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = achados.filter((a) => a.nivel === nivel)
    const rotulo =
      nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ Conformes'
    linhas.push('', `${rotulo}: ${itens.length}`)
    for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
  }
  const relatorio = linhas.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'auditoria-areas-projetos.txt'), `${relatorio}\n`, 'utf8')

  const nErros = achados.filter((a) => a.nivel === 'ERRO').length
  expect(nErros, `${nErros} erro(s) na auditoria de áreas/projetos`).toBe(0)
})

// ═════════════════════════════════════════════════════════════════════════
// A. Área não concede permissão
// ═════════════════════════════════════════════════════════════════════════
describe('A) área de atuação não concede permissão', () => {
  it('nenhum membro de área ganha poder de gestão pela área', async () => {
    const AREA = 'areas/permissao'

    const vinculos: {
      userId: string
      papel: string
      area: { id: string; nome: string; tenantId: string; departamentoId: string }
      user: { email: string | null }
    }[] = await db.departamentoAreaMembro.findMany({
      select: {
        userId: true,
        papel: true,
        area: { select: { id: true, nome: true, tenantId: true, departamentoId: true } },
        user: { select: { email: true } },
      },
    })

    if (vinculos.length === 0) {
      alerta(AREA, 'Nenhum DepartamentoAreaMembro no banco — regra não exercitada')
      return
    }

    let conformes = 0
    let responsaveis = 0
    for (const v of vinculos) {
      const legitimo = await podeGerirDepartamento(
        v.userId,
        v.area.tenantId,
        v.area.departamentoId,
      )
      const efetivas = await permissoesEfetivas(v.userId, v.area.tenantId)
      const comGestao = efetivas.filter((e) => PERMISSOES_DE_GESTAO.includes(e))

      if (v.papel === 'RESPONSAVEL') responsaveis += 1

      if (comGestao.length > 0 && !legitimo) {
        // Poder sem gestoria nem `roles:manage` = veio de outro lugar. Se o
        // único vínculo dessa pessoa com o departamento for a área, é
        // vazamento — o pacote do próprio departamento é caminho legítimo.
        const noDepartamento: { id: string } | null = await db.userDepartamento.findFirst({
          where: { userId: v.userId, tenantId: v.area.tenantId, departamentoId: v.area.departamentoId },
          select: { id: true },
        })
        const porCargoDepto: { id: string } | null = await db.userRole.findFirst({
          where: {
            userId: v.userId,
            tenantId: v.area.tenantId,
            role: { departamentoId: v.area.departamentoId },
          },
          select: { id: true },
        })
        if (!noDepartamento && !porCargoDepto) {
          erro(
            AREA,
            `${v.user.email} tem ${comGestao.join(', ')} em "${v.area.nome}" sem estar no departamento — área virou cargo`,
          )
          continue
        }
      }
      conformes += 1
    }

    ok(
      AREA,
      `${conformes}/${vinculos.length} vínculo(s) de área sem poder indevido (${responsaveis} RESPONSAVEL)`,
    )
  })

  it('RESPONSAVEL de área não vira gestor do departamento', async () => {
    const AREA = 'areas/responsavel'

    const responsaveis: {
      userId: string
      area: { nome: string; tenantId: string; departamentoId: string }
      user: { email: string | null }
    }[] = await db.departamentoAreaMembro.findMany({
      where: { papel: 'RESPONSAVEL' },
      select: {
        userId: true,
        area: { select: { nome: true, tenantId: true, departamentoId: true } },
        user: { select: { email: true } },
      },
    })
    if (responsaveis.length === 0) {
      alerta(AREA, 'Nenhum RESPONSAVEL de área no banco — regra não exercitada')
      return
    }

    for (const r of responsaveis) {
      const gestor: { id: string } | null = await db.departamentoGestor.findFirst({
        where: { userId: r.userId, departamentoId: r.area.departamentoId },
        select: { id: true },
      })
      const pode = await podeGerirDepartamento(r.userId, r.area.tenantId, r.area.departamentoId)
      if (pode && !gestor) {
        const efetivas = await permissoesEfetivas(r.userId, r.area.tenantId)
        if (!efetivas.includes('roles:manage')) {
          erro(
            AREA,
            `${r.user.email}: RESPONSAVEL de "${r.area.nome}" gere o departamento sem ser DepartamentoGestor nem ter roles:manage`,
          )
          continue
        }
      }
      ok(AREA, `${r.user.email}: RESPONSAVEL de "${r.area.nome}" sem poder derivado do papel`)
    }
  })

  it('membro de área é subconjunto de quem está no departamento', async () => {
    const AREA = 'areas/elegibilidade'

    // `assertElegivelParaArea` exige estar no departamento antes de entrar na
    // área. Linha que viola isso é estado que a action não poderia ter criado.
    const vinculos: {
      userId: string
      area: { nome: string; tenantId: string; departamentoId: string }
      user: { email: string | null }
    }[] = await db.departamentoAreaMembro.findMany({
      select: {
        userId: true,
        area: { select: { nome: true, tenantId: true, departamentoId: true } },
        user: { select: { email: true } },
      },
    })

    let orfaos = 0
    for (const v of vinculos) {
      const [porDepartamento, porCargo, gestor]: [
        { id: string } | null,
        { id: string } | null,
        { id: string } | null,
      ] = await Promise.all([
        db.userDepartamento.findFirst({
          where: {
            userId: v.userId,
            tenantId: v.area.tenantId,
            departamentoId: v.area.departamentoId,
          },
          select: { id: true },
        }),
        db.userRole.findFirst({
          where: {
            userId: v.userId,
            tenantId: v.area.tenantId,
            role: { departamentoId: v.area.departamentoId },
          },
          select: { id: true },
        }),
        db.departamentoGestor.findFirst({
          where: { userId: v.userId, departamentoId: v.area.departamentoId },
          select: { id: true },
        }),
      ])
      if (!porDepartamento && !porCargo && !gestor) {
        orfaos += 1
        erro(
          AREA,
          `${v.user.email} está na área "${v.area.nome}" sem nenhum vínculo com o departamento — órfão`,
        )
      }
    }
    if (orfaos === 0) {
      ok(AREA, `${vinculos.length} vínculo(s) de área, todos com base no departamento`)
    }
  })

  it('área não atravessa tenant', async () => {
    const AREA = 'areas/tenant'
    const areas: { id: string; nome: string; tenantId: string; departamentoId: string }[] =
      await db.departamentoArea.findMany({
        select: { id: true, nome: true, tenantId: true, departamentoId: true },
      })
    if (areas.length === 0) {
      alerta(AREA, 'Nenhuma DepartamentoArea no banco — rode seed:departamento-areas')
      return
    }

    // Em lote: o banco tem milhares de áreas (10 por departamento × 565
    // torcidas) e um `findUnique` por linha estoura o tempo da auditoria.
    const deptos: { id: string; tenantId: string }[] = await db.departamento.findMany({
      where: { id: { in: [...new Set(areas.map((a) => a.departamentoId))] } },
      select: { id: true, tenantId: true },
    })
    const tenantDoDepto = new Map(deptos.map((d) => [d.id, d.tenantId]))

    let divergentes = 0
    for (const a of areas) {
      const tenantDepto = tenantDoDepto.get(a.departamentoId)
      if (tenantDepto && tenantDepto !== a.tenantId) {
        divergentes += 1
        if (divergentes <= 10) {
          erro(
            AREA,
            `Área "${a.nome}" tem tenantId ${a.tenantId} mas o departamento é do tenant ${tenantDepto}`,
          )
        }
      }
    }
    if (divergentes === 0) ok(AREA, `${areas.length} área(s), todas no tenant do próprio departamento`)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. A regra pura confrontada com o banco
// ═════════════════════════════════════════════════════════════════════════
describe('B) resolverAreasDepartamento decide gestão só pelo departamento', () => {
  it('podeGerir ignora ser membro e ser responsável de todas as áreas', async () => {
    const AREA = 'areas/regra-pura'
    const { resolverAreasDepartamento } = await import('@/lib/departamentos-portal-access')
    type AreaBase = import('@/lib/departamentos-portal-access').AreaBase

    const depto: { id: string; nome: string; tenantId: string } | null =
      await db.departamento.findFirst({
        where: { areas: { some: {} } },
        select: { id: true, nome: true, tenantId: true },
      })
    if (!depto) {
      alerta(AREA, 'Nenhum departamento com áreas — regra pura não exercitada')
      return
    }

    const areas: AreaBase[] = await db.departamentoArea.findMany({
      where: { departamentoId: depto.id },
      select: {
        id: true,
        nome: true,
        slug: true,
        descricao: true,
        icone: true,
        ordem: true,
        ativa: true,
        sazonal: true,
      },
    })
    const todosIds = areas.map((a) => a.id)

    // Cenário extremo de propósito: membro E responsável de TODAS as áreas,
    // sem ser gestor do departamento. Se `podeGerir` virar true aqui, área
    // passou a conceder poder.
    const semGestoria = resolverAreasDepartamento({
      areas,
      membroAreaIds: todosIds,
      responsavelAreaIds: todosIds,
      isGestorDepartamento: false,
    })
    const vazou = semGestoria.filter((a) => a.podeGerir)
    if (vazou.length > 0) {
      erro(
        AREA,
        `podeGerir=true em ${vazou.length} área(s) sem gestoria do departamento — área virou cargo`,
      )
    } else {
      ok(AREA, `"${depto.nome}": responsável de todas as ${areas.length} áreas ainda não gere`)
    }

    // E o contrário: gestor do departamento gere todas, mesmo sem estar em nenhuma.
    const comGestoria = resolverAreasDepartamento({
      areas,
      membroAreaIds: [],
      responsavelAreaIds: [],
      isGestorDepartamento: true,
    })
    if (comGestoria.some((a) => !a.podeGerir)) {
      erro(AREA, 'Gestor do departamento não gere alguma área — gestão deixou de cascatear')
    } else {
      ok(AREA, `"${depto.nome}": gestor do departamento gere as ${areas.length} áreas`)
    }

    // `isSuperAdmin` está marcado @deprecated justamente por não conceder mais.
    const comoSuperAdmin = resolverAreasDepartamento({
      areas,
      membroAreaIds: [],
      responsavelAreaIds: [],
      isGestorDepartamento: false,
      isSuperAdmin: true,
    })
    if (comoSuperAdmin.some((a) => a.podeGerir)) {
      erro(AREA, 'isSuperAdmin voltou a conceder gestão de área — o parâmetro é inerte por decisão')
    } else {
      ok(AREA, 'isSuperAdmin não concede gestão de área (parâmetro inerte, como documentado)')
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. Projeto não concede permissão
// ═════════════════════════════════════════════════════════════════════════
describe('C) projeto não concede permissão', () => {
  it('participante e responsável de projeto não ganham gestão', async () => {
    const AREA = 'projetos/permissao'

    const participantes: {
      userId: string
      projeto: { titulo: string; tenantId: string; departamentoId: string }
      user: { email: string | null }
    }[] = await db.projetoParticipante.findMany({
      select: {
        userId: true,
        projeto: { select: { titulo: true, tenantId: true, departamentoId: true } },
        user: { select: { email: true } },
      },
    })

    const responsaveis: {
      id: string
      titulo: string
      tenantId: string
      departamentoId: string
      responsavelId: string | null
      responsavel: { email: string | null } | null
    }[] = await db.projeto.findMany({
      where: { responsavelId: { not: null } },
      select: {
        id: true,
        titulo: true,
        tenantId: true,
        departamentoId: true,
        responsavelId: true,
        responsavel: { select: { email: true } },
      },
    })

    if (participantes.length === 0 && responsaveis.length === 0) {
      alerta(AREA, 'Nenhum Projeto com participante ou responsável — regra não exercitada')
      return
    }

    const conferir = [
      ...participantes.map((p) => ({
        userId: p.userId,
        email: p.user.email,
        rotulo: `participante de "${p.projeto.titulo}"`,
        tenantId: p.projeto.tenantId,
        departamentoId: p.projeto.departamentoId,
      })),
      ...responsaveis.map((r) => ({
        userId: r.responsavelId!,
        email: r.responsavel?.email ?? null,
        rotulo: `responsável por "${r.titulo}"`,
        tenantId: r.tenantId,
        departamentoId: r.departamentoId,
      })),
    ]

    let conformes = 0
    for (const c of conferir) {
      const legitimo = await podeGerirDepartamento(c.userId, c.tenantId, c.departamentoId)
      if (!legitimo) {
        conformes += 1
        continue
      }
      // Gere o departamento: só vale se veio de gestoria/roles:manage, não do projeto.
      const gestor: { id: string } | null = await db.departamentoGestor.findFirst({
        where: { userId: c.userId, departamentoId: c.departamentoId },
        select: { id: true },
      })
      const efetivas = await permissoesEfetivas(c.userId, c.tenantId)
      if (!gestor && !efetivas.includes('roles:manage')) {
        erro(AREA, `${c.email}: ${c.rotulo} gere o departamento sem gestoria nem roles:manage`)
        continue
      }
      conformes += 1
    }
    ok(AREA, `${conformes}/${conferir.length} vínculo(s) de projeto sem poder derivado do projeto`)
  })

  it('participante de projeto está no departamento do projeto', async () => {
    const AREA = 'projetos/elegibilidade'
    const participantes: {
      userId: string
      projeto: { titulo: string; tenantId: string; departamentoId: string }
      user: { email: string | null }
    }[] = await db.projetoParticipante.findMany({
      select: {
        userId: true,
        projeto: { select: { titulo: true, tenantId: true, departamentoId: true } },
        user: { select: { email: true } },
      },
    })
    if (participantes.length === 0) {
      alerta(AREA, 'Nenhum ProjetoParticipante — regra não exercitada')
      return
    }

    let orfaos = 0
    for (const p of participantes) {
      const [porDepartamento, porCargo, gestor]: [
        { id: string } | null,
        { id: string } | null,
        { id: string } | null,
      ] = await Promise.all([
        db.userDepartamento.findFirst({
          where: {
            userId: p.userId,
            tenantId: p.projeto.tenantId,
            departamentoId: p.projeto.departamentoId,
          },
          select: { id: true },
        }),
        db.userRole.findFirst({
          where: {
            userId: p.userId,
            tenantId: p.projeto.tenantId,
            role: { departamentoId: p.projeto.departamentoId },
          },
          select: { id: true },
        }),
        db.departamentoGestor.findFirst({
          where: { userId: p.userId, departamentoId: p.projeto.departamentoId },
          select: { id: true },
        }),
      ])
      if (!porDepartamento && !porCargo && !gestor) {
        orfaos += 1
        erro(
          AREA,
          `${p.user.email} participa de "${p.projeto.titulo}" sem vínculo com o departamento`,
        )
      }
    }
    if (orfaos === 0) {
      ok(AREA, `${participantes.length} participante(s) de projeto, todos do departamento`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// D. Dinheiro do projeto é derivado
// ═════════════════════════════════════════════════════════════════════════
describe('D) gasto do projeto vem da soma das DESPESA, não de campo digitado', () => {
  it('lançamento vinculado pertence ao mesmo tenant do projeto', async () => {
    const AREA = 'projetos/financeiro'

    const lancamentos: {
      id: string
      tenantId: string
      tipo: string
      projetoId: string | null
      departamentoId: string | null
    }[] = await db.financeiroLancamento.findMany({
      where: { projetoId: { not: null } },
      select: { id: true, tenantId: true, tipo: true, projetoId: true, departamentoId: true },
    })
    if (lancamentos.length === 0) {
      alerta(AREA, 'Nenhum lançamento com projetoId — rateio por projeto não exercitado')
      return
    }

    let divergentes = 0
    for (const l of lancamentos) {
      const projeto: { tenantId: string; departamentoId: string; titulo: string } | null =
        await db.projeto.findUnique({
          where: { id: l.projetoId! },
          select: { tenantId: true, departamentoId: true, titulo: true },
        })
      if (!projeto) {
        divergentes += 1
        erro(AREA, `Lançamento ${l.id} aponta para projeto inexistente ${l.projetoId}`)
        continue
      }
      if (projeto.tenantId !== l.tenantId) {
        divergentes += 1
        erro(
          AREA,
          `Lançamento ${l.id} (tenant ${l.tenantId}) rateado no projeto "${projeto.titulo}" do tenant ${projeto.tenantId} — dinheiro atravessou torcida`,
        )
      }
      if (l.departamentoId && l.departamentoId !== projeto.departamentoId) {
        alerta(
          AREA,
          `Lançamento ${l.id}: departamentoId ${l.departamentoId} ≠ departamento do projeto "${projeto.titulo}"`,
        )
      }
    }
    if (divergentes === 0) {
      ok(AREA, `${lancamentos.length} lançamento(s) rateado(s), todos coerentes com o projeto`)
    }
  })

  it('o gasto exibido é recomputado da base, não lido de coluna', async () => {
    const AREA = 'projetos/derivado'

    // `Projeto` só guarda `orcamentoPrevisto`. Se um dia surgir uma coluna de
    // gasto realizado, este teste vira o lugar onde a decisão é revista: hoje
    // a única fonte é o `groupBy` sobre `FinanceiroLancamento`.
    const projeto: { id: string; titulo: string; tenantId: string } | null =
      await db.projeto.findFirst({ select: { id: true, titulo: true, tenantId: true } })
    if (!projeto) {
      alerta(AREA, 'Nenhum Projeto no banco — invariante não exercitada')
      return
    }

    const soma: { _sum: { valor: unknown } } = await db.financeiroLancamento.aggregate({
      where: { tenantId: projeto.tenantId, tipo: 'DESPESA', projetoId: projeto.id },
      _sum: { valor: true },
    })
    const esperado = Number(soma._sum.valor ?? 0)

    const campos = Object.keys(
      (await db.projeto.findUnique({ where: { id: projeto.id } })) ?? {},
    )
    const suspeitos = campos.filter((c) => /gasto|realizadoValor|despesaTotal/i.test(c))
    if (suspeitos.length > 0) {
      erro(
        AREA,
        `Projeto ganhou coluna de gasto (${suspeitos.join(', ')}) — a regra é derivar da soma das DESPESA`,
      )
    } else {
      ok(AREA, `"${projeto.titulo}": sem coluna de gasto; soma das DESPESA = ${esperado}`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// E. Gates das Server Actions
// ═════════════════════════════════════════════════════════════════════════
describe('E) as actions recusam quem não gere o departamento', () => {
  it('criar área, criar projeto e adicionar membro exigem gestão', async () => {
    const AREA = 'actions/gate'
    const { criarAreaDepartamento, adicionarMembroAreaDepartamento } = await import(
      '@/app/portal/departamentos/actions'
    )
    const { criarProjeto } = await import('@/app/portal/departamentos/projetos-actions')

    const depto: {
      id: string
      slug: string
      nome: string
      tenantId: string
      tenant: { slug: string }
    } | null = await db.departamento.findFirst({
      where: { areas: { some: {} }, tenant: { ativo: true, sintetico: false } },
      select: {
        id: true,
        slug: true,
        nome: true,
        tenantId: true,
        tenant: { select: { slug: true } },
      },
    })
    if (!depto) {
      alerta(AREA, 'Nenhum departamento com áreas em tenant ativo — gates não exercitados')
      return
    }

    // Sócio aprovado comum: sem gestoria, sem roles:manage. É o perfil que
    // não pode criar área nem projeto — e o mais provável de existir por engano
    // do lado de dentro da tela.
    const candidatos: { userId: string; user: { email: string | null } }[] =
      await db.saasMembro.findMany({
        where: {
          tenantId: depto.tenantId,
          status: 'APROVADO',
          tipo: 'SOCIO',
          espelhado: false,
          desligadoEm: null,
        },
        select: { userId: true, user: { select: { email: true } } },
        take: 25,
      })

    let comum: { userId: string; email: string | null } | null = null
    for (const c of candidatos) {
      if (await podeGerirDepartamento(c.userId, depto.tenantId, depto.id)) continue
      comum = { userId: c.userId, email: c.user.email }
      break
    }
    if (!comum) {
      alerta(AREA, `${depto.tenant.slug}: todo sócio testado já gere "${depto.nome}" — sem contraste`)
      return
    }

    // ⚠️ O payload precisa passar no Zod, senão a recusa vem do schema e o
    // gate nunca é exercitado — "Invalid input" seria um verde falso. Por isso
    // todo campo do formulário real vai preenchido, inclusive os opcionais
    // (`formData.get()` de campo ausente devolve `null`, que `.optional()` do
    // Zod recusa).
    const formArea = new FormData()
    formArea.append('departamentoId', depto.id)
    formArea.append('slug', depto.slug)
    formArea.append('nome', 'Área que a auditoria não pode criar')
    formArea.append('descricao', '')
    formArea.append('sazonal', '')
    const recusaArea = await comoUsuarioNoTenant(comum.userId, depto.tenant.slug, () =>
      recusou(() => criarAreaDepartamento({}, formArea)),
    )
    if (!recusaArea) {
      erro(AREA, `${comum.email} criou área em "${depto.nome}" sem gerir o departamento`)
    } else if (/invalid input|dados inválidos/i.test(recusaArea)) {
      erro(
        AREA,
        `criarAreaDepartamento recusou por schema ("${recusaArea}"), não pelo gate — a sonda não prova nada; corrija o payload`,
      )
    } else {
      ok(AREA, `criarAreaDepartamento recusou sócio comum pelo gate: "${recusaArea}"`)
    }

    const formProjeto = new FormData()
    formProjeto.append('departamentoId', depto.id)
    formProjeto.append('slug', depto.slug)
    formProjeto.append('titulo', 'Projeto que a auditoria não pode criar')
    formProjeto.append('descricao', '')
    formProjeto.append('tipo', 'PROJETO')
    formProjeto.append('status', 'PLANEJADO')
    formProjeto.append('areaId', '')
    formProjeto.append('inicio', new Date().toISOString().slice(0, 10))
    formProjeto.append('fim', '')
    formProjeto.append('metaUnidade', '')
    formProjeto.append('responsavelId', '')
    const recusaProjeto = await comoUsuarioNoTenant(comum.userId, depto.tenant.slug, () =>
      recusou(() => criarProjeto({}, formProjeto)),
    )
    if (!recusaProjeto) {
      erro(AREA, `${comum.email} criou projeto em "${depto.nome}" sem gerir o departamento`)
    } else if (/invalid input|dados inválidos/i.test(recusaProjeto)) {
      erro(
        AREA,
        `criarProjeto recusou por schema ("${recusaProjeto}"), não pelo gate — corrija o payload`,
      )
    } else {
      ok(AREA, `criarProjeto recusou sócio comum pelo gate: "${recusaProjeto}"`)
    }

    const area: { id: string; nome: string } | null = await db.departamentoArea.findFirst({
      where: { departamentoId: depto.id },
      select: { id: true, nome: true },
    })
    if (area) {
      const formMembro = new FormData()
      formMembro.append('areaId', area.id)
      formMembro.append('departamentoId', depto.id)
      formMembro.append('slug', depto.slug)
      formMembro.append('targetUserId', comum.userId)
      const recusaMembro = await comoUsuarioNoTenant(comum.userId, depto.tenant.slug, () =>
        recusou(() => adicionarMembroAreaDepartamento({}, formMembro)),
      )
      if (!recusaMembro) {
        erro(AREA, `${comum.email} se auto-adicionou à área "${area.nome}"`)
      } else {
        ok(AREA, `adicionarMembroAreaDepartamento recusou auto-inscrição: "${recusaMembro}"`)
      }
    }
  })

  it('gestão não atravessa torcida: gestor de um tenant não gere o departamento de outro', async () => {
    const AREA = 'actions/cross-tenant'
    const { criarAreaDepartamento } = await import('@/app/portal/departamentos/actions')

    const gestor: {
      userId: string
      departamento: { tenantId: string; nome: string }
      user: { email: string | null }
    } | null = await db.departamentoGestor.findFirst({
      select: {
        userId: true,
        departamento: { select: { tenantId: true, nome: true } },
        user: { select: { email: true } },
      },
    })
    if (!gestor) {
      alerta(AREA, 'Nenhum DepartamentoGestor no banco — cross-tenant não exercitado')
      return
    }

    const alheio: {
      id: string
      nome: string
      slug: string
      tenantId: string
      tenant: { slug: string }
    } | null = await db.departamento.findFirst({
      where: {
        tenantId: { not: gestor.departamento.tenantId },
        tenant: { ativo: true, sintetico: false },
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        tenantId: true,
        tenant: { select: { slug: true } },
      },
    })
    if (!alheio) {
      alerta(AREA, 'Sem departamento em outro tenant para contraste')
      return
    }

    // Cookie apontando para a torcida alheia: é a tentativa de escalada que
    // um usuário faria trocando o contexto à mão.
    const form = new FormData()
    form.append('departamentoId', alheio.id)
    form.append('slug', alheio.slug)
    form.append('nome', 'Área cross-tenant que não pode existir')
    form.append('descricao', '')
    form.append('sazonal', '')
    const recusa = await comoUsuarioNoTenant(gestor.userId, alheio.tenant.slug, () =>
      recusou(() => criarAreaDepartamento({}, form)),
    )
    if (!recusa) {
      erro(
        AREA,
        `${gestor.user.email} (gestor em outro tenant) criou área em "${alheio.nome}" de ${alheio.tenant.slug}`,
      )
    } else if (/invalid input|dados inválidos/i.test(recusa)) {
      erro(AREA, `Recusa veio do schema ("${recusa}"), não do gate cross-tenant — corrija o payload`)
    } else {
      ok(AREA, `criarAreaDepartamento recusou gestão cross-tenant pelo gate: "${recusa}"`)
    }
  })
})
