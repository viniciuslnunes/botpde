import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EditarSedeForm } from '@/components/admin/sede-forms'
import { PromoverSedeButton } from '@/components/admin/promover-sede-button'
import { ArrowLeft, Calendar, MapPin, Users } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Sede' }

export default async function EditarSedePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    await assertPermission(PERMISSIONS.SEDES_MANAGE)
  } catch {
    redirect('/admin')
  }

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/portal')

  type SedeEdit = {
    id: string
    nome: string
    tipo: string
    sedeId: string | null
    endereco: string | null
    cidade: string | null
    estado: string | null
    cep: string | null
    capacidade: number | null
    responsavel: string | null
    responsavelUserId: string | null
    telefone: string | null
    horarios: string | null
    descricao: string | null
    fotoUrl: string | null
    lat: number | null
    lng: number | null
    ativa: boolean
    tenantId: string | null
  }

  const agora = new Date()

  const [sede, todasSedes, membrosCount, filhosAtivos, eventos, candidatosRaw]: [
    SedeEdit | null,
    Array<{ id: string; nome: string; tipo: string }>,
    number,
    number,
    Array<{ id: string; titulo: string; data: Date }>,
    Array<{ userId: string; nome: string; user: { nome: string | null; email: string | null } }>,
  ] = await Promise.all([
    db.sede.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        sedeId: true,
        endereco: true,
        cidade: true,
        estado: true,
        cep: true,
        capacidade: true,
        responsavel: true,
        responsavelUserId: true,
        telefone: true,
        horarios: true,
        descricao: true,
        fotoUrl: true,
        lat: true,
        lng: true,
        ativa: true,
        tenantId: true,
      },
    }),
    db.sede.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, nome: true, tipo: true },
      orderBy: { nome: 'asc' },
    }),
    db.saasMembro.count({
      where: { tenantId: tenant.id, sedeId: id, status: 'APROVADO' },
    }),
    db.sede.count({
      where: { tenantId: tenant.id, sedeId: id, ativa: true },
    }),
    db.evento.findMany({
      where: { tenantId: tenant.id, sedeId: id, data: { gte: agora } },
      orderBy: { data: 'asc' },
      take: 5,
      select: { id: true, titulo: true, data: true },
    }),
    db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO' },
      orderBy: { nome: 'asc' },
      take: 200,
      select: {
        userId: true,
        nome: true,
        user: { select: { nome: true, email: true } },
      },
    }),
  ])

  if (!sede || sede.tenantId !== tenant.id) notFound()

  const candidatos = candidatosRaw.map((m) => ({
    id: m.userId,
    nome: m.user.nome ?? m.nome,
    email: m.user.email,
  }))
  const semCoords = sede.lat == null || sede.lng == null

  let podePromoverUi = false
  if (
    sede.ativa &&
    (sede.tipo === 'SUBSEDE' || sede.tipo === 'PONTO_ENCONTRO') &&
    sede.tenantId === tenant.id
  ) {
    if (isSuperAdminEmail(session.user.email)) {
      podePromoverUi = true
    } else if (session.user.id) {
      const { rolePermissions, overrides } = await getUserPermissionsInTenant(
        session.user.id,
        tenant.id,
      )
      const effective = calculateEffectivePermissions(rolePermissions, overrides)
      const temSede = await db.sede.findFirst({
        where: { tenantId: tenant.id, tipo: 'SEDE' },
        select: { id: true },
      })
      podePromoverUi =
        Boolean(temSede) && hasPermission(effective, PERMISSIONS.TORCIDA_GLOBAL_VIEW)
    }
  }

  return (
    <div className="app-container space-y-6 py-8">
      <div>
        <Link
          href="/admin/sedes"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para sedes
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Editar sede</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{sede.nome}</p>
        {semCoords && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Sem coordenadas — use “Geocodificar endereço” para aparecer no mapa do portal.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
            <Users className="h-3.5 w-3.5" />
            Membros aprovados
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {membrosCount}
          </p>
        </div>
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-3.5 w-3.5" />
            Filhos ativos
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {filhosAtivos}
          </p>
          {filhosAtivos > 0 && (
            <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
              Desativar esta unidade exige desativar/reatribuir os filhos
            </p>
          )}
        </div>
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
            <Calendar className="h-3.5 w-3.5" />
            Próximos eventos
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {eventos.length}
            {eventos.length === 5 ? '+' : ''}
          </p>
        </div>
      </div>

      {eventos.length > 0 && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Agenda nesta unidade
          </h2>
          <ul className="space-y-1.5">
            {eventos.map((evento) => (
              <li key={evento.id}>
                <Link
                  href={`/admin/eventos/${evento.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-[rgb(var(--background-subtle))]"
                >
                  <span className="truncate font-medium text-[rgb(var(--foreground))]">
                    {evento.titulo}
                  </span>
                  <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(evento.data)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {podePromoverUi && <PromoverSedeButton sedeId={sede.id} sedeNome={sede.nome} />}

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <EditarSedeForm
          sede={{
            id: sede.id,
            nome: sede.nome,
            tipo: sede.tipo,
            sedeId: sede.sedeId,
            endereco: sede.endereco,
            cidade: sede.cidade,
            estado: sede.estado,
            cep: sede.cep,
            capacidade: sede.capacidade,
            responsavel: sede.responsavel,
            responsavelUserId: sede.responsavelUserId,
            telefone: sede.telefone,
            horarios: sede.horarios,
            descricao: sede.descricao,
            fotoUrl: sede.fotoUrl,
            lat: sede.lat,
            lng: sede.lng,
            ativa: sede.ativa,
          }}
          sedes={todasSedes}
          candidatos={candidatos}
        />
      </div>
    </div>
  )
}
