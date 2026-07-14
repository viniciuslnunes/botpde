import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EditarSedeForm } from '@/components/admin/sede-forms'
import { ArrowLeft } from 'lucide-react'
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

  const [sede, todasSedes] = await Promise.all([
    db.sede.findUnique({ where: { id } }),
    db.sede.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, nome: true, tipo: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  if (!sede || sede.tenantId !== tenant.id) notFound()

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
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Editar Sede</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{sede.nome}</p>
      </div>

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
            telefone: sede.telefone,
            horarios: sede.horarios,
            descricao: sede.descricao,
            ativa: sede.ativa,
          }}
          sedes={todasSedes.map((s: { id: string; nome: string; tipo: string }) => ({ id: s.id, nome: s.nome, tipo: s.tipo }))}
        />
      </div>
    </div>
  )
}
