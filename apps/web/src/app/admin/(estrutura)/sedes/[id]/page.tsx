import { db } from '@torcida/db'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
  formatNomeTorcida,
} from '@torcida/types'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EditarSedeForm } from '@/components/admin/sede-forms'
import { PromoverSedeButton } from '@/components/admin/promover-sede-button'
import { AdminDetailHeader, KpiGrid, StatCard } from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { labelTipoUnidade } from '@/lib/canais-shared'
import { Badge } from '@torcida/ui'
import { Calendar, MapPin, Users } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Sede' }

export default async function EditarSedePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const authz = await assertPermission(PERMISSIONS.SEDES_MANAGE).catch(() => null)
  if (!authz) redirect('/admin')
  const { session, tenant } = authz

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
    streetViewHeading: number | null
    streetViewPitch: number | null
    streetViewFov: number | null
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
        streetViewHeading: true,
        streetViewPitch: true,
        streetViewFov: true,
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

  // Caso B: pai pode estar no tenant da torcida principal (fora deste host).
  type PaiHerdadoLite = {
    id: string
    nome: string
    tipo: string
    tenantNome: string
  }
  let paiHerdado: PaiHerdadoLite | null = null
  if (sede.sedeId) {
    const pai: {
      id: string
      nome: string
      tipo: string
      tenantId: string | null
      tenant: { nome: string } | null
    } | null = await db.sede.findUnique({
      where: { id: sede.sedeId },
      select: {
        id: true,
        nome: true,
        tipo: true,
        tenantId: true,
        tenant: { select: { nome: true } },
      },
    })
    if (pai?.tenantId && pai.tenantId !== tenant.id && pai.tenant) {
      paiHerdado = {
        id: pai.id,
        nome: pai.nome,
        tipo: pai.tipo,
        tenantNome: formatNomeTorcida(pai.tenant.nome),
      }
    }
  }

  const candidatos = candidatosRaw.map((m) => ({
    id: m.userId,
    nome: m.user.nome ?? m.nome,
    email: m.user.email,
  }))
  const semCoords = sede.lat == null || sede.lng == null
  const localResumo = [sede.cidade, sede.estado].filter(Boolean).join(' · ')

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
    <div className="space-y-6">
      <AdminDetailHeader
        title={sede.nome}
        backHref="/admin/sedes"
        backLabel="Unidades"
        icon={<MapPin className="h-5 w-5" />}
        description={localResumo || undefined}
        badges={
          <>
            <Badge variant="info">{labelTipoUnidade(sede.tipo)}</Badge>
            <Badge variant={sede.ativa ? 'success' : 'neutral'}>
              {sede.ativa ? 'Ativa' : 'Inativa'}
            </Badge>
            {paiHerdado ? (
              <Badge variant="neutral">PDE de {paiHerdado.tenantNome}</Badge>
            ) : null}
          </>
        }
      />

      <div className="space-y-6">
        {paiHerdado && (
          <MotionReveal index={0}>
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Hierarquia: PDE afiliado à torcida principal{' '}
                <span className="font-semibold text-[rgb(var(--foreground))]">
                  {paiHerdado.tenantNome}
                </span>{' '}
                via [{paiHerdado.tipo === 'SEDE' ? 'Sede' : 'Subsede'}] {paiHerdado.nome}.
              </p>
            </div>
          </MotionReveal>
        )}

        {semCoords && (
          <MotionReveal index={0}>
            <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Sem coordenadas no mapa
                </p>
                <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/90">
                  Na etapa Localização, cole um link do Google Maps, busque o local ou geocodifique
                  o endereço para aparecer no portal.
                </p>
              </div>
            </div>
          </MotionReveal>
        )}

        <KpiGrid cols={3} className="grid gap-3 sm:grid-cols-3">
          <StatCard
            compact
            label="Membros aprovados"
            value={membrosCount}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            compact
            label="Filhos ativos"
            value={filhosAtivos}
            icon={<MapPin className="h-4 w-4" />}
            badge={
              filhosAtivos > 0
                ? 'Desativar exige desativar/reatribuir os filhos'
                : undefined
            }
            badgeTone="default"
          />
          <StatCard
            compact
            label="Próximos eventos"
            value={`${eventos.length}${eventos.length === 5 ? '+' : ''}`}
            icon={<Calendar className="h-4 w-4" />}
          />
        </KpiGrid>

        {eventos.length > 0 && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
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

        <MotionReveal index={1}>
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
              streetViewHeading: sede.streetViewHeading,
              streetViewPitch: sede.streetViewPitch,
              streetViewFov: sede.streetViewFov,
              ativa: sede.ativa,
            }}
            sedes={todasSedes}
            candidatos={candidatos}
            paiHerdado={paiHerdado}
          />
        </MotionReveal>
      </div>
    </div>
  )
}
