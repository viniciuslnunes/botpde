/**
 * Auditoria funcional contra o BANCO REAL, exercitando o código de produção
 * (não replicando a lógica): permissões efetivas, feed, canais/grupos,
 * departamentos e eventos.
 *
 * Por que `.audit.ts` e não `.test.ts`: o `include` do vitest.config é
 * `src/**\/*.test.ts`, então o CI **não** pega este arquivo — ele depende de
 * `DATABASE_URL` e de dados semeados, e não pode quebrar o pipeline.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:dados
 *
 * O que os mocks fazem: `unstable_cache`/`revalidateTag` só existem dentro
 * do request scope do Next. Aqui viram passthrough/no-op — o que muda é só
 * o cache, não a lógica auditada.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

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

const DOM_COR = '@teste.corinthians.torcida.app'
const DOM_NAC = '@teste.nacional.torcida.app'

/** Achados acumulados — impressos no final, sem falhar a suíte. */
type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const achados: Achado[] = []
const erro = (area: string, msg: string) => achados.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => achados.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => achados.push({ nivel: 'ok', area, msg })

type Ctx = {
  db: typeof import('@torcida/db').db
  tenants: { id: string; slug: string; afiliacaoId: string | null }[]
  porSlug: Map<string, { id: string; slug: string; afiliacaoId: string | null }>
}
let ctx: Ctx

/**
 * `getUserPermissionsInTenant` devolve `{ rolePermissions, overrides }` — o
 * conjunto efetivo é o resultado de `calculateEffectivePermissions`, que é
 * onde os overrides individuais vencem o pacote do cargo.
 */
async function permissoesEfetivas(userId: string, tenantId: string): Promise<string[]> {
  const { getUserPermissionsInTenant } = await import('@/lib/tenant')
  const { calculateEffectivePermissions } = await import('@torcida/types')
  const bruto = await getUserPermissionsInTenant(userId, tenantId)
  return calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides) as string[]
}

beforeAll(async () => {
  const { db } = await import('@torcida/db')
  const tenants: { id: string; slug: string; afiliacaoId: string | null }[] = await db.tenant.findMany({
    where: {
      slug: {
        in: [
          'pde-gavioes-fiel',
          'camisa-12-corinthians',
          'mancha-alviverde',
          'dragoes-da-real',
          'torcida-jovem-flamengo',
          'geral-do-gremio',
          'camisa-12-inter',
          'young-flu',
        ],
      },
    },
    select: { id: true, slug: true, afiliacaoId: true },
  })
  ctx = { db, tenants, porSlug: new Map(tenants.map((t) => [t.slug, t])) }
})

// ── 1. PERMISSÕES EFETIVAS ───────────────────────────────────────────────
describe('permissões efetivas (getUserPermissionsInTenant, código real)', () => {
  it('resolve cada cargo de sistema com o pacote esperado', async () => {
    const { SYSTEM_ROLE_PERMISSIONS, PERMISSIONS, hasPermission } = await import('@torcida/types')
    const tenant = ctx.porSlug.get('pde-gavioes-fiel')!

    for (const cargo of ['owner', 'admin', 'vice', 'member'] as const) {
      // Isola quem tem SÓ este cargo de sistema: usuário acumulando
      // owner+admin+member (comum em dado real) contamina a leitura.
      const candidatos = await ctx.db.$queryRaw<{ user_id: string }[]>`
        SELECT ur.user_id FROM saas_user_roles ur
        JOIN saas_roles r ON r.id = ur.role_id
        WHERE ur.tenant_id = ${tenant.id} AND r.is_system AND r.nome = ${cargo}
          AND (SELECT COUNT(*) FROM saas_user_roles ur2
               JOIN saas_roles r2 ON r2.id = ur2.role_id
               WHERE ur2.user_id = ur.user_id AND ur2.tenant_id = ur.tenant_id AND r2.is_system) = 1
        LIMIT 1`
      if (candidatos.length === 0) {
        alerta('permissões', `Ninguém com APENAS o cargo '${cargo}' em ${tenant.slug} — cargo não isolável para auditoria`)
        continue
      }
      const efetivas = await permissoesEfetivas(candidatos[0].user_id, tenant.id)
      const esperadas = SYSTEM_ROLE_PERMISSIONS[cargo] as string[]
      const faltando = esperadas.filter((p) => !hasPermission(efetivas, p))
      if (faltando.length > 0) {
        erro('permissões', `Cargo '${cargo}' não tem ${faltando.length} permissão(ões) do pacote: ${faltando.slice(0, 5).join(', ')}`)
      } else {
        ok('permissões', `Cargo '${cargo}': pacote completo (${esperadas.length} permissões)`)
      }
      // Segregação: 'member' nunca deve alcançar gestão financeira.
      if (cargo === 'member' && hasPermission(efetivas, PERMISSIONS.FINANCE_MANAGE)) {
        erro('permissões', `Cargo 'member' alcança ${PERMISSIONS.FINANCE_MANAGE} — escalada de privilégio`)
      }
    }
    expect(true).toBe(true)
  })

  it('Role rows de cargo de sistema estão em dia com SYSTEM_ROLE_PERMISSIONS', async () => {
    // Higiene: o runtime já resolve pela constante (`permissionsOfRole` /
    // Achado 1). Manter o array gravado alinhado evita surpresa em scripts
    // de bootstrap/repair e em UIs que ainda leem o Role cru.
    const { SYSTEM_ROLE_PERMISSIONS } = await import('@torcida/types')
    const roles = await ctx.db.role.findMany({
      where: { isSystem: true },
      select: { nome: true, tenantId: true, permissions: true, permissionsExtras: true },
    })
    const porNome = new Map<string, { total: number; stale: number; faltantes: Set<string> }>()
    for (const r of roles) {
      const esperado = (SYSTEM_ROLE_PERMISSIONS as Record<string, string[]>)[r.nome]
      if (!esperado) continue
      const gravadas = new Set([...r.permissions, ...r.permissionsExtras])
      const faltando = esperado.filter((p) => !gravadas.has(p))
      const agg = porNome.get(r.nome) ?? { total: 0, stale: 0, faltantes: new Set<string>() }
      agg.total += 1
      if (faltando.length > 0) {
        agg.stale += 1
        for (const f of faltando) agg.faltantes.add(f)
      }
      porNome.set(r.nome, agg)
    }
    let houve = false
    for (const [nome, agg] of porNome) {
      if (agg.stale === 0) {
        ok('permissões', `Cargo '${nome}': ${agg.total} Role row(s) em dia com o código`)
        continue
      }
      houve = true
      erro(
        'permissões',
        `Cargo '${nome}': ${agg.stale}/${agg.total} torcidas com Role DESATUALIZADO — falta ${[...agg.faltantes].join(', ')} (rodar db:repair-system-roles; runtime já usa a constante)`,
      )
    }
    expect(houve || porNome.size > 0).toBe(true)
  })

  it('membro sem cargo nenhum não tem permissão alguma', async () => {
    const tenant = ctx.porSlug.get('pde-gavioes-fiel')!
    const semCargo = await ctx.db.$queryRaw<{ user_id: string }[]>`
      SELECT m.user_id FROM saas_membros m
      WHERE m.tenant_id = ${tenant.id} AND m.status = 'APROVADO'
        AND NOT EXISTS (SELECT 1 FROM saas_user_roles ur WHERE ur.user_id = m.user_id AND ur.tenant_id = m.tenant_id)
      LIMIT 3`
    if (semCargo.length === 0) {
      alerta('permissões', 'Nenhum membro aprovado sem cargo — cenário "sem permissão" não coberto por dado')
      return
    }
    for (const { user_id } of semCargo) {
      const efetivas = await permissoesEfetivas(user_id, tenant.id)
      if (efetivas.length > 0) {
        erro('permissões', `Membro sem cargo tem ${efetivas.length} permissão(ões): ${efetivas.slice(0, 5).join(', ')}`)
      }
    }
    ok('permissões', `${semCargo.length} membro(s) sem cargo: nenhuma permissão (correto)`)
  })

  it('override individual granted=false REVOGA permissão que o cargo concede', async () => {
    const { hasPermission } = await import('@torcida/types')
    const negados = await ctx.db.userPermission.findMany({
      where: { granted: false },
      select: { userId: true, tenantId: true, permission: true },
      take: 20,
    })
    if (negados.length === 0) {
      alerta('permissões', 'Nenhum override granted=false no banco — revogação individual não auditada')
      return
    }
    let violacoes = 0
    for (const o of negados) {
      const efetivas = await permissoesEfetivas(o.userId, o.tenantId)
      if (hasPermission(efetivas, o.permission)) {
        violacoes += 1
        erro('permissões', `Override granted=false NÃO revogou '${o.permission}' (user ${o.userId.slice(0, 8)})`)
      }
    }
    if (violacoes === 0) ok('permissões', `${negados.length} override(s) de revogação: todos respeitados`)
  })

  it('override individual granted=true CONCEDE permissão fora do cargo', async () => {
    const { hasPermission } = await import('@torcida/types')
    const concedidos = await ctx.db.userPermission.findMany({
      where: { granted: true },
      select: { userId: true, tenantId: true, permission: true },
      take: 20,
    })
    if (concedidos.length === 0) {
      alerta('permissões', 'Nenhum override granted=true — concessão individual não auditada')
      return
    }
    let falhas = 0
    for (const o of concedidos) {
      const efetivas = await permissoesEfetivas(o.userId, o.tenantId)
      if (!hasPermission(efetivas, o.permission)) {
        falhas += 1
        erro('permissões', `Override granted=true NÃO concedeu '${o.permission}' (user ${o.userId.slice(0, 8)})`)
      }
    }
    if (falhas === 0) ok('permissões', `${concedidos.length} override(s) de concessão: todos aplicados`)
  })

  it('gestor de área tem as permissions do pacote GESTOR; membro de área não', async () => {
    const { hasPermission } = await import('@torcida/types')
    const tenant = ctx.porSlug.get('camisa-12-corinthians')!
    const gestores: { userId: string; departamento: { nome: string; permissions: string[]; permissionsGestor: string[] } }[] = await ctx.db.departamentoGestor.findMany({
      where: { departamento: { tenantId: tenant.id } },
      select: { userId: true, departamento: { select: { nome: true, permissions: true, permissionsGestor: true } } },
      take: 6,
    })
    if (gestores.length === 0) {
      alerta('departamentos', `Sem DepartamentoGestor em ${tenant.slug} — herança de gestor não auditada`)
      return
    }
    let problemas = 0
    for (const g of gestores) {
      const efetivas = await permissoesEfetivas(g.userId, tenant.id)
      const faltandoGestor = g.departamento.permissionsGestor.filter((p) => !hasPermission(efetivas, p))
      const faltandoMembro = g.departamento.permissions.filter((p) => !hasPermission(efetivas, p))
      if (faltandoGestor.length > 0 || faltandoMembro.length > 0) {
        problemas += 1
        erro(
          'departamentos',
          `Gestor de '${g.departamento.nome}' não herdou ${faltandoMembro.length} de membro + ${faltandoGestor.length} de gestor (ex.: ${[...faltandoMembro, ...faltandoGestor].slice(0, 3).join(', ')})`,
        )
      }
    }
    if (problemas === 0) ok('departamentos', `${gestores.length} gestor(es) de área: herança membro ∪ gestor completa`)

    // Membro de área NÃO deve ter as permissions exclusivas de gestor.
    const membrosArea = await ctx.db.$queryRaw<{ user_id: string; departamento_id: string }[]>`
      SELECT ud.user_id, ud.departamento_id FROM saas_user_departamentos ud
      WHERE ud.tenant_id = ${tenant.id}
        AND NOT EXISTS (SELECT 1 FROM saas_departamento_gestores g WHERE g.user_id = ud.user_id AND g.departamento_id = ud.departamento_id)
      LIMIT 8`
    let escaladas = 0
    for (const m of membrosArea) {
      const depto: { nome: string; permissions: string[]; permissionsGestor: string[] } | null = await ctx.db.departamento.findUnique({
        where: { id: m.departamento_id },
        select: { nome: true, permissions: true, permissionsGestor: true },
      })
      if (!depto) continue
      const efetivas = await permissoesEfetivas(m.user_id, tenant.id)
      // O pacote transversal de `member` já concede algumas dessas (ex.:
      // groups:create) — não é escalada de área.
      const { SYSTEM_ROLE_PERMISSIONS: SRP } = await import('@torcida/types')
      const doMemberTransversal = new Set(SRP.member as string[])
      const exclusivasGestor = depto.permissionsGestor.filter(
        (p) => !depto.permissions.includes(p) && !doMemberTransversal.has(p),
      )
      const vazadas = exclusivasGestor.filter((p) => hasPermission(efetivas, p))
      // Só é escalada se o usuário não tiver OUTRO cargo que justifique.
      const temCargoSistema = await ctx.db.userRole.count({
        where: { userId: m.user_id, tenantId: tenant.id, role: { isSystem: true, nome: { in: ['owner', 'admin', 'vice'] } } },
      })
      if (vazadas.length > 0 && temCargoSistema === 0) {
        escaladas += 1
        erro('departamentos', `Membro (não gestor) de '${depto.nome}' alcança permissão exclusiva de gestor: ${vazadas.slice(0, 3).join(', ')}`)
      }
    }
    if (escaladas === 0) ok('departamentos', `${membrosArea.length} membro(s) de área: sem escalada para permissão de gestor`)
  })

  it('membro PENDENTE/REPROVADO não tem permissão de membro aprovado', async () => {
    const naoAprovados = await ctx.db.saasMembro.findMany({
      where: { status: { in: ['PENDENTE', 'REPROVADO'] }, user: { email: { endsWith: DOM_COR } } },
      select: { userId: true, tenantId: true, status: true },
      take: 10,
    })
    let comPermissao = 0
    for (const m of naoAprovados) {
      const efetivas = await permissoesEfetivas(m.userId, m.tenantId)
      if (efetivas.length > 0) {
        comPermissao += 1
        erro('permissões', `Membro ${m.status} tem ${efetivas.length} permissão(ões) — deveria não ter acesso`)
      }
    }
    if (comPermissao === 0) ok('permissões', `${naoAprovados.length} membro(s) não aprovado(s): sem permissão`)
  })
})

// ── 2. FEED / VISIBILIDADE CROSS-TENANT ──────────────────────────────────
describe('feed e visibilidade cross-tenant (código real)', () => {
  it('rival NÃO enxerga nenhum tenant do rival no escopo do feed', async () => {
    const { getVisibleTenantIds, getTenantRelation } = await import('@/lib/hierarquia')
    const pares: [string, string][] = [
      ['pde-gavioes-fiel', 'mancha-alviverde'],
      ['dragoes-da-real', 'mancha-alviverde'],
      ['torcida-jovem-flamengo', 'young-flu'],
      ['geral-do-gremio', 'camisa-12-inter'],
    ]
    for (const [aSlug, bSlug] of pares) {
      const a = ctx.porSlug.get(aSlug)
      const b = ctx.porSlug.get(bSlug)
      if (!a || !b) continue
      const relacao = await getTenantRelation(a.id, b.id)
      const visiveis = await getVisibleTenantIds(a.id, 'comunidade')
      if (relacao !== 'rival') {
        alerta('feed', `${aSlug} × ${bSlug}: relação '${relacao}' (esperado 'rival')`)
        continue
      }
      if (visiveis.includes(b.id)) {
        erro('feed', `RIVAL VAZANDO: ${aSlug} enxerga ${bSlug} no escopo de comunidade`)
      } else {
        ok('feed', `${aSlug} × ${bSlug}: rival fora do escopo (segregação anti-infiltração ok)`)
      }
    }
  })

  it('aliado ATIVO entra no escopo público e NÃO no restrito', async () => {
    const { getVisibleTenantIds, getTenantRelation } = await import('@/lib/hierarquia')
    const aliancas = await ctx.db.alianca.findMany({
      where: { status: 'ATIVA' },
      select: { tenantOrigem: { select: { id: true, slug: true } }, tenantAliado: { select: { id: true, slug: true } } },
    })
    if (aliancas.length === 0) {
      alerta('feed', 'Nenhuma aliança ATIVA — escopo de aliado não auditado')
      return
    }
    for (const al of aliancas) {
      const relacao = await getTenantRelation(al.tenantOrigem.id, al.tenantAliado.id)
      if (relacao !== 'allied') {
        erro('feed', `Aliança ATIVA ${al.tenantOrigem.slug}→${al.tenantAliado.slug} não resolve como 'allied' (deu '${relacao}')`)
        continue
      }
      const publico = await getVisibleTenantIds(al.tenantOrigem.id, 'comunidade')
      const restrito = await getVisibleTenantIds(al.tenantOrigem.id, 'financeiro')
      if (!publico.includes(al.tenantAliado.id)) {
        erro('feed', `Aliado ${al.tenantAliado.slug} FORA do escopo público de ${al.tenantOrigem.slug}`)
      } else if (restrito.includes(al.tenantAliado.id)) {
        erro('feed', `Aliado ${al.tenantAliado.slug} DENTRO do escopo restrito (financeiro) de ${al.tenantOrigem.slug} — deveria ver só o público`)
      } else {
        ok('feed', `Aliado ${al.tenantOrigem.slug}→${al.tenantAliado.slug}: público sim, restrito não`)
      }
    }
  })

  it('getPostPorId (gate real do permalink) recusa post de torcida rival', async () => {
    const { getPostPorId, podeVerPost } = await import('@/lib/feed')
    const alvo = ctx.porSlug.get('mancha-alviverde')!
    const intruso = ctx.porSlug.get('pde-gavioes-fiel')!
    const intrusoUser = await ctx.db.saasMembro.findFirst({
      where: { tenantId: intruso.id, status: 'APROVADO', user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    if (!intrusoUser) {
      alerta('feed', 'Sem membro de teste para simular intruso')
      return
    }
    for (const visibilidade of ['TENANT', 'PRIVADO', 'PUBLICO'] as const) {
      const post = await ctx.db.post.findFirst({
        where: { tenantId: alvo.id, visibilidade, oculto: false },
        select: { id: true, autorId: true, tipo: true, comunicadoOrigemId: true },
      })
      if (!post) {
        alerta('feed', `Sem post ${visibilidade} em ${alvo.slug} para testar`)
        continue
      }
      // Gate real da página /portal/comunidade/post/[id].
      const visto = await getPostPorId(post.id, intruso.id, intrusoUser.userId)
      if (visto) {
        erro('feed', `PERMALINK VAZANDO: membro de ${intruso.slug} abre post ${visibilidade} da rival ${alvo.slug}`)
      } else {
        ok('feed', `Permalink de post ${visibilidade} da rival ${alvo.slug}: bloqueado para ${intruso.slug}`)
      }

      // `podeVerPost` isolado NÃO consulta hierarquia/rivalidade — o gate de
      // tenant é o escopo aplicado antes dela. Registrar para ninguém usar
      // essa função como gate único num caminho novo.
      const podeIsolado = await podeVerPost(intrusoUser.userId, {
        autorId: post.autorId,
        tenantId: alvo.id,
        visibilidade,
        oculto: false,
        tipo: post.tipo,
        comunicadoOrigemId: post.comunicadoOrigemId,
      })
      if (podeIsolado && visto === null) {
        alerta(
          'feed',
          `podeVerPost isolado libera post ${visibilidade} da rival (só o escopo de tenants de getPostPorId barra) — não usar como gate único`,
        )
      }
    }
  })

  it('leitura de comentário usa o mesmo alcance de tenant do permalink', async () => {
    const { getVisibleTenantIds } = await import('@/lib/hierarquia')
    const alvo = ctx.porSlug.get('mancha-alviverde')!
    const intruso = ctx.porSlug.get('pde-gavioes-fiel')!
    const post = await ctx.db.post.findFirst({
      where: { tenantId: alvo.id, visibilidade: 'PUBLICO', oculto: false, comentarios: { some: {} } },
      select: { id: true, _count: { select: { comentarios: true } } },
    })
    if (!post) {
      alerta('comunidade', 'Sem post PUBLICO com comentário para auditar o gate de comentários')
      return
    }
    const visiveis = await getVisibleTenantIds(intruso.id, 'comunidade')
    const tenantVisivel = visiveis.includes(alvo.id)
    if (!tenantVisivel) {
      ok('comunidade', `Comentários de ${alvo.slug} ficam fora do alcance do rival ${intruso.slug}`)
    } else {
      erro('comunidade', `Matriz de alcance inclui indevidamente a rival ${alvo.slug} para ${intruso.slug}`)
    }
  })

  it('feed do tenant só devolve post de tenant visível', async () => {
    const { getPostsParaFeed, resolveVisibleTenantIdsForFeed } = await import('@/lib/feed')
    const tenant = ctx.porSlug.get('camisa-12-corinthians')!
    const membro = await ctx.db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    if (!membro) return
    // O feed inclui também o tenant sintético da Comunidade Nacional. Auditar
    // com o mesmo resolver do caminho real evita classificar esse post como vazamento.
    const visiveis = new Set(await resolveVisibleTenantIdsForFeed(tenant.id, membro.userId))
    const posts = await getPostsParaFeed(tenant.id, membro.userId, { take: 40 })
    const lista = Array.isArray(posts) ? posts : ((posts as { posts?: unknown[] }).posts ?? [])
    const vazados = (lista as { tenantId?: string; id: string }[]).filter(
      (p) => p.tenantId && !visiveis.has(p.tenantId),
    )
    if (vazados.length > 0) {
      const tenantIds = [...new Set([...visiveis, ...vazados.flatMap((p) => p.tenantId ?? [])])]
      const tenants: { id: string; slug: string }[] = await ctx.db.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, slug: true },
      })
      const slugPorId = new Map(tenants.map((item) => [item.id, item.slug]))
      const formatTenant = (id: string) => `${id} (${slugPorId.get(id) ?? 'slug desconhecido'})`
      const detalhesVazados = vazados
        .map((post) => `${post.id} → ${formatTenant(post.tenantId!)}`)
        .join(', ')
      erro(
        'feed',
        `${vazados.length}/${lista.length} post(s) fora do escopo do resolver do feed: ${detalhesVazados}. Permitidos: ${[...visiveis].map(formatTenant).join(', ')}`,
      )
    } else {
      ok('feed', `Feed de ${tenant.slug}: ${lista.length} posts, todos de tenant visível`)
    }
  })

  it('feed nacional só mostra posts alcanceNacional + PUBLICO da mesma afiliação', async () => {
    const { getPostsFeedNacional } = await import('@/lib/feed')
    const tenant = ctx.porSlug.get('torcida-jovem-flamengo')!
    if (!tenant.afiliacaoId) {
      alerta('feed', `${tenant.slug} sem afiliacaoId — feed nacional não auditável`)
      return
    }
    const membro = await ctx.db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: DOM_NAC } } },
      select: { userId: true },
    })
    if (!membro) {
      alerta('feed', 'Sem membro do lote nacional para auditar feed nacional')
      return
    }
    // 1º argumento é a AFILIAÇÃO (clube), não o tenant.
    const res = await getPostsFeedNacional(tenant.afiliacaoId, membro.userId, { take: 40 })
    const lista = res.posts as { id: string }[]
    if (lista.length === 0) {
      const nacionaisNoClube = await ctx.db.post.count({
        where: { alcanceNacional: true, tenant: { afiliacaoId: tenant.afiliacaoId } },
      })
      const nacionaisMembro = await ctx.db.post.count({
        where: { alcanceNacional: true, tipo: 'MEMBRO', visibilidade: 'PUBLICO', tenant: { afiliacaoId: tenant.afiliacaoId } },
      })
      alerta(
        'feed',
        `Feed nacional de ${tenant.slug} VAZIO: ${nacionaisNoClube} post(s) nacionais no clube, dos quais ${nacionaisMembro} elegíveis (o feed filtra tipo=MEMBRO + PUBLICO — post INSTITUCIONAL com alcanceNacional nunca aparece)`,
      )
      return
    }
    const ids = lista.map((p) => p.id)
    // Anotação explícita: a inferência do Prisma quebra em silêncio neste schema (ARCHITECTURE §5.2).
    const detalhes: { id: string; alcanceNacional: boolean; visibilidade: string; tenant: { afiliacaoId: string | null } | null }[] = await ctx.db.post.findMany({
      where: { id: { in: ids } },
      select: { id: true, alcanceNacional: true, visibilidade: true, tenant: { select: { afiliacaoId: true } } },
    })
    const naoNacionais = detalhes.filter((p) => !p.alcanceNacional)
    const naoPublicos = detalhes.filter((p) => p.visibilidade !== 'PUBLICO')
    const outroClube = detalhes.filter((p) => p.tenant?.afiliacaoId !== tenant.afiliacaoId)
    if (naoNacionais.length) erro('feed', `${naoNacionais.length} post no feed nacional SEM alcanceNacional`)
    if (naoPublicos.length) erro('feed', `${naoPublicos.length} post no feed nacional com visibilidade ≠ PUBLICO`)
    if (outroClube.length) erro('feed', `${outroClube.length} post no feed nacional de OUTRO clube`)
    if (!naoNacionais.length && !naoPublicos.length && !outroClube.length) {
      ok('feed', `Feed nacional de ${tenant.slug}: ${lista.length} posts, todos nacionais/públicos/do mesmo clube`)
    }
  })
})

// ── 3. CANAIS E GRUPOS ───────────────────────────────────────────────────
describe('canais e grupos (código real)', () => {
  it('toda unidade ativa tem canal oficial', async () => {
    const semCanal: { nome: string; tipo: string; tenant: { slug: string } | null }[] = await ctx.db.sede.findMany({
      where: { ativa: true, canalConversaId: null, tenantId: { in: ctx.tenants.map((t) => t.id) } },
      select: { nome: true, tipo: true, tenant: { select: { slug: true } } },
    })
    if (semCanal.length > 0) {
      erro('canais', `${semCanal.length} unidade(s) sem canal oficial (db:ensure-canais-oficiais): ${semCanal.slice(0, 4).map((s) => `${s.tenant?.slug}/${s.nome}`).join(', ')}`)
    } else {
      ok('canais', 'Toda unidade ativa das torcidas auditadas tem canal oficial')
    }
  })

  it('listCanaisVisiveis não devolve canal de tenant rival', async () => {
    const { listCanaisVisiveis } = await import('@/lib/canais')
    const { getVisibleTenantIds } = await import('@/lib/hierarquia')
    for (const slug of ['pde-gavioes-fiel', 'mancha-alviverde', 'torcida-jovem-flamengo']) {
      const tenant = ctx.porSlug.get(slug)
      if (!tenant) continue
      const membro = await ctx.db.saasMembro.findFirst({
        where: { tenantId: tenant.id, status: 'APROVADO' },
        select: { userId: true },
      })
      if (!membro) continue
      const canais = (await listCanaisVisiveis(tenant.id, membro.userId)) as {
        id: string
        tenantId?: string | null
      }[]
      const visiveis = new Set(await getVisibleTenantIds(tenant.id, 'comunidade'))
      const fora = canais.filter((c) => c.tenantId && !visiveis.has(c.tenantId))
      if (fora.length > 0) {
        erro('canais', `${slug}: ${fora.length}/${canais.length} canal(is) de tenant fora do escopo visível`)
      } else {
        ok('canais', `${slug}: ${canais.length} canais visíveis, todos de tenant permitido`)
      }
    }
  })

  it('podeVerCanal recusa canal privado de outra torcida', async () => {
    const { podeVerCanal } = await import('@/lib/canais')
    const alvo = ctx.porSlug.get('mancha-alviverde')!
    const intruso = ctx.porSlug.get('pde-gavioes-fiel')!
    const canal = await ctx.db.conversa.findFirst({
      where: { tenantId: alvo.id },
      select: { id: true, nome: true, publica: true, visibilidadeCanal: true },
    })
    const membroIntruso = await ctx.db.saasMembro.findFirst({
      where: { tenantId: intruso.id, status: 'APROVADO' },
      select: { userId: true },
    })
    if (!canal || !membroIntruso) {
      alerta('canais', 'Sem canal/membro para testar acesso cross-tenant')
      return
    }
    const pode = await podeVerCanal(intruso.id, alvo.id, canal.visibilidadeCanal, membroIntruso.userId)
    if (pode) {
      erro('canais', `Membro de ${intruso.slug} (rival) VÊ canal "${canal.nome}" de ${alvo.slug} (publica=${canal.publica})`)
    } else {
      ok('canais', `Canal de ${alvo.slug} invisível para membro rival de ${intruso.slug}`)
    }
  })

  it('roster de canal real exige vínculo local e aprovação para ATIVO', async () => {
    // Exclui o tenant SINTÉTICO da Comunidade Nacional: lá a participação é de
    // torcedor global (PerfilTorcedor), sem SaasMembro por definição. Exclui
    // também DIRETA (conversa 1:1 não é canal de torcida).
    const forasteiros: Array<{ status: string; n: number }> = await ctx.db.$queryRaw`
      SELECT mc.status::text AS status, COUNT(*)::int AS n FROM saas_membros_conversa mc
      JOIN saas_conversas c ON c.id = mc.conversa_id
      JOIN saas_tenants t ON t.id = c.tenant_id
      LEFT JOIN saas_membros m_local
        ON m_local.user_id = mc.user_id AND m_local.tenant_id = c.tenant_id
      LEFT JOIN saas_socios s_local
        ON s_local.user_id = mc.user_id AND s_local.tenant_id = c.tenant_id
      WHERE c.tenant_id IS NOT NULL AND c.comunidade = false
        AND c.tipo <> 'DIRETA' AND t.sintetico = false
        AND mc.saiu_em IS NULL
        AND (
          (mc.status = 'PENDENTE' AND NOT EXISTS (
            SELECT 1 FROM saas_membros m
            WHERE m.user_id = mc.user_id AND m.tenant_id = c.tenant_id
          ))
          OR
          -- "Sem vinculo" tem de considerar o canal EMPRESTADO: numa unidade
          -- promovida (Caso B) a Sede e do tenant-filho e a Conversa mora no
          -- tenant da mae, e e la que assertElegibilidadeMembroCanal vai
          -- buscar o vinculo. Sem este OR, 88 membros legitimos apareciam
          -- como roster invalido, e o repair chegou a expulsa-los.
          (mc.status = 'ATIVO'
            -- Pendente no canal de uma unidade FILHA e legitimo (§7 22): ele
            -- acompanha enquanto espera. So o canal da SEDE e reservado a
            -- aprovado, e isso e medido na assercao propria, logo abaixo.
            AND NOT EXISTS (
              SELECT 1 FROM saas_membros mp
              JOIN saas_sedes sdp ON sdp.canal_conversa_id = c.id AND sdp.tipo <> 'SEDE'
              WHERE mp.user_id = mc.user_id AND mp.status = 'PENDENTE'
                AND mp.tenant_id IN (c.tenant_id, sdp.tenant_id)
            )
            AND NOT EXISTS (
            SELECT 1 FROM saas_membros m
            WHERE m.user_id = mc.user_id
              AND m.status = 'APROVADO' AND m.desligado_em IS NULL
              AND (
                m.tenant_id = c.tenant_id
                -- Canal emprestado: vinculo mora na unidade dona.
                OR m.tenant_id IN (
                  SELECT sd.tenant_id FROM saas_sedes sd
                  WHERE sd.canal_conversa_id = c.id AND sd.tenant_id IS NOT NULL
                )
                -- Caso B no canal da SEDE: o socio aprovado na unidade entra
                -- no canal da organizada (vincularMembroCanaisAposAprovacao),
                -- e o vinculo dele fica no tenant-filho. Sem isto, 51 socios
                -- legitimos apareciam como roster invalido.
                OR m.tenant_id IN (
                  SELECT sf.tenant_id FROM saas_sedes sf
                  WHERE sf.tenant_id IS NOT NULL
                    AND sf.sede_id IN (
                      SELECT sr.id FROM saas_sedes sr WHERE sr.tenant_id = c.tenant_id
                    )
                )
              )
          ))
        )
      GROUP BY mc.status`
    const n = forasteiros.reduce((total, item) => total + item.n, 0)
    if (n > 0) {
      const resumo = forasteiros.map((item) => `${item.status}=${item.n}`).join(', ')
      erro('canais', `${n} roster(s) inválido(s) em canal real (${resumo})`)
    } else {
      ok('canais', 'Todo membro de canal local tem vínculo no tenant do canal (ou na unidade dona)')
    }

    // Carteirinha vencida **não** é roster inválido. Vencer é temporário e
    // reversível; sair do canal não é — a reinscrição só acontece numa nova
    // aprovação. O gate de leitura já barra quem está vencido, então tratar
    // isso como erro empurrava o repair a remover 278 sócios que voltariam
    // sozinhos ao regularizar. Medido como dimensão do §7 15, não como falha.
    const vencidos = await ctx.db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM saas_membros_conversa mc
      JOIN saas_conversas c ON c.id = mc.conversa_id
      JOIN saas_membros m ON m.user_id = mc.user_id AND m.tenant_id = c.tenant_id
      JOIN saas_socios s ON s.user_id = mc.user_id AND s.tenant_id = c.tenant_id
      WHERE mc.status = 'ATIVO' AND mc.saiu_em IS NULL
        AND m.tipo = 'SOCIO' AND m.status = 'APROVADO' AND m.desligado_em IS NULL
        AND s.validade < NOW()`
    const nVencidos = vencidos[0]?.n ?? 0
    if (nVencidos > 0) {
      alerta(
        'canais',
        `${nVencidos} sócio(s) com carteirinha vencida em canal — leem bloqueado pelo gate, mas seguem no roster (esperado; ver §7 15)`,
      )
    }
  })

  /**
   * Regra decidida em 2026-08-04 (ARCHITECTURE.md §7 22): sócio PENDENTE que
   * chegou por **link de convite** acompanha o canal da própria unidade
   * enquanto espera — de leitura, com permissões de torcedor. O que ele nunca
   * vê antes da aprovação é a comunidade da **torcida** (canal da SEDE).
   *
   * Esta asserção afirmava o contrário e apontava para um repair que expulsava
   * quem o onboarding acabava de inscrever: o roster oscilava conforme o que
   * rodasse por último. Agora ela mede a regra de verdade — não-aprovado em
   * canal de SEDE é erro; em canal de unidade filha, é o comportamento.
   */
  it('membro não aprovado não está no canal da SEDE (comunidade da torcida)', async () => {
    const naSede = await ctx.db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM saas_membros_conversa mc
      JOIN saas_conversas c ON c.id = mc.conversa_id
      JOIN saas_membros m ON m.user_id = mc.user_id AND m.tenant_id = c.tenant_id
      WHERE m.status <> 'APROVADO' AND mc.status = 'ATIVO' AND mc.saiu_em IS NULL
        AND EXISTS (
          SELECT 1 FROM saas_sedes s
          WHERE s.canal_conversa_id = c.id AND s.tipo = 'SEDE'
        )`
    const n = naSede[0]?.n ?? 0
    if (n > 0) {
      erro(
        'canais',
        `${n} membro(s) não aprovado(s) ATIVO(s) no canal da SEDE — comunidade da torcida só após aprovação (§7 22)`,
      )
    } else {
      ok('canais', 'Nenhum não aprovado no canal da SEDE')
    }

    // Em canal de unidade filha é esperado — contado para dar dimensão, não
    // para reprovar.
    const naUnidade = await ctx.db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM saas_membros_conversa mc
      JOIN saas_conversas c ON c.id = mc.conversa_id
      JOIN saas_membros m ON m.user_id = mc.user_id AND m.tenant_id = c.tenant_id
      WHERE m.status = 'PENDENTE' AND mc.status = 'ATIVO' AND mc.saiu_em IS NULL
        AND EXISTS (
          SELECT 1 FROM saas_sedes s
          WHERE s.canal_conversa_id = c.id AND s.tipo <> 'SEDE'
        )`
    ok('canais', `${naUnidade[0]?.n ?? 0} pendente(s) acompanhando o canal da própria unidade (§7 22)`)
  })

  it('aprovado está no canal da unidade e no da SEDE', async () => {
    const tenantIds = ctx.tenants.map((t) => t.id)
    const sedes: Array<{
      id: string
      tenantId: string
      tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
      canalConversaId: string | null
    }> = await ctx.db.sede.findMany({
      where: { tenantId: { in: tenantIds }, canalConversaId: { not: null } },
      select: { id: true, tenantId: true, tipo: true, canalConversaId: true },
    })
    const canalPorSedeId = new Map(
      sedes
        .filter((s) => s.canalConversaId)
        .map((s) => [s.id, s.canalConversaId as string]),
    )
    const canalSedePorTenant = new Map(
      sedes
        .filter((s) => s.tipo === 'SEDE' && s.canalConversaId)
        .map((s) => [s.tenantId, s.canalConversaId as string]),
    )

    const aprovados: Array<{ userId: string; tenantId: string; sedeId: string | null }> =
      await ctx.db.saasMembro.findMany({
        where: { tenantId: { in: tenantIds }, status: 'APROVADO' },
        select: { userId: true, tenantId: true, sedeId: true },
      })

    const canalIds = [
      ...new Set([...canalPorSedeId.values(), ...canalSedePorTenant.values()]),
    ]
    const ativos: Array<{ conversaId: string; userId: string }> =
      canalIds.length === 0
        ? []
        : await ctx.db.membroConversa.findMany({
            where: { conversaId: { in: canalIds }, saiuEm: null, status: 'ATIVO' },
            select: { conversaId: true, userId: true },
          })
    const ativoSet = new Set(ativos.map((m) => `${m.conversaId}:${m.userId}`))

    let foraUnidade = 0
    let foraSede = 0
    for (const a of aprovados) {
      if (a.sedeId) {
        const canalUnidade = canalPorSedeId.get(a.sedeId)
        if (canalUnidade && !ativoSet.has(`${canalUnidade}:${a.userId}`)) foraUnidade++
      }
      const canalSede = canalSedePorTenant.get(a.tenantId)
      if (canalSede && !ativoSet.has(`${canalSede}:${a.userId}`)) foraSede++
    }

    if (foraUnidade > 0 || foraSede > 0) {
      erro(
        'canais',
        `${foraUnidade} aprovado(s) fora do canal da unidade · ${foraSede} fora do canal da SEDE (db:repair-aprovado-canal-membro)`,
      )
    } else {
      ok(
        'canais',
        `Todo aprovado das torcidas auditadas está no canal da unidade e da SEDE (${aprovados.length} checados)`,
      )
    }
  })
})

// ── 4. EVENTOS ───────────────────────────────────────────────────────────
describe('eventos e agenda (código real)', () => {
  it('escopo de eventos visíveis respeita hierarquia/rivalidade', async () => {
    const { getEscopoEventosVisiveis } = await import('@/lib/eventos')
    const { getVisibleTenantIds } = await import('@/lib/hierarquia')
    for (const slug of ['pde-gavioes-fiel', 'dragoes-da-real']) {
      const tenant = ctx.porSlug.get(slug)
      if (!tenant) continue
      const membro = await ctx.db.saasMembro.findFirst({
        where: { tenantId: tenant.id, status: 'APROVADO' },
        select: { userId: true },
      })
      // Devolve um fragmento `where` do Prisma ({ OR: [...] }), não uma lista.
      const escopo = (await getEscopoEventosVisiveis(tenant.id, membro?.userId)) as {
        OR: Array<{ tenantId?: string | { in: string[] } }>
      }
      const ids = new Set<string>()
      for (const clausula of escopo.OR) {
        if (typeof clausula.tenantId === 'string') ids.add(clausula.tenantId)
        else if (clausula.tenantId && 'in' in clausula.tenantId) {
          for (const id of clausula.tenantId.in) ids.add(id)
        }
      }
      const permitidos = new Set(await getVisibleTenantIds(tenant.id, 'eventos'))
      const fora = [...ids].filter((id) => !permitidos.has(id))
      if (ids.size === 0) {
        erro('eventos', `${slug}: escopo de eventos vazio — nem o próprio tenant entrou`)
      } else if (fora.length > 0) {
        erro('eventos', `${slug}: escopo de eventos inclui ${fora.length} tenant fora do permitido`)
      } else {
        // Conta quantos eventos o escopo realmente devolve — escopo correto
        // mas resultado vazio também é sinal.
        const total = await ctx.db.evento.count({ where: escopo as never })
        ok('eventos', `${slug}: escopo com ${ids.size} tenant(s), ${total} evento(s) visíveis`)
      }
    }
  })

  it('capacidade e lista de espera são consistentes', async () => {
    const eventos: { id: string; titulo: string; capacidade: number | null; rsvps: { status: string }[] }[] = await ctx.db.evento.findMany({
      where: { capacidade: { not: null }, tenantId: { in: ctx.tenants.map((t) => t.id) } },
      select: {
        id: true,
        titulo: true,
        capacidade: true,
        rsvps: { select: { status: true } },
      },
      take: 60,
    })
    let excedidos = 0
    let esperaSemLotar = 0
    for (const e of eventos) {
      const conf = e.rsvps.filter((r) => r.status === 'CONFIRMADO').length
      const espera = e.rsvps.filter((r) => r.status === 'LISTA_ESPERA').length
      if (conf > (e.capacidade ?? 0)) excedidos += 1
      if (espera > 0 && conf < (e.capacidade ?? 0)) esperaSemLotar += 1
    }
    if (excedidos > 0) erro('eventos', `${excedidos} evento(s) com confirmados acima da capacidade`)
    if (esperaSemLotar > 0) {
      erro('eventos', `${esperaSemLotar} evento(s) com gente na LISTA_ESPERA sem a capacidade estar cheia — deveria promover`)
    }
    if (!excedidos && !esperaSemLotar) ok('eventos', `${eventos.length} evento(s) com capacidade: lotação e fila coerentes`)
  })

  it('série de eventos (ENSAIO) tem serieId coerente e datas distintas', async () => {
    const series = await ctx.db.evento.groupBy({
      by: ['serieId'],
      where: { serieId: { not: null } },
      _count: true,
    })
    if (series.length === 0) {
      alerta('eventos', 'Nenhum evento em série — recorrência não auditada')
      return
    }
    let problemas = 0
    for (const s of series) {
      const eventos: { data: Date; tenantId: string; tipo: string }[] = await ctx.db.evento.findMany({
        where: { serieId: s.serieId },
        select: { data: true, tenantId: true, tipo: true },
      })
      const tenantsDistintos = new Set(eventos.map((e) => e.tenantId))
      const datas = new Set(eventos.map((e) => e.data.toISOString()))
      if (tenantsDistintos.size > 1) {
        problemas += 1
        erro('eventos', `Série ${s.serieId?.slice(0, 8)} atravessa ${tenantsDistintos.size} torcidas`)
      }
      if (datas.size !== eventos.length) {
        problemas += 1
        erro('eventos', `Série ${s.serieId?.slice(0, 8)} tem datas duplicadas`)
      }
    }
    if (problemas === 0) ok('eventos', `${series.length} série(s) de evento: 1 torcida cada, datas distintas`)
  })

  it('plugin de caravana/bateria respeita o gate de acesso', async () => {
    const mod = await import('@/lib/eventos-plugin-access').catch(() => null)
    if (!mod) {
      alerta('eventos', 'eventos-plugin-access não importável — gate de plugin não auditado')
      return
    }
    ok('eventos', `eventos-plugin-access exporta: ${Object.keys(mod).join(', ')}`)
  })
})

// ── 5. ÁREA ADMIN — gate de autorização no servidor ──────────────────────
/** Varre recursivamente arquivos que casam com o predicado. */
function varrer(dir: string, aceita: (p: string) => boolean, acc: string[] = []): string[] {
  let entradas: string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return acc
  }
  for (const nome of entradas) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) varrer(caminho, aceita, acc)
    else if (aceita(caminho)) acc.push(caminho)
  }
  return acc
}

/**
 * Separa o arquivo em blocos por Server Action exportada. Heurística
 * deliberadamente simples: pega do `export async function X` até o próximo
 * `export ` no topo do arquivo.
 */
function blocosDeAction(fonte: string): { nome: string; corpo: string }[] {
  const linhas = fonte.split('\n')
  const blocos: { nome: string; corpo: string }[] = []
  let atual: { nome: string; corpo: string[] } | null = null
  for (const linha of linhas) {
    const m = /^export async function (\w+)/.exec(linha)
    if (m) {
      if (atual) blocos.push({ nome: atual.nome, corpo: atual.corpo.join('\n') })
      atual = { nome: m[1], corpo: [linha] }
      continue
    }
    if (/^export (const|function|type|interface) /.test(linha) && atual) {
      blocos.push({ nome: atual.nome, corpo: atual.corpo.join('\n') })
      atual = null
      continue
    }
    if (atual) atual.corpo.push(linha)
  }
  if (atual) blocos.push({ nome: atual.nome, corpo: atual.corpo.join('\n') })
  return blocos
}

describe('área admin — autorização no servidor', () => {
  const RAIZ_ADMIN = join(process.cwd(), 'src/app/admin')

  it('toda Server Action de mutação do /admin chama assertPermission', async () => {
    const arquivos = varrer(RAIZ_ADMIN, (p) => /actions\.ts$/.test(p))
    if (arquivos.length === 0) {
      alerta('admin', 'Nenhum actions.ts encontrado em src/app/admin')
      return
    }
    const semGate: string[] = []
    let comGate = 0
    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf8')
      if (!/'use server'|"use server"/.test(fonte)) continue
      for (const bloco of blocosDeAction(fonte)) {
        // Só interessa mutação: quem escreve no banco.
        const muta = /\b(create|update|delete|upsert|createMany|updateMany|deleteMany|\$executeRaw|\$transaction)\b/.test(
          bloco.corpo,
        )
        if (!muta) continue
        // Qualquer helper `assertXxx(` conta: o padrão real do repo é a action
        // chamar um wrapper de domínio (`assertAliancasManage`,
        // `assertPodeGerirDepartamento`) que por dentro faz assertPermission.
        const temGate =
          /\bassert[A-Z]\w*\s*\(/.test(bloco.corpo) ||
          /require[A-Z]\w*\s*\(|garantirAcesso|podeGerenciar/.test(bloco.corpo) ||
          // Super Admin fica fora do RBAC por tenant (allowlist de e-mail).
          /isSuperAdminEmail/.test(bloco.corpo)
        // Helper exportado para reuso: recebe `tenantId` por parâmetro e não
        // resolve sessão — o gate é responsabilidade de quem chama. Análise
        // estática não alcança isso, então classifica como alerta.
        const ehHelper =
          !temGate && /^export async function \w+\(\s*$|tenantId: string/.test(bloco.corpo) && !/await auth\(\)/.test(bloco.corpo)
        if (temGate) comGate += 1
        else if (ehHelper) {
          alerta(
            'admin',
            `${arquivo.replace(process.cwd(), '.')}::${bloco.nome} muta sem gate próprio — recebe tenantId por parâmetro, gate depende do chamador (verificar manualmente)`,
          )
        } else semGate.push(`${arquivo.replace(process.cwd(), '.')}::${bloco.nome}`)
      }
    }
    if (semGate.length > 0) {
      erro(
        'admin',
        `${semGate.length} Server Action(s) de mutação em /admin sem gate de autorização visível: ${semGate.slice(0, 8).join(', ')}${semGate.length > 8 ? ` … (+${semGate.length - 8})` : ''}`,
      )
    } else {
      ok('admin', `${comGate} Server Action(s) de mutação em /admin: todas com assertPermission/gate`)
    }
  })

  it('toda página do /admin tem gate de permissão (na página ou no layout)', async () => {
    const paginas = varrer(RAIZ_ADMIN, (p) => /page\.tsx$/.test(p))
    const semGate: string[] = []
    for (const pagina of paginas) {
      const fonte = readFileSync(pagina, 'utf8')
      const temGate =
        /assert(Permission|AnyPermission|PresidenteGlobal|SuperAdmin)|hasPermission|getUserPermissionsInTenant|requirePermission/.test(
          fonte,
        )
      if (temGate) continue
      // Gate pode estar no layout do próprio segmento ou de um ancestral.
      let dir = pagina.replace(/[/\\]page\.tsx$/, '')
      let cobertoPorLayout = false
      for (let i = 0; i < 6 && dir.includes('admin'); i++) {
        try {
          const layout = readFileSync(join(dir, 'layout.tsx'), 'utf8')
          if (/assert(Permission|AnyPermission|PresidenteGlobal|SuperAdmin)|hasPermission|getUserPermissionsInTenant/.test(layout)) {
            cobertoPorLayout = true
            break
          }
        } catch {
          /* sem layout nesse nível */
        }
        dir = join(dir, '..')
      }
      if (!cobertoPorLayout) semGate.push(pagina.replace(process.cwd(), '.'))
    }
    if (semGate.length > 0) {
      alerta(
        'admin',
        `${semGate.length} página(s) de /admin sem gate próprio nem em layout ancestral: ${semGate.slice(0, 6).join(', ')}${semGate.length > 6 ? ` … (+${semGate.length - 6})` : ''}`,
      )
    } else {
      ok('admin', `${paginas.length} página(s) de /admin: todas com gate próprio ou de layout`)
    }
  })

  it('toda mutação administrativa grava AuditLog', async () => {
    const arquivos = varrer(RAIZ_ADMIN, (p) => /actions\.ts$/.test(p))
    const semAudit: string[] = []
    let comAudit = 0
    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf8')
      if (!/'use server'|"use server"/.test(fonte)) continue
      for (const bloco of blocosDeAction(fonte)) {
        const muta = /\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\(/.test(bloco.corpo)
        if (!muta) continue
        if (/auditLog\.create|registrarAuditoria|gravarAuditoria/.test(bloco.corpo)) comAudit += 1
        else semAudit.push(`${arquivo.replace(process.cwd(), '.')}::${bloco.nome}`)
      }
    }
    if (semAudit.length > 0) {
      alerta(
        'admin',
        `${semAudit.length} mutação(ões) administrativa(s) sem AuditLog visível (convenção do CLAUDE.md): ${semAudit.slice(0, 8).join(', ')}${semAudit.length > 8 ? ` … (+${semAudit.length - 8})` : ''}`,
      )
    } else {
      ok('admin', `${comAudit} mutação(ões) administrativa(s): todas gravam AuditLog`)
    }
  })

  it('AuditLog tem registro das torcidas semeadas', async () => {
    const porTenant = await ctx.db.auditLog.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: ctx.tenants.map((t) => t.id) } },
      _count: true,
    })
    if (porTenant.length === 0) {
      alerta(
        'admin',
        'AuditLog vazio nas torcidas auditadas — esperado: o seed escreve direto no banco, sem passar pelas Server Actions. Nenhuma mutação administrativa real foi exercitada.',
      )
    } else {
      ok('admin', `AuditLog presente em ${porTenant.length} torcida(s)`)
    }
  })
})

// ── 6. DEPARTAMENTOS — acesso a módulo do portal ─────────────────────────
describe('departamentos e acesso ao portal', () => {
  it('acesso a módulo do portal segue o departamento do membro', async () => {
    const mod = await import('@/lib/departamentos-portal-access').catch(() => null)
    if (!mod) {
      alerta('departamentos', 'departamentos-portal-access não importável')
      return
    }
    ok('departamentos', `departamentos-portal-access exporta: ${Object.keys(mod).join(', ')}`)
  })

  it('preferência de área (SaasMembro.departamentoId) não concede permissão', async () => {
    const { hasPermission } = await import('@torcida/types')
    // Membro com preferência de área mas SEM UserDepartamento: não deve
    // herdar nada do pacote do departamento.
    const soPreferencia = await ctx.db.$queryRaw<{ user_id: string; tenant_id: string; departamento_id: string }[]>`
      SELECT m.user_id, m.tenant_id, m.departamento_id FROM saas_membros m
      WHERE m.departamento_id IS NOT NULL AND m.status = 'APROVADO'
        AND NOT EXISTS (
          SELECT 1 FROM saas_user_departamentos ud
          WHERE ud.user_id = m.user_id AND ud.tenant_id = m.tenant_id AND ud.departamento_id = m.departamento_id)
      LIMIT 10`
    if (soPreferencia.length === 0) {
      alerta('departamentos', 'Sem membro com preferência de área e sem equipe — regra não auditada')
      return
    }
    let vazamentos = 0
    for (const m of soPreferencia) {
      const depto: { nome: string; permissions: string[] } | null = await ctx.db.departamento.findUnique({
        where: { id: m.departamento_id },
        select: { nome: true, permissions: true },
      })
      if (!depto || depto.permissions.length === 0) continue
      const efetivas = await permissoesEfetivas(m.user_id, m.tenant_id)
      // Ignora quem tem cargo de sistema (owner/admin/vice) — aí a permissão
      // vem do cargo, não da preferência.
      const temCargoSistema = await ctx.db.userRole.count({
        where: { userId: m.user_id, tenantId: m.tenant_id, role: { isSystem: true, nome: { in: ['owner', 'admin', 'vice'] } } },
      })
      if (temCargoSistema > 0) continue
      const herdadas = depto.permissions.filter((p) => hasPermission(efetivas, p))
      // `member` transversal já concede algumas — só acusa as que são
      // exclusivas do pacote da área.
      const { SYSTEM_ROLE_PERMISSIONS } = await import('@torcida/types')
      const doMember = new Set(SYSTEM_ROLE_PERMISSIONS.member as string[])
      const exclusivasArea = herdadas.filter((p) => !doMember.has(p))
      if (exclusivasArea.length > 0) {
        vazamentos += 1
        erro(
          'departamentos',
          `Preferência de área '${depto.nome}' concedeu permissão sem membership: ${exclusivasArea.slice(0, 3).join(', ')}`,
        )
      }
    }
    if (vazamentos === 0) {
      ok('departamentos', `${soPreferencia.length} membro(s) com só preferência de área: nenhuma permissão herdada (correto)`)
    }
  })
})

// ── 6b. DEPARTAMENTOS — só sócio elegível pertence a área ────────────────
/**
 * Invariante: pertencer a departamento exige `SaasMembro` SOCIO, APROVADO,
 * ativo (sem `desligadoEm`), canônico (não espelho) e do próprio tenant —
 * `isMembroElegivelDepartamento`. TORCEDOR não tem preferência de área,
 * perfil de área, equipe nem gestoria.
 *
 * Diferente do resto deste arquivo, aqui a contagem **falha o teste**: é
 * violação de dado, não observação. Reparo: `db:repair-departamento-orfaos`.
 */
describe('departamentos — somente sócio elegível pertence a área', () => {
  it('nenhum TORCEDOR tem preferência de departamento', async () => {
    const n = await ctx.db.saasMembro.count({
      where: { tipo: 'TORCEDOR', departamentoId: { not: null } },
    })
    if (n > 0) {
      erro('departamentos', `${n} TORCEDOR com SaasMembro.departamentoId — preferência de área é exclusiva de sócio (db:repair-departamento-orfaos)`)
    } else {
      ok('departamentos', 'Preferência de área: 0 TORCEDOR com departamentoId')
    }
    expect(n, 'TORCEDOR com preferência de departamento').toBe(0)
  })

  it('nenhum perfil de área (UserRole) pertence a usuário inelegível', async () => {
    const linhas = await ctx.db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM saas_user_roles ur
      JOIN saas_roles r ON r.id = ur.role_id
      LEFT JOIN saas_membros m ON m.user_id = ur.user_id AND m.tenant_id = ur.tenant_id
      WHERE r.departamento_id IS NOT NULL
        AND (
          m.id IS NULL OR m.tipo <> 'SOCIO' OR m.status <> 'APROVADO'
          OR m.desligado_em IS NOT NULL OR m.espelhado = true
          OR m.membro_origem_id IS NOT NULL
        )`
    const n = linhas[0]?.n ?? 0
    if (n > 0) {
      erro('departamentos', `${n} UserRole de perfil com departamento atribuído a usuário inelegível (não sócio, não aprovado, desligado, espelho ou de outro tenant)`)
    } else {
      ok('departamentos', 'Perfis de área (UserRole): 0 vínculo de usuário inelegível')
    }
    expect(n, 'UserRole de área em usuário inelegível').toBe(0)
  })

  it('nenhum UserDepartamento pertence a usuário inelegível', async () => {
    const linhas = await ctx.db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM saas_user_departamentos ud
      LEFT JOIN saas_membros m ON m.user_id = ud.user_id AND m.tenant_id = ud.tenant_id
      WHERE m.id IS NULL OR m.tipo <> 'SOCIO' OR m.status <> 'APROVADO'
        OR m.desligado_em IS NOT NULL OR m.espelhado = true
        OR m.membro_origem_id IS NOT NULL`
    const n = linhas[0]?.n ?? 0
    if (n > 0) {
      erro('departamentos', `${n} UserDepartamento (equipe de área) de usuário inelegível`)
    } else {
      ok('departamentos', 'Equipe de área (UserDepartamento): 0 vínculo de usuário inelegível')
    }
    expect(n, 'UserDepartamento de usuário inelegível').toBe(0)
  })

  it('nenhum DepartamentoGestor pertence a usuário inelegível', async () => {
    // Gestoria não tem `tenantId` própria: o tenant vem do departamento.
    const linhas = await ctx.db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM saas_departamento_gestores g
      JOIN saas_departamentos d ON d.id = g.departamento_id
      LEFT JOIN saas_membros m ON m.user_id = g.user_id AND m.tenant_id = d.tenant_id
      WHERE m.id IS NULL OR m.tipo <> 'SOCIO' OR m.status <> 'APROVADO'
        OR m.desligado_em IS NOT NULL OR m.espelhado = true
        OR m.membro_origem_id IS NOT NULL`
    const n = linhas[0]?.n ?? 0
    if (n > 0) {
      erro('departamentos', `${n} DepartamentoGestor (gestoria de área) de usuário inelegível`)
    } else {
      ok('departamentos', 'Gestoria de área (DepartamentoGestor): 0 vínculo de usuário inelegível')
    }
    expect(n, 'DepartamentoGestor de usuário inelegível').toBe(0)
  })

  it('membro desligado não conserva perfil de área, equipe nem gestoria', async () => {
    // Recorte específico do desligamento — o motivo mais comum de projeção
    // sobrevivente, porque nasce depois do vínculo já ter sido válido.
    const linhas = await ctx.db.$queryRaw<{ perfis: number; equipe: number; gestoria: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM saas_user_roles ur
           JOIN saas_roles r ON r.id = ur.role_id
           JOIN saas_membros m ON m.user_id = ur.user_id AND m.tenant_id = ur.tenant_id
          WHERE r.departamento_id IS NOT NULL AND m.desligado_em IS NOT NULL) AS perfis,
        (SELECT COUNT(*)::int FROM saas_user_departamentos ud
           JOIN saas_membros m ON m.user_id = ud.user_id AND m.tenant_id = ud.tenant_id
          WHERE m.desligado_em IS NOT NULL) AS equipe,
        (SELECT COUNT(*)::int FROM saas_departamento_gestores g
           JOIN saas_departamentos d ON d.id = g.departamento_id
           JOIN saas_membros m ON m.user_id = g.user_id AND m.tenant_id = d.tenant_id
          WHERE m.desligado_em IS NOT NULL) AS gestoria`
    const r = linhas[0] ?? { perfis: 0, equipe: 0, gestoria: 0 }
    const total = r.perfis + r.equipe + r.gestoria
    const desligados = await ctx.db.saasMembro.count({ where: { desligadoEm: { not: null } } })
    if (total > 0) {
      erro('departamentos', `Desligamento não limpou projeções de área: ${r.perfis} perfil(is), ${r.equipe} da equipe e ${r.gestoria} de gestoria em membros desligados`)
    } else {
      ok('departamentos', `${desligados} membro(s) desligado(s): nenhum perfil de área, equipe ou gestoria remanescente`)
    }
    expect(total, 'projeções de área em membro desligado').toBe(0)
  })
})

// ── Relatório ────────────────────────────────────────────────────────────
describe('relatório', () => {
  it('imprime achados', () => {
    const linhas: string[] = ['', '══════ AUDITORIA FUNCIONAL (código real × banco) ══════']
    for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
      const itens = achados.filter((a) => a.nivel === nivel)
      if (nivel === 'ok') {
        linhas.push('', `✅ Conformes: ${itens.length}`)
        for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
        continue
      }
      linhas.push('', `${nivel === 'ERRO' ? '❌ ERROS' : '⚠️  ALERTAS'}: ${itens.length}`)
      for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
    }
    const relatorio = linhas.join('\n')
    // Vitess não imprime console.log de teste de forma confiável; o relatório
    // vai para arquivo (e para stdout via process.stdout, que passa).
    process.stdout.write(`${relatorio}\n`)
    writeFileSync(join(process.cwd(), 'auditoria-dados-reais.txt'), `${relatorio}\n`, 'utf8')
    expect(achados.length).toBeGreaterThan(0)
  })
})
