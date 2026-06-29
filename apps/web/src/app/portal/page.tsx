import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Meu Portal',
}

export default async function PortalPage() {
  const session = await auth()
  const tenant = await getTenantFromHost()

  const membro = tenant
    ? await db.membro.findUnique({
        where: {
          tenantId_userId: {
            tenantId: tenant.id,
            userId: session!.user!.id,
          },
        },
      })
    : null

  const socio = tenant
    ? await db.socio.findUnique({
        where: {
          tenantId_userId: {
            tenantId: tenant.id,
            userId: session!.user!.id,
          },
        },
      })
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
          Olá, {session?.user?.name?.split(' ')[0] ?? 'torcedor'} 👋
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          {tenant ? `Bem-vindo à ${tenant.nome}` : 'Bem-vindo à plataforma'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card de status do membro */}
        <StatusCard
          titulo="Meu Status"
          valor={
            membro?.status === 'APROVADO'
              ? membro.tipo === 'SOCIO'
                ? 'Sócio'
                : 'Torcedor'
              : membro?.status === 'PENDENTE'
                ? 'Pendente de aprovação'
                : 'Não cadastrado'
          }
          descricao={
            socio ? `Sócio Nº ${socio.numeroSocio}` : undefined
          }
        />

        {/* Mais cards serão adicionados conforme os módulos forem implementados */}
      </div>
    </div>
  )
}

function StatusCard({
  titulo,
  valor,
  descricao,
}: {
  titulo: string
  valor: string
  descricao?: string
}) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {titulo}
      </p>
      <p className="mt-2 text-lg font-semibold text-[rgb(var(--foreground))]">{valor}</p>
      {descricao && (
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{descricao}</p>
      )}
    </div>
  )
}
