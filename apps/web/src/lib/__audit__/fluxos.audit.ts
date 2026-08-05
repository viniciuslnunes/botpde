/**
 * Auditoria de FLUXOS ponta a ponta — executa as **Server Actions reais**
 * com sessão simulada, em vez de só ler o banco.
 *
 * Diferença para `dados-reais.audit.ts`: lá auditamos estado e funções de
 * leitura; aqui percorremos a sequência que um usuário percorre (aprovar
 * membro, comprar na loja, publicar, moderar, propor aliança) passando pelos
 * mesmos `assertPermission` que a UI passa. É o que revela regra que só
 * aparece quando o fluxo roda inteiro.
 *
 * ⚠️ **Este arquivo MUTA o banco.** Toda mutação é feita sobre entidades dos
 * lotes de teste e **revertida** no `afterAll` (ver `limpeza`). Se a auditoria
 * abortar no meio, rode `pnpm --filter @torcida/db reset:corinthians-teste
 * -- --dry-run` para conferir o que sobrou.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:fluxos
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// ── Sessão simulada ──────────────────────────────────────────────────────
/** Usuário "logado" no momento — trocado por `comoUsuario`. */
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
 * Tenant "do host" — sem request HTTP, `getTenantFromHost` cairia no
 * TENANT_SLUG do .env e as actions do portal mutariam a torcida errada.
 * `null` mantém o comportamento real para todo mundo que não usa `comoTenant`.
 */
let tenantSimulado: import('@torcida/db').Tenant | null = null
vi.mock('@/lib/tenant', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant')>()
  return {
    ...real,
    getTenantFromHost: async () => tenantSimulado ?? (await real.getTenantFromHost()),
  }
})

const DOM_COR = '@teste.corinthians.torcida.app'

type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const achados: Achado[] = []
const erro = (area: string, msg: string) => achados.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => achados.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => achados.push({ nivel: 'ok', area, msg })

/** Reversões pendentes, executadas na ordem inversa no afterAll. */
const limpeza: { descricao: string; desfazer: () => Promise<void> }[] = []

type Db = typeof import('@torcida/db').db
let db: Db

async function comoUsuario<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, nome: true },
  })
  if (!user) throw new Error(`Usuário ${userId} não encontrado`)
  const anterior = sessaoAtual
  sessaoAtual = { user: { id: user.id, email: user.email, name: user.nome ?? 'Teste' } }
  try {
    return await fn()
  } finally {
    sessaoAtual = anterior
  }
}

/** Fixa o tenant que as actions do portal enxergam como "o host atual". */
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

/** Executa e devolve o erro em vez de propagar — o padrão das actions varia. */
async function tentativa<T>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; erro: string }> {
  try {
    const valor = await fn()
    // Várias actions devolvem `{ error }` em vez de lançar.
    if (valor && typeof valor === 'object' && 'error' in valor && (valor as { error?: string }).error) {
      return { ok: false, erro: String((valor as { error?: string }).error) }
    }
    return { ok: true, valor }
  } catch (e) {
    // finalizarPedido (e outras) usam redirect() no sucesso — digest NEXT_REDIRECT.
    if (e && typeof e === 'object' && typeof (e as { digest?: string }).digest === 'string') {
      const digest = (e as { digest: string }).digest
      if (digest.startsWith('NEXT_REDIRECT')) return { ok: true, valor: undefined as T }
    }
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(async () => {
  for (const item of [...limpeza].reverse()) {
    try {
      await item.desfazer()
    } catch (e) {
      erro('limpeza', `Falhou ao reverter "${item.descricao}": ${e instanceof Error ? e.message : e}`)
    }
  }

  const linhas: string[] = ['', '══════ AUDITORIA DE FLUXOS (Server Actions reais) ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = achados.filter((a) => a.nivel === nivel)
    linhas.push('', `${nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ Conformes'}: ${itens.length}`)
    for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
  }
  linhas.push('', `🧹 Reversões executadas: ${limpeza.length}`)
  const relatorio = linhas.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'auditoria-fluxos.txt'), `${relatorio}\n`, 'utf8')
})

// ── FLUXO 1: prova do Achado 1 (cargo desatualizado bloqueia o Bar) ──────
describe('fluxo: Presidente tenta operar o Bar', () => {
  it('owner real é barrado no PDV por Role desatualizado', async () => {
    // Escolhe o tenant pelo DEFEITO, não por nome: um cujo Role de owner
    // realmente não tem bar:operate/bar:manage gravado. (O Gaviões é um dos
    // poucos atualizados — testar nele daria falso "tudo certo".)
    const { PERMISSIONS } = await import('@torcida/types')
    const stale = await db.$queryRaw<{ tenant_id: string; slug: string; user_id: string }[]>`
      SELECT r.tenant_id, t.slug, ur.user_id
      FROM saas_roles r
      JOIN saas_tenants t ON t.id = r.tenant_id
      JOIN saas_user_roles ur ON ur.role_id = r.id
      WHERE r.is_system AND r.nome = 'owner'
        AND NOT (${PERMISSIONS.BAR_OPERATE} = ANY(r.permissions) OR ${PERMISSIONS.BAR_OPERATE} = ANY(r.permissions_extras))
        AND NOT (${PERMISSIONS.BAR_MANAGE} = ANY(r.permissions) OR ${PERMISSIONS.BAR_MANAGE} = ANY(r.permissions_extras))
      LIMIT 1`
    if (stale.length === 0) {
      ok('bar', 'Nenhum Role de owner sem bar:operate/bar:manage — Achado 1 resolvido')
      return
    }
    const tenant = { id: stale[0].tenant_id, slug: stale[0].slug }
    const ownerRole = {
      userId: stale[0].user_id,
      user: await db.user.findUnique({ where: { id: stale[0].user_id }, select: { email: true } }),
    }
    if (!ownerRole.user) {
      alerta('bar', 'Owner do tenant desatualizado não encontrado')
      return
    }
    // Super admin passa por cima de tudo — precisa de um owner comum.
    const { isSuperAdminEmail } = await import('@/lib/tenant-context')
    if (isSuperAdminEmail(ownerRole.user.email)) {
      alerta('bar', 'O owner do Gaviões é super-admin (passa por cima do RBAC) — fluxo não conclusivo aqui')
    }

    const { abrirTurnoBar } = await import('@/app/admin/bar/actions')
    const r = await comoUsuario(ownerRole.userId, () => tentativa(() => abrirTurnoBar()))
    if (!r.ok && /Sem permissão/i.test(r.erro)) {
      erro(
        'bar',
        `CONFIRMADO em fluxo real: o Presidente de ${tenant.slug} recebe "Sem permissão" ao abrir o caixa do bar — Role de sistema desatualizado (bar:operate/bar:manage). Ver auditoria-funcional-2026-07 §Achado 1`,
      )
    } else if (r.ok) {
      ok('bar', 'Presidente consegue abrir turno de caixa (Role em dia neste tenant)')
      // Se abriu, fecha para não deixar turno órfão.
      const turno = await db.barCaixaTurno.findFirst({
        where: { tenantId: tenant.id, fechadoEm: null },
        orderBy: { abertoEm: 'desc' },
        select: { id: true },
      })
      if (turno) {
        limpeza.push({
          descricao: `fechar turno ${turno.id} aberto pela auditoria`,
          desfazer: async () => {
            await db.barCaixaTurno.delete({ where: { id: turno.id } })
          },
        })
      }
    } else {
      alerta('bar', `Abertura de turno falhou por outro motivo: ${r.erro}`)
    }
  })
})

// ── FLUXO 2: aprovação de membro ─────────────────────────────────────────
describe('fluxo: cadastro pendente → aprovação → equipe + canal', () => {
  it('aprovarMembro promove o membro e projeta os efeitos colaterais', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: 'camisa-12-corinthians' },
      select: { id: true, slug: true },
    })
    if (!tenant) return

    const pendente = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'PENDENTE', user: { email: { endsWith: DOM_COR } } },
      select: { id: true, userId: true, nome: true, departamentoId: true, sedeId: true },
    })
    if (!pendente) {
      alerta('membros', `Sem membro PENDENTE de teste em ${tenant.slug} — fluxo de aprovação não exercitado`)
      return
    }

    // Quem aprova: alguém com members:approve de fato.
    const { calculateEffectivePermissions, hasPermission, PERMISSIONS } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')
    const candidatos = await db.userRole.findMany({
      where: { tenantId: tenant.id, role: { isSystem: true, nome: { in: ['owner', 'admin'] } } },
      select: { userId: true },
      take: 8,
    })
    let aprovadorId: string | null = null
    for (const c of candidatos) {
      const bruto = await getUserPermissionsInTenant(c.userId, tenant.id)
      const ef = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      if (hasPermission(ef, PERMISSIONS.MEMBERS_APPROVE)) {
        aprovadorId = c.userId
        break
      }
    }
    if (!aprovadorId) {
      erro('membros', `Ninguém em ${tenant.slug} tem members:approve — a fila de aprovação está travada`)
      return
    }

    const antes = {
      canais: await db.membroConversa.count({ where: { userId: pendente.userId } }),
      auditoria: await db.auditLog.count({ where: { tenantId: tenant.id } }),
      notificacoes: await db.notificacao.count({ where: { userId: pendente.userId } }),
      equipe: await db.userDepartamento.count({ where: { userId: pendente.userId, tenantId: tenant.id } }),
      cargos: await db.userRole.count({ where: { userId: pendente.userId, tenantId: tenant.id } }),
    }

    // Reversão registrada ANTES da mutação.
    limpeza.push({
      descricao: `reverter aprovação do membro ${pendente.id}`,
      desfazer: async () => {
        await db.userDepartamento.deleteMany({ where: { userId: pendente.userId, tenantId: tenant.id } })
        await db.departamentoGestor.deleteMany({
          where: { userId: pendente.userId, departamento: { tenantId: tenant.id } },
        })
        await db.userRole.deleteMany({ where: { userId: pendente.userId, tenantId: tenant.id } })
        await db.membroConversa.deleteMany({ where: { userId: pendente.userId } })
        await db.notificacao.deleteMany({ where: { userId: pendente.userId } })
        await db.saasMembro.update({
          where: { id: pendente.id },
          data: { status: 'PENDENTE', aprovadoEm: null, aprovadoPorNome: null },
        })
      },
    })

    const { aprovarMembro } = await import('@/app/admin/membros/actions')
    const r = await comoUsuario(aprovadorId, () => tentativa(() => aprovarMembro(pendente.id)))
    if (!r.ok) {
      erro('membros', `aprovarMembro falhou para quem TEM members:approve: ${r.erro}`)
      return
    }

    const depois = {
      membro: await db.saasMembro.findUnique({
        where: { id: pendente.id },
        select: { status: true, aprovadoEm: true, departamentoId: true },
      }),
      canais: await db.membroConversa.count({ where: { userId: pendente.userId } }),
      auditoria: await db.auditLog.count({ where: { tenantId: tenant.id } }),
      notificacoes: await db.notificacao.count({ where: { userId: pendente.userId } }),
      equipe: await db.userDepartamento.count({ where: { userId: pendente.userId, tenantId: tenant.id } }),
      cargos: await db.userRole.count({ where: { userId: pendente.userId, tenantId: tenant.id } }),
    }

    if (depois.membro?.status !== 'APROVADO') {
      erro('membros', `aprovarMembro não deixou o membro APROVADO (ficou ${depois.membro?.status})`)
    } else {
      ok('membros', 'aprovarMembro: status vira APROVADO com aprovadoEm preenchido')
    }
    if (depois.canais <= antes.canais) {
      erro('membros', `Aprovação não vinculou o membro a nenhum canal (antes ${antes.canais}, depois ${depois.canais}) — canal oficial da unidade deveria receber o aprovado`)
    } else {
      ok('membros', `Aprovação vinculou o membro a ${depois.canais - antes.canais} canal(is)`)
    }
    if (depois.cargos <= antes.cargos) {
      alerta('membros', 'Aprovação não atribuiu nenhum cargo (member) ao aprovado')
    } else {
      ok('membros', `Aprovação atribuiu ${depois.cargos - antes.cargos} cargo(s)`)
    }
    if (depois.auditoria <= antes.auditoria) {
      erro('membros', 'aprovarMembro não gravou AuditLog (convenção obrigatória do CLAUDE.md)')
    } else {
      ok('membros', 'aprovarMembro gravou AuditLog')
    }
    if (depois.notificacoes <= antes.notificacoes) {
      alerta('notificações', 'Aprovação não gerou notificação para o membro aprovado')
    } else {
      ok('notificações', `Aprovação gerou ${depois.notificacoes - antes.notificacoes} notificação(ões)`)
    }
    // Preferência de área → equipe, só na aprovação.
    if (pendente.departamentoId) {
      if (depois.equipe > antes.equipe) {
        ok('departamentos', 'Preferência de área virou membership de equipe na aprovação (fluxo documentado)')
      } else {
        alerta(
          'departamentos',
          'Membro tinha preferência de área e a aprovação não criou UserDepartamento — conferir opts.incluirDepartamento',
        )
      }
    }
  })

  it('membro comum NÃO consegue aprovar ninguém', async () => {
    const tenant = await db.tenant.findFirst({ where: { slug: 'camisa-12-corinthians' }, select: { id: true } })
    if (!tenant) return
    const comum = await db.$queryRaw<{ user_id: string }[]>`
      SELECT ur.user_id FROM saas_user_roles ur
      JOIN saas_roles r ON r.id = ur.role_id
      WHERE ur.tenant_id = ${tenant.id} AND r.is_system AND r.nome = 'member'
        AND (SELECT COUNT(*) FROM saas_user_roles ur2 JOIN saas_roles r2 ON r2.id = ur2.role_id
             WHERE ur2.user_id = ur.user_id AND ur2.tenant_id = ur.tenant_id AND r2.is_system) = 1
      LIMIT 1`
    const pendente = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'PENDENTE' },
      select: { id: true },
    })
    if (comum.length === 0 || !pendente) {
      alerta('membros', 'Sem membro comum ou sem pendente para testar negação de aprovação')
      return
    }
    const { aprovarMembro } = await import('@/app/admin/membros/actions')
    const r = await comoUsuario(comum[0].user_id, () => tentativa(() => aprovarMembro(pendente.id)))
    if (r.ok) {
      erro('membros', 'ESCALADA: membro comum (só cargo member) conseguiu APROVAR outro membro')
    } else {
      ok('membros', `Membro comum barrado ao tentar aprovar: "${r.erro}"`)
    }
  })

  it('admin de uma torcida NÃO aprova membro de outra torcida', async () => {
    const [a, b] = await Promise.all([
      db.tenant.findFirst({ where: { slug: 'camisa-12-corinthians' }, select: { id: true, slug: true } }),
      db.tenant.findFirst({ where: { slug: 'pavilhao-nove' }, select: { id: true, slug: true } }),
    ])
    if (!a || !b) return
    const adminA = await db.userRole.findFirst({
      where: { tenantId: a.id, role: { isSystem: true, nome: 'admin' }, user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    const pendenteB = await db.saasMembro.findFirst({
      where: { tenantId: b.id, status: 'PENDENTE' },
      select: { id: true },
    })
    if (!adminA || !pendenteB) {
      alerta('multi-tenant', 'Sem admin/pendente para testar aprovação cross-tenant')
      return
    }
    const { aprovarMembro } = await import('@/app/admin/membros/actions')
    const r = await comoUsuario(adminA.userId, () => tentativa(() => aprovarMembro(pendenteB.id)))
    if (r.ok) {
      erro('multi-tenant', `VAZAMENTO: admin de ${a.slug} aprovou membro de ${b.slug}`)
    } else {
      ok('multi-tenant', `Admin de ${a.slug} barrado ao aprovar membro de ${b.slug}: "${r.erro}"`)
    }
  })
})

// ── FLUXO 2b: reprovação com laudo → histórico → reenvio ─────────────────
describe('fluxo: cadastro pendente → reprovação justificada', () => {
  it('reprovarMembro exige justificativa, grava o laudo e alimenta o histórico', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: 'camisa-12-corinthians' },
      select: { id: true, slug: true },
    })
    if (!tenant) return

    const pendente = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'PENDENTE', user: { email: { endsWith: DOM_COR } } },
      select: { id: true, userId: true, departamentoId: true },
    })
    if (!pendente) {
      alerta('membros', `Sem membro PENDENTE de teste em ${tenant.slug} — fluxo de reprovação não exercitado`)
      return
    }

    const { calculateEffectivePermissions, hasPermission, PERMISSIONS } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')
    const candidatos = await db.userRole.findMany({
      where: { tenantId: tenant.id, role: { isSystem: true, nome: { in: ['owner', 'admin'] } } },
      select: { userId: true },
      take: 8,
    })
    let reprovadorId: string | null = null
    for (const c of candidatos) {
      const bruto = await getUserPermissionsInTenant(c.userId, tenant.id)
      const ef = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      if (hasPermission(ef, PERMISSIONS.MEMBERS_REJECT)) {
        reprovadorId = c.userId
        break
      }
    }
    if (!reprovadorId) {
      erro('membros', `Ninguém em ${tenant.slug} tem members:reject — não dá para recusar cadastro`)
      return
    }

    limpeza.push({
      descricao: `reverter reprovação do membro ${pendente.id}`,
      desfazer: async () => {
        const { REPROVACAO_LIMPA } = await import('@/lib/membros-sede')
        await db.notificacao.deleteMany({ where: { userId: pendente.userId } })
        await db.saasMembro.update({
          where: { id: pendente.id },
          data: {
            status: 'PENDENTE',
            aprovadoEm: null,
            aprovadoPorId: null,
            aprovadoPorNome: null,
            departamentoId: pendente.departamentoId,
            ...REPROVACAO_LIMPA,
          },
        })
      },
    })

    const { reprovarMembro } = await import('@/app/admin/membros/actions')

    // 1. Justificativa curta demais precisa ser recusada pela própria action —
    // a validação do diálogo não é a barreira de verdade.
    const curta = await comoUsuario(reprovadorId, () =>
      tentativa(() =>
        reprovarMembro(pendente.id, {
          categoria: 'DOCUMENTACAO',
          motivo: 'ruim',
          pontos: ['documento'],
          permiteReenvio: true,
        }),
      ),
    )
    if (curta.ok) {
      erro('membros', 'reprovarMembro aceitou justificativa de 4 caracteres — o motivo não está sendo validado no servidor')
    } else {
      ok('membros', `Justificativa curta barrada no servidor: "${curta.erro}"`)
    }

    // 2. Reprovação real, com pontos apontados.
    const pontos = ['documento', 'cpf']
    const motivo = 'Auditoria automatizada: foto do documento ilegível e CPF divergente do RG enviado.'
    const feita = await comoUsuario(reprovadorId, () =>
      tentativa(() =>
        reprovarMembro(pendente.id, {
          categoria: 'DOCUMENTACAO',
          motivo,
          pontos,
          permiteReenvio: false,
        }),
      ),
    )
    if (!feita.ok) {
      erro('membros', `reprovarMembro falhou para quem TEM members:reject: ${feita.erro}`)
      return
    }

    const depois = await db.saasMembro.findUnique({
      where: { id: pendente.id },
      select: {
        status: true,
        reprovadoEm: true,
        reprovadoPorNome: true,
        reprovadoCategoria: true,
        reprovadoMotivo: true,
        reprovadoPontos: true,
        reprovadoPermiteReenvio: true,
      },
    })
    if (depois?.status !== 'REPROVADO') {
      erro('membros', `reprovarMembro não deixou o membro REPROVADO (ficou ${depois?.status})`)
    } else {
      const faltando: string[] = []
      if (depois.reprovadoMotivo !== motivo) faltando.push(`motivo (${depois.reprovadoMotivo ?? 'null'})`)
      if (depois.reprovadoCategoria !== 'DOCUMENTACAO') {
        faltando.push(`categoria (${depois.reprovadoCategoria ?? 'null'})`)
      }
      if (depois.reprovadoPontos.length !== pontos.length) {
        faltando.push(`pontos ([${depois.reprovadoPontos.join(', ')}])`)
      }
      if (!depois.reprovadoEm) faltando.push('reprovadoEm')
      if (!depois.reprovadoPorNome) faltando.push('reprovadoPorNome')
      if (faltando.length > 0) {
        erro('membros', `Reprovação gravou status mas o laudo ficou incompleto — ${faltando.join('; ')}`)
      } else {
        ok('membros', `Reprovação gravou laudo completo: ${depois.reprovadoPontos.length} ponto(s), autor e data`)
      }
    }
    if (depois?.reprovadoPermiteReenvio !== false) {
      erro('membros', 'Reprovação definitiva não persistiu reprovadoPermiteReenvio = false')
    } else {
      ok('membros', 'Reprovação definitiva bloqueia o reenvio (reprovadoPermiteReenvio = false)')
    }

    // 3. O laudo precisa chegar ao card e ao histórico — é o que a UI lê.
    const { listarHistoricoMembro } = await import('@/app/admin/membros/historico-actions')
    const hist = await comoUsuario(reprovadorId, () => tentativa(() => listarHistoricoMembro(pendente.id)))
    if (!hist.ok || !hist.valor || hist.valor.ok !== true) {
      erro('membros', `listarHistoricoMembro falhou para o admin: ${hist.ok ? 'retorno inesperado' : hist.erro}`)
    } else {
      const entradaReprovacao = hist.valor.entradas.find((e) => e.acao === 'MEMBRO_REPROVADO')
      if (!entradaReprovacao) {
        erro('membros', 'Histórico do membro não trouxe a entrada MEMBRO_REPROVADO recém-criada')
      } else if (entradaReprovacao.atorTipo !== 'admin' || entradaReprovacao.detalhes.length === 0) {
        erro('membros', 'Entrada de reprovação no histórico veio sem detalhes legíveis ou com ator errado')
      } else {
        ok('membros', `Histórico mostra a reprovação com ${entradaReprovacao.detalhes.length} detalhe(s) e o admin como ator`)
      }
      const entradaSolicitante = hist.valor.entradas.find((e) => e.atorTipo === 'solicitante')
      if (!entradaSolicitante) {
        alerta('membros', 'Histórico não trouxe nenhuma ação do próprio solicitante (cadastro/reenvio) — seed pode não ter auditado a criação')
      } else {
        ok('membros', `Histórico distingue ações do solicitante ("${entradaSolicitante.acaoLabel}") das do admin`)
      }
    }

    // 4. Reenvio bloqueado de ponta a ponta, e não só na tela.
    const { solicitarCadastro } = await import('@/app/portal/cadastro/actions')
    const form = new FormData()
    form.set('nome', 'Auditoria Reenvio')
    form.set('tipo', 'SOCIO')
    // O formulário real sempre envia os campos opcionais como string vazia;
    // omiti-los aqui viraria `null` e travaria no Zod antes do que interessa.
    for (const campo of ['idade', 'telefone', 'cidade', 'discordTag']) form.set(campo, '')
    // Torcida com mais de uma unidade exige a escolha — sem isso o reenvio
    // pararia na validação do formulário e nunca chegaria ao bloqueio.
    const sede = await db.sede.findFirst({
      where: { tenantId: tenant.id, ativa: true },
      select: { id: true },
    })
    if (sede) form.set('sedeId', sede.id)
    const reenvio = await comoTenant(tenant.id, () =>
      comoUsuario(pendente.userId, () => tentativa(() => solicitarCadastro({}, form))),
    )
    const msgReenvio = !reenvio.ok
      ? reenvio.erro
      : reenvio.valor && typeof reenvio.valor === 'object'
        ? (String((reenvio.valor as { message?: string }).message ?? '') ||
          JSON.stringify((reenvio.valor as { errors?: unknown }).errors ?? {}))
        : ''
    if (/bloqueado/i.test(msgReenvio)) {
      ok('membros', 'Reenvio de cadastro barrado no servidor após reprovação definitiva')
    } else {
      const aindaReprovado = await db.saasMembro.findUnique({
        where: { id: pendente.id },
        select: { status: true },
      })
      if (aindaReprovado?.status === 'PENDENTE') {
        erro('membros', 'Reprovação definitiva NÃO bloqueou o reenvio: o cadastro voltou para PENDENTE')
      } else {
        alerta('membros', `Reenvio não foi aceito, mas por outro motivo: "${msgReenvio}"`)
      }
    }
  })
})

// ── FLUXO 3: loja — sacola → cupom → checkout ────────────────────────────
describe('fluxo: comprar na loja', () => {
  it('carrinho → cupom → pedido decrementa estoque e fecha o valor', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: 'camisa-12-corinthians' },
      select: { id: true, slug: true },
    })
    if (!tenant) return
    const produto = await db.saasProduto.findFirst({
      where: { tenantId: tenant.id, ativo: true, slug: { startsWith: 'teste-corinthians-' } },
      select: { id: true, nome: true, preco: true, tamanhos: true, estoque: true },
    })
    const comprador = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    if (!produto || !comprador) {
      alerta('loja', 'Sem produto/comprador de teste para o fluxo de compra')
      return
    }

    const tamanho = produto.tamanhos[0] ?? 'UN'
    const estoqueAntes = (produto.estoque as Record<string, number>)[tamanho] ?? 0

    limpeza.push({
      descricao: `limpar carrinho/pedido de ${comprador.userId}`,
      desfazer: async () => {
        await db.saasCarrinhoItem.deleteMany({ where: { userId: comprador.userId } })
        const pedidos = await db.saasPedido.findMany({
          where: { userId: comprador.userId, tenantId: tenant.id, criadoEm: { gte: new Date(Date.now() - 3600_000) } },
          select: { id: true, financeiroLancamentoId: true },
        }) as { id: string; financeiroLancamentoId: string | null }[]
        for (const p of pedidos) {
          if (p.financeiroLancamentoId) {
            await db.financeiroLancamento.deleteMany({ where: { id: p.financeiroLancamentoId } })
          }
        }
        await db.saasPedido.deleteMany({ where: { id: { in: pedidos.map((p) => p.id) } } })
        await db.saasProduto.update({ where: { id: produto.id }, data: { estoque: produto.estoque as object } })
      },
    })

    const { adicionarAoCarrinho, finalizarPedido } = await import('@/app/portal/loja/actions')

    const fdCarrinho = new FormData()
    fdCarrinho.set('produtoId', produto.id)
    fdCarrinho.set('quantidade', '2')
    fdCarrinho.set('tamanho', tamanho)
    const rCarrinho = await comoUsuario(comprador.userId, () =>
      tentativa(() => adicionarAoCarrinho({}, fdCarrinho)),
    )
    if (!rCarrinho.ok) {
      erro('loja', `adicionarAoCarrinho falhou: ${rCarrinho.erro}`)
      return
    }
    const itensNoCarrinho = await db.saasCarrinhoItem.count({ where: { userId: comprador.userId } })
    if (itensNoCarrinho === 0) {
      erro('loja', 'adicionarAoCarrinho não persistiu item na sacola')
      return
    }
    ok('loja', `Sacola: ${itensNoCarrinho} item(ns) após adicionar`)

    const fdPedido = new FormData()
    fdPedido.set('modalidadeEntrega', 'RETIRADA')
    fdPedido.set('cupomCodigo', 'TESTE10')
    const rPedido = await comoUsuario(comprador.userId, () => tentativa(() => finalizarPedido({}, fdPedido)))
    if (!rPedido.ok) {
      alerta('loja', `finalizarPedido não concluiu: ${rPedido.erro}`)
      return
    }

    const pedido: { id: string; subtotal: unknown; desconto: unknown; total: unknown; cupomCodigo: string | null; itens: { quantidade: number; total: unknown }[] } | null = await db.saasPedido.findFirst({
      where: { userId: comprador.userId, tenantId: tenant.id },
      orderBy: { criadoEm: 'desc' },
      select: { id: true, subtotal: true, desconto: true, total: true, cupomCodigo: true, itens: { select: { quantidade: true, total: true } } },
    })
    if (!pedido) {
      erro('loja', 'finalizarPedido retornou sucesso mas nenhum pedido foi criado')
      return
    }
    ok('loja', `Pedido criado: subtotal R$ ${pedido.subtotal} · desconto R$ ${pedido.desconto} · total R$ ${pedido.total}`)

    const somaItens = pedido.itens.reduce((s, i) => s + Number(i.total), 0)
    if (Math.abs(somaItens - Number(pedido.subtotal)) > 0.02) {
      erro('loja', `Subtotal do pedido (${pedido.subtotal}) ≠ soma dos itens (${somaItens})`)
    }
    if (Math.abs(Number(pedido.subtotal) - Number(pedido.desconto) - Number(pedido.total)) > 0.02) {
      erro('loja', 'total ≠ subtotal − desconto no pedido gerado pelo checkout')
    }
    if (pedido.cupomCodigo === 'TESTE10' && Number(pedido.desconto) <= 0) {
      erro('loja', 'Cupom TESTE10 registrado no pedido mas desconto ficou zero')
    } else if (Number(pedido.desconto) > 0) {
      ok('loja', `Cupom aplicado: desconto de R$ ${pedido.desconto}`)
    }

    const produtoDepois = await db.saasProduto.findUnique({
      where: { id: produto.id },
      select: { estoque: true },
    })
    const estoqueDepois = (produtoDepois?.estoque as Record<string, number>)[tamanho] ?? 0
    if (estoqueDepois >= estoqueAntes) {
      erro('loja', `Checkout NÃO decrementou estoque (${tamanho}: ${estoqueAntes} → ${estoqueDepois}) — venda pode furar o inventário`)
    } else {
      ok('loja', `Estoque decrementado no checkout (${tamanho}: ${estoqueAntes} → ${estoqueDepois})`)
    }

    const carrinhoDepois = await db.saasCarrinhoItem.count({ where: { userId: comprador.userId } })
    if (carrinhoDepois > 0) {
      erro('loja', `Sacola não foi esvaziada após o checkout (${carrinhoDepois} item(ns) restante(s))`)
    } else {
      ok('loja', 'Sacola esvaziada após o checkout')
    }
  })

  it('membro de uma torcida não compra produto de outra', async () => {
    const [a, b] = await Promise.all([
      db.tenant.findFirst({ where: { slug: 'camisa-12-corinthians' }, select: { id: true, slug: true } }),
      db.tenant.findFirst({ where: { slug: 'pavilhao-nove' }, select: { id: true, slug: true } }),
    ])
    if (!a || !b) return
    const produtoB = await db.saasProduto.findFirst({
      where: { tenantId: b.id, ativo: true },
      select: { id: true, tamanhos: true },
    })
    const membroA = await db.saasMembro.findFirst({
      where: { tenantId: a.id, status: 'APROVADO', user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    if (!produtoB || !membroA) {
      alerta('loja', 'Sem produto/membro para testar compra cross-tenant')
      return
    }
    limpeza.push({
      descricao: `limpar carrinho cross-tenant de ${membroA.userId}`,
      desfazer: async () => {
        await db.saasCarrinhoItem.deleteMany({ where: { userId: membroA.userId } })
      },
    })
    const { adicionarAoCarrinho } = await import('@/app/portal/loja/actions')
    const fd = new FormData()
    fd.set('produtoId', produtoB.id)
    fd.set('quantidade', '1')
    fd.set('tamanho', produtoB.tamanhos[0] ?? 'UN')
    const r = await comoUsuario(membroA.userId, () => tentativa(() => adicionarAoCarrinho({}, fd)))
    const noCarrinho = await db.saasCarrinhoItem.count({
      where: { userId: membroA.userId, produtoId: produtoB.id },
    })
    if (r.ok && noCarrinho > 0) {
      erro('loja', `VAZAMENTO: membro de ${a.slug} colocou na sacola produto de ${b.slug}`)
    } else {
      ok('loja', `Membro de ${a.slug} barrado ao comprar de ${b.slug}: "${r.ok ? 'não persistiu' : r.erro}"`)
    }
  })
})

// ── FLUXO 4: aliança co-irmã (regra de domínio) ──────────────────────────
describe('fluxo: propor aliança', () => {
  it('rejeita aliança entre torcidas do MESMO clube (co-irmãs)', async () => {
    const [origem, coIrma] = await Promise.all([
      db.tenant.findFirst({ where: { slug: 'camisa-12-corinthians' }, select: { id: true, slug: true, afiliacaoId: true } }),
      db.tenant.findFirst({ where: { slug: 'pavilhao-nove' }, select: { id: true, slug: true, afiliacaoId: true } }),
    ])
    if (!origem || !coIrma || origem.afiliacaoId !== coIrma.afiliacaoId) {
      alerta('aliança', 'Par co-irmã não disponível para o teste')
      return
    }
    const { calculateEffectivePermissions, hasPermission, PERMISSIONS } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')
    const candidatos = await db.userRole.findMany({
      where: { tenantId: origem.id, role: { isSystem: true, nome: { in: ['owner', 'admin'] } } },
      select: { userId: true },
      take: 8,
    })
    let presidenteId: string | null = null
    for (const c of candidatos) {
      const bruto = await getUserPermissionsInTenant(c.userId, origem.id)
      if (hasPermission(calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides), PERMISSIONS.ALLIANCES_MANAGE)) {
        presidenteId = c.userId
        break
      }
    }
    if (!presidenteId) {
      alerta('aliança', `Ninguém com alliances:manage em ${origem.slug}`)
      return
    }
    limpeza.push({
      descricao: 'remover aliança co-irmã se tiver sido criada',
      desfazer: async () => {
        await db.alianca.deleteMany({ where: { tenantOrigemId: origem.id, tenantAliadoId: coIrma.id } })
      },
    })
    const { proporAlianca } = await import('@/app/admin/aliancas/actions')
    const r = await comoUsuario(presidenteId, () => tentativa(() => proporAlianca(coIrma.id)))
    const criada = await db.alianca.count({ where: { tenantOrigemId: origem.id, tenantAliadoId: coIrma.id } })
    if (r.ok || criada > 0) {
      erro('aliança', `Aliança entre co-irmãs do mesmo clube foi ACEITA (${origem.slug} → ${coIrma.slug}) — regra de proporAlianca não segurou`)
    } else {
      ok('aliança', `Co-irmã rejeitada corretamente: "${r.erro}"`)
    }
  })
})

// ── FLUXO 5: publicar e moderar ──────────────────────────────────────────
describe('fluxo: publicar post → denunciar → moderar', () => {
  it('membro aprovado publica; conteúdo respeita o tenant', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: 'camisa-12-corinthians' },
      select: { id: true, slug: true },
    })
    if (!tenant) return
    const autor = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'APROVADO', user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    if (!autor) return

    limpeza.push({
      descricao: 'apagar post criado pela auditoria de fluxo',
      desfazer: async () => {
        await db.post.deleteMany({
          where: { autorId: autor.userId, conteudo: { startsWith: '[AUDITORIA-FLUXO]' } },
        })
      },
    })

    const { publicarPost } = await import('@/app/portal/comunidade/actions')
    const fd = new FormData()
    fd.set('conteudo', '[AUDITORIA-FLUXO] post gerado pela auditoria de fluxos.')
    fd.set('visibilidade', 'TENANT')
    const r = await comoUsuario(autor.userId, () => tentativa(() => publicarPost({}, fd)))
    const post = await db.post.findFirst({
      where: { autorId: autor.userId, conteudo: { startsWith: '[AUDITORIA-FLUXO]' } },
      select: { id: true, tenantId: true, visibilidade: true },
    })
    if (!post) {
      erro('comunidade', `publicarPost não criou o post: ${r.ok ? 'sem erro reportado' : r.erro}`)
      return
    }
    ok('comunidade', `publicarPost criou post ${post.visibilidade} no tenant do autor`)
    if (post.tenantId !== tenant.id) {
      erro('comunidade', `Post gravado no tenant errado (${post.tenantId} ≠ ${tenant.id})`)
    }

    // Denúncia por outro membro do MESMO tenant.
    const denunciante = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, status: 'APROVADO', userId: { not: autor.userId }, user: { email: { endsWith: DOM_COR } } },
      select: { userId: true },
    })
    if (!denunciante) return
    const acoes = await import('@/app/portal/comunidade/actions')
    const denunciar = (acoes as Record<string, unknown>).denunciarPost as
      | ((postId: string, motivo: string) => Promise<unknown>)
      | undefined
    if (typeof denunciar !== 'function') {
      alerta('moderação', 'Não há action `denunciarPost` exportada em portal/comunidade/actions — fluxo de denúncia não auditado por aqui')
      return
    }
    limpeza.push({
      descricao: 'apagar denúncia da auditoria',
      desfazer: async () => {
        await db.denuncia.deleteMany({ where: { postId: post.id } })
      },
    })
    const rd = await comoUsuario(denunciante.userId, () => tentativa(() => denunciar(post.id, 'Auditoria de fluxo')))
    const denuncia = await db.denuncia.findFirst({ where: { postId: post.id }, select: { id: true, status: true } })
    if (!denuncia) {
      erro('moderação', `Denúncia não persistiu: ${rd.ok ? 'sem erro' : rd.erro}`)
    } else {
      ok('moderação', `Denúncia criada com status ${denuncia.status}`)
    }
  })
})

// ── FLUXO 6: departamento só aceita sócio elegível ───────────────────────
// Regra: pertencer a departamento exige `SaasMembro` SOCIO, APROVADO, ativo,
// canônico e do mesmo tenant. TORCEDOR nunca recebe perfil de área,
// `UserDepartamento` nem `DepartamentoGestor`. O gate
// (`assertMembroElegivelParaDepartamento`) roda DENTRO da `$transaction` de
// /admin/acessos, então a recusa também prova ausência de escrita parcial.
const TENANT_FLUXO_DEPTO = 'camisa-12-corinthians'

/**
 * Ator do tenant com a permissão pedida cujo tenant ATIVO é o próprio tenant.
 * Candidatos: cargos de sistema **e** gestores de área — em torcida com Role
 * de sistema desatualizado (Achado 1), quem ainda tem `members:dismiss` é o
 * gestor da Diretoria, que herda do pacote do departamento.
 */
async function atorComPermissao(tenantId: string, permissao: string): Promise<string | null> {
  const { calculateEffectivePermissions, hasPermission } = await import('@torcida/types')
  const { getUserPermissionsInTenant, getActiveTenant } = await import('@/lib/tenant')
  const { isSuperAdminEmail } = await import('@/lib/tenant-context')
  const porCargo: { userId: string; user: { email: string } | null }[] = await db.userRole.findMany({
    where: { tenantId },
    select: { userId: true, user: { select: { email: true } } },
    take: 30,
  })
  const porGestoria: { userId: string; user: { email: string } | null }[] =
    await db.departamentoGestor.findMany({
      where: { departamento: { tenantId } },
      select: { userId: true, user: { select: { email: true } } },
      take: 12,
    })
  const vistos = new Set<string>()
  for (const c of [...porCargo, ...porGestoria]) {
    if (vistos.has(c.userId)) continue
    vistos.add(c.userId)
    // Super admin passa por cima do RBAC e resolve outro tenant ativo.
    if (isSuperAdminEmail(c.user?.email)) continue
    const bruto = await getUserPermissionsInTenant(c.userId, tenantId)
    const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
    if (!hasPermission(efetivas, permissao)) continue
    // A action resolve o tenant pelo vínculo do ator — se não for este, o
    // fluxo mutaria a torcida errada.
    const ativo = await getActiveTenant(c.userId, c.user?.email ?? null)
    if (ativo?.id === tenantId) return c.userId
  }
  return null
}

type ProjecoesArea = { perfis: number; equipe: number; gestoria: number }

async function contarProjecoesArea(tenantId: string, userId: string): Promise<ProjecoesArea> {
  const [perfis, equipe, gestoria] = await Promise.all([
    db.userRole.count({ where: { userId, tenantId, role: { departamentoId: { not: null } } } }),
    db.userDepartamento.count({ where: { userId, tenantId } }),
    db.departamentoGestor.count({ where: { userId, departamento: { tenantId } } }),
  ])
  return { perfis, equipe, gestoria }
}

describe('fluxo: conceder departamento exige sócio elegível', () => {
  it('recusa conceder área a TORCEDOR e não deixa escrita parcial', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: TENANT_FLUXO_DEPTO },
      select: { id: true, slug: true },
    })
    if (!tenant) return

    const torcedor = await db.saasMembro.findFirst({
      where: { tenantId: tenant.id, tipo: 'TORCEDOR', espelhado: false },
      select: { userId: true, status: true },
    })
    const perfilArea: { id: string; departamentoId: string | null } | null = await db.role.findFirst({
      where: {
        tenantId: tenant.id,
        papelNoDepartamento: 'MEMBRO',
        departamentoId: { not: null },
        departamento: { slug: { not: 'diretoria' } },
      },
      select: { id: true, departamentoId: true },
    })
    if (!torcedor || !perfilArea?.departamentoId) {
      alerta('departamentos', `Sem TORCEDOR ou perfil de área em ${tenant.slug} — recusa de área não exercitada`)
      return
    }
    const ator = await atorComPermissao(tenant.id, (await import('@torcida/types')).PERMISSIONS.ROLES_MANAGE)
    if (!ator) {
      alerta('departamentos', `Ninguém com roles:manage e tenant ativo ${tenant.slug} — concessão de área não exercitada`)
      return
    }

    const departamentoId = perfilArea.departamentoId
    const antes = await contarProjecoesArea(tenant.id, torcedor.userId)
    const { adicionarMembroDepartamento } = await import('@/app/admin/(plataforma)/acessos/actions')
    const r = await comoUsuario(ator, () =>
      tentativa(() => adicionarMembroDepartamento(departamentoId, torcedor.userId)),
    )
    const depois = await contarProjecoesArea(tenant.id, torcedor.userId)

    if (r.ok) {
      erro('departamentos', `TORCEDOR (${torcedor.status}) recebeu vínculo de departamento pelo fluxo real de /admin/acessos`)
    } else if (/sócio/i.test(r.erro)) {
      ok('departamentos', `TORCEDOR barrado ao receber área: "${r.erro}"`)
    } else {
      alerta('departamentos', `Concessão de área a TORCEDOR falhou por outro motivo: "${r.erro}" — regra de elegibilidade não conclusiva neste par`)
    }
    if (depois.perfis !== antes.perfis || depois.equipe !== antes.equipe || depois.gestoria !== antes.gestoria) {
      erro(
        'departamentos',
        `ESCRITA PARCIAL: recusa deixou resíduo no TORCEDOR (perfis ${antes.perfis}→${depois.perfis}, equipe ${antes.equipe}→${depois.equipe}, gestoria ${antes.gestoria}→${depois.gestoria})`,
      )
    } else {
      ok('departamentos', 'Recusa de área a TORCEDOR não gravou perfil, equipe nem gestoria (transação íntegra)')
    }
  })

  it('concede área a sócio elegível, projeta a equipe e desfaz na remoção', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: TENANT_FLUXO_DEPTO },
      select: { id: true, slug: true },
    })
    if (!tenant) return

    const perfilArea: { id: string; departamentoId: string | null } | null = await db.role.findFirst({
      where: {
        tenantId: tenant.id,
        papelNoDepartamento: 'MEMBRO',
        departamentoId: { not: null },
        departamento: { slug: { not: 'diretoria' } },
      },
      select: { id: true, departamentoId: true },
    })
    const ator = perfilArea
      ? await atorComPermissao(tenant.id, (await import('@torcida/types')).PERMISSIONS.ROLES_MANAGE)
      : null
    if (!perfilArea?.departamentoId || !ator) {
      alerta('departamentos', `Sem perfil de área ou gestor de acessos em ${tenant.slug} — concessão a sócio não exercitada`)
      return
    }
    const departamentoId = perfilArea.departamentoId

    // Sócio canônico que ainda não está nesta área — não sujar vínculo real.
    const candidatos: { userId: string }[] = await db.saasMembro.findMany({
      where: {
        tenantId: tenant.id,
        tipo: 'SOCIO',
        status: 'APROVADO',
        desligadoEm: null,
        espelhado: false,
        membroOrigemId: null,
        user: { email: { endsWith: DOM_COR } },
      },
      select: { userId: true },
      take: 25,
    })
    let socioId: string | null = null
    for (const c of candidatos) {
      const jaTem = await db.userRole.count({
        where: { userId: c.userId, tenantId: tenant.id, roleId: perfilArea.id },
      })
      const jaEquipe = await db.userDepartamento.count({
        where: { userId: c.userId, tenantId: tenant.id, departamentoId },
      })
      if (jaTem === 0 && jaEquipe === 0) {
        socioId = c.userId
        break
      }
    }
    if (!socioId) {
      alerta('departamentos', 'Todo sócio de teste já está na área escolhida — concessão não exercitada')
      return
    }
    const alvo = socioId
    const inicio = new Date()

    limpeza.push({
      descricao: `remover vínculo de área criado pela auditoria (${alvo})`,
      desfazer: async () => {
        await db.departamentoGestor.deleteMany({ where: { userId: alvo, departamentoId } })
        await db.userDepartamento.deleteMany({ where: { userId: alvo, tenantId: tenant.id, departamentoId } })
        await db.userRole.deleteMany({ where: { userId: alvo, tenantId: tenant.id, roleId: perfilArea.id } })
        await db.notificacao.deleteMany({
          where: {
            userId: alvo,
            tipo: { in: ['DEPARTAMENTO_ADICIONADO', 'DEPARTAMENTO_REMOVIDO'] },
            criadoEm: { gte: inicio },
          },
        })
        await db.auditLog.deleteMany({
          where: {
            tenantId: tenant.id,
            entidadeId: departamentoId,
            acao: { in: ['DEPARTAMENTO_MEMBRO_ADICIONADO', 'DEPARTAMENTO_MEMBRO_REMOVIDO'] },
            criadoEm: { gte: inicio },
          },
        })
      },
    })

    const { adicionarMembroDepartamento, removerMembroDepartamento } = await import(
      '@/app/admin/(plataforma)/acessos/actions'
    )
    const r = await comoUsuario(ator, () =>
      tentativa(() => adicionarMembroDepartamento(departamentoId, alvo)),
    )
    if (!r.ok) {
      erro('departamentos', `Sócio elegível foi RECUSADO na concessão de área: "${r.erro}"`)
      return
    }
    const projetado = await db.userDepartamento.count({
      where: { userId: alvo, tenantId: tenant.id, departamentoId },
    })
    const perfilAtribuido = await db.userRole.count({
      where: { userId: alvo, tenantId: tenant.id, roleId: perfilArea.id },
    })
    if (projetado === 1 && perfilAtribuido === 1) {
      ok('departamentos', 'Sócio elegível recebeu o perfil de área e a equipe (UserDepartamento) foi projetada')
    } else {
      erro('departamentos', `Concessão a sócio elegível ficou incompleta (perfil=${perfilAtribuido}, equipe=${projetado})`)
    }
    const gestoria = await db.departamentoGestor.count({ where: { userId: alvo, departamentoId } })
    if (gestoria > 0) {
      erro('departamentos', 'Perfil de MEMBRO da área virou gestoria (DepartamentoGestor) — escalada de papel')
    }

    const rr = await comoUsuario(ator, () =>
      tentativa(() => removerMembroDepartamento(departamentoId, alvo)),
    )
    const sobrouEquipe = await db.userDepartamento.count({
      where: { userId: alvo, tenantId: tenant.id, departamentoId },
    })
    const sobrouPerfil = await db.userRole.count({
      where: { userId: alvo, tenantId: tenant.id, roleId: perfilArea.id },
    })
    if (!rr.ok) {
      erro('departamentos', `removerMembroDepartamento falhou para quem concedeu: "${rr.erro}"`)
    } else if (sobrouEquipe > 0 || sobrouPerfil > 0) {
      erro('departamentos', `Remoção da área deixou resíduo (perfil=${sobrouPerfil}, equipe=${sobrouEquipe})`)
    } else {
      ok('departamentos', 'Remoção da área apagou perfil e equipe pelo mesmo núcleo transacional')
    }
  })
})

// ── FLUXO 7: desligamento limpa as projeções de área ─────────────────────
/** Sócio canônico com equipe de área e sem espelho na Sede (reversível num só tenant). */
async function socioComAreaSemEspelho(
  tenantId: string,
): Promise<{ userId: string; membroId: string } | null> {
  const linhas: { user_id: string; membro_id: string }[] = await db.$queryRaw`
    SELECT m.user_id, m.id AS membro_id FROM saas_membros m
    JOIN saas_user_departamentos ud ON ud.user_id = m.user_id AND ud.tenant_id = m.tenant_id
    WHERE m.tenant_id = ${tenantId} AND m.tipo = 'SOCIO' AND m.status = 'APROVADO'
      AND m.desligado_em IS NULL AND m.espelhado = false AND m.membro_origem_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM saas_membros e WHERE e.membro_origem_id = m.id)
    LIMIT 1`
  if (linhas.length === 0) return null
  return { userId: linhas[0].user_id, membroId: linhas[0].membro_id }
}

/** Sentinela para desfazer a transação de teste sem deixar rastro no banco. */
class DesfazerTransacao extends Error {}

describe('fluxo: desligamento do sócio limpa área', () => {
  it('desligar torna o sócio inelegível e o núcleo transacional apaga equipe e gestoria (transação desfeita)', async () => {
    // Fixture reversível por construção: tudo roda numa `$transaction` que
    // termina em rollback — exercita `syncMembershipFromRoles` real contra o
    // banco semeado sem depender do RBAC do tenant.
    const tenant = await db.tenant.findFirst({
      where: { slug: TENANT_FLUXO_DEPTO },
      select: { id: true, slug: true },
    })
    if (!tenant) return
    const alvo = await socioComAreaSemEspelho(tenant.id)
    if (!alvo) {
      alerta('departamentos', `Sem sócio com equipe de área em ${tenant.slug} — limpeza por desligamento não exercitada`)
      return
    }
    const { syncMembershipFromRoles } = await import('@torcida/db')

    // Holder (não `let`): a medição acontece dentro do callback da transação.
    const medicao: { projecoes: { equipe: number; gestoria: number } | null } = { projecoes: null }
    try {
      await db.$transaction(
        async (tx: import('@torcida/db').Prisma.TransactionClient) => {
          await tx.saasMembro.update({
            where: { id: alvo.membroId },
            data: { desligadoEm: new Date() },
          })
          await syncMembershipFromRoles(tx, { userId: alvo.userId, tenantId: tenant.id })
          medicao.projecoes = {
            equipe: await tx.userDepartamento.count({
              where: { userId: alvo.userId, tenantId: tenant.id },
            }),
            gestoria: await tx.departamentoGestor.count({
              where: { userId: alvo.userId, departamento: { tenantId: tenant.id } },
            }),
          }
          throw new DesfazerTransacao()
        },
        { timeout: 30_000, maxWait: 10_000 },
      )
    } catch (e) {
      if (!(e instanceof DesfazerTransacao)) throw e
    }

    const projecoes = medicao.projecoes
    if (!projecoes) {
      erro('departamentos', 'Transação de teste do desligamento não chegou a medir as projeções')
      return
    }
    if (projecoes.equipe > 0 || projecoes.gestoria > 0) {
      erro(
        'departamentos',
        `Sócio desligado conservou área na sincronização real: ${projecoes.equipe} da equipe, ${projecoes.gestoria} de gestoria`,
      )
    } else {
      ok('departamentos', 'Sócio desligado perde equipe e gestoria em syncMembershipFromRoles (transação desfeita, banco intacto)')
    }

    // O rollback tem de ser real: nada de membro desligado sobrando.
    const depoisDoRollback = await db.saasMembro.findUnique({
      where: { id: alvo.membroId },
      select: { desligadoEm: true },
    })
    const equipeIntacta = await db.userDepartamento.count({
      where: { userId: alvo.userId, tenantId: tenant.id },
    })
    if (depoisDoRollback?.desligadoEm || equipeIntacta === 0) {
      erro('departamentos', 'A transação de teste do desligamento NÃO foi desfeita — dado de teste vazou para o banco')
    } else {
      ok('departamentos', `Rollback confirmado: sócio segue ativo com ${equipeIntacta} vínculo(s) de área`)
    }
  })

  it('desligarMembro remove perfil de área, equipe e gestoria do desligado', async () => {
    const tenant = await db.tenant.findFirst({
      where: { slug: TENANT_FLUXO_DEPTO },
      select: { id: true, slug: true },
    })
    if (!tenant) return

    const alvo = await socioComAreaSemEspelho(tenant.id)
    if (!alvo) {
      alerta('departamentos', `Sem sócio com equipe de área e sem espelho em ${tenant.slug} — desligamento não exercitado`)
      return
    }
    const { userId, membroId } = alvo

    const ator = await atorComPermissao(
      tenant.id,
      (await import('@torcida/types')).PERMISSIONS.MEMBERS_DISMISS,
    )
    if (!ator) {
      // Mesma raiz do Achado 1: `members:dismiss` não está gravado nem no Role
      // de sistema nem no pacote do departamento desta torcida, então ninguém
      // consegue desligar pela UI. Rodar `db:repair-system-roles` +
      // `seed:departamentos` habilita este fluxo (a limpeza em si já está
      // coberta pelo teste transacional acima).
      alerta(
        'departamentos',
        `Ninguém em ${tenant.slug} tem members:dismiss (Role de sistema e pacote do departamento desatualizados — Achado 1): fluxo real de desligamento não exercitado`,
      )
      return
    }

    const perfisAntes: { roleId: string }[] = await db.userRole.findMany({
      where: { userId, tenantId: tenant.id, role: { departamentoId: { not: null } } },
      select: { roleId: true },
    })
    const equipeAntes: { departamentoId: string }[] = await db.userDepartamento.findMany({
      where: { userId, tenantId: tenant.id },
      select: { departamentoId: true },
    })
    const gestoriaAntes: { departamentoId: string }[] = await db.departamentoGestor.findMany({
      where: { userId, departamento: { tenantId: tenant.id } },
      select: { departamentoId: true },
    })
    const inicio = new Date()

    // Reversão registrada ANTES da mutação: reata perfis e projeções e
    // devolve o membro ao estado ativo.
    limpeza.push({
      descricao: `reverter desligamento do membro ${membroId} e reatar área`,
      desfazer: async () => {
        await db.saasMembro.update({
          where: { id: membroId },
          data: { desligadoEm: null, desligadoMotivo: null, desligadoPorId: null },
        })
        if (perfisAntes.length > 0) {
          await db.userRole.createMany({
            data: perfisAntes.map((p) => ({ userId, tenantId: tenant.id, roleId: p.roleId })),
            skipDuplicates: true,
          })
        }
        if (equipeAntes.length > 0) {
          await db.userDepartamento.createMany({
            data: equipeAntes.map((e) => ({
              userId,
              tenantId: tenant.id,
              departamentoId: e.departamentoId,
            })),
            skipDuplicates: true,
          })
        }
        if (gestoriaAntes.length > 0) {
          await db.departamentoGestor.createMany({
            data: gestoriaAntes.map((g) => ({ userId, departamentoId: g.departamentoId })),
            skipDuplicates: true,
          })
        }
        await db.auditLog.deleteMany({
          where: {
            tenantId: tenant.id,
            entidadeId: membroId,
            acao: 'MEMBRO_DESLIGADO',
            criadoEm: { gte: inicio },
          },
        })
      },
    })

    const { desligarMembro } = await import('@/app/admin/membros/actions')
    const fd = new FormData()
    fd.set('membroId', membroId)
    fd.set('motivo', 'Auditoria de fluxos: desligamento reversível para conferir limpeza de área.')
    const r = await comoUsuario(ator, () => tentativa(() => desligarMembro({}, fd)))
    const membro = await db.saasMembro.findUnique({
      where: { id: membroId },
      select: { desligadoEm: true },
    })
    if (!membro?.desligadoEm) {
      // A action devolve `{ errors }` na validação e `{ error }` na regra —
      // só o estado no banco distingue "recusou" de "não fez nada".
      erro(
        'departamentos',
        `desligarMembro não desligou o membro para quem TEM members:dismiss: ${r.ok ? JSON.stringify(r.valor) : r.erro}`,
      )
      return
    }

    const depois = await contarProjecoesArea(tenant.id, userId)
    if (depois.perfis > 0 || depois.equipe > 0 || depois.gestoria > 0) {
      erro(
        'departamentos',
        `Desligamento NÃO limpou a área: sobraram ${depois.perfis} perfil(is), ${depois.equipe} da equipe e ${depois.gestoria} de gestoria (membro desligado é inelegível)`,
      )
    } else {
      ok(
        'departamentos',
        `Desligamento limpou a área do sócio (${perfisAntes.length} perfil(is), ${equipeAntes.length} equipe, ${gestoriaAntes.length} gestoria removidos)`,
      )
    }
  })
})

// ── FLUXO 8: alcance de comentários e roster de canais ───────────────────
describe('fluxo: comentários e integração em canais', () => {
  it('rival não lista comentários, enquanto membro do mesmo tenant lista', async () => {
    const alvo = await db.tenant.findFirst({ where: { slug: 'mancha-alviverde' }, select: { id: true } })
    const rival = await db.tenant.findFirst({ where: { slug: 'pde-gavioes-fiel' }, select: { id: true } })
    if (!alvo || !rival) return
    const post = await db.post.findFirst({
      where: { tenantId: alvo.id, visibilidade: 'PUBLICO', oculto: false, comentarios: { some: {} } },
      select: { id: true },
    })
    const local = await db.saasMembro.findFirst({
      where: { tenantId: alvo.id, status: 'APROVADO' },
      select: { userId: true },
    })
    const intruso = await db.saasMembro.findFirst({
      where: { tenantId: rival.id, status: 'APROVADO' },
      select: { userId: true },
    })
    if (!post || !local || !intruso) {
      alerta('comunidade', 'Fixture insuficiente para o fluxo real de comentários')
      return
    }
    const { listarComentariosPost } = await import('@/app/portal/comunidade/actions')
    const negado = await comoTenant(rival.id, () =>
      comoUsuario(intruso.userId, () => tentativa(() => listarComentariosPost(post.id))),
    )
    const permitido = await comoTenant(alvo.id, () =>
      comoUsuario(local.userId, () => tentativa(() => listarComentariosPost(post.id))),
    )
    if (negado.ok || !/Post não encontrado/i.test(negado.erro)) {
      erro('comunidade', `Rival não recebeu "Post não encontrado": ${negado.ok ? 'acesso liberado' : negado.erro}`)
    } else {
      ok('comunidade', 'Rival recebe "Post não encontrado" ao listar comentários')
    }
    if (!permitido.ok || permitido.valor.length === 0) {
      erro('comunidade', `Mesmo tenant não leu comentários: ${permitido.ok ? 'lista vazia' : permitido.erro}`)
    } else {
      ok('comunidade', `Mesmo tenant leu ${permitido.valor.length} comentário(s)`)
    }
  })

  it('aliado descobre canal, mas não pede nem tem pedido aprovado sem vínculo local', async () => {
    const pares: { viewer_id: string; canal_tenant_id: string; user_id: string }[] =
      await db.$queryRaw`
        WITH pares AS (
          SELECT tenant_origem_id AS viewer_id, tenant_aliado_id AS canal_tenant_id
          FROM saas_aliancas WHERE status = 'ATIVA'
          UNION ALL
          SELECT tenant_aliado_id, tenant_origem_id FROM saas_aliancas WHERE status = 'ATIVA'
        )
        SELECT p.viewer_id, p.canal_tenant_id, m.user_id
        FROM pares p
        JOIN saas_membros m ON m.tenant_id = p.viewer_id
          AND m.status = 'APROVADO' AND m.tipo = 'SOCIO' AND m.desligado_em IS NULL
        JOIN saas_user_roles ur ON ur.user_id = m.user_id AND ur.tenant_id = p.viewer_id
        WHERE NOT EXISTS (
          SELECT 1 FROM saas_membros local
          WHERE local.tenant_id = p.canal_tenant_id AND local.user_id = m.user_id
        )
          AND EXISTS (
            SELECT 1 FROM saas_membros gestor
            WHERE gestor.tenant_id = p.canal_tenant_id
              AND gestor.status = 'APROVADO' AND gestor.desligado_em IS NULL
          )
        LIMIT 1`
    const fixture = pares[0]
    if (!fixture) {
      alerta('canais', 'Sem aliado/canal ALIADOS elegível para testar roster local')
      return
    }
    const admin = await db.saasMembro.findFirst({
      where: {
        tenantId: fixture.canal_tenant_id,
        status: 'APROVADO',
        desligadoEm: null,
        tipo: 'TORCEDOR',
      },
      select: { userId: true },
    }) ?? await db.saasMembro.findFirst({
      where: { tenantId: fixture.canal_tenant_id, status: 'APROVADO', desligadoEm: null },
      select: { userId: true },
    })
    const role = await db.role.findFirst({
      where: {
        tenantId: fixture.canal_tenant_id,
        isSystem: true,
        nome: 'member',
      },
      select: { id: true },
    })
    if (!admin || !role) {
      alerta('canais', 'Sem membro/Role local no tenant aliado para testar aprovação')
      return
    }
    const adminId = admin.userId
    const roleExistente = await db.userRole.findUnique({
      where: {
        userId_tenantId_roleId: {
          userId: adminId,
          tenantId: fixture.canal_tenant_id,
          roleId: role.id,
        },
      },
      select: { id: true },
    })
    if (!roleExistente) {
      const criado = await db.userRole.create({
        data: { userId: adminId, tenantId: fixture.canal_tenant_id, roleId: role.id },
        select: { id: true },
      })
      limpeza.push({
        descricao: `remover Role temporário ${criado.id}`,
        desfazer: async () => {
          await db.userRole.deleteMany({ where: { id: criado.id } })
        },
      })
    }
    const canal = await db.conversa.create({
      data: {
        tenantId: fixture.canal_tenant_id,
        criadoPorId: adminId,
        tipo: 'CANAL',
        nome: 'Canal temporário — auditoria de roster',
        canalOficial: false,
        institucional: true,
        visibilidadeCanal: 'ALIADOS',
        publica: false,
        membros: { create: { userId: adminId, papel: 'ADMIN', status: 'ATIVO' } },
      },
      select: { id: true },
    })
    limpeza.push({
      descricao: `remover canal temporário ${canal.id}`,
      desfazer: async () => {
        await db.auditLog.deleteMany({ where: { entidadeId: canal.id } })
        await db.conversa.deleteMany({ where: { id: canal.id } })
      },
    })
    const { pedirEntradaCanal, decidirPedidoCanal } = await import('@/app/portal/comunidade/actions')
    const antes = await db.membroConversa.count({
      where: { conversaId: canal.id, userId: fixture.user_id },
    })
    const pedido = await comoTenant(fixture.viewer_id, () =>
      comoUsuario(fixture.user_id, () => tentativa(() => pedirEntradaCanal(canal.id))),
    )
    const depois = await db.membroConversa.count({
      where: { conversaId: canal.id, userId: fixture.user_id },
    })
    if (pedido.ok || !/vínculo com a torcida deste canal/i.test(pedido.erro) || depois !== antes) {
      erro('canais', `Aliado sem vínculo local materializou pedido ou recebeu erro incorreto (antes=${antes}, depois=${depois})`)
      return
    }

    const pendente = await db.membroConversa.upsert({
      where: { conversaId_userId: { conversaId: canal.id, userId: fixture.user_id } },
      create: { conversaId: canal.id, userId: fixture.user_id, status: 'PENDENTE' },
      update: { status: 'PENDENTE', saiuEm: null },
      select: { id: true },
    })
    limpeza.push({
      descricao: `remover pedido inválido sintético ${pendente.id}`,
      desfazer: async () => {
        await db.membroConversa.deleteMany({ where: { id: pendente.id } })
      },
    })
    const aprovacao = await comoTenant(fixture.canal_tenant_id, () =>
      comoUsuario(adminId, () =>
        tentativa(() => decidirPedidoCanal(canal.id, fixture.user_id, true)),
      ),
    )
    const status = await db.membroConversa.findUnique({ where: { id: pendente.id }, select: { status: true } })
    if (aprovacao.ok || status?.status !== 'PENDENTE') {
      erro('canais', 'Aprovação de aliado sem vínculo local escreveu parcialmente no roster')
    } else {
      ok('canais', 'Aliado vê canal ALIADOS, mas pedido e aprovação não materializam roster sem vínculo local')
    }
  })

  it('membro local aprovado entra em canal real sem escrita parcial', async () => {
    const candidatos: { canal_id: string; user_id: string }[] = await db.$queryRaw`
      SELECT c.id AS canal_id, m.user_id
      FROM saas_conversas c
      JOIN saas_tenants t ON t.id = c.tenant_id AND t.sintetico = false
      JOIN saas_membros m ON m.tenant_id = c.tenant_id
        AND m.status = 'APROVADO' AND m.desligado_em IS NULL
      WHERE c.tipo = 'CANAL' AND c.comunidade = false AND c.publica = true
        AND NOT EXISTS (
          SELECT 1 FROM saas_membros_conversa mc
          WHERE mc.conversa_id = c.id AND mc.user_id = m.user_id AND mc.saiu_em IS NULL
        )
      LIMIT 1`
    const fixture = candidatos[0]
    if (!fixture) {
      alerta('canais', 'Sem membro local aprovado fora de canal aberto para testar entrada')
      return
    }
    const { inscreverCanal } = await import('@/lib/canais')
    limpeza.push({
      descricao: `remover inscrição funcional em ${fixture.canal_id}`,
      desfazer: async () => {
        await db.membroConversa.deleteMany({
          where: { conversaId: fixture.canal_id, userId: fixture.user_id },
        })
      },
    })
    await inscreverCanal(fixture.canal_id, fixture.user_id)
    const ativo = await db.membroConversa.count({
      where: {
        conversaId: fixture.canal_id,
        userId: fixture.user_id,
        status: 'ATIVO',
        saiuEm: null,
      },
    })
    if (ativo !== 1) {
      erro('canais', `Inscrição de membro local aprovado gerou ${ativo} roster(s) ativo(s)`)
    } else {
      ok('canais', 'Membro local aprovado entra em canal real com um único roster ATIVO')
    }
  })
})

// ── Sanidade da própria auditoria ────────────────────────────────────────
describe('sanidade', () => {
  it('houve achados', () => {
    expect(achados.length).toBeGreaterThan(0)
  })
})
