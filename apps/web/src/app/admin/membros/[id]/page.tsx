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
    planoAssociacao: { nome: string } | null
    departamento: { id: string; nome: string } | null
    user: { email: string | null }
  }

  const membro: MembroRow | null = await db.saasMembro.findFirst({
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
      planoAssociacao: { select: { nome: true } },
      departamento: { select: { id: true, nome: true } },
      user: { select: { email: true } },
    },
  })

  if (!membro) notFound()

  const [planos, sedes]: [
    { id: string; nome: string }[],
    { id: string; nome: string; tipo: string }[],
  ] = await Promise.all([
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
  ])

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  let podeDesligar = isSuperAdmin
  let podeReatribuirSede = isSuperAdmin
  if (session.user.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    if (!podeDesligar) {
      podeDesligar = hasPermission(effective, PERMISSIONS.MEMBERS_DISMISS)
    }
    if (!podeReatribuirSede) {
      podeReatribuirSede = hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/admin/membros"
        className="inline-flex items-center gap-1 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar à lista
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[rgb(var(--foreground))]">{membro.nome}</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {membro.tipo} · {membro.status}
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
                <span className="text-green-600 dark:text-green-400">Adimplente</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">Inadimplente</span>
              )}
            </p>
          </div>
        </div>
        <MemberActions
          membroId={membro.id}
          status={membro.status as 'PENDENTE' | 'APROVADO' | 'REPROVADO'}
          departamentoNome={membro.departamento?.nome}
        />
      </div>

      {membro.desligadoMotivo && (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Motivo do desligamento: {membro.desligadoMotivo}
        </p>
      )}

      <AdminMembroSedeForm
        membroId={membro.id}
        sedeIdAtual={membro.sedeId}
        sedes={sedes}
        canEdit={podeReatribuirSede}
      />

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
      />
    </div>
  )
}
