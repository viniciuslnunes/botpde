import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { redirect } from 'next/navigation'
import { AdminSociosClient } from './admin-socios-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sócios — Admin' }

function isVencida(validade: Date) {
  return validade < new Date()
}

function isProximaVencer(validade: Date) {
  const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  return validade > new Date() && validade < em30dias
}

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const busca = params.q ?? ''
  const statusRaw = params.status ?? ''

  const todosSocios = await db.saasSocio.findMany({
    where: { tenantId: tenant.id },
    include: {
      user: { select: { email: true, avatarUrl: true } },
    },
    orderBy: { numeroSocio: 'asc' },
  })

  type SocioRow = (typeof todosSocios)[number]
  const userIdsComCarteirinha = todosSocios.map((s: SocioRow) => s.userId)

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
    departamento: { nome: string } | null
  }

  const membrosElegiveis: ElegivelRow[] = await db.saasMembro.findMany({
    where: {
      tenantId: tenant.id,
      status: 'APROVADO',
      tipo: 'SOCIO',
      ...(userIdsComCarteirinha.length > 0
        ? { userId: { notIn: userIdsComCarteirinha } }
        : {}),
    },
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
      departamento: { select: { nome: true } },
    },
    orderBy: [{ aprovadoEm: 'desc' }, { nome: 'asc' }],
  })

  const contagens = {
    emitidas: todosSocios.length,
    ativos: 0,
    vencendo: 0,
    vencidos: 0,
    aguardando: membrosElegiveis.length,
  }
  for (const s of todosSocios) {
    if (isVencida(s.validade)) contagens.vencidos += 1
    else {
      contagens.ativos += 1
      if (isProximaVencer(s.validade)) contagens.vencendo += 1
    }
  }

  // Sem status na URL: prioriza a fila quando ainda não há carteirinhas
  const statusFiltro =
    statusRaw ||
    (contagens.aguardando > 0 && contagens.emitidas === 0 ? 'aguardando' : 'todos')

  const buscaLower = busca.trim().toLowerCase()
  const numeroBusca = parseInt(busca.trim(), 10)

  const sociosAposBusca = !busca.trim()
    ? todosSocios
    : todosSocios.filter((s: SocioRow) => {
        if (s.nome.toLowerCase().includes(buscaLower)) return true
        if (!Number.isNaN(numeroBusca) && s.numeroSocio === numeroBusca) return true
        return false
      })

  const sociosFiltrados = sociosAposBusca.filter((s: SocioRow) => {
    if (statusFiltro === 'ativos') return !isVencida(s.validade)
    if (statusFiltro === 'vencidos') return isVencida(s.validade)
    if (statusFiltro === 'vencendo') return isProximaVencer(s.validade)
    if (statusFiltro === 'aguardando') return false
    return true
  })

  let podeEmitir = isSuperAdminEmail(session.user.email)
  if (!podeEmitir && session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeEmitir = hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE)
  }

  return (
    <div className="flex h-full flex-col">
      <AdminSociosClient
        socios={sociosFiltrados.map((s: SocioRow) => ({
          id: s.id,
          userId: s.userId,
          numeroSocio: s.numeroSocio,
          nome: s.nome,
          validadeIso: s.validade.toISOString().split('T')[0] ?? '',
          validadeLabel: s.validade.toLocaleDateString('pt-BR'),
          email: s.user.email,
          avatarUrl: s.user.avatarUrl,
          vencida: isVencida(s.validade),
          vencendo: isProximaVencer(s.validade),
        }))}
        elegiveis={membrosElegiveis.map((m) => ({
          userId: m.userId,
          membroId: m.id,
          nome: m.nome,
          discordTag: m.discordTag,
          telefone: m.telefone,
          cidade: m.cidade,
          avatarUrl: m.user.avatarUrl,
          sedeNome: m.sede?.nome ?? null,
          departamentoNome: m.departamento?.nome ?? null,
          aprovadoEmLabel: m.aprovadoEm
            ? m.aprovadoEm.toLocaleDateString('pt-BR')
            : null,
        }))}
        contagens={contagens}
        statusFiltro={statusFiltro}
        busca={busca}
        podeEmitir={podeEmitir}
      />
    </div>
  )
}
