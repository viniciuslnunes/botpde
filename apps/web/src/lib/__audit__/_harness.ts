/**
 * Peças comuns das auditorias funcionais (`*.audit.ts`).
 *
 * O que NÃO mora aqui: os `vi.mock` de sessão/tenant. `vi.mock` é içado pelo
 * Vitest por arquivo — mover para cá faria o mock não valer no arquivo de
 * teste. Cada auditoria declara os seus e injeta o setter de sessão em
 * `criarAjudantes`.
 *
 * `fluxos.audit.ts` ainda carrega a própria cópia destas peças; migrar quando
 * for mexer nele de novo, para não invalidar uma rodada já conferida.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }

/** Reversão pendente — executada na ordem inversa no fim da auditoria. */
export type Reversao = { descricao: string; desfazer: () => Promise<void> }

export type Coletor = {
  achados: Achado[]
  limpeza: Reversao[]
  erro: (area: string, msg: string) => void
  alerta: (area: string, msg: string) => void
  ok: (area: string, msg: string) => void
  /** Empilha uma reversão. Chame ANTES de mutar, com o estado já capturado. */
  aoDesfazer: (descricao: string, desfazer: () => Promise<void>) => void
  /** Roda as reversões (ordem inversa) e escreve o relatório em disco. */
  encerrar: (titulo: string, arquivo: string) => Promise<void>
}

export function criarColetor(): Coletor {
  const achados: Achado[] = []
  const limpeza: Reversao[] = []

  const push = (nivel: Achado['nivel']) => (area: string, msg: string) =>
    void achados.push({ nivel, area, msg })

  return {
    achados,
    limpeza,
    erro: push('ERRO'),
    alerta: push('ALERTA'),
    ok: push('ok'),
    aoDesfazer: (descricao, desfazer) => void limpeza.push({ descricao, desfazer }),
    async encerrar(titulo, arquivo) {
      for (const item of [...limpeza].reverse()) {
        try {
          await item.desfazer()
        } catch (e) {
          achados.push({
            nivel: 'ERRO',
            area: 'limpeza',
            msg: `Falhou ao reverter "${item.descricao}": ${e instanceof Error ? e.message : e}`,
          })
        }
      }

      const linhas: string[] = ['', `══════ ${titulo} ══════`]
      for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
        const itens = achados.filter((a) => a.nivel === nivel)
        const rotulo =
          nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ Conformes'
        linhas.push('', `${rotulo}: ${itens.length}`)
        for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
      }
      linhas.push('', `🧹 Reversões executadas: ${limpeza.length}`)
      const relatorio = linhas.join('\n')
      process.stdout.write(`${relatorio}\n`)
      writeFileSync(join(process.cwd(), arquivo), `${relatorio}\n`, 'utf8')
    },
  }
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }

function isRedirectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const digest = (error as { digest?: string }).digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}

/**
 * Executa e devolve o erro em vez de propagar. O padrão das actions varia:
 * umas lançam, outras devolvem `{ error }` — as duas formas viram `ok: false`.
 * `redirect()` do Next (digest NEXT_REDIRECT) conta como sucesso.
 */
export async function tentativa<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    const valor = await fn()
    if (valor && typeof valor === 'object') {
      const obj = valor as { error?: string; ok?: boolean }
      if (obj.error) return { ok: false, erro: String(obj.error) }
      if (obj.ok === false) return { ok: false, erro: String(obj.error ?? 'recusado sem mensagem') }
    }
    return { ok: true, valor }
  } catch (e) {
    if (isRedirectError(e)) return { ok: true, valor: undefined as T }
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

type Db = typeof import('@torcida/db').db

/**
 * Ajudantes que dependem do banco e da sessão simulada. `setSessao` é o
 * setter da variável que o `vi.mock('@/lib/auth')` do arquivo de teste lê.
 */
export function criarAjudantes(
  db: Db,
  setSessao: (s: { user: { id: string; email: string; name: string } } | null) => void,
  getSessao: () => { user: { id: string; email: string; name: string } } | null,
) {
  /** Roda `fn` com o usuário "logado" — restaura a sessão anterior ao sair. */
  async function comoUsuario<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const user: { id: string; email: string; nome: string | null } | null = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, nome: true },
    })
    if (!user) throw new Error(`Usuário ${userId} não encontrado`)
    const anterior = getSessao()
    setSessao({ user: { id: user.id, email: user.email, name: user.nome ?? 'Teste' } })
    try {
      return await fn()
    } finally {
      setSessao(anterior)
    }
  }

  /**
   * Ator do tenant com a permissão pedida **e** cujo tenant ativo é esse mesmo
   * tenant — a action resolve o tenant pelo vínculo do ator, então um ator com
   * outro tenant ativo mutaria a torcida errada. Considera cargos e gestores de
   * área (em torcida com Role defasado, quem ainda tem a permissão é o gestor).
   */
  async function atorComPermissao(tenantId: string, permissao: string): Promise<string | null> {
    const { calculateEffectivePermissions, hasPermission } = await import('@torcida/types')
    const { getUserPermissionsInTenant, getActiveTenant } = await import('@/lib/tenant')
    const { isSuperAdminEmail } = await import('@/lib/tenant-context')

    const porCargo: { userId: string; user: { email: string } | null }[] = await db.userRole.findMany({
      where: { tenantId },
      select: { userId: true, user: { select: { email: true } } },
      take: 40,
    })
    const porGestoria: { userId: string; user: { email: string } | null }[] =
      await db.departamentoGestor.findMany({
        where: { departamento: { tenantId } },
        select: { userId: true, user: { select: { email: true } } },
        take: 20,
      })

    const vistos = new Set<string>()
    for (const c of [...porCargo, ...porGestoria]) {
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

  /** Conjunto efetivo de permissões do usuário no tenant (cargos + overrides). */
  async function permissoesEfetivas(tenantId: string, userId: string): Promise<string[]> {
    const { calculateEffectivePermissions } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')
    const bruto = await getUserPermissionsInTenant(userId, tenantId)
    return calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
  }

  /** Membro aprovado, ativo e canônico (não espelhado) — o ator "de verdade". */
  async function membrosAprovados(
    tenantId: string,
    quantos: number,
    opcoes: { tipo?: 'SOCIO' | 'TORCEDOR'; sufixoEmail?: string; excluir?: string[] } = {},
  ): Promise<string[]> {
    const linhas: { userId: string }[] = await db.saasMembro.findMany({
      where: {
        tenantId,
        status: 'APROVADO',
        desligadoEm: null,
        espelhado: false,
        membroOrigemId: null,
        ...(opcoes.tipo ? { tipo: opcoes.tipo } : {}),
        ...(opcoes.excluir?.length ? { userId: { notIn: opcoes.excluir } } : {}),
        ...(opcoes.sufixoEmail ? { user: { email: { endsWith: opcoes.sufixoEmail } } } : {}),
      },
      select: { userId: true },
      orderBy: { criadoEm: 'asc' },
      take: quantos,
    })
    return linhas.map((l) => l.userId)
  }

  return { comoUsuario, atorComPermissao, permissoesEfetivas, membrosAprovados }
}
