import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminSociosClient } from './admin-socios-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sócios — Admin' }

const POR_PAGINA = 20

type StatusFiltro = 'aguardando' | 'todos' | 'ativos' | 'vencendo' | 'vencidos'

function parseStatus(raw: string): StatusFiltro | '' {
  if (
    raw === 'aguardando' ||
    raw === 'todos' ||
    raw === 'ativos' ||
    raw === 'vencendo' ||
    raw === 'vencidos'
  ) {
    return raw
  }
  return ''
}

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; pagina?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const busca = params.q?.trim() ?? ''
  const statusRaw = parseStatus(params.status ?? '')
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const now = new Date()
  const em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const numeroBusca = parseInt(busca, 10)

  let podeEmitir = isSuperAdminEmail(session.user.email)
  if (!podeEmitir && session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeEmitir = hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE)
  }

  // Anti-join via User.socios — evita NOT IN gigante em tenants grandes
  const elegivelWhere = {
    tenantId: tenant.id,
    status: 'APROVADO' as const,
    tipo: 'SOCIO' as const,
    user: { socios: { none: { tenantId: tenant.id } } },
  }

  const [emitidas, ativos, vencendo, vencidos, aguardando] = await Promise.all([
    db.saasSocio.count({ where: { tenantId: tenant.id } }),
    db.saasSocio.count({
      where: { tenantId: tenant.id, validade: { gte: now } },
    }),
    db.saasSocio.count({
      where: {
        tenantId: tenant.id,
        validade: { gt: now, lt: em30dias },
      },
    }),
    db.saasSocio.count({
      where: { tenantId: tenant.id, validade: { lt: now } },
    }),
    db.saasMembro.count({ where: elegivelWhere }),
  ])

  const contagens = { emitidas, ativos, vencendo, vencidos, aguardando }

  const statusFiltro: StatusFiltro =
    statusRaw ||
    (aguardando > 0 && emitidas === 0 ? 'aguardando' : 'todos')

  const isAguardando = statusFiltro === 'aguardando'

  type SocioRow = {
    id: string
    userId: string
    numeroSocio: number
    nome: string
    validade: Date
    user: { email: string | null; avatarUrl: string | null }
  }

  type ElegivelRow = {
    id: string
    userId: string
    nome: string
    discordTag: string | null
    telefone: string | null
    cidade: string | null
    aprovadoEm: Date | null
    user: { avatarUrl: string | null }
    sede: { nome: string } | null
  }

  let socios: SocioRow[] = []
  let elegiveis: ElegivelRow[] = []
  let totalLista = 0

  if (isAguardando) {
    const elegivelBuscaWhere = {
      ...elegivelWhere,
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
    const [rows, total] = await Promise.all([
      db.saasMembro.findMany({
        where: elegivelBuscaWhere,
        select: {
          id: true,
          userId: true,
          nome: true,
          discordTag: true,
          telefone: true,
          cidade: true,
          aprovadoEm: true,
          user: { select: { avatarUrl: true } },
          sede: { select: { nome: true } },
        },
        orderBy: [{ aprovadoEm: 'desc' }, { nome: 'asc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      db.saasMembro.count({ where: elegivelBuscaWhere }),
    ])
    elegiveis = rows
    totalLista = total
  } else {
    const validadeWhere =
      statusFiltro === 'ativos'
        ? { validade: { gte: now } }
        : statusFiltro === 'vencidos'
          ? { validade: { lt: now } }
          : statusFiltro === 'vencendo'
            ? { validade: { gt: now, lt: em30dias } }
            : {}

    const socioWhere = {
      tenantId: tenant.id,
      ...validadeWhere,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' as const } },
              ...(!Number.isNaN(numeroBusca)
                ? [{ numeroSocio: numeroBusca }]
                : []),
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      db.saasSocio.findMany({
        where: socioWhere,
        select: {
          id: true,
          userId: true,
          numeroSocio: true,
          nome: true,
          validade: true,
          user: { select: { email: true, avatarUrl: true } },
        },
        orderBy: { numeroSocio: 'asc' },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      db.saasSocio.count({ where: socioWhere }),
    ])
    socios = rows
    totalLista = total
  }

  // Opções leves do modal de emissão (cap) — só se pode emitir
  type OptRow = {
    id: string
    userId: string
    nome: string
    discordTag: string | null
    cidade: string | null
    telefone: string | null
    aprovadoEm: Date | null
    user: { avatarUrl: string | null }
    sede: { nome: string } | null
  }
  const elegiveisModal: OptRow[] = podeEmitir
    ? await db.saasMembro.findMany({
        where: elegivelWhere,
        select: {
          id: true,
          userId: true,
          nome: true,
          discordTag: true,
          cidade: true,
          telefone: true,
          aprovadoEm: true,
          user: { select: { avatarUrl: true } },
          sede: { select: { nome: true } },
        },
        orderBy: { nome: 'asc' },
        take: 300,
      })
    : []

  const totalPaginas = Math.max(1, Math.ceil(totalLista / POR_PAGINA))

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = {
      status: statusFiltro,
      q: busca,
      pagina: String(pagina),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v || v === 'todos' || v === '1') continue
      if (k === 'pagina' && v === '1') continue
      p.set(k, v)
    }
    const qs = p.toString()
    return `/admin/socios${qs ? `?${qs}` : ''}`
  }

  function mapElegivel(m: OptRow | ElegivelRow) {
    return {
      userId: m.userId,
      membroId: m.id,
      nome: m.nome,
      discordTag: m.discordTag,
      telefone: m.telefone,
      cidade: m.cidade,
      avatarUrl: m.user.avatarUrl,
      sedeNome: m.sede?.nome ?? null,
      departamentoNome: null as string | null,
      aprovadoEmLabel: m.aprovadoEm
        ? m.aprovadoEm.toLocaleDateString('pt-BR')
        : null,
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AdminSociosClient
        socios={socios.map((s) => ({
          id: s.id,
          userId: s.userId,
          numeroSocio: s.numeroSocio,
          nome: s.nome,
          validadeIso: s.validade.toISOString().split('T')[0] ?? '',
          validadeLabel: s.validade.toLocaleDateString('pt-BR'),
          email: s.user.email,
          avatarUrl: s.user.avatarUrl,
          vencida: s.validade < now,
          vencendo: s.validade > now && s.validade < em30dias,
        }))}
        elegiveis={elegiveis.map(mapElegivel)}
        elegiveisModal={elegiveisModal.map(mapElegivel)}
        contagens={contagens}
        statusFiltro={statusFiltro}
        busca={busca}
        podeEmitir={podeEmitir}
      />

      {totalPaginas > 1 && (
        <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-3">
          <div className="app-container flex items-center justify-between text-sm">
            <p className="text-[rgb(var(--foreground-muted))]">
              Página {pagina} de {totalPaginas}
              {totalLista > 0 ? ` · ${totalLista} resultado${totalLista !== 1 ? 's' : ''}` : ''}
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
        </div>
      )}
    </div>
  )
}
