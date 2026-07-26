import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { AdminMembroLgeForm } from '../admin-membro-lge-form'
import { AdminMembroSedeForm } from '../admin-membro-sede-form'
import { MemberActions } from '@/components/admin/member-actions'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { StatusBadge } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Membro — Admin' }

type Props = { params: Promise<{ id: string }> }

export default async function MembroDetalhePage({ params }: Props) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.MEMBERS_APPROVE,
    ]))
  } catch {
    redirect('/admin')
  }

  const { id } = await params

  type MembroRow = {
    id: string
    nome: string
    tipo: string
    status: string
    cidade: string | null
    telefone: string | null
    adimplente: boolean
    desligadoEm: Date | null
    desligadoMotivo: string | null
    rg: string | null
    cpf: string | null
    filiacao: string | null
    escolaridade: string | null
    profissao: string | null
    dataNascimento: Date | null
    planoAssociacaoId: string | null
    sedeId: string | null
    espelhado: boolean
    aprovadoNaUnidadeTenantId: string | null
    planoAssociacao: { nome: string } | null
    departamento: { id: string; nome: string } | null
    user: { email: string | null }
  }

  // Membro, planos, sedes e permissões são independentes → um round-trip.
  const [membro, planos, sedes, perms]: [
    MembroRow | null,
    { id: string; nome: string }[],
    { id: string; nome: string; tipo: string }[],
    Awaited<ReturnType<typeof getUserPermissionsInTenant>>,
  ] = await Promise.all([
    db.saasMembro.findFirst({
      where: { id, tenantId: tenant.id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        status: true,
        cidade: true,
        telefone: true,
        adimplente: true,
        desligadoEm: true,
        desligadoMotivo: true,
        rg: true,
        cpf: true,
        filiacao: true,
        escolaridade: true,
        profissao: true,
        dataNascimento: true,
        planoAssociacaoId: true,
        sedeId: true,
        espelhado: true,
        aprovadoNaUnidadeTenantId: true,
        planoAssociacao: { select: { nome: true } },
        departamento: { select: { id: true, nome: true } },
        user: { select: { email: true } },
      },
    }),
    db.planoAssociacao.findMany({
      where: { tenantId: tenant.id, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, tipo: true },
    }),
    getUserPermissionsInTenant(session.user.id, tenant.id),
  ])

  if (!membro) notFound()

  const unidadeOrigem: { nome: string } | null = membro.aprovadoNaUnidadeTenantId
    ? await db.tenant.findFirst({
        where: { id: membro.aprovadoNaUnidadeTenantId },
        select: { nome: true },
      })
    : null
  const aprovadoNaUnidadeNome = unidadeOrigem?.nome ?? null

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  const effective = calculateEffectivePermissions(perms.rolePermissions, perms.overrides)
  const podeDesligar =
    isSuperAdmin || hasPermission(effective, PERMISSIONS.MEMBERS_DISMISS)
  const podeReatribuirSede =
    isSuperAdmin || hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/admin/membros"
        className="inline-flex items-center gap-1 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar à lista
      </Link>

      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-[rgb(var(--foreground))]">
                  {membro.nome}
                </h1>
                <StatusBadge dominio="membro" status={membro.status} />
                {membro.espelhado && (
                  <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                    {aprovadoNaUnidadeNome
                      ? `Aprovado via ${aprovadoNaUnidadeNome}`
                      : 'Espelho da Sede'}
                  </span>
                )}
              </div>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {membro.tipo}
                {membro.departamento ? ` · ${membro.departamento.nome}` : ''}
                {membro.planoAssociacao ? ` · ${membro.planoAssociacao.nome}` : ''}
              </p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {membro.user.email}
                {membro.telefone ? ` · ${membro.telefone}` : ''}
                {membro.cidade ? ` · ${membro.cidade}` : ''}
              </p>
              <p className="mt-1 text-xs">
                {membro.adimplente ? (
                  <span className="text-[rgb(var(--color-success-fg))]">Adimplente</span>
                ) : (
                  <span className="text-[rgb(var(--color-danger-fg))]">Inadimplente</span>
                )}
              </p>
            </div>
          </div>
          <MemberActions
            membroId={membro.id}
            status={membro.status as 'PENDENTE' | 'APROVADO' | 'REPROVADO'}
            departamentoNome={membro.departamento?.nome}
            espelhado={membro.espelhado}
            aprovadoNaUnidadeNome={aprovadoNaUnidadeNome}
          />
        </div>
      </MotionReveal>

      {membro.desligadoMotivo && (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Motivo do desligamento: {membro.desligadoMotivo}
        </p>
      )}

      <MotionReveal index={1}>
        <AdminMembroSedeForm
          membroId={membro.id}
          sedeIdAtual={membro.sedeId}
          sedes={sedes}
          canEdit={podeReatribuirSede}
          espelhado={membro.espelhado}
          aprovadoNaUnidadeNome={aprovadoNaUnidadeNome}
        />
      </MotionReveal>

      <MotionReveal index={2}>
        <AdminMembroLgeForm
          membroId={membro.id}
          initial={{
            rg: membro.rg,
            cpf: membro.cpf,
            filiacao: membro.filiacao,
            escolaridade: membro.escolaridade,
            profissao: membro.profissao,
            dataNascimento: membro.dataNascimento,
            planoAssociacaoId: membro.planoAssociacaoId,
          }}
          planos={planos}
          podeDesligar={podeDesligar}
          desligadoEm={membro.desligadoEm}
          espelhado={membro.espelhado}
          aprovadoNaUnidadeNome={aprovadoNaUnidadeNome}
        />
      </MotionReveal>
    </div>
  )
}
