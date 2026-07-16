import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, UserCheck, UserX, Clock } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { tenantsAreRivais } from '@/lib/hierarquia'
import { AdminMembrosTable, AdminMembrosTabs } from './admin-membros-client'
import { ExportarLgeButton } from './exportar-lge-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Membros — Admin' }

type StatusFilter = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'TODOS'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDENTE: {
    label: 'Pendente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  APROVADO: {
    label: 'Aprovado',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  REPROVADO: {
    label: 'Reprovado',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
}

const TIPO_BADGE: Record<string, string> = {
  SOCIO: 'Sócio',
  TORCEDOR: 'Torcedor',
}

export default async function MembrosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; pagina?: string }>
}) {
  // Gate de leitura: dados de cadastro (comprovante, telefone) são RESTRITOS —
  // esconder o link no menu não basta, a URL direta precisa ser bloqueada.
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const statusFiltro = (params.status as StatusFilter) ?? 'TODOS'
  const busca = params.q ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const porPagina = 20

  const where = {
    tenantId: tenant.id,
    ...(statusFiltro !== 'TODOS' ? { status: statusFiltro } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' as const } },
            { cidade: { contains: busca, mode: 'insensitive' as const } },
            { telefone: { contains: busca } },
            { discordTag: { contains: busca, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [membros, total, contagens] = await Promise.all([
    db.saasMembro.findMany({
      where,
      include: { user: { select: { nome: true, email: true, avatarUrl: true } } },
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    db.saasMembro.count({ where }),
    db.saasMembro.groupBy({
      by: ['status'],
      where: { tenantId: tenant.id },
      _count: true,
    }),
  ])

  const totalPaginas = Math.ceil(total / porPagina)

  // Alerta informativo: sócio (desta página) já aprovado como sócio em torcida
  // rival. Select mínimo — nunca trazer nome/prova de outro tenant; o client
  // recebe só um booleano, sem identificar a torcida rival.
  const userIdsSocios = membros
    .filter((m: (typeof membros)[number]) => m.tipo === 'SOCIO')
    .map((m: (typeof membros)[number]) => m.userId)
  let userIdsComRivalSocio = new Set<string>()
  if (userIdsSocios.length > 0) {
    const sociosOutrosTenants: { userId: string; tenantId: string }[] =
      await db.saasMembro.findMany({
        where: {
          userId: { in: userIdsSocios },
          status: 'APROVADO',
          tipo: 'SOCIO',
          tenantId: { not: tenant.id },
        },
        select: { userId: true, tenantId: true },
      })
    const outrosTenantIds = [...new Set(sociosOutrosTenants.map((s) => s.tenantId))]
    const checagens = await Promise.all(
      outrosTenantIds.map(
        async (id) => [id, await tenantsAreRivais(tenant.id, id)] as const,
      ),
    )
    const tenantsRivais = new Set(checagens.filter(([, rival]) => rival).map(([id]) => id))
    userIdsComRivalSocio = new Set(
      sociosOutrosTenants.filter((s) => tenantsRivais.has(s.tenantId)).map((s) => s.userId),
    )
  }

  // Alerta informativo: sócio (desta página) já foi REPROVADO em recrutamento
  // de OUTRA torcida/clube. Não identifica qual — só a contagem, mesmo padrão
  // de privacidade do alerta de rival acima.
  const reprovacoesOutraTorcidaPorUser = new Map<string, number>()
  if (userIdsSocios.length > 0) {
    const reprovacoesOutrosTenants: { userId: string }[] = await db.saasMembro.findMany({
      where: {
        userId: { in: userIdsSocios },
        status: 'REPROVADO',
        tipo: 'SOCIO',
        tenantId: { not: tenant.id },
      },
      select: { userId: true },
    })
    for (const r of reprovacoesOutrosTenants) {
      reprovacoesOutraTorcidaPorUser.set(
        r.userId,
        (reprovacoesOutraTorcidaPorUser.get(r.userId) ?? 0) + 1,
      )
    }
  }

  // Histórico de tentativas via AuditLog (sem mudar schema): conta solicitações
  // e recupera o motivo da última reprovação para informar a decisão do admin.
  const membroIds = membros.map((m: (typeof membros)[number]) => m.id)
  type LogMembro = {
    entidadeId: string | null
    acao: string
    detalhes: unknown
    criadoEm: Date
  }
  const logsMembros: LogMembro[] =
    membroIds.length > 0
      ? await db.auditLog.findMany({
          where: {
            tenantId: tenant.id,
            entidade: 'SaasMembro',
            entidadeId: { in: membroIds },
            acao: { in: ['CADASTRO_SOLICITADO', 'RECADASTRO_SOLICITADO', 'MEMBRO_REPROVADO'] },
          },
          orderBy: { criadoEm: 'desc' },
          select: { entidadeId: true, acao: true, detalhes: true, criadoEm: true },
        })
      : []
  const tentativasPorMembro = new Map<string, number>()
  const motivoReprovacaoPorMembro = new Map<string, string>()
  for (const log of logsMembros) {
    if (!log.entidadeId) continue
    if (log.acao === 'CADASTRO_SOLICITADO' || log.acao === 'RECADASTRO_SOLICITADO') {
      tentativasPorMembro.set(log.entidadeId, (tentativasPorMembro.get(log.entidadeId) ?? 0) + 1)
    }
    // Logs em ordem decrescente — o primeiro MEMBRO_REPROVADO é o mais recente.
    if (log.acao === 'MEMBRO_REPROVADO' && !motivoReprovacaoPorMembro.has(log.entidadeId)) {
      const detalhes = log.detalhes
      if (
        detalhes &&
        typeof detalhes === 'object' &&
        'motivo' in detalhes &&
        typeof (detalhes as { motivo: unknown }).motivo === 'string'
      ) {
        motivoReprovacaoPorMembro.set(log.entidadeId, (detalhes as { motivo: string }).motivo)
      }
    }
  }

  const count: Record<string, number> = { PENDENTE: 0, APROVADO: 0, REPROVADO: 0 }
  for (const c of contagens) count[c.status] = c._count

  const tabs: { status: StatusFilter; label: string; icon: React.ElementType; count?: number }[] = [
    { status: 'TODOS', label: 'Todos', icon: Users, count: Object.values(count).reduce((a, b) => a + b, 0) },
    { status: 'PENDENTE', label: 'Pendentes', icon: Clock, count: count.PENDENTE },
    { status: 'APROVADO', label: 'Aprovados', icon: UserCheck, count: count.APROVADO },
    { status: 'REPROVADO', label: 'Reprovados', icon: UserX, count: count.REPROVADO },
  ]

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { status: statusFiltro, q: busca, pagina: String(pagina), ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'TODOS' && v !== '' && v !== '1') p.set(k, v)
    }
    return `/admin/membros${p.toString() ? '?' + p.toString() : ''}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Membros</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {total} {total === 1 ? 'resultado' : 'resultados'}
              </p>
            </div>
            <ExportarLgeButton />
          </div>

        <AdminMembrosTabs
          tabs={tabs.map((tab) => ({
            status: tab.status,
            label: tab.label,
            href: buildHref({ status: tab.status, pagina: '1' }),
            active: statusFiltro === tab.status,
            count: tab.count,
            countClass:
              tab.status === 'PENDENTE' && statusFiltro !== tab.status
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : undefined,
          }))}
        />

        {/* Busca */}
        <form method="GET" action="/admin/membros" className="mt-3">
          {statusFiltro !== 'TODOS' && (
            <input type="hidden" name="status" value={statusFiltro} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, cidade, telefone ou Discord..."
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
          />
        </form>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto py-4">
        <div className="app-container">
        <AdminMembrosTable
          membros={membros.map((membro: (typeof membros)[number]) => {
            const badge = STATUS_BADGE[membro.status]
            const isSocio = membro.tipo === 'SOCIO'
            return {
              id: membro.id,
              nome: membro.nome,
              discordTag: membro.discordTag,
              tipo: TIPO_BADGE[membro.tipo] ?? membro.tipo,
              cidade: membro.cidade,
              status: membro.status as 'PENDENTE' | 'APROVADO' | 'REPROVADO',
              statusLabel: badge.label,
              statusClass: badge.className,
              criadoEmLabel: new Date(membro.criadoEm).toLocaleDateString('pt-BR'),
              avatarUrl: membro.user.avatarUrl,
              inicial: membro.nome.charAt(0).toUpperCase(),
              telefone: membro.telefone,
              idade: membro.idade,
              // Prova de vínculo só existe/importa para sócio (dado RESTRITO).
              imagemProva: isSocio ? membro.imagemProva : null,
              numeroAssociado: isSocio ? membro.numeroAssociado : null,
              anosSocio: isSocio ? membro.anosSocio : null,
              alertaRivalSocio: isSocio && userIdsComRivalSocio.has(membro.userId),
              reprovacoesOutraTorcida: isSocio
                ? reprovacoesOutraTorcidaPorUser.get(membro.userId)
                : undefined,
              tentativas: tentativasPorMembro.get(membro.id) ?? 1,
              ultimoMotivoReprovacao: motivoReprovacaoPorMembro.get(membro.id),
            }
          })}
        />

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-[rgb(var(--foreground-muted))]">
              Página {pagina} de {totalPaginas}
            </p>
            <div className="flex gap-2">
              {pagina > 1 && (
                <Link
                  href={buildHref({ pagina: String(pagina - 1) })}
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  ← Anterior
                </Link>
              )}
              {pagina < totalPaginas && (
                <Link
                  href={buildHref({ pagina: String(pagina + 1) })}
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
