/**
 * Seed de JORNADAS — pessoas que entram pelo caminho de verdade.
 *
 * Os seeds de volume (`seed:corinthians-teste`, `seed:nacional-teste`) gravam
 * `SaasMembro` com `createMany`: o banco fica com o **resultado** de um
 * vínculo que nunca aconteceu. Tudo que mora no caminho — inscrição em canal
 * oficial, cargo `member` na aprovação, espelho na Sede raiz (Caso B),
 * `PerfilTorcedor` concluído, `AuditLog`, notificação — some. Foi assim que o
 * lote antigo precisou de `repair-aprovado-canal-membro` para não mentir.
 *
 * Aqui cada pessoa entra chamando as **Server Actions reais**, pelos três
 * fluxos de entrada do produto:
 *
 *   1. TORCEDOR global      → `salvarClubeRegiao` + `concluirComoTorcedor`
 *   2. TORCEDOR da torcida  → `solicitarVinculo({ tipo: 'TORCEDOR' })`
 *   3. Solicitação de vínculo («já sou sócio»)
 *                           → `solicitarVinculo({ tipo:'SOCIO', caminhoSocio:'EXISTENTE' })`
 *   4. Solicitação de associação («quero me associar»)
 *                           → `solicitarVinculo({ tipo:'SOCIO', caminhoSocio:'NOVO' })`
 *
 * e a diretoria decide com `aprovarMembro` / `reprovarMembro` de verdade. Em
 * seguida os aprovados **criam canais temáticos e entram em vários canais**
 * (`criarCanalTematico`, `entrarCanal`, `pedirEntradaCanal`,
 * `decidirPedidoCanal`, `publicarPostCanal`) — o material que faltava para
 * olhar o fluxo de canais com gente dentro.
 *
 * A entrada é pelo **link de convite** (`resolverConvite`), não pela vitrine:
 * é o caminho que nenhum seed exercitava e o único que existe para unidade
 * com canal restrito. Rode `seed:convites-teste` antes.
 *
 * ⚠️ Este arquivo **persiste** (ao contrário das auditorias, que revertem).
 * Marcação: `User` em `@jornada.torcida.app`, `Conversa`/`Post` com
 * `[JORNADA]`. Limpeza: `pnpm --filter @torcida/db reset:jornadas`.
 *
 * Idempotente por destino: tenant que já tem gente do lote é pulado.
 *
 * Rodar:
 *   pnpm --filter @torcida/db seed:convites-teste
 *   pnpm --filter @torcida/web seed:jornadas
 *   pnpm --filter @torcida/web audit:jornadas
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import {
  cpfSinteticoValido,
  DESTINOS_JORNADA,
  DOMINIO_JORNADA,
  MARCA_JORNADA,
  POR_DESTINO,
  SENHA_JORNADA,
  type DesfechoJornada,
  type FluxoJornada,
} from './_jornadas'

// ── Sessão simulada ──────────────────────────────────────────────────────
// Mesmo contrato das auditorias: as actions resolvem tenant e permissões pelo
// vínculo de quem está "logado", então basta trocar a sessão.
let sessaoAtual: { user: { id: string; email: string; name: string } } | null = null

/**
 * Contexto de torcida da "aba". As actions de Comunidade resolvem o tenant
 * pelo vínculo (`getActiveTenant`), mas as de departamento/projeto usam
 * `getTenantFromHost()` — subdomínio → cookie → `TENANT_SLUG`. Sem host no
 * harness, o cookie é a única alavanca, e é exatamente o que o portal real
 * carrega junto da sessão.
 */
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
/**
 * `after()` do Next só existe dentro de um request scope; fora dele **lança**.
 * `publicarPostCanal` o usa para o trabalho pós-publicação
 * (`agendarPosPublicacaoFeed`) — e como a action embrulha tudo num
 * `try/catch`, o erro virava "Não foi possível publicar. Tente novamente."
 * **depois** de o post já ter sido gravado. O relatório dizia "nenhum post"
 * com 52 posts no banco.
 *
 * Executar o callback na hora é o mais próximo do comportamento real que o
 * harness consegue: o trabalho acontece, só não é adiado.
 */
vi.mock('next/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('next/server')>()
  return {
    ...original,
    after: (fn: unknown) => {
      if (typeof fn === 'function') return (fn as () => unknown)()
      return undefined
    },
  }
})
vi.mock('@/lib/auth', () => ({
  auth: async () => sessaoAtual,
  signIn: async () => {},
  signOut: async () => {},
  handlers: {},
}))

type Db = typeof import('@torcida/db').db
let db: Db

// ── Relatório ────────────────────────────────────────────────────────────
type Linha = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const linhas: Linha[] = []
const erro = (area: string, msg: string) => void linhas.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => void linhas.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => void linhas.push({ nivel: 'ok', area, msg })

/** Credenciais impressas no fim — é o entregável para navegar o produto. */
type Credencial = {
  email: string
  nome: string
  fluxo: FluxoJornada
  desfecho: DesfechoJornada
  tenantSlug: string
  papel: string
}
const credenciais: Credencial[] = []

// ── Utilidades ───────────────────────────────────────────────────────────
let seq = 0
const nextSeq = () => (seq += 1)

const PRIMEIROS = [
  'Alex', 'Bruna', 'Caio', 'Débora', 'Elias', 'Flávia', 'Gilmar', 'Helena',
  'Ítalo', 'Joana', 'Kléber', 'Lívia', 'Murilo', 'Nádia', 'Otávio', 'Paula',
  'Quésia', 'Renan', 'Sônia', 'Tarcísio', 'Ubiratan', 'Valéria', 'Wesley', 'Yara',
]
const SOBRENOMES = [
  'Aguiar', 'Bezerra', 'Camargo', 'Duarte', 'Esteves', 'Furtado', 'Guimarães',
  'Hollanda', 'Iglesias', 'Jardim', 'Klein', 'Lacerda', 'Monteiro', 'Novaes',
]

function slugify(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!
}

/**
 * Roda `fn` com o usuário "logado". `tenantSlug` fixa o cookie de contexto —
 * obrigatório para as actions que resolvem por `getTenantFromHost()`
 * (departamentos, áreas, projetos) e inofensivo para as demais, que resolvem
 * pelo vínculo.
 */
async function comoUsuario<T>(
  userId: string,
  fn: () => Promise<T>,
  tenantSlug?: string,
): Promise<T> {
  const user: { id: string; email: string | null; nome: string | null } | null =
    await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, nome: true },
    })
  if (!user) throw new Error(`Usuário ${userId} não encontrado`)
  const sessaoAnterior = sessaoAtual
  const cookieAnterior = cookieTenantSlug
  sessaoAtual = { user: { id: user.id, email: user.email ?? '', name: user.nome ?? 'Jornada' } }
  if (tenantSlug) cookieTenantSlug = tenantSlug
  try {
    return await fn()
  } finally {
    sessaoAtual = sessaoAnterior
    cookieTenantSlug = cookieAnterior
  }
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }

/** As actions ora lançam, ora devolvem `{ message }`/`{ errors }` — normaliza. */
async function tentativa<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    const valor = await fn()
    if (valor && typeof valor === 'object') {
      const obj = valor as { message?: string; error?: string; errors?: Record<string, string[]> }
      if (obj.errors && Object.keys(obj.errors).length > 0) {
        const detalhe = Object.entries(obj.errors)
          .map(([campo, msgs]) => `${campo}: ${msgs.join('; ')}`)
          .join(' | ')
        return { ok: false, erro: detalhe }
      }
      if (obj.message) return { ok: false, erro: obj.message }
      if (obj.error) return { ok: false, erro: obj.error }
    }
    return { ok: true, valor }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Alguns erros aqui são de **infraestrutura**, não de produto: o banco fica
 * atrás do proxy do Railway e uma transação interativa ocasionalmente perde a
 * janela ("Transaction not found", P1017, "Server has closed the
 * connection"). Repetir uma vez separa o blip do defeito — se falhar de novo,
 * é achado de verdade e vira ERRO no relatório.
 */
const PADROES_TRANSIENTES = [
  'Transaction not found',
  'Transaction API error',
  'Server has closed the connection',
  'P1017',
  'ECONNRESET',
]

function ehTransiente(msg: string): boolean {
  return PADROES_TRANSIENTES.some((p) => msg.includes(p))
}

async function tentativaComRetry<T>(fn: () => Promise<T>, tentativas = 3): Promise<Resultado<T>> {
  let ultimo: Resultado<T> = { ok: false, erro: 'nunca executou' }
  for (let i = 0; i < tentativas; i++) {
    ultimo = await tentativa(fn)
    if (ultimo.ok || !ehTransiente(ultimo.erro)) return ultimo
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  return ultimo
}

// ── Contexto de um destino ───────────────────────────────────────────────
interface Destino {
  tenantId: string
  tenantSlug: string
  tenantNome: string
  eixo: string
  comTorcedorGlobal: boolean
  afiliacaoId: string
  conviteSlug: string
  /** Unidade pré-selecionada pelo convite — pode ser null (tenant sem sede). */
  unidadeId: string | null
  /** Ator com MEMBERS_APPROVE e este tenant como ativo. Sem ele não há decisão. */
  decisorId: string | null
  /** Ator com ROLES_MANAGE — promove um sócio do lote a admin (criador de canal). */
  gestorAcessoId: string | null
  /**
   * Departamentos reais do tenant (sem os legados). O sócio declara um no
   * vínculo: é a **preferência**, e só a aprovação a transforma em membership
   * (`aplicarDepartamentoPreferido`). Sem isso ninguém entra em departamento,
   * e área/projeto — que exigem estar no departamento — ficam vazios.
   */
  departamentos: { id: string; slug: string; nome: string }[]
  uf: string
  cidade: string
}

/** Ator do tenant que tem a permissão E resolve este tenant como ativo. */
async function atorComPermissao(tenantId: string, permissao: string): Promise<string | null> {
  const { calculateEffectivePermissions, hasPermission } = await import('@torcida/types')
  const { getUserPermissionsInTenant, getActiveTenant } = await import('@/lib/tenant')
  const { isSuperAdminEmail } = await import('@/lib/tenant-context')

  const candidatos: { userId: string; user: { email: string | null } | null }[] =
    await db.userRole.findMany({
      where: { tenantId },
      select: { userId: true, user: { select: { email: true } } },
      take: 60,
    })

  const vistos = new Set<string>()
  for (const c of candidatos) {
    if (vistos.has(c.userId)) continue
    vistos.add(c.userId)
    if (isSuperAdminEmail(c.user?.email)) continue
    const bruto = await getUserPermissionsInTenant(c.userId, tenantId)
    const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
    if (!hasPermission(efetivas, permissao)) continue
    const ativo = await getActiveTenant(c.userId, c.user?.email ?? null)
    if (ativo?.id === tenantId) return c.userId
  }
  return null
}

async function carregarDestinos(): Promise<Destino[]> {
  const { resolverConvite } = await import('@/lib/convite')
  const { PERMISSIONS } = await import('@torcida/types')

  const destinos: Destino[] = []
  for (const d of DESTINOS_JORNADA) {
    const tenant: {
      id: string
      slug: string
      nome: string
      conviteSlug: string | null
      conviteAtivo: boolean
      ativo: boolean
    } | null = await db.tenant.findFirst({
      where: { slug: d.tenantSlug },
      select: { id: true, slug: true, nome: true, conviteSlug: true, conviteAtivo: true, ativo: true },
    })
    if (!tenant?.ativo) {
      alerta('contexto', `${d.tenantSlug}: tenant ausente ou inativo — destino pulado`)
      continue
    }
    if (!tenant.conviteSlug || !tenant.conviteAtivo) {
      alerta(
        'contexto',
        `${d.tenantSlug}: sem link de convite ativo — rode 'pnpm --filter @torcida/db seed:convites-teste'`,
      )
      continue
    }

    // Passa pelo resolvedor real: é ele que decide unidade pré-selecionada e
    // clube efetivo (herdado do ancestral em unidade Caso B).
    const convite = await resolverConvite(tenant.conviteSlug)
    if (!convite) {
      erro('contexto', `${d.tenantSlug}: resolverConvite('${tenant.conviteSlug}') devolveu null`)
      continue
    }

    // Idempotência por destino: rodar de novo não deve duplicar o lote. Quem
    // quiser um lote novo roda `reset:jornadas` antes.
    const jaSemeado: number = await db.saasMembro.count({
      where: { tenantId: tenant.id, user: { email: { endsWith: `@${DOMINIO_JORNADA}` } } },
    })
    if (jaSemeado > 0) {
      alerta('contexto', `${d.tenantSlug}: já tem ${jaSemeado} pessoa(s) do lote — destino pulado`)
      continue
    }

    const { isDepartamentoLegado } = await import('@torcida/types')
    const departamentosBrutos: { id: string; slug: string; nome: string }[] =
      await db.departamento.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, slug: true, nome: true },
        orderBy: { nome: 'asc' },
      })
    const departamentos = departamentosBrutos.filter((d) => !isDepartamentoLegado(d))

    const [decisorId, gestorAcessoId] = await Promise.all([
      atorComPermissao(tenant.id, PERMISSIONS.MEMBERS_APPROVE),
      atorComPermissao(tenant.id, PERMISSIONS.ROLES_MANAGE),
    ])
    if (!decisorId) {
      alerta(
        'contexto',
        `${d.tenantSlug}: ninguém com members:approve e este tenant ativo — as decisões ficarão pendentes`,
      )
    }

    destinos.push({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantNome: tenant.nome,
      eixo: d.eixo,
      comTorcedorGlobal: d.comTorcedorGlobal,
      afiliacaoId: convite.clube.id,
      conviteSlug: tenant.conviteSlug,
      unidadeId: convite.unidadeId,
      decisorId,
      gestorAcessoId,
      departamentos,
      uf: convite.uf || 'SP',
      cidade: convite.cidade || 'São Paulo',
    })
    if (departamentos.length === 0) {
      alerta(
        'contexto',
        `${d.tenantSlug}: sem departamentos não-legados — área/projeto ficarão sem material`,
      )
    }
    ok('contexto', `${d.tenantSlug}: convite resolvido (passo inicial "${convite.passoInicial}")`)
  }
  return destinos
}

// ── Criação de conta ─────────────────────────────────────────────────────
/**
 * Cria a conta como o cadastro por e-mail/senha faz (`(auth)/entrar/actions`):
 * `senhaHash` bcrypt + `nickname` único. O apelido é obrigatório antes do
 * onboarding — o convite não pula essa etapa.
 */
async function criarConta(fluxo: FluxoJornada, destinoSlug: string): Promise<{
  id: string
  email: string
  nome: string
}> {
  const bcrypt = (await import('bcryptjs')).default
  const n = nextSeq()
  const nome = `${pick(PRIMEIROS, n)} ${pick(SOBRENOMES, n * 7)}`
  const email = `${slugify(nome)}.${n}@${DOMINIO_JORNADA}`
  const nickname = `jornada_${slugify(destinoSlug).slice(0, 18)}_${n}`

  const user: { id: string } = await db.user.create({
    data: {
      id: randomUUID(),
      email,
      nome,
      nickname,
      senhaHash: await bcrypt.hash(SENHA_JORNADA, 10),
      consentidoEm: new Date(),
    },
    select: { id: true },
  })
  void fluxo
  return { id: user.id, email, nome }
}

// ── Payloads dos fluxos de sócio ─────────────────────────────────────────
function dataIso(anosAtras: number, diasExtra = 0): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - anosAtras)
  d.setDate(d.getDate() - diasExtra)
  return d.toISOString().slice(0, 10)
}

const PLACEHOLDER = {
  prova: 'https://placehold.co/640x400/png?text=prova-vinculo-jornada',
  documento: 'https://placehold.co/640x400/png?text=documento-jornada',
  residencia: 'https://placehold.co/640x400/png?text=residencia-jornada',
}

/** Campos LGE comuns aos dois caminhos de sócio (o `superRefine` exige todos). */
function fichaSocioBase(opts: {
  nome: string
  email: string
  n: number
  destino: Destino
}): Record<string, unknown> {
  const { nome, email, n, destino } = opts
  return {
    nome,
    email,
    telefone: `11${String(900000000 + n).slice(0, 9)}`,
    cidade: destino.cidade,
    dataNascimento: dataIso(22 + (n % 30)),
    sexo: n % 2 === 0 ? 'Masculino' : 'Feminino',
    estadoCivil: 'Solteiro(a)',
    nacionalidade: 'Brasileira',
    rg: String(200000000 + n).slice(0, 9),
    cpf: cpfSinteticoValido(500000 + n * 37),
    logradouro: 'Rua da Jornada de Teste',
    numero: String(100 + (n % 800)),
    bairro: 'Centro',
    cep: '01001-000',
    uf: destino.uf,
    profissao: 'Autônomo',
    fotoDocumentoUrl: PLACEHOLDER.documento,
    comprovanteResidenciaUrl: PLACEHOLDER.residencia,
    termoResponsabilidadeAceito: true,
  }
}

/** Nº de associado livre na linhagem — evita `encontrarConflitoNumeroAssociado`. */
async function numeroAssociadoLivre(tenantId: string, sugerido: number): Promise<string> {
  const { getTorcidaLineageTenantIds } = await import('@/lib/hierarquia')
  const lineage = await getTorcidaLineageTenantIds(tenantId)
  let candidato = sugerido
  for (let i = 0; i < 200; i++) {
    const conflito: { id: string } | null = await db.saasMembro.findFirst({
      where: { tenantId: { in: lineage }, numeroAssociado: String(candidato), espelhado: false },
      select: { id: true },
    })
    if (!conflito) return String(candidato)
    candidato += 1
  }
  return String(candidato)
}

// ── Registro do que foi semeado (usado pelo relatório e pelas fases 3/4) ──
interface PessoaJornada {
  userId: string
  email: string
  nome: string
  fluxo: FluxoJornada
  desfecho: DesfechoJornada
  destino: Destino
  /** Tenant onde o vínculo canônico nasceu (pode ser filho do destino). */
  tenantVinculoId: string | null
  membroId: string | null
}
const pessoas: PessoaJornada[] = []

function registrar(p: PessoaJornada, papel: string) {
  pessoas.push(p)
  credenciais.push({
    email: p.email,
    nome: p.nome,
    fluxo: p.fluxo,
    desfecho: p.desfecho,
    tenantSlug: p.destino.tenantSlug,
    papel,
  })
}

// ═════════════════════════════════════════════════════════════════════════
beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(() => {
  const out: string[] = ['', '══════ SEED DE JORNADAS ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = linhas.filter((l) => l.nivel === nivel)
    const rotulo = nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ OK'
    out.push('', `${rotulo}: ${itens.length}`)
    for (const i of itens) out.push(`   [${i.area}] ${i.msg}`)
  }

  out.push('', '══════ CREDENCIAIS (senha única: ' + SENHA_JORNADA + ') ══════')
  const porTenant = new Map<string, Credencial[]>()
  for (const c of credenciais) {
    const lista = porTenant.get(c.tenantSlug) ?? []
    lista.push(c)
    porTenant.set(c.tenantSlug, lista)
  }
  for (const [tenantSlug, lista] of porTenant) {
    out.push('', `── ${tenantSlug} ──`)
    for (const c of lista) {
      out.push(`   ${c.email}`)
      out.push(`      ${c.nome} · fluxo=${c.fluxo} · desfecho=${c.desfecho} · ${c.papel}`)
    }
  }
  out.push('', `Total de pessoas: ${credenciais.length}`)

  const relatorio = out.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'seed-jornadas.txt'), `${relatorio}\n`, 'utf8')
})

// ═════════════════════════════════════════════════════════════════════════
// Fase 1 — as três portas de entrada
// ═════════════════════════════════════════════════════════════════════════
let destinos: Destino[] = []

describe('Fase 0 — contexto e links de convite', () => {
  it('resolve os destinos pelos links de convite reais', async () => {
    destinos = await carregarDestinos()
    if (destinos.length === 0) {
      erro('contexto', 'Nenhum destino utilizável — nada foi semeado')
    }
  })
})

describe('Fase 1 — TORCEDOR global (sem torcida)', () => {
  it('conclui o onboarding pela Comunidade Nacional', async () => {
    const AREA = 'fluxo/torcedor-global'
    const { salvarClubeRegiao, concluirComoTorcedor, buscarCidadesDaUf } = await import(
      '@/app/onboarding/actions'
    )

    for (const destino of destinos.filter((d) => d.comTorcedorGlobal)) {
      const conta = await criarConta('torcedor_global', destino.tenantSlug)

      // `salvarClubeRegiao` só aceita município da lista IBGE da UF. O nome
      // gravado na Sede é bairro tantas vezes ("Centro", "Jardim Aricanduva")
      // que usá-lo direto reprovaria o passo por dado da torcida, não por
      // regra — então cai na lista canônica da própria action.
      // `buscarCidadesDaUf` exige sessão (devolve [] sem ela) — por isso a
      // leitura roda dentro do `comoUsuario`, igual ao wizard.
      const r1 = await comoUsuario(conta.id, async () => {
        const cidades = await buscarCidadesDaUf(destino.uf)
        const cidade = cidades.includes(destino.cidade) ? destino.cidade : (cidades[0] ?? '')
        return tentativa(() =>
          salvarClubeRegiao({ afiliacaoId: destino.afiliacaoId, uf: destino.uf, cidade }),
        )
      })
      if (!r1.ok) {
        alerta(AREA, `${conta.email}: salvarClubeRegiao recusou (${r1.erro}) — seguindo sem região`)
      }

      const r2 = await comoUsuario(conta.id, () => tentativa(() => concluirComoTorcedor()))
      if (!r2.ok) {
        erro(AREA, `${conta.email}: concluirComoTorcedor falhou — ${r2.erro}`)
        continue
      }

      registrar(
        {
          ...conta,
          userId: conta.id,
          fluxo: 'torcedor_global',
          desfecho: 'pendente',
          destino,
          tenantVinculoId: null,
          membroId: null,
        },
        'torcedor global (só Comunidade Nacional)',
      )
      ok(AREA, `${conta.email}: torcedor global do clube de ${destino.tenantSlug}`)
    }
  })
})

describe('Fase 1 — TORCEDOR da torcida (pelo convite)', () => {
  it('entra APROVADO sem passar por fila', async () => {
    const AREA = 'fluxo/torcedor-torcida'
    const { solicitarVinculo } = await import('@/app/onboarding/actions')

    for (const destino of destinos) {
      for (let i = 0; i < POR_DESTINO.torcedor_torcida; i++) {
        const conta = await criarConta('torcedor_torcida', destino.tenantSlug)
        const n = nextSeq()
        const r = await comoUsuario(conta.id, () =>
          tentativaComRetry(() =>
            solicitarVinculo({
              tenantId: destino.tenantId,
              tipo: 'TORCEDOR',
              nome: conta.nome,
              email: conta.email,
              telefone: `11${String(900000000 + n).slice(0, 9)}`,
              cidade: destino.cidade,
              idade: 20 + (n % 30),
              ...(destino.unidadeId ? { sedeId: destino.unidadeId } : {}),
            }),
          ),
        )
        if (!r.ok) {
          erro(AREA, `${conta.email} @${destino.tenantSlug}: ${r.erro}`)
          continue
        }

        const membro: { id: string; tenantId: string; status: string } | null =
          await db.saasMembro.findFirst({
            where: { userId: conta.id, espelhado: false },
            select: { id: true, tenantId: true, status: true },
          })
        if (!membro) {
          erro(AREA, `${conta.email}: action passou mas nenhum SaasMembro canônico foi criado`)
          continue
        }
        if (membro.status !== 'APROVADO') {
          erro(
            AREA,
            `${conta.email}: TORCEDOR nasceu "${membro.status}" — deveria entrar APROVADO sem fila`,
          )
        }

        registrar(
          {
            ...conta,
            userId: conta.id,
            fluxo: 'torcedor_torcida',
            desfecho: 'aprovado',
            destino,
            tenantVinculoId: membro.tenantId,
            membroId: membro.id,
          },
          'torcedor da torcida (canal da unidade, sem canal da Sede)',
        )
        ok(AREA, `${conta.email}: TORCEDOR APROVADO em ${destino.tenantSlug}`)
      }
    }
  })
})

/** Fluxos 3 e 4 compartilham quase tudo — muda o `caminhoSocio` e o que ele exige. */
async function semearSocio(
  destino: Destino,
  caminho: 'EXISTENTE' | 'NOVO',
  /**
   * «Já sou sócio» com carteirinha física antiga. `aprovarMembro` auto-emite a
   * digital com `validade = dataExpedicaoCarteirinha + periodicidade`: uma
   * expedição de mais de um ano atrás nasce **já vencida**, e o gate de canal
   * (`canais.ts` → "Sua carteirinha nesta torcida está vencida") barra a
   * pessoa em todos os canais no minuto seguinte à aprovação.
   *
   * O lote mantém um caso desses de propósito, para a tela de regularização
   * ter sujeito — mas só um por torcida, senão nenhum sócio do lote consegue
   * entrar em canal e o resto do fluxo deixa de ser exercitado.
   */
  expedicaoAntiga = false,
): Promise<PessoaJornada | null> {
  const AREA = caminho === 'EXISTENTE' ? 'fluxo/socio-vinculo' : 'fluxo/socio-associacao'
  const { solicitarVinculo } = await import('@/app/onboarding/actions')

  const conta = await criarConta(caminho === 'EXISTENTE' ? 'socio_vinculo' : 'socio_associacao', destino.tenantSlug)
  const n = nextSeq()
  const base = fichaSocioBase({ nome: conta.nome, email: conta.email, n, destino })

  const extras =
    caminho === 'EXISTENTE'
      ? {
          caminhoSocio: 'EXISTENTE' as const,
          numeroAssociado: await numeroAssociadoLivre(destino.tenantId, 700000 + n),
          anosSocio: 1 + (n % 15),
          imagemProva: PLACEHOLDER.prova,
          // Recente por padrão: a digital emitida na aprovação (expedição +
          // 1 ano, plano ANUAL) precisa nascer vigente para o sócio conseguir
          // usar canais. Ver `expedicaoAntiga`.
          dataExpedicaoCarteirinha: expedicaoAntiga ? dataIso(1, 40) : dataIso(0, 30 + (n % 120)),
          // Periodicidade tem que estar entre as habilitadas no tenant; a
          // action recusa o resto. ANUAL é a única presente em todas.
          periodicidadePretendida: 'ANUAL' as const,
        }
      : { caminhoSocio: 'NOVO' as const }

  // Área pretendida: `SaasMembro.departamentoId` é **preferência**; vira
  // membership só em `aprovarMembro` (`aplicarDepartamentoPreferido`). É o que
  // dá material para as áreas de atuação e os projetos — sem ninguém em
  // departamento, `assertElegivelParaArea` recusa todo mundo.
  const departamento = destino.departamentos.length
    ? destino.departamentos[n % destino.departamentos.length]!
    : null

  const r = await comoUsuario(conta.id, () =>
    tentativaComRetry(() =>
      solicitarVinculo({
        tenantId: destino.tenantId,
        tipo: 'SOCIO',
        ...base,
        ...extras,
        ...(departamento ? { departamentoId: departamento.id } : {}),
        ...(destino.unidadeId ? { sedeId: destino.unidadeId } : {}),
      } as never),
    ),
  )
  if (!r.ok) {
    erro(AREA, `${conta.email} @${destino.tenantSlug}: ${r.erro}`)
    return null
  }

  const membro: { id: string; tenantId: string; status: string } | null =
    await db.saasMembro.findFirst({
      where: { userId: conta.id, espelhado: false, membroOrigemId: null },
      select: { id: true, tenantId: true, status: true },
    })
  if (!membro) {
    erro(AREA, `${conta.email}: nenhum SaasMembro canônico após solicitarVinculo`)
    return null
  }
  if (membro.status !== 'PENDENTE') {
    erro(AREA, `${conta.email}: SOCIO nasceu "${membro.status}" — deveria entrar PENDENTE`)
  }

  return {
    ...conta,
    userId: conta.id,
    fluxo: caminho === 'EXISTENTE' ? 'socio_vinculo' : 'socio_associacao',
    desfecho: 'pendente',
    destino,
    tenantVinculoId: membro.tenantId,
    membroId: membro.id,
  }
}

describe('Fase 1 — solicitação de VÍNCULO («já sou sócio»)', () => {
  it('cria a fila com nº de associado, carteirinha e prova', async () => {
    const AREA = 'fluxo/socio-vinculo'
    const total =
      POR_DESTINO.socio_vinculo_aprovado +
      POR_DESTINO.socio_vinculo_pendente +
      POR_DESTINO.socio_vinculo_reprovado

    for (const destino of destinos) {
      for (let i = 0; i < total; i++) {
        // O segundo aprovado leva a carteirinha física antiga. O primeiro é o
        // que a Fase 3a promove a admin — ele precisa estar vigente.
        const pessoa = await semearSocio(destino, 'EXISTENTE', i === 1)
        if (!pessoa) continue
        // Desfecho pretendido — a Fase 2 executa a decisão de verdade.
        const desfecho: DesfechoJornada =
          i < POR_DESTINO.socio_vinculo_aprovado
            ? 'aprovado'
            : i < POR_DESTINO.socio_vinculo_aprovado + POR_DESTINO.socio_vinculo_pendente
              ? 'pendente'
              : 'reprovado'
        const nota = i === 1 ? ' · carteirinha física antiga (nasce vencida)' : ''
        registrar({ ...pessoa, desfecho }, `sócio por vínculo — alvo: ${desfecho}${nota}`)
        ok(AREA, `${pessoa.email}: PENDENTE em ${destino.tenantSlug} (alvo ${desfecho})`)
      }
    }
  })
})

describe('Fase 1 — solicitação de ASSOCIAÇÃO («quero me associar»)', () => {
  it('cria a fila sem nº de associado', async () => {
    const AREA = 'fluxo/socio-associacao'
    const total = POR_DESTINO.socio_associacao_aprovado + POR_DESTINO.socio_associacao_pendente

    for (const destino of destinos) {
      for (let i = 0; i < total; i++) {
        const pessoa = await semearSocio(destino, 'NOVO')
        if (!pessoa) continue
        const desfecho: DesfechoJornada =
          i < POR_DESTINO.socio_associacao_aprovado ? 'aprovado' : 'pendente'
        registrar({ ...pessoa, desfecho }, `sócio por associação — alvo: ${desfecho}`)
        ok(AREA, `${pessoa.email}: PENDENTE em ${destino.tenantSlug} (alvo ${desfecho})`)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// Fase 2 — a diretoria decide (aprovarMembro / reprovarMembro reais)
// ═════════════════════════════════════════════════════════════════════════
describe('Fase 2 — decisão da diretoria', () => {
  it('aprova e reprova pela action real (cargo, canais e espelho no caminho)', async () => {
    const AREA = 'decisao'
    const { aprovarMembro, reprovarMembro } = await import('@/app/admin/membros/actions')

    for (const pessoa of pessoas) {
      if (!pessoa.membroId || pessoa.fluxo === 'torcedor_global') continue
      if (pessoa.desfecho === 'pendente') continue
      if (pessoa.fluxo === 'torcedor_torcida') continue

      const decisor = pessoa.destino.decisorId
      if (!decisor) {
        alerta(AREA, `${pessoa.email}: sem decisor no tenant — segue PENDENTE`)
        continue
      }

      // O membro canônico pode ter nascido num tenant-filho (Caso B). A fila é
      // compartilhada: o decisor da Sede age sobre o espelho, e a action
      // resolve a origem. Buscamos o id visível para ESTE decisor.
      const alvo: { id: string } | null = await db.saasMembro.findFirst({
        where: { userId: pessoa.userId, tenantId: pessoa.destino.tenantId },
        select: { id: true },
      })
      const membroId = alvo?.id ?? pessoa.membroId

      if (pessoa.desfecho === 'aprovado') {
        const r = await comoUsuario(decisor, () => tentativaComRetry(() => aprovarMembro(membroId)))
        if (!r.ok) {
          erro(AREA, `aprovarMembro(${pessoa.email}) falhou — ${r.erro}`)
          continue
        }
        ok(AREA, `${pessoa.email}: APROVADO em ${pessoa.destino.tenantSlug}`)
      } else {
        const r = await comoUsuario(decisor, () =>
          tentativaComRetry(() =>
            reprovarMembro(membroId, {
              categoria: 'DOCUMENTACAO',
              motivo:
                'A foto do documento saiu ilegível e o comprovante de residência está vencido. Reenvie os dois para concluir a análise.',
              pontos: ['documento', 'residencia'],
              permiteReenvio: true,
            } as never),
          ),
        )
        if (!r.ok) {
          erro(AREA, `reprovarMembro(${pessoa.email}) falhou — ${r.erro}`)
          continue
        }
        ok(AREA, `${pessoa.email}: REPROVADO com laudo em ${pessoa.destino.tenantSlug}`)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// Fase 3 — canais: quem cria, quem entra, quem pede e quem é barrado
// ═════════════════════════════════════════════════════════════════════════

/**
 * Canais criados pelo lote, por tenant. `publica: false` é o canal fechado —
 * a entrada dele é por pedido + decisão, o único caminho que exercita
 * `pedirEntradaCanal`/`decidirPedidoCanal`.
 *
 * As quatro visibilidades entram de propósito: `TENANT` (só a torcida),
 * `HIERARQUIA` (worktree Sede↔unidades), `ALIADOS` (malha de aliança) e
 * `PUBLICO` (alcança a Comunidade Nacional do clube — é o único que um
 * torcedor sem tenant ativo consegue acessar por `entrarCanal`).
 */
const CANAIS_DO_LOTE = [
  {
    sufixo: 'Bastidores da diretoria',
    descricao: 'Canal fechado do lote de jornadas — entrada só por pedido aprovado.',
    visibilidade: 'TENANT' as const,
    publica: false,
  },
  {
    sufixo: 'Caravanas e viagens',
    descricao: 'Canal aberto da worktree — Sede e unidades combinam ônibus aqui.',
    visibilidade: 'HIERARQUIA' as const,
    publica: true,
  },
  {
    sufixo: 'Arquibancada aliada',
    descricao: 'Canal aberto para a malha de aliados.',
    visibilidade: 'ALIADOS' as const,
    publica: true,
  },
  {
    sufixo: 'Praca do clube',
    descricao: 'Canal público — alcança a Comunidade Nacional do clube.',
    visibilidade: 'PUBLICO' as const,
    publica: true,
  },
]

interface CanalCriado {
  id: string
  nome: string
  visibilidade: string
  publica: boolean
  tenantSlug: string
  criadorEmail: string
}
const canaisCriados: CanalCriado[] = []

describe('Fase 3a — sócio aprovado vira admin e cria canais temáticos', () => {
  it('promove pela tela real de acessos e cria as 4 visibilidades', async () => {
    const AREA = 'canais/criacao'
    const { salvarAcessoUsuario } = await import('@/app/admin/(plataforma)/acessos/actions')
    const { criarCanalTematico } = await import('@/app/portal/comunidade/actions')

    for (const destino of destinos) {
      const candidato = pessoas.find(
        (p) =>
          p.destino.tenantSlug === destino.tenantSlug &&
          p.desfecho === 'aprovado' &&
          (p.fluxo === 'socio_vinculo' || p.fluxo === 'socio_associacao'),
      )
      if (!candidato) {
        alerta(AREA, `${destino.tenantSlug}: sem sócio aprovado do lote — nenhum canal criado`)
        continue
      }
      if (!destino.gestorAcessoId) {
        alerta(AREA, `${destino.tenantSlug}: ninguém com roles:manage — sem promoção a admin`)
        continue
      }

      // Criar canal exige `channels:manage` ou `community:manage` — quem tem é
      // liderança. Então a promoção passa pela mesma tela que a diretoria usa,
      // e não por um `UserRole` enfiado à mão.
      const adminRole: {
        id: string
        nome: string
        permissions: string[]
        permissionsExtras: string[]
        departamentoId: string | null
        papelNoDepartamento: string | null
      } | null = await db.role.findFirst({
        where: { tenantId: destino.tenantId, isSystem: true, nome: 'admin' },
        select: {
          id: true,
          nome: true,
          permissions: true,
          permissionsExtras: true,
          departamentoId: true,
          papelNoDepartamento: true,
        },
      })
      if (!adminRole) {
        erro(AREA, `${destino.tenantSlug}: sem cargo de sistema "admin"`)
        continue
      }

      // O formulário de acessos é declarativo: o que **não** vem em
      // `permissoes` vira override NEGADO, mesmo estando no pacote do cargo.
      // A tela sempre envia o conjunto efetivo junto; mandar só `perfilIds`
      // produziria um admin com zero permissão. `permissionsOfRole` é a
      // mesma fonte que a tela usa para marcar as caixas.
      // Os cargos que a pessoa já tem entram junto: o formulário é
      // declarativo, e mandar só o `admin` **remove** o perfil de departamento
      // que a aprovação concedeu (`aplicarDepartamentoPreferido`) — a pessoa
      // vira admin e sai da própria área no mesmo request. A tela real manda
      // as caixas já marcadas; aqui é a mesma coisa.
      const cargosAtuais: { roleId: string }[] = await db.userRole.findMany({
        where: { userId: candidato.userId, tenantId: destino.tenantId },
        select: { roleId: true },
      })

      const { permissionsOfRole } = await import('@torcida/types')
      const form = new FormData()
      for (const id of new Set([adminRole.id, ...cargosAtuais.map((c) => c.roleId)])) {
        form.append('perfilIds', id)
      }
      for (const p of permissionsOfRole(adminRole, null)) form.append('permissoes', p)
      const rPromocao = await comoUsuario(destino.gestorAcessoId, () =>
        tentativaComRetry(() => salvarAcessoUsuario(candidato.userId, form)),
      )
      if (!rPromocao.ok) {
        erro(AREA, `promover ${candidato.email} a admin falhou — ${rPromocao.erro}`)
        continue
      }
      credenciais.push({
        email: candidato.email,
        nome: candidato.nome,
        fluxo: candidato.fluxo,
        desfecho: 'aprovado',
        tenantSlug: destino.tenantSlug,
        papel: 'promovido a ADMIN — cria canais, áreas, projetos e decide pedidos',
      })
      adminPorTenant.set(destino.tenantSlug, candidato)
      ok(AREA, `${candidato.email}: promovido a admin em ${destino.tenantSlug}`)

      for (const spec of CANAIS_DO_LOTE) {
        const nome = `${MARCA_JORNADA} ${spec.sufixo} — ${destino.tenantNome}`.slice(0, 80)
        const r = await comoUsuario(candidato.userId, () =>
          tentativaComRetry(() =>
            criarCanalTematico(nome, spec.descricao, spec.visibilidade, undefined, spec.publica),
          ),
        )
        if (!r.ok) {
          erro(AREA, `criarCanalTematico("${spec.sufixo}" @${destino.tenantSlug}) — ${r.erro}`)
          continue
        }
        const canal = r.valor as { id: string }
        canaisCriados.push({
          id: canal.id,
          nome,
          visibilidade: spec.visibilidade,
          publica: spec.publica,
          tenantSlug: destino.tenantSlug,
          criadorEmail: candidato.email,
        })
        ok(
          AREA,
          `${destino.tenantSlug}: canal "${spec.sufixo}" (${spec.visibilidade}, ${spec.publica ? 'aberto' : 'fechado'})`,
        )
      }
    }
  })
})

describe('Fase 3b — entrada em múltiplos canais', () => {
  it('sócio entra nos abertos, pede nos fechados e a decisão acontece', async () => {
    const AREA = 'canais/entrada'
    const { entrarCanal, pedirEntradaCanal, decidirPedidoCanal } = await import(
      '@/app/portal/comunidade/actions'
    )

    for (const destino of destinos) {
      const canais = canaisCriados.filter((c) => c.tenantSlug === destino.tenantSlug)
      if (canais.length === 0) continue

      const participantes = pessoas.filter(
        (p) =>
          p.destino.tenantSlug === destino.tenantSlug &&
          p.desfecho === 'aprovado' &&
          p.fluxo !== 'torcedor_global',
      )
      const adminEmail = canais[0]!.criadorEmail
      const adminPessoa = pessoas.find((p) => p.email === adminEmail)

      for (const pessoa of participantes) {
        if (pessoa.email === adminEmail) continue
        // Torcedor não tem tenant ativo (só SOCIO APROVADO abre modo torcida):
        // `entrarCanal` cai no ramo da Comunidade Nacional, que só aceita
        // canal PUBLICO. Recusa no resto é a regra, não defeito.
        const soAlcancaPublico = pessoa.fluxo === 'torcedor_torcida'

        for (const canal of canais.filter((c) => c.publica)) {
          const r = await comoUsuario(pessoa.userId, () => tentativa(() => entrarCanal(canal.id)))
          if (!r.ok) {
            if (soAlcancaPublico && canal.visibilidade !== 'PUBLICO') {
              ok(AREA, `${pessoa.email}: barrado em ${canal.visibilidade} (torcedor — correto)`)
            } else if (/carteirinha|não encontrado ou indispon/i.test(r.erro)) {
              // É o sócio com carteirinha física antiga (ver `expedicaoAntiga`):
              // a digital nasceu vencida na aprovação e `assertElegibilidade
              // MembroCanal` o barra em TODO canal. Cenário semeado de
              // propósito — o alerta é o registro dele, não um defeito do seed.
              alerta(
                AREA,
                `${pessoa.email}: barrado em ${canal.visibilidade} por carteirinha vencida na aprovação — cenário proposital, ver ARCHITECTURE §7`,
              )
            } else {
              erro(AREA, `entrarCanal(${canal.visibilidade}) por ${pessoa.email} — ${r.erro}`)
            }
            continue
          }
          ok(AREA, `${pessoa.email} entrou em ${canal.visibilidade}/${destino.tenantSlug}`)
        }

        for (const canal of canais.filter((c) => !c.publica)) {
          const rPedido = await comoUsuario(pessoa.userId, () =>
            tentativa(() => pedirEntradaCanal(canal.id)),
          )
          if (!rPedido.ok) {
            if (soAlcancaPublico) {
              ok(AREA, `${pessoa.email}: sem pedir em canal fechado (torcedor — correto)`)
            } else {
              alerta(AREA, `pedirEntradaCanal por ${pessoa.email} — ${rPedido.erro}`)
            }
            continue
          }
          if (!adminPessoa) continue

          // Aprova a maioria e recusa um a cada três: a tela de pedidos só
          // mostra os dois estados se os dois existirem no banco.
          const aprovar = participantes.indexOf(pessoa) % 3 !== 2
          const rDecisao = await comoUsuario(adminPessoa.userId, () =>
            tentativa(() => decidirPedidoCanal(canal.id, pessoa.userId, aprovar)),
          )
          if (!rDecisao.ok) {
            erro(AREA, `decidirPedidoCanal(${pessoa.email}) — ${rDecisao.erro}`)
            continue
          }
          ok(AREA, `${pessoa.email}: pedido ${aprovar ? 'APROVADO' : 'RECUSADO'} no canal fechado`)
        }
      }
    }
  })
})

describe('Fase 3c — torcedor global entra em canal PUBLICO pela CN', () => {
  it('exercita o ramo Comunidade Nacional de entrarCanal', async () => {
    const AREA = 'canais/nacional'
    const { entrarCanal } = await import('@/app/portal/comunidade/actions')

    for (const pessoa of pessoas.filter((p) => p.fluxo === 'torcedor_global')) {
      const publicos = canaisCriados.filter(
        (c) => c.visibilidade === 'PUBLICO' && c.tenantSlug === pessoa.destino.tenantSlug,
      )
      if (publicos.length === 0) {
        alerta(AREA, `${pessoa.email}: nenhum canal PUBLICO no clube — ramo CN não exercitado`)
        continue
      }
      for (const canal of publicos) {
        const r = await comoUsuario(pessoa.userId, () => tentativa(() => entrarCanal(canal.id)))
        if (!r.ok) {
          if (/precisa ter vínculo com a torcida deste canal/i.test(r.erro)) {
            // ACHADO: o ramo de Comunidade Nacional de `entrarCanal` valida
            // tudo que deveria bastar (canal PUBLICO, tenant não-sintético,
            // mesma afiliação) e então chama `inscreverCanal`, que exige um
            // `SaasMembro` no tenant do canal — o que um torcedor da CN, por
            // definição, não tem. O ramo não consegue ter sucesso para o
            // público que ele foi escrito para atender.
            alerta(
              AREA,
              `ACHADO: torcedor global ${pessoa.email} recusado em canal PUBLICO — o ramo CN de entrarCanal é inalcançável (assertElegibilidadeMembroCanal exige SaasMembro)`,
            )
          } else {
            erro(AREA, `torcedor global ${pessoa.email} em canal PUBLICO — ${r.erro}`)
          }
          continue
        }
        ok(AREA, `${pessoa.email}: entrou no canal PUBLICO pela Comunidade Nacional`)
      }
    }
  })
})

describe('Fase 3d — grupos públicos existentes', () => {
  it('sócio aprovado entra em grupo público da própria torcida', async () => {
    const AREA = 'canais/grupos'
    const { entrarGrupoPublico } = await import('@/app/portal/comunidade/actions')

    const socios = pessoas.filter(
      (p) =>
        p.desfecho === 'aprovado' &&
        (p.fluxo === 'socio_vinculo' || p.fluxo === 'socio_associacao'),
    )

    for (const pessoa of socios) {
      // `entrarGrupoPublico` procura o grupo no **tenant ativo** de quem age.
      // Em unidade Caso B o vínculo canônico nasce no tenant-filho, então
      // buscar o grupo no tenant do convite acha um grupo que a action não
      // enxerga — e o "Grupo não encontrado" seria falso positivo.
      if (!pessoa.tenantVinculoId) continue
      const { getActiveTenant } = await import('@/lib/tenant')
      const ativo = await getActiveTenant(pessoa.userId, pessoa.email)
      if (!ativo) {
        alerta(AREA, `${pessoa.email}: sem torcida ativa — grupo do portal não se aplica`)
        continue
      }
      const grupo: { id: string; nome: string | null } | null = await db.conversa.findFirst({
        where: { tenantId: ativo.id, tipo: 'GRUPO', publica: true, comunidade: true },
        select: { id: true, nome: true },
      })
      if (!grupo) {
        alerta(
          AREA,
          `${ativo.slug}: sem grupo público na torcida ativa — fluxo de grupo não exercitado`,
        )
        continue
      }
      const r = await comoUsuario(pessoa.userId, () => tentativa(() => entrarGrupoPublico(grupo.id)))
      if (!r.ok) {
        // "Grupo cheio" é a regra de `MAX_MEMBROS_GRUPO` funcionando.
        alerta(AREA, `entrarGrupoPublico por ${pessoa.email} — ${r.erro}`)
        continue
      }
      ok(AREA, `${pessoa.email}: entrou no grupo "${grupo.nome}"`)
    }
  })
})

describe('Fase 3e — conteúdo nos canais', () => {
  it('publica no mural de cada canal que tem membro dentro', async () => {
    const AREA = 'canais/posts'
    const { publicarPostCanal } = await import('@/app/portal/comunidade/actions')

    const TEXTOS = [
      'Bora combinar a saída pro próximo jogo? Quem topa ir de ônibus?',
      'Chegando na sede mais cedo hoje, quem quiser me encontra no portão 2.',
      'Alguém tem foto da arquibancada do último jogo pra postar aqui?',
      'Aviso: a reunião da semana que vem mudou de dia. Fiquem ligados.',
    ]

    for (const canal of canaisCriados) {
      const membros: { userId: string }[] = await db.membroConversa.findMany({
        where: { conversaId: canal.id, status: 'ATIVO', saiuEm: null },
        select: { userId: true },
        take: 3,
      })
      let publicados = 0
      const recusas: string[] = []
      for (const [i, m] of membros.entries()) {
        const form = new FormData()
        form.append('conversaId', canal.id)
        form.append('conteudo', `${MARCA_JORNADA} ${TEXTOS[i % TEXTOS.length]}`)
        const r = await comoUsuario(m.userId, () => tentativa(() => publicarPostCanal({}, form)))
        if (r.ok) publicados += 1
        else recusas.push(r.erro)
      }
      if (publicados === 0) {
        // O motivo importa: "nenhum post" sozinho não distingue gate correto de
        // mural quebrado. `publicarPostCanal` devolve `{ message }`, então a
        // recusa vem com texto — é o que decide se isso é achado ou regra.
        alerta(
          AREA,
          `"${canal.nome}": nenhum post publicado (${membros.length} membro(s) ativo(s)) — motivo: ${[...new Set(recusas)].join(' | ') || 'sem mensagem'}`,
        )
      } else {
        ok(AREA, `"${canal.nome}": ${publicados} post(s) no mural`)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// Fase 4 — áreas de atuação e projetos
//
// Os dois módulos mais novos (2026-08-03) estavam com o banco **vazio**:
// zero `DepartamentoAreaMembro`, zero `Projeto` em toda a plataforma. Sem
// linha nenhuma, a regra que os define ("área e projeto NÃO concedem
// permissão") não podia ser verificada nem à mão nem por auditoria — não
// havia o que olhar.
//
// Quem age aqui é o sócio promovido a admin na Fase 3a: `roles:manage` é o
// que `assertPodeGerirArea`/`assertPodeGerirDepartamento` exigem. Os alvos
// são os sócios aprovados do lote, que entraram num departamento pela
// preferência declarada no vínculo.
// ═════════════════════════════════════════════════════════════════════════

/** Quem foi promovido a admin em cada tenant (Fase 3a). */
const adminPorTenant = new Map<string, PessoaJornada>()

interface AreaCriada {
  id: string
  nome: string
  tenantSlug: string
  departamentoId: string
  departamentoSlug: string
}
const areasCriadas: AreaCriada[] = []

describe('Fase 4a — áreas de atuação dentro do departamento', () => {
  it('cria área, coloca gente dentro e define responsável', async () => {
    const AREA = 'areas/seed'
    const { criarAreaDepartamento, adicionarMembroAreaDepartamento, definirResponsavelArea } =
      await import('@/app/portal/departamentos/actions')

    for (const destino of destinos) {
      const admin = adminPorTenant.get(destino.tenantSlug)
      if (!admin) {
        alerta(AREA, `${destino.tenantSlug}: sem admin do lote — áreas não semeadas`)
        continue
      }
      if (destino.departamentos.length === 0) continue

      // Departamento onde há gente do lote: só nele `assertElegivelParaArea`
      // deixa alguém entrar.
      const comGente = new Map<string, PessoaJornada[]>()
      for (const p of pessoas) {
        if (p.destino.tenantSlug !== destino.tenantSlug) continue
        if (p.desfecho !== 'aprovado') continue
        if (p.fluxo !== 'socio_vinculo' && p.fluxo !== 'socio_associacao') continue
        if (!p.tenantVinculoId) continue
        const membro: { departamentoId: string | null } | null = await db.saasMembro.findFirst({
          where: { userId: p.userId, tenantId: destino.tenantId },
          select: { departamentoId: true },
        })
        if (!membro?.departamentoId) continue
        const lista = comGente.get(membro.departamentoId) ?? []
        lista.push(p)
        comGente.set(membro.departamentoId, lista)
      }

      if (comGente.size === 0) {
        alerta(
          AREA,
          `${destino.tenantSlug}: ninguém do lote entrou em departamento — preferência não virou membership`,
        )
        continue
      }

      for (const [departamentoId, membros] of comGente) {
        const depto = destino.departamentos.find((d) => d.id === departamentoId)
        if (!depto) continue

        const nomeArea = `${MARCA_JORNADA} Frente de campo — ${depto.nome}`.slice(0, 80)
        const formArea = new FormData()
        formArea.append('departamentoId', departamentoId)
        formArea.append('slug', depto.slug)
        formArea.append('nome', nomeArea)
        formArea.append('descricao', 'Área criada pelo lote de jornadas para exercitar o módulo.')
        formArea.append('sazonal', '')

        const rArea = await comoUsuario(
          admin.userId,
          () => tentativaComRetry(() => criarAreaDepartamento({}, formArea)),
          destino.tenantSlug,
        )
        if (!rArea.ok) {
          erro(AREA, `criarAreaDepartamento("${depto.nome}" @${destino.tenantSlug}) — ${rArea.erro}`)
          continue
        }

        const area: { id: string; nome: string } | null = await db.departamentoArea.findFirst({
          where: { departamentoId, nome: nomeArea },
          select: { id: true, nome: true },
        })
        if (!area) {
          erro(AREA, `Área "${nomeArea}" não encontrada após a action reportar sucesso`)
          continue
        }
        areasCriadas.push({
          id: area.id,
          nome: area.nome,
          tenantSlug: destino.tenantSlug,
          departamentoId,
          departamentoSlug: depto.slug,
        })
        ok(AREA, `${destino.tenantSlug}: área "${depto.nome}" criada`)

        let dentro = 0
        for (const p of membros) {
          const formMembro = new FormData()
          formMembro.append('areaId', area.id)
          formMembro.append('departamentoId', departamentoId)
          formMembro.append('slug', depto.slug)
          formMembro.append('targetUserId', p.userId)
          const r = await comoUsuario(
            admin.userId,
            () => tentativaComRetry(() => adicionarMembroAreaDepartamento({}, formMembro)),
            destino.tenantSlug,
          )
          if (!r.ok) {
            alerta(AREA, `adicionarMembroAreaDepartamento(${p.email}) — ${r.erro}`)
            continue
          }
          dentro += 1
        }
        ok(AREA, `"${area.nome}": ${dentro}/${membros.length} pessoa(s) na área`)

        // Um RESPONSAVEL de propósito: é o papel que **parece** cargo e não
        // pode conceder nada. Sem uma linha dessas, a regra não é testável.
        const primeiro = membros[0]
        if (dentro > 0 && primeiro) {
          const formResp = new FormData()
          formResp.append('areaId', area.id)
          formResp.append('departamentoId', departamentoId)
          formResp.append('slug', depto.slug)
          formResp.append('targetUserId', primeiro.userId)
          formResp.append('papel', 'RESPONSAVEL')
          const r = await comoUsuario(
            admin.userId,
            () => tentativaComRetry(() => definirResponsavelArea({}, formResp)),
            destino.tenantSlug,
          )
          if (!r.ok) {
            alerta(AREA, `definirResponsavelArea(${primeiro.email}) — ${r.erro}`)
          } else {
            ok(AREA, `"${area.nome}": ${primeiro.email} é RESPONSAVEL (rótulo, não poder)`)
          }
        }
      }
    }
  })
})

describe('Fase 4b — projetos e campanhas da área', () => {
  it('cria projeto, adiciona participantes e registra realizado', async () => {
    const AREA = 'projetos/seed'
    const { criarProjeto, adicionarParticipanteProjeto, registrarRealizadoProjeto } = await import(
      '@/app/portal/departamentos/projetos-actions'
    )

    for (const area of areasCriadas) {
      const admin = adminPorTenant.get(area.tenantSlug)
      if (!admin) continue

      const titulo = `${MARCA_JORNADA} Campanha do Agasalho`
      const formProjeto = new FormData()
      formProjeto.append('departamentoId', area.departamentoId)
      formProjeto.append('slug', area.departamentoSlug)
      formProjeto.append('titulo', titulo)
      formProjeto.append('descricao', 'Projeto do lote de jornadas — arrecadação de agasalhos.')
      formProjeto.append('tipo', 'CAMPANHA')
      // `StatusProjeto` é PLANEJADO | ATIVO | CONCLUIDO | CANCELADO.
      formProjeto.append('status', 'ATIVO')
      formProjeto.append('areaId', area.id)
      formProjeto.append('inicio', new Date().toISOString().slice(0, 10))
      formProjeto.append('fim', '')
      formProjeto.append('metaQuantidade', '500')
      formProjeto.append('metaUnidade', 'peças')
      formProjeto.append('orcamentoPrevisto', '2500')
      formProjeto.append('responsavelId', '')
      formProjeto.append('recorrenteAnual', 'on')

      const rProjeto = await comoUsuario(
        admin.userId,
        () => tentativaComRetry(() => criarProjeto({}, formProjeto)),
        area.tenantSlug,
      )
      if (!rProjeto.ok) {
        erro(AREA, `criarProjeto em "${area.nome}" (${area.tenantSlug}) — ${rProjeto.erro}`)
        continue
      }

      const projeto: { id: string; titulo: string } | null = await db.projeto.findFirst({
        where: { departamentoId: area.departamentoId, titulo },
        select: { id: true, titulo: true },
      })
      if (!projeto) {
        erro(AREA, `Projeto "${titulo}" não encontrado após sucesso da action`)
        continue
      }
      ok(AREA, `${area.tenantSlug}: projeto "${projeto.titulo}" criado em "${area.nome}"`)

      // Participantes: os mesmos que estão na área. Participar também não pode
      // conceder permissão — é a segunda metade da regra.
      const naArea: { userId: string }[] = await db.departamentoAreaMembro.findMany({
        where: { areaId: area.id },
        select: { userId: true },
      })
      let participantes = 0
      for (const m of naArea) {
        const r = await comoUsuario(
          admin.userId,
          () =>
            tentativaComRetry(() =>
              adicionarParticipanteProjeto(
                area.departamentoId,
                projeto.id,
                area.departamentoSlug,
                m.userId,
              ),
            ),
          area.tenantSlug,
        )
        if (r.ok) participantes += 1
      }
      ok(AREA, `"${projeto.titulo}": ${participantes}/${naArea.length} participante(s)`)

      const formRealizado = new FormData()
      formRealizado.append('departamentoId', area.departamentoId)
      formRealizado.append('projetoId', projeto.id)
      formRealizado.append('slug', area.departamentoSlug)
      formRealizado.append('realizado', '180')
      const rReal = await comoUsuario(
        admin.userId,
        () => tentativaComRetry(() => registrarRealizadoProjeto({}, formRealizado)),
        area.tenantSlug,
      )
      if (!rReal.ok) {
        alerta(AREA, `registrarRealizadoProjeto("${projeto.titulo}") — ${rReal.erro}`)
      } else {
        ok(AREA, `"${projeto.titulo}": 180/500 peças registradas`)
      }
    }
  })
})
