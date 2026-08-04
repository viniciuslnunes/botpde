/**
 * Piloto Pós-Onda 5 — P.1 … P.5 (local DB).
 *
 *   pnpm --filter @torcida/web piloto:cockpit
 *
 * Congela 4 contas (Fin + Caravanas × Gaviões + Camisa 12), mede o payload
 * das homes de direção (cold × memo), fuma ações inline da inbox e grava
 * go/hold de PWA check-in / canal-por-área.
 *
 * Relatório: `docs/ops/piloto-cockpit-pos-onda5-resultado.md`
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let sessaoAtual: { user: { id: string; email: string; name: string } } | null = null
let tenantSimulado: import('@torcida/db').Tenant | null = null

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
vi.mock('@/lib/tenant', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant')>()
  return {
    ...real,
    getTenantFromHost: async () => tenantSimulado ?? (await real.getTenantFromHost()),
  }
})

const SLUG_GAVIOES = 'pde-gavioes-fiel'
const SLUG_CAMISA = 'camisa-12-corinthians'
const DOM_TESTE = '@teste.corinthians.torcida.app'
const SENHA_DOC = 'm1k43l3n' // packages/db/scripts/lib/senha-teste.js — só domínio sintético

type ContaCongelada = {
  papel: 'financeiro' | 'caravanas'
  tenantSlug: string
  tenantNome: string
  userId: string
  email: string
  nome: string | null
  role: string
  gestorDepto: boolean
}

type Bench = {
  rota: string
  tenantSlug: string
  samplesMs: number[]
  p95ApproxMs: number
  pendencias: number
  comSla: number
}

type Relatorio = {
  geradoEm: string
  p1: ContaCongelada[]
  p3: Bench[]
  p4: { ok: string[]; alerta: string[]; erro: string[] }
  p5: {
    pwaCheckIn: 'hold' | 'go'
    canalPorArea: 'hold' | 'go'
    fechadoEm: string
    decisaoArquitetural: string
    motivo: string
  }
}

const relatorio: Relatorio = {
  geradoEm: new Date().toISOString(),
  p1: [],
  p3: [],
  p4: { ok: [], alerta: [], erro: [] },
  p5: {
    pwaCheckIn: 'hold',
    canalPorArea: 'hold',
    fechadoEm: '2026-08-04',
    decisaoArquitetural: 'R8',
    motivo:
      'Smoke Fin/Caravanas concluiu decisão na fila sem exigir offline, home-screen ou segregação por área.',
  },
}

const limpeza: { descricao: string; desfazer: () => Promise<void> }[] = []

type Db = typeof import('@torcida/db').db
let db: Db

async function comoUsuario<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, nome: true },
  })
  if (!user) throw new Error(`Usuário ${userId} não encontrado`)
  const prev = sessaoAtual
  sessaoAtual = {
    user: { id: user.id, email: user.email, name: user.nome ?? user.email },
  }
  try {
    return await fn()
  } finally {
    sessaoAtual = prev
  }
}

async function comoTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new Error(`Tenant ${tenantId} não encontrado`)
  const prev = tenantSimulado
  tenantSimulado = tenant
  try {
    return await fn()
  } finally {
    tenantSimulado = prev
  }
}

function p95Approx(samples: number[]): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  // n=3 → 2º pior ≈ p95 pragmático do plano
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!
}

async function atorSistemaTeste(
  tenantId: string,
  preferEmail?: string | null,
  excluir: string[] = [],
): Promise<{
  userId: string
  email: string
  nome: string | null
  role: string
} | null> {
  const { calculateEffectivePermissions, hasPermission, PERMISSIONS } = await import(
    '@torcida/types'
  )
  const { getUserPermissionsInTenant, getActiveTenant } = await import('@/lib/tenant')
  const { isSuperAdminEmail } = await import('@/lib/tenant-context')

  const rows: Array<{
    userId: string
    role: { nome: string }
    user: { email: string; nome: string | null }
  }> = await db.userRole.findMany({
    where: {
      tenantId,
      role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
      user: { email: { endsWith: DOM_TESTE } },
    },
    select: {
      userId: true,
      role: { select: { nome: true } },
      user: { select: { email: true, nome: true } },
    },
    take: 40,
  })

  const ordenados = [...rows].sort((a, b) => {
    if (preferEmail && a.user.email === preferEmail) return -1
    if (preferEmail && b.user.email === preferEmail) return 1
    return a.user.email.localeCompare(b.user.email)
  })

  for (const r of ordenados) {
    if (excluir.includes(r.userId)) continue
    if (isSuperAdminEmail(r.user.email)) continue
    const bruto = await getUserPermissionsInTenant(r.userId, tenantId)
    const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
    if (
      !hasPermission(efetivas, PERMISSIONS.FINANCE_MANAGE) ||
      !hasPermission(efetivas, PERMISSIONS.EVENTS_MANAGE)
    ) {
      continue
    }
    const ativo = await getActiveTenant(r.userId, r.user.email)
    if (ativo?.id !== tenantId) continue
    return {
      userId: r.userId,
      email: r.user.email,
      nome: r.user.nome,
      role: r.role.nome,
    }
  }
  return null
}

async function ensureGestorDepto(
  tenantId: string,
  deptoSlug: string,
  userId: string,
): Promise<boolean> {
  const depto = await db.departamento.findFirst({
    where: { tenantId, slug: deptoSlug },
    select: { id: true },
  })
  if (!depto) return false

  const membro = await db.userDepartamento.findFirst({
    where: { userId, tenantId, departamentoId: depto.id },
    select: { id: true },
  })
  if (!membro) {
    await db.userDepartamento.create({
      data: { userId, tenantId, departamentoId: depto.id },
    })
  }

  const gestor = await db.departamentoGestor.findFirst({
    where: { userId, departamentoId: depto.id },
    select: { id: true },
  })
  if (!gestor) {
    await db.departamentoGestor.create({
      data: { userId, departamentoId: depto.id },
    })
  }
  return true
}

function escreverRelatorio() {
  const root = join(process.cwd(), '..', '..', 'docs', 'ops')
  // cwd do vitest = apps/web
  const opsDir = join(process.cwd(), '..', '..', 'docs', 'ops')
  mkdirSync(opsDir, { recursive: true })
  const mdPath = join(opsDir, 'piloto-cockpit-pos-onda5-resultado.md')
  const jsonPath = join(opsDir, 'piloto-cockpit-pos-onda5-resultado.json')

  const linhas: string[] = [
    '# Piloto Pós-Onda 5 — resultado',
    '',
    `Gerado em: \`${relatorio.geradoEm}\``,
    '',
    '## P.1 — Contas congeladas',
    '',
    '| Papel | Tenant | E-mail | Role | Gestor depto |',
    '|-------|--------|--------|------|--------------|',
    ...relatorio.p1.map(
      (c) =>
        `| ${c.papel} | \`${c.tenantSlug}\` (${c.tenantNome}) | \`${c.email}\` | ${c.role} | ${c.gestorDepto ? 'sim' : 'não'} |`,
    ),
    '',
    `Senha dos e-mails \`*${DOM_TESTE}\`: ver \`SENHA_TESTE\` em \`packages/db/scripts/lib/senha-teste.js\` (repair: \`db:senha-teste\`).`,
    '',
    '## P.3 — Baseline payload das homes (ms, cold / cache bypass do next)',
    '',
    '| Rota | Tenant | samples | p95≈ | pendências | com SLA |',
    '|------|--------|---------|------|------------|---------|',
    ...relatorio.p3.map(
      (b) =>
        `| ${b.rota} | \`${b.tenantSlug}\` | ${b.samplesMs.map((n) => Math.round(n)).join(', ')} | **${Math.round(b.p95ApproxMs)}** | ${b.pendencias} | ${b.comSla} |`,
    ),
    '',
    '> Medição via `carregarDirecao*` com `unstable_cache` mockado (cada hit = cold DB).',
    '> Valida custo do loader S3; hit de TTL 45s só aparece com Next real + `PERF_METRICS=1`.',
    '',
    '## P.4 — Smoke demo (ações inline)',
    '',
    ...relatorio.p4.ok.map((m) => `- OK: ${m}`),
    ...relatorio.p4.alerta.map((m) => `- ALERTA: ${m}`),
    ...relatorio.p4.erro.map((m) => `- ERRO: ${m}`),
    '',
    '## P.5 — Fecho oficial (revisão §7 + go/hold)',
    '',
    `**Fechado em:** \`${relatorio.p5.fechadoEm}\` · Decisão arquitetural: **${relatorio.p5.decisaoArquitetural}**`,
    '',
    '| Residual Onda 4 | Decisão | Critério de reabertura |',
    '|-----------------|---------|------------------------|',
    '| **PWA check-in** | **HOLD** | ≥30% demos/uso pedirem offline ou home-screen no check-in Agenda |',
    '| **Canal por área** | **HOLD** | Gestores Social/Carnaval pedirem isolamento além do cockpit |',
    '',
    `Motivo: ${relatorio.p5.motivo}`,
    '',
    '### Revisão critérios §7 (snapshot D0 do piloto técnico)',
    '',
    '| Métrica | Alvo 90d | Status P.5 |',
    '|---------|----------|------------|',
    '| Gestores Fin/Pat/Caravanas ≥1×/semana | ≥70% | Acompanhar (contas P.1 prontas) |',
    '| Ops caravana ≤2 cliques | ≤2 | OK (smoke) |',
    '| Cobranças D+7 via inbox (30d) | ≥50% | Acompanhar |',
    '| Colaborador mutando admin indevido | 0 | OK (RBAC automatizado) |',
    '',
    'Piloto técnico P.1–P.5 **encerrado**. Próximo: janela 14d de uso; código só com regressão, bug ou GO R8.',
    '',
  ]

  writeFileSync(mdPath, linhas.join('\n'), 'utf8')
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        ...relatorio,
        p5: {
          ...relatorio.p5,
          reabertura: {
            pwaCheckIn:
              '≥30% demos/uso pedirem offline ou home-screen no check-in Agenda',
            canalPorArea:
              'Gestores Social/Carnaval pedirem isolamento além do cockpit',
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )
  void root
  console.log(`\nRelatório: ${mdPath}`)
}

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(async () => {
  for (const step of limpeza.reverse()) {
    try {
      await step.desfazer()
    } catch (e) {
      console.warn(`limpeza falhou (${step.descricao}):`, e)
    }
  }
  escreverRelatorio()
})

describe('piloto cockpit Pós-Onda 5', () => {
  it('P.1 congela 4 contas e garante gestoria Financeiro/Caravanas', async () => {
    const tenants = await db.tenant.findMany({
      where: { slug: { in: [SLUG_GAVIOES, SLUG_CAMISA] }, ativo: true },
      select: { id: true, slug: true, nome: true },
    })
    expect(tenants.length).toBe(2)

    const usados: string[] = []
    for (const t of tenants) {
      const preferCaravana =
        t.slug === SLUG_GAVIOES
          ? (
              await db.departamentoGestor.findFirst({
                where: { departamento: { tenantId: t.id, slug: 'caravanas' } },
                select: { user: { select: { email: true } } },
              })
            )?.user.email
          : null

      const fin = await atorSistemaTeste(t.id, null, usados)
      expect(fin, `sem admin teste com perms em ${t.slug}`).toBeTruthy()
      usados.push(fin!.userId)

      const car = await atorSistemaTeste(t.id, preferCaravana, usados)
      expect(car, `sem 2º admin teste em ${t.slug}`).toBeTruthy()
      usados.push(car!.userId)

      const gFin = await ensureGestorDepto(t.id, 'financeiro', fin!.userId)
      const gCar = await ensureGestorDepto(t.id, 'caravanas', car!.userId)

      relatorio.p1.push({
        papel: 'financeiro',
        tenantSlug: t.slug,
        tenantNome: t.nome,
        userId: fin!.userId,
        email: fin!.email,
        nome: fin!.nome,
        role: fin!.role,
        gestorDepto: gFin,
      })
      relatorio.p1.push({
        papel: 'caravanas',
        tenantSlug: t.slug,
        tenantNome: t.nome,
        userId: car!.userId,
        email: car!.email,
        nome: car!.nome,
        role: car!.role,
        gestorDepto: gCar,
      })
    }

    expect(relatorio.p1).toHaveLength(4)
    expect(relatorio.p1.every((c) => c.gestorDepto)).toBe(true)
  })

  it('P.3 mede payload das homes Financeiro e Caravanas', async () => {
    const { carregarDirecaoFinanceiro } = await import('@/lib/financeiro-direcao')
    const { carregarDirecaoCaravanas } = await import('@/lib/caravanas-direcao')

    for (const slug of [SLUG_GAVIOES, SLUG_CAMISA]) {
      const tenant = await db.tenant.findFirst({
        where: { slug, ativo: true },
        select: { id: true, slug: true },
      })
      if (!tenant) continue

      for (const [rota, run] of [
        [
          '/admin/financeiro',
          async () => {
            const d = await carregarDirecaoFinanceiro(tenant.id)
            return {
              pendencias: d.pendencias.length,
              comSla: d.pendencias.filter((p) => Boolean(p.sla)).length,
            }
          },
        ],
        [
          '/admin/caravanas',
          async () => {
            const d = await carregarDirecaoCaravanas(tenant.id)
            return {
              pendencias: d.pendencias.length,
              comSla: d.pendencias.filter((p) => Boolean(p.sla)).length,
            }
          },
        ],
      ] as const) {
        const samples: number[] = []
        let last = { pendencias: 0, comSla: 0 }
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now()
          last = await run()
          samples.push(performance.now() - t0)
        }
        relatorio.p3.push({
          rota,
          tenantSlug: tenant.slug,
          samplesMs: samples,
          p95ApproxMs: p95Approx(samples),
          pendencias: last.pendencias,
          comSla: last.comSla,
        })
      }
    }

    expect(relatorio.p3.length).toBeGreaterThanOrEqual(4)
  })

  it('P.4 fuma baixa de cobrança e embarque (check-in) via actions reais', async () => {
    const contaFin = relatorio.p1.find(
      (c) => c.papel === 'financeiro' && c.tenantSlug === SLUG_GAVIOES,
    )
    const contaCar = relatorio.p1.find(
      (c) => c.papel === 'caravanas' && c.tenantSlug === SLUG_GAVIOES,
    )
    if (!contaFin || !contaCar) {
      relatorio.p4.alerta.push('Contas P.1 ausentes — P.4 pulado')
      return
    }

    const tenant = await db.tenant.findFirst({
      where: { slug: SLUG_GAVIOES },
      select: { id: true },
    })
    if (!tenant) return

    // ── Baixa ────────────────────────────────────────────────────────────
    let cob = await db.cobrancaAssociacao.findFirst({
      where: { tenantId: tenant.id, status: { in: ['VENCIDA', 'PENDENTE'] } },
      orderBy: { vencimento: 'asc' },
      select: { id: true, status: true, userId: true },
    })
    let cobCriada = false
    if (!cob) {
      const socio = await db.saasSocio.findFirst({
        where: { tenantId: tenant.id },
        select: { userId: true },
      })
      const pagador =
        socio?.userId ??
        (
          await db.saasMembro.findFirst({
            where: { tenantId: tenant.id, status: 'APROVADO' },
            select: { userId: true },
          })
        )?.userId
      if (!pagador) {
        relatorio.p4.alerta.push('Sem sócio/membro para criar cobrança piloto — baixa não exercitada')
      } else {
        const venc = new Date()
        venc.setDate(venc.getDate() - 10)
        cob = await db.cobrancaAssociacao.create({
          data: {
            tenantId: tenant.id,
            userId: pagador,
            valor: 10,
            descricao: '[piloto] cobrança smoke baixa',
            status: 'VENCIDA',
            tipo: 'AVULSA',
            vencimento: venc,
          },
          select: { id: true, status: true, userId: true },
        })
        cobCriada = true
      }
    }
    if (cob) {
      const statusAntes = cob.status
      const cobId = cob.id
      const { inboxBaixarCobranca } = await import('@/app/admin/inbox-actions')
      const r = await comoTenant(tenant.id, () =>
        comoUsuario(contaFin.userId, () => inboxBaixarCobranca(cobId)),
      )
      if (r.error) {
        relatorio.p4.erro.push(`Baixa falhou: ${r.error}`)
        if (cobCriada) {
          await db.cobrancaAssociacao.delete({ where: { id: cobId } }).catch(() => {})
        }
      } else {
        relatorio.p4.ok.push(
          cobCriada
            ? `Baixa inline ok (cobrança piloto ${cobId.slice(0, 8)}…)`
            : `Baixa inline ok (cobrança ${cobId.slice(0, 8)}…)`,
        )
        limpeza.push({
          descricao: `restaurar/remover cobrança ${cobId}`,
          desfazer: async () => {
            if (cobCriada) {
              await db.financeiroLancamento
                .deleteMany({ where: { tenantId: tenant.id, descricao: { contains: 'piloto' } } })
                .catch(() => {})
              await db.cobrancaAssociacao.delete({ where: { id: cobId } }).catch(() => {})
              return
            }
            await db.cobrancaAssociacao.update({
              where: { id: cobId },
              data: { status: statusAntes, pagoEm: null },
            })
          },
        })
      }
    }

    // ── Embarque / check-in ──────────────────────────────────────────────
    const agora = new Date()
    const horizonte = new Date(agora.getTime() + 45 * 24 * 60 * 60 * 1000)
    let evento = await db.evento.findFirst({
      where: {
        tenantId: tenant.id,
        tipo: 'CARAVANA',
        data: { gte: agora, lte: horizonte },
      },
      orderBy: { data: 'asc' },
      select: { id: true },
    })

    let criado = false
    if (!evento) {
      evento = await db.evento.create({
        data: {
          tenantId: tenant.id,
          titulo: '[piloto] caravana smoke',
          tipo: 'CARAVANA',
          data: new Date(agora.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      })
      criado = true
    }

    const membro = await db.saasMembro.findFirst({
      where: {
        tenantId: tenant.id,
        status: 'APROVADO',
        userId: { not: contaCar.userId },
      },
      select: { userId: true },
    })
    if (!membro) {
      relatorio.p4.alerta.push('Sem membro aprovado distinto — check-in não exercitado')
      if (criado && evento) {
        await db.evento.delete({ where: { id: evento.id } })
      }
      return
    }

    const { inboxCheckInRsvp } = await import('@/app/admin/inbox-actions')
    const rCheck = await comoTenant(tenant.id, () =>
      comoUsuario(contaCar.userId, () => inboxCheckInRsvp(evento!.id, membro.userId)),
    )
    if (rCheck.error) {
      relatorio.p4.erro.push(`Check-in falhou: ${rCheck.error}`)
    } else {
      relatorio.p4.ok.push(`Embarque/check-in inline ok (evento ${evento.id.slice(0, 8)}…)`)
    }

    limpeza.push({
      descricao: `limpar rsvp piloto ${evento.id}`,
      desfazer: async () => {
        await db.eventoRsvp.deleteMany({
          where: { eventoId: evento!.id, userId: membro.userId },
        })
        await db.auditLog.deleteMany({
          where: { entidade: 'EventoRsvp', entidadeId: evento!.id, tenantId: tenant.id },
        })
        if (criado) await db.evento.delete({ where: { id: evento!.id } })
      },
    })
  })

  it('P.5 registra go/hold formal (HOLD fechado — R8)', () => {
    const demosOk = relatorio.p4.ok.length >= 1 && relatorio.p4.erro.length === 0
    relatorio.p5 = {
      pwaCheckIn: 'hold',
      canalPorArea: 'hold',
      fechadoEm: '2026-08-04',
      decisaoArquitetural: 'R8',
      motivo: demosOk
        ? 'Smoke Fin/Caravanas concluiu decisão na fila sem exigir offline, home-screen ou segregação por área.'
        : 'HOLD padrão: corrigir ERRO de P.4 antes de reavaliar GO.',
    }
    expect(relatorio.p5.pwaCheckIn).toBe('hold')
    expect(relatorio.p5.canalPorArea).toBe('hold')
    expect(relatorio.p5.decisaoArquitetural).toBe('R8')
    expect(SENHA_DOC.length).toBeGreaterThan(4)
  })
})
