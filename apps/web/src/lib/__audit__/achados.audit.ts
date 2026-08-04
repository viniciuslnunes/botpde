/**
 * Auditoria: STATUS DOS ACHADOS ABERTOS (`ARCHITECTURE.md` §7).
 *
 * §7 lista 12 achados da rodada de 2026-07-29 como "correções **pendentes**".
 * Vários já foram corrigidos desde então e ninguém atualizou o documento — o
 * que é pior do que não ter lista: uma lista de pendências que mistura o que
 * já está resolvido com o que não está deixa de ser usada para priorizar.
 *
 * Esta auditoria mede **cada item contra o código e o banco de hoje** e
 * classifica:
 *
 *   ✅ ok      — o achado está fechado; a checagem é a rede que impede a volta.
 *   ⚠️  ALERTA — continua em aberto (esperado; o item ainda não foi decidido).
 *   ❌ ERRO    — um achado que já estava fechado **regrediu**.
 *
 * Ou seja: rodar isto verde não quer dizer "nada pendente" — quer dizer
 * "nenhuma correção foi desfeita". O que ainda falta sai na lista de alertas,
 * com o número do item, pronto para virar tarefa.
 *
 * Itens não cobertos aqui e por quê:
 *   #3 (`podeVerPost` com nome amplo demais) e #7 (override negado no feed) são
 *   decisões de nomenclatura/intenção, não estado observável — precisam de
 *   decisão humana, não de sonda.
 *
 * Somente leitura, exceto a sonda de escalada do #6, que tenta criar um cargo
 * e **espera ser recusada** (nada é criado quando o gate funciona; se algo for
 * criado, isso é o próprio achado e a linha é removida na hora).
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:achados
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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
  const s = sessaoAtual
  const c = cookieTenantSlug
  sessaoAtual = { user: { id: user.id, email: user.email ?? '', name: user.nome ?? 'Auditoria' } }
  cookieTenantSlug = tenantSlug
  try {
    return await fn()
  } finally {
    sessaoAtual = s
    cookieTenantSlug = c
  }
}

async function recusou(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    const r = await fn()
    if (r && typeof r === 'object') {
      const obj = r as { error?: string; message?: string }
      if (obj.error) return obj.error
      if (obj.message) return obj.message
    }
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(() => {
  const linhas: string[] = ['', '══════ STATUS DOS ACHADOS DE ARCHITECTURE §7 ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = achados.filter((a) => a.nivel === nivel)
    const rotulo =
      nivel === 'ERRO'
        ? '❌ REGRESSÕES (achado fechado voltou)'
        : nivel === 'ALERTA'
          ? '⚠️  AINDA EM ABERTO'
          : '✅ FECHADOS (com rede)'
    linhas.push('', `${rotulo}: ${itens.length}`)
    for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
  }
  const relatorio = linhas.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'auditoria-achados.txt'), `${relatorio}\n`, 'utf8')

  const nErros = achados.filter((a) => a.nivel === 'ERRO').length
  expect(nErros, `${nErros} achado(s) fechado(s) regrediram`).toBe(0)
})

// ─────────────────────────────────────────────────────────────────────────
describe('#1 — cargo de sistema resolve o pacote em runtime', () => {
  it('owner tem bar:operate mesmo com o array gravado vazio/defasado', async () => {
    const AREA = '§7 #1'
    const { calculateEffectivePermissions, SYSTEM_ROLE_PERMISSIONS } = await import(
      '@torcida/types'
    )
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')

    // O achado dizia: "cargo de sistema resolve pelo array gravado no Role,
    // então permissão nova só chega via db:repair-system-roles". A correção foi
    // resolver por `SYSTEM_ROLE_PERMISSIONS` em runtime — então o contraste
    // certo é justamente um `owner` cujo array gravado está desatualizado.
    const owners: {
      userId: string
      tenantId: string
      role: { permissions: string[] }
      tenant: { slug: string }
    }[] = await db.userRole.findMany({
      where: { role: { isSystem: true, nome: 'owner' }, tenant: { ativo: true, sintetico: false } },
      select: {
        userId: true,
        tenantId: true,
        role: { select: { permissions: true } },
        tenant: { select: { slug: true } },
      },
      take: 40,
    })
    if (owners.length === 0) {
      alerta(AREA, 'Nenhum owner em tenant ativo — não dá para medir')
      return
    }

    const esperado: string[] = SYSTEM_ROLE_PERMISSIONS.owner
    const defasados = owners.filter((o) => o.role.permissions.length < esperado.length)
    const amostra = defasados.length > 0 ? defasados : owners

    let falhas = 0
    for (const o of amostra.slice(0, 12)) {
      const bruto = await getUserPermissionsInTenant(o.userId, o.tenantId)
      const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      if (!efetivas.includes('bar:operate') || !efetivas.includes('affiliation:manage')) {
        falhas += 1
        erro(
          AREA,
          `owner de ${o.tenant.slug} sem bar:operate/affiliation:manage (array gravado tem ${o.role.permissions.length}) — cargo de sistema voltou a depender do repair`,
        )
      }
    }
    if (falhas === 0) {
      ok(
        AREA,
        `FECHADO: ${amostra.slice(0, 12).length} owner(s) com o pacote completo em runtime (${defasados.length}/${owners.length} ainda com array gravado defasado, o que agora é só higiene de UI)`,
      )
    }
  })
})

describe('#2 — comentário respeita o alcance de tenant do post', () => {
  it('listarComentariosPost recusa quem não alcança o tenant do post', async () => {
    const AREA = '§7 #2'
    const { listarComentariosPost } = await import('@/app/portal/comunidade/actions')

    // Post PUBLICO num tenant, leitor sócio de um tenant sem relação.
    const post: {
      id: string
      tenantId: string
      autorId: string
      tenant: { slug: string; afiliacaoId: string | null }
    } | null = await db.post.findFirst({
      where: {
        visibilidade: 'PUBLICO',
        oculto: false,
        tenant: { ativo: true, sintetico: false, afiliacaoId: { not: null } },
      },
      select: {
        id: true,
        tenantId: true,
        autorId: true,
        tenant: { select: { slug: true, afiliacaoId: true } },
      },
    })
    if (!post) {
      alerta(AREA, 'Nenhum post PUBLICO utilizável — achado não medido')
      return
    }

    // Sócio de outro clube: `unrelated` na malha, e portanto sem alcance.
    const forasteiro: {
      userId: string
      tenantId: string
      tenant: { slug: string }
      user: { email: string | null }
    } | null = await db.saasMembro.findFirst({
      where: {
        status: 'APROVADO',
        tipo: 'SOCIO',
        espelhado: false,
        desligadoEm: null,
        tenant: {
          ativo: true,
          sintetico: false,
          afiliacaoId: { not: post.tenant.afiliacaoId },
        },
      },
      select: {
        userId: true,
        tenantId: true,
        tenant: { select: { slug: true } },
        user: { select: { email: true } },
      },
    })
    if (!forasteiro) {
      alerta(AREA, 'Sem sócio de outro clube para contraste')
      return
    }

    const resultado = await comoUsuarioNoTenant(
      forasteiro.userId,
      forasteiro.tenant.slug,
      async () => {
        try {
          return await listarComentariosPost(post.id)
        } catch {
          return null
        }
      },
    )

    if (Array.isArray(resultado) && resultado.length > 0) {
      erro(
        AREA,
        `${forasteiro.user.email} (${forasteiro.tenant.slug}) leu ${resultado.length} comentário(s) de post em ${post.tenant.slug}, sem alcance — o achado voltou`,
      )
    } else {
      ok(
        AREA,
        `FECHADO: leitor de ${forasteiro.tenant.slug} não lê comentários de post em ${post.tenant.slug}`,
      )
    }
  })
})

describe('#4 — alcanceNacional em post INSTITUCIONAL', () => {
  it('reporta se a flag continua inerte no feed nacional', async () => {
    const AREA = '§7 #4'
    const institucionaisComFlag: number = await db.post.count({
      where: { tipo: 'INSTITUCIONAL', alcanceNacional: true },
    })
    if (institucionaisComFlag === 0) {
      ok(AREA, 'Nenhum post INSTITUCIONAL com alcanceNacional — a inconsistência não existe hoje')
      return
    }
    // O feed nacional filtra `tipo: MEMBRO`; a flag no institucional não muda
    // nada. Continua sendo decisão de produto (bloquear no composer OU passar a
    // incluir), então é alerta, não erro.
    alerta(
      AREA,
      `EM ABERTO: ${institucionaisComFlag} post(s) INSTITUCIONAL com alcanceNacional=true — a flag não é lida pelo feed nacional (decidir: bloquear no composer ou incluir)`,
    )
  })
})

describe('#5 — MembroConversa órfão', () => {
  it('nenhum membro de conversa sem vínculo com o tenant da conversa', async () => {
    const AREA = '§7 #5'

    // O achado apontou 1 linha órfã em canal privado. A varredura aqui é a
    // rede: qualquer nova linha do tipo aparece na próxima rodada.
    const canais: { id: string; nome: string | null; tenantId: string }[] =
      await db.conversa.findMany({
        where: { tipo: 'CANAL', publica: false, tenant: { ativo: true, sintetico: false } },
        select: { id: true, nome: true, tenantId: true },
        take: 400,
      })

    let orfaos = 0
    for (const canal of canais) {
      const membros: { userId: string }[] = await db.membroConversa.findMany({
        where: { conversaId: canal.id, status: 'ATIVO', saiuEm: null },
        select: { userId: true },
      })
      if (membros.length === 0) continue

      const { getTorcidaLineageTenantIds } = await import('@/lib/hierarquia')
      const lineage = await getTorcidaLineageTenantIds(canal.tenantId)
      const comVinculo: { userId: string }[] = await db.saasMembro.findMany({
        where: {
          userId: { in: membros.map((m) => m.userId) },
          tenantId: { in: lineage },
          desligadoEm: null,
        },
        select: { userId: true },
        distinct: ['userId'],
      })
      const set = new Set(comVinculo.map((c) => c.userId))
      for (const m of membros) {
        if (set.has(m.userId)) continue
        orfaos += 1
        if (orfaos <= 10) {
          const u: { email: string | null } | null = await db.user.findUnique({
            where: { id: m.userId },
            select: { email: true },
          })
          alerta(
            AREA,
            `EM ABERTO: ${u?.email} está ativo no canal privado "${canal.nome}" sem vínculo na linhagem do tenant`,
          )
        }
      }
    }
    if (orfaos === 0) {
      ok(AREA, `FECHADO: ${canais.length} canal(is) privado(s) varrido(s), nenhum membro órfão`)
    } else {
      alerta(AREA, `EM ABERTO: ${orfaos} MembroConversa órfão(s) — nenhum repair cobre o caso`)
    }
  })
})

describe('#6 — roles:manage não escala privilégio', () => {
  it('quem não tem settings:manage não cria cargo com settings:manage', async () => {
    const AREA = '§7 #6'
    const { salvarPerfilComposto } = await import('@/app/admin/(plataforma)/acessos/actions')

    const { calculateEffectivePermissions } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')

    // Ator com roles:manage mas SEM settings:manage — é o `admin` de sistema.
    const candidatos: {
      userId: string
      tenantId: string
      tenant: { slug: string }
      user: { email: string | null }
    }[] = await db.userRole.findMany({
      where: {
        role: { isSystem: true, nome: 'admin' },
        tenant: { ativo: true, sintetico: false },
      },
      select: {
        userId: true,
        tenantId: true,
        tenant: { select: { slug: true } },
        user: { select: { email: true } },
      },
      take: 20,
    })

    let ator: (typeof candidatos)[number] | null = null
    for (const c of candidatos) {
      const bruto = await getUserPermissionsInTenant(c.userId, c.tenantId)
      const ef = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      if (ef.includes('roles:manage') && !ef.includes('settings:manage')) {
        ator = c
        break
      }
    }
    if (!ator) {
      alerta(AREA, 'Sem ator com roles:manage e sem settings:manage — escalada não medida')
      return
    }

    const nome = `AUDITORIA escalada ${Date.now()}`
    const form = new FormData()
    form.append('nome', nome)
    // O campo do perfil composto é `permissionsExtras` — é por ele que a
    // permissão sensível entraria no cargo novo.
    form.append('permissionsExtras', 'settings:manage')

    const recusa = await comoUsuarioNoTenant(ator.userId, ator.tenant.slug, () =>
      recusou(() => salvarPerfilComposto(form)),
    )

    // Se passou, o cargo existe de verdade — apagar na hora e reportar.
    const criado: { id: string } | null = await db.role.findFirst({
      where: { tenantId: ator.tenantId, nome },
      select: { id: true },
    })
    if (criado) {
      await db.userRole.deleteMany({ where: { roleId: criado.id } })
      await db.role.delete({ where: { id: criado.id } })
    }

    if (!recusa && criado) {
      erro(
        AREA,
        `${ator.user.email} (${ator.tenant.slug}) criou cargo com settings:manage sem tê-la — escalada por roles:manage voltou (cargo removido pela auditoria)`,
      )
    } else {
      ok(AREA, `FECHADO: criação de cargo com permissão que o ator não tem foi recusada ("${recusa}")`)
    }
  })
})

describe('#8 — promoverSedeParaTenant não estoura a transação', () => {
  it('a transação da promoção declara timeout folgado', async () => {
    const AREA = '§7 #8'
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(
      join(process.cwd(), 'src/lib/promover-sede.ts'),
      'utf8',
    )
    // O achado é sobre orçamento de tempo, não sobre lógica: sem opções, o
    // default de 5 s do Prisma faz rollback de ~40 round-trips. A rede aqui é
    // a presença explícita das opções na chamada.
    const temOpts = /\$transaction\([\s\S]*?\},\s*TRANSACAO_PROMOCAO_OPTS\s*\)/.test(fonte)
    const temConstante = /TRANSACAO_PROMOCAO_OPTS\s*=\s*\{[^}]*timeout:\s*(\d[\d_]*)/.test(fonte)
    if (!temOpts || !temConstante) {
      erro(
        AREA,
        'A transação de promoveSedeParaTenant voltou ao default de 5 s do Prisma — promoção faz rollback inteiro em rede distante',
      )
    } else {
      const m = /timeout:\s*(\d[\d_]*)/.exec(fonte)
      ok(AREA, `FECHADO: transação da promoção com timeout=${m?.[1] ?? '?'}ms`)
    }
  })
})

describe('#9 — relação de tenant parte da raiz da árvore', () => {
  it('Sede mãe é ancestral da própria unidade promovida, de forma estável', async () => {
    const AREA = '§7 #9'
    const { getTenantRelation } = await import('@/lib/hierarquia')

    // Unidade promovida (Caso B): a Sede representante mora na árvore da mãe.
    const promovidas: { id: string; nome: string; tenantId: string | null; sedeId: string | null }[] =
      await db.sede.findMany({
        where: { tenantId: { not: null }, sedeId: { not: null } },
        select: { id: true, nome: true, tenantId: true, sedeId: true },
        take: 60,
      })

    let medidos = 0
    let falhas = 0
    for (const s of promovidas) {
      const pai: { tenantId: string | null } | null = await db.sede.findUnique({
        where: { id: s.sedeId! },
        select: { tenantId: true },
      })
      if (!pai?.tenantId || pai.tenantId === s.tenantId) continue

      const maeParaFilha = await getTenantRelation(pai.tenantId, s.tenantId!)
      const filhaParaMae = await getTenantRelation(s.tenantId!, pai.tenantId)
      medidos += 1

      // A mãe pode ver a filha como `descendant`; a filha vê a mãe como
      // `ancestor`. `unrelated` em qualquer direção é o sintoma do achado.
      // (Canal restrito rebaixa de propósito — por isso `restrito` é aceito.)
      if (maeParaFilha === 'unrelated' && filhaParaMae === 'unrelated') {
        const { isTenantRestrito } = await import('@/lib/isolamento')
        if (await isTenantRestrito(s.tenantId!)) continue
        falhas += 1
        if (falhas <= 8) {
          erro(
            AREA,
            `"${s.nome}": mãe↔filha resolveu unrelated nas duas direções — varredura partiu de nó arbitrário`,
          )
        }
      }
      if (medidos >= 20) break
    }

    if (medidos === 0) {
      alerta(AREA, 'Nenhuma unidade promovida com mãe distinta — achado não medido')
    } else if (falhas === 0) {
      ok(AREA, `FECHADO: ${medidos} par(es) mãe↔unidade promovida com relação estrutural preservada`)
    }
  })
})

describe('#10 — super admin no portal resolve tenant só por cookie', () => {
  it('reporta se o vínculo do super admin ainda é ignorado', async () => {
    const AREA = '§7 #10'
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(join(process.cwd(), 'src/lib/tenant.ts'), 'utf8')

    // O guard `if (userId && !superAdmin)` é o que pula toda a resolução por
    // vínculo. Enquanto ele existir, o achado está em aberto por desenho.
    const guardPresente = /if\s*\(\s*userId\s*&&\s*!superAdmin\s*\)/.test(fonte)
    if (guardPresente) {
      alerta(
        AREA,
        'EM ABERTO: getActiveTenant ainda pula a resolução por vínculo quando o e-mail é super admin — link direto do portal continua devolvendo 404 mudo depois de abrir outra torcida no /super-admin',
      )
    } else {
      ok(AREA, 'FECHADO: o vínculo do super admin passou a valer na resolução de tenant')
    }
  })
})

describe('#11 — reconciliação de leitura cobre N destinatários', () => {
  it('a reconciliação é por critério do evento, não por destinatário', async () => {
    const AREA = '§7 #11'
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(join(process.cwd(), 'src/lib/notificacoes.ts'), 'utf8')

    const temReconciliador = /export async function reconciliarNotificacoesDoEvento/.test(fonte)
    if (!temReconciliador) {
      erro(AREA, 'reconciliarNotificacoesDoEvento sumiu — badge preso volta para N-1 destinatários')
      return
    }
    // A assinatura do achado é o `userId` no `where` do updateMany.
    const trecho = fonte.slice(fonte.indexOf('reconciliarNotificacoesDoEvento'))
    const corpo = trecho.slice(0, trecho.indexOf('\n}\n') + 3)
    if (/where\s*=\s*\{[\s\S]*?userId/.test(corpo)) {
      erro(AREA, 'A reconciliação voltou a filtrar por userId — só quem decidiu tem o badge limpo')
    } else {
      ok(AREA, 'FECHADO: reconciliação por (tenant, tipo, ator, corpo), com ping para todos os afetados')
    }
  })
})

describe('#12 — ex-membro não recebe mais comunicado', () => {
  it('o fan-out de membros aprovados exclui quem tem desligadoEm', async () => {
    const AREA = '§7 #12'
    const { listarUserIdsMembrosAprovados } = await import('@/lib/notificacoes')

    const desligado: {
      userId: string
      tenantId: string
      tenant: { slug: string }
      user: { email: string | null }
    } | null = await db.saasMembro.findFirst({
      where: { status: 'APROVADO', desligadoEm: { not: null } },
      select: {
        userId: true,
        tenantId: true,
        tenant: { select: { slug: true } },
        user: { select: { email: true } },
      },
    })
    if (!desligado) {
      alerta(AREA, 'Nenhum membro APROVADO com desligadoEm — achado não medido')
      return
    }

    const alvos = await listarUserIdsMembrosAprovados(desligado.tenantId)
    if (alvos.includes(desligado.userId)) {
      erro(
        AREA,
        `${desligado.user.email} foi desligado de ${desligado.tenant.slug} e continua no fan-out de comunicado`,
      )
    } else {
      ok(
        AREA,
        `FECHADO: desligado de ${desligado.tenant.slug} fora do fan-out (${alvos.length} destinatário(s))`,
      )
    }
  })
})
