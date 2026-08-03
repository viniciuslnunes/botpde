/**
 * Auditoria: onboarding → comunidades e permissões (código real × banco).
 *
 * Garante que TORCEDOR, SOCIO PENDENTE e SOCIO APROVADO direcionam para as
 * comunidades certas sem vazar a aba/mural da Sede (Gaviões) antes da aprovação.
 *
 * Spec: docs/data/spec-onboarding.md § feed torcedor até aprovação.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:onboarding
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const achados: Achado[] = []
const erro = (area: string, msg: string) => void achados.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => void achados.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => void achados.push({ nivel: 'ok', area, msg })

type Db = typeof import('@torcida/db').db
let db: Db
let sedeId: string
let sedeSlug: string
let afiliacaoId: string | null

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
  const sede: {
    id: string
    slug: string
    afiliacaoId: string | null
  } | null = await db.tenant.findFirst({
    where: { slug: 'pde-gavioes-fiel', ativo: true, sintetico: false },
    select: { id: true, slug: true, afiliacaoId: true },
  })
  if (!sede) throw new Error('Tenant pde-gavioes-fiel não encontrado — rode o seed de teste')
  sedeId = sede.id
  sedeSlug = sede.slug
  afiliacaoId = sede.afiliacaoId
})

afterAll(() => {
  const linhas: string[] = ['', '══════ Auditoria: onboarding → comunidade ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = achados.filter((a) => a.nivel === nivel)
    const rotulo =
      nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ Conformes'
    linhas.push('', `${rotulo}: ${itens.length}`)
    for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
  }
  const relatorio = linhas.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'audit-onboarding-comunidade.txt'), `${relatorio}\n`, 'utf8')

  const nErros = achados.filter((a) => a.nivel === 'ERRO').length
  expect(nErros, `${nErros} erro(s) na auditoria de onboarding→comunidade`).toBe(0)
})

type MembroLite = {
  userId: string
  tenantId: string
  status: string
  tipo: string
  espelhado: boolean
  sedeId: string | null
  user: { email: string | null }
  tenant: { slug: string; nome: string }
}

async function garantirPerfilTorcedor(
  area: string,
  userId: string,
  rotulo: string,
): Promise<boolean> {
  const perfil: { onboardingConcluidoEm: Date | null; afiliacaoId: string | null } | null =
    await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
  if (perfil?.onboardingConcluidoEm && perfil.afiliacaoId) return true
  if (!afiliacaoId) {
    alerta(area, `${rotulo}: sem afiliacaoId na Sede — não dá para completar PerfilTorcedor`)
    return false
  }
  await db.perfilTorcedor.upsert({
    where: { userId },
    create: {
      userId,
      afiliacaoId,
      onboardingConcluidoEm: new Date(),
    },
    update: {
      afiliacaoId: perfil?.afiliacaoId ?? afiliacaoId,
      onboardingConcluidoEm: new Date(),
    },
  })
  ok(area, `${rotulo}: PerfilTorcedor completado para medir o gate (idempotente)`)
  return true
}

async function assertContextoTorcedorLike(
  area: string,
  userId: string,
  email: string | null,
  rotulo: string,
): Promise<void> {
  const {
    resolveUserTenantSlugForUser,
    vinculoAutorizaContextoTenant,
  } = await import('@/lib/tenant-context')
  const { resolverContextoComunidade } = await import('@/lib/comunidade-contexto')
  const { podeVerFeedSocios } = await import('@/lib/feed')
  const { resolverEscopoComunidade } = await import('@/lib/comunidade-contexto')

  const slug = await resolveUserTenantSlugForUser(userId)
  if (slug !== null) {
    erro(area, `${rotulo}: resolveUserTenantSlugForUser devolveu "${slug}" — deveria ser null (CN)`)
  } else {
    ok(area, `${rotulo}: slug de tenant null (não abre modo sócio)`)
  }

  const autorizaSede = await vinculoAutorizaContextoTenant(userId, sedeSlug)
  if (autorizaSede) {
    erro(area, `${rotulo}: vinculoAutorizaContextoTenant(Sede) = true — cookie poderia abrir Gaviões`)
  } else {
    ok(area, `${rotulo}: cookie da Sede NÃO autorizado`)
  }

  if (!(await garantirPerfilTorcedor(area, userId, rotulo))) return

  const ctx = await resolverContextoComunidade(userId, email)
  if (!ctx) {
    erro(area, `${rotulo}: resolverContextoComunidade retornou null após garantir perfil`)
    return
  }

  if (ctx.modo !== 'nacional') {
    erro(area, `${rotulo}: modo="${ctx.modo}" — esperado nacional até aprovação / torcedor`)
  } else {
    ok(area, `${rotulo}: modo nacional`)
  }

  if (ctx.escopos.torcida) {
    erro(area, `${rotulo}: escopos.torcida=true — aba Gaviões vazou sem SOCIO APROVADO`)
  } else {
    ok(area, `${rotulo}: escopos.torcida=false (sem aba da Sede)`)
  }

  const escopoForcado = resolverEscopoComunidade(ctx, 'torcida')
  if (escopoForcado === 'torcida') {
    erro(area, `${rotulo}: ?escopo=torcida ainda resolveu torcida — query não pode furar o gate`)
  } else {
    ok(area, `${rotulo}: ?escopo=torcida cai no default (não fura)`)
  }

  if (await podeVerFeedSocios(userId, sedeId)) {
    erro(area, `${rotulo}: podeVerFeedSocios(Sede)=true — mural TENANT vazou`)
  } else {
    ok(area, `${rotulo}: mural de sócios da Sede bloqueado`)
  }
}

describe('A) TORCEDOR APROVADO — CN + unidade, sem Sede', () => {
  it('torcedor canônico não abre Gaviões nem feed de sócios', async () => {
    const AREA = 'onboarding/torcedor'
    const torcedor: MembroLite | null = await db.saasMembro.findFirst({
      where: {
        status: 'APROVADO',
        tipo: 'TORCEDOR',
        espelhado: false,
        desligadoEm: null,
        user: { email: { endsWith: DOM_COR } },
        tenant: { ativo: true, sintetico: false },
      },
      select: {
        userId: true,
        tenantId: true,
        status: true,
        tipo: true,
        espelhado: true,
        sedeId: true,
        user: { select: { email: true } },
        tenant: { select: { slug: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    if (!torcedor) {
      alerta(AREA, `Sem TORCEDOR APROVADO de teste (${DOM_COR}) — caminho A não exercitado`)
      return
    }

    await assertContextoTorcedorLike(
      AREA,
      torcedor.userId,
      torcedor.user.email,
      `TORCEDOR@${torcedor.tenant.slug}`,
    )

    // Com unidade: aba deve existir; sem unidade (vínculo direto na Sede) é ok ficar só CN.
    const { resolverContextoComunidade } = await import('@/lib/comunidade-contexto')
    const ctx = await resolverContextoComunidade(torcedor.userId, torcedor.user.email)
    if (torcedor.sedeId && ctx && !ctx.escopos.unidade) {
      // Unidade sem canal provisionado: alerta, não erro duro (write-on-GET proibido).
      alerta(
        AREA,
        `TORCEDOR@${torcedor.tenant.slug} tem sedeId mas escopos.unidade=false — canal da unidade pode estar sem ponteiro`,
      )
    } else if (torcedor.sedeId && ctx?.escopos.unidade) {
      ok(AREA, `TORCEDOR@${torcedor.tenant.slug}: aba Minha unidade disponível`)
    } else {
      ok(AREA, `TORCEDOR@${torcedor.tenant.slug}: sem unidade (só CN) — esperado se vínculo na Sede`)
    }

    if (await (await import('@/lib/feed')).podeVerFeedSocios(torcedor.userId, torcedor.tenantId)) {
      erro(AREA, `TORCEDOR vê feed de sócios no próprio tenant ${torcedor.tenant.slug}`)
    } else {
      ok(AREA, `TORCEDOR não vê mural TENANT em ${torcedor.tenant.slug}`)
    }
  })
})

describe('B) SOCIO PENDENTE — mesma experiência de torcedor', () => {
  it('pendente canônico não abre Sede; espelho não autoriza cookie', async () => {
    const AREA = 'onboarding/pendente'
    const pendente: MembroLite | null = await db.saasMembro.findFirst({
      where: {
        status: 'PENDENTE',
        tipo: 'SOCIO',
        espelhado: false,
        user: { email: { endsWith: DOM_COR } },
        tenant: { ativo: true, sintetico: false },
      },
      select: {
        userId: true,
        tenantId: true,
        status: true,
        tipo: true,
        espelhado: true,
        sedeId: true,
        user: { select: { email: true } },
        tenant: { select: { slug: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    if (!pendente) {
      alerta(AREA, `Sem SOCIO PENDENTE canônico de teste (${DOM_COR}) — caminho B não exercitado`)
      return
    }

    // Garante perfil concluído (senão contexto null e a auditoria não mede o gate).
    if (!(await garantirPerfilTorcedor(AREA, pendente.userId, `PENDENTE@${pendente.tenant.slug}`))) {
      return
    }

    await assertContextoTorcedorLike(
      AREA,
      pendente.userId,
      pendente.user.email,
      `PENDENTE@${pendente.tenant.slug}`,
    )

    const { vinculoAutorizaContextoTenant } = await import('@/lib/tenant-context')
    const autorizaOrigem = await vinculoAutorizaContextoTenant(
      pendente.userId,
      pendente.tenant.slug,
    )
    if (autorizaOrigem) {
      erro(
        AREA,
        `PENDENTE@${pendente.tenant.slug}: cookie do tenant de origem autorizado — abriria modo sócio`,
      )
    } else {
      ok(AREA, `PENDENTE@${pendente.tenant.slug}: cookie do tenant de origem NÃO autorizado`)
    }

    // Espelho na Sede (Caso B): se existir, também não pode autorizar.
    const espelho: { id: string } | null = await db.saasMembro.findFirst({
      where: {
        userId: pendente.userId,
        tenantId: sedeId,
        status: 'PENDENTE',
        tipo: 'SOCIO',
        espelhado: true,
      },
      select: { id: true },
    })
    if (espelho) {
      const autorizaEspelho = await vinculoAutorizaContextoTenant(pendente.userId, sedeSlug)
      if (autorizaEspelho) {
        erro(AREA, 'Espelho PENDENTE na Sede autorizou cookie — vazamento clássico Gaviões')
      } else {
        ok(AREA, 'Espelho PENDENTE na Sede NÃO autoriza cookie')
      }
    } else {
      ok(AREA, 'Sem espelho PENDENTE na Sede neste fixture (Caso A ou ainda sem fan-out)')
    }

    const { podeVerFeedSocios } = await import('@/lib/feed')
    if (await podeVerFeedSocios(pendente.userId, pendente.tenantId)) {
      erro(AREA, `PENDENTE vê mural TENANT em ${pendente.tenant.slug}`)
    } else {
      ok(AREA, `PENDENTE não vê mural TENANT em ${pendente.tenant.slug}`)
    }
  })
})

describe('C) SOCIO APROVADO — modo torcida + mural', () => {
  it('sócio aprovado abre tenant e vê feed de sócios', async () => {
    const AREA = 'onboarding/aprovado'
    const socio: MembroLite | null = await db.saasMembro.findFirst({
      where: {
        status: 'APROVADO',
        tipo: 'SOCIO',
        espelhado: false,
        desligadoEm: null,
        user: { email: { endsWith: DOM_COR } },
        tenantId: sedeId,
      },
      select: {
        userId: true,
        tenantId: true,
        status: true,
        tipo: true,
        espelhado: true,
        sedeId: true,
        user: { select: { email: true } },
        tenant: { select: { slug: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    if (!socio) {
      alerta(AREA, `Sem SOCIO APROVADO canônico em ${sedeSlug} (${DOM_COR}) — caminho C não exercitado`)
      return
    }

    const {
      resolveUserTenantSlugForUser,
      vinculoAutorizaContextoTenant,
    } = await import('@/lib/tenant-context')
    const { resolverContextoComunidade, resolverEscopoComunidade } =
      await import('@/lib/comunidade-contexto')
    const { podeVerFeedSocios } = await import('@/lib/feed')

    const slug = await resolveUserTenantSlugForUser(socio.userId)
    if (!slug) {
      // Pode ter outro SOCIO APROVADO mais recente noutro tenant — ainda assim
      // o cookie deste tenant deve autorizar.
      alerta(
        AREA,
        `resolveUserTenantSlugForUser não apontou slug (outro vínculo mais recente?) — checando cookie da Sede`,
      )
    } else {
      ok(AREA, `SOCIO APROVADO resolve slug="${slug}"`)
    }

    if (!(await vinculoAutorizaContextoTenant(socio.userId, sedeSlug))) {
      erro(AREA, 'SOCIO APROVADO na Sede NÃO autoriza cookie — portal de sócio quebraria')
    } else {
      ok(AREA, 'SOCIO APROVADO autoriza cookie da Sede')
    }

    if (!(await podeVerFeedSocios(socio.userId, sedeId))) {
      erro(AREA, 'SOCIO APROVADO sem podeVerFeedSocios na Sede — mural TENANT quebrado')
    } else {
      ok(AREA, 'SOCIO APROVADO vê mural TENANT na Sede')
    }

    const ctx = await resolverContextoComunidade(socio.userId, socio.user.email)
    if (!ctx) {
      erro(AREA, 'resolverContextoComunidade null para sócio aprovado')
      return
    }

    // Sem cookie/subdomínio no audit, getActiveTenant pode ser null e cair em
    // nacional mesmo com APROVADO — o probe de cookie/slug é o gate real de
    // sessão. Se modo torcida, escopos.torcida deve estar true.
    if (ctx.modo === 'torcida') {
      if (!ctx.escopos.torcida) {
        erro(AREA, 'modo torcida sem escopos.torcida')
      } else {
        ok(AREA, 'modo torcida com aba da organizada')
      }
      const escopo = resolverEscopoComunidade(ctx, undefined)
      if (escopo !== 'torcida' && escopo !== 'unidade') {
        alerta(AREA, `default de sócio foi "${escopo}" (esperado torcida ou unidade Caso B)`)
      } else {
        ok(AREA, `default de sócio = ${escopo}`)
      }
    } else {
      // Ambiente de audit sem cookie: slug ainda existe, mas contexto cai CN.
      // Não é erro de produto se vinculoAutoriza + slug + feed passaram.
      ok(
        AREA,
        'modo nacional no audit sem cookie/host — gates de slug/cookie/feed já conferidos acima',
      )
    }
  })
})

describe('subdomínio / host sem vínculo aprovado', () => {
  it('getActiveTenant não abre Sede para PENDENTE mesmo com host da Sede (código real)', async () => {
    const AREA = 'onboarding/subdominio'
    const pendente: { userId: string; user: { email: string | null } } | null =
      await db.saasMembro.findFirst({
        where: {
          status: 'PENDENTE',
          tipo: 'SOCIO',
          espelhado: false,
          user: { email: { endsWith: DOM_COR } },
        },
        select: { userId: true, user: { select: { email: true } } },
        orderBy: { criadoEm: 'desc' },
      })
    if (!pendente) {
      alerta(AREA, 'Sem PENDENTE para exercitar getActiveTenant × host')
      return
    }

    // Sem mock de host: em single-tenant o gate é cookie/slug (já coberto).
    // Aqui confirmamos que vinculoAutoriza(Sede) é false — o mesmo predicado
    // que agora barra o subdomínio em getActiveTenant.
    const { vinculoAutorizaContextoTenant, resolveUserTenantSlugForUser } =
      await import('@/lib/tenant-context')
    const { getActiveTenant } = await import('@/lib/tenant')

    if (await vinculoAutorizaContextoTenant(pendente.userId, sedeSlug)) {
      erro(AREA, 'PENDENTE autoriza Sede — subdomínio/cookie ainda vazariam')
    } else {
      ok(AREA, 'PENDENTE: predicado de host/cookie da Sede = false')
    }

    if ((await resolveUserTenantSlugForUser(pendente.userId)) !== null) {
      erro(AREA, 'PENDENTE resolve slug de tenant')
    } else {
      ok(AREA, 'PENDENTE: resolveUserTenantSlug = null')
    }

    const ativo = await getActiveTenant(pendente.userId, pendente.user.email)
    if (ativo && ativo.id === sedeId) {
      erro(AREA, `getActiveTenant devolveu a Sede (${ativo.slug}) para PENDENTE`)
    } else if (ativo) {
      // Outro tenant só seria ok se SOCIO APROVADO canônico noutro lugar.
      alerta(AREA, `getActiveTenant devolveu ${ativo.slug} (não a Sede) — conferir outro vínculo`)
    } else {
      ok(AREA, 'getActiveTenant = null para PENDENTE (CN)')
    }
  })
})

describe('segregação: PENDENTE ≠ APROVADO no mesmo tenant', () => {
  it('podeVerFeedSocios distingue tipo e status no tenant da Sede', async () => {
    const AREA = 'onboarding/segregacao-feed'
    const { podeVerFeedSocios } = await import('@/lib/feed')

    const [aprovado, pendente, torcedor] = await Promise.all([
      db.saasMembro.findFirst({
        where: {
          tenantId: sedeId,
          status: 'APROVADO',
          tipo: 'SOCIO',
          espelhado: false,
          desligadoEm: null,
          user: { email: { endsWith: DOM_COR } },
        },
        select: { userId: true },
      }),
      db.saasMembro.findFirst({
        where: {
          status: 'PENDENTE',
          tipo: 'SOCIO',
          espelhado: false,
          user: { email: { endsWith: DOM_COR } },
        },
        select: { userId: true, tenantId: true },
      }),
      db.saasMembro.findFirst({
        where: {
          status: 'APROVADO',
          tipo: 'TORCEDOR',
          espelhado: false,
          desligadoEm: null,
          user: { email: { endsWith: DOM_COR } },
        },
        select: { userId: true, tenantId: true },
      }),
    ])

    if (aprovado) {
      if (!(await podeVerFeedSocios(aprovado.userId, sedeId))) {
        erro(AREA, 'SOCIO APROVADO na Sede sem acesso ao mural')
      } else {
        ok(AREA, 'SOCIO APROVADO: mural liberado')
      }
    } else {
      alerta(AREA, 'Sem SOCIO APROVADO na Sede para contraste')
    }

    if (pendente) {
      if (await podeVerFeedSocios(pendente.userId, pendente.tenantId)) {
        erro(AREA, 'SOCIO PENDENTE acessa mural TENANT')
      } else {
        ok(AREA, 'SOCIO PENDENTE: mural bloqueado')
      }
      if (await podeVerFeedSocios(pendente.userId, sedeId)) {
        erro(AREA, 'SOCIO PENDENTE acessa mural da Sede')
      } else {
        ok(AREA, 'SOCIO PENDENTE: mural da Sede bloqueado')
      }
    }

    if (torcedor) {
      if (await podeVerFeedSocios(torcedor.userId, torcedor.tenantId)) {
        erro(AREA, 'TORCEDOR APROVADO acessa mural TENANT')
      } else {
        ok(AREA, 'TORCEDOR APROVADO: mural bloqueado')
      }
    }
  })
})
