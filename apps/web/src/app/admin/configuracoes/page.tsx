import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Settings, Palette, MessageSquare, Shield, Users2 } from 'lucide-react'
import {
  PerfilTenantForm,
  DiscordForm,
  RolesManager,
  DepartamentosManager,
} from '@/components/admin/config-forms'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações — Admin' }

export default async function ConfiguracoesPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant || !session?.user?.id) redirect('/')

  // Quantos usuários usam cada cargo — controla o botão de excluir na UI
  interface UsoPorRole {
    roleId: string
    _count: { roleId: number }
  }
  const usoPorRole: UsoPorRole[] = await db.userRole.groupBy({
    by: ['roleId'],
    where: { tenantId: tenant.id },
    _count: { roleId: true },
  })
  const usoMap = new Map(usoPorRole.map((u) => [u.roleId, u._count.roleId]))

  const [rolesRaw, departamentos, isOwner] = await Promise.all([
    db.role.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isSystem: 'desc' }, { ordem: 'asc' }, { nome: 'asc' }],
    }),
    db.departamento.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    }),
    db.userRole.findFirst({
      where: {
        userId: session.user.id,
        tenantId: tenant.id,
        role: { isSystem: true, nome: 'owner' },
      },
    }),
  ])

  const roles = rolesRaw.map((role: (typeof rolesRaw)[number]) => ({
    ...role,
    emUso: usoMap.get(role.id) ?? 0,
  }))

  const sections = [
    {
      id: 'perfil',
      icon: Palette,
      title: 'Perfil da torcida',
      description: 'Nome e identidade visual da plataforma',
      ownerOnly: true,
    },
    {
      id: 'discord',
      icon: MessageSquare,
      title: 'Integração Discord',
      description: 'Vincule o servidor Discord para sincronizar membros e comandos do bot',
      ownerOnly: true,
    },
    {
      id: 'cargos',
      icon: Shield,
      title: 'Cargos e permissões',
      description: 'Gerencie os cargos disponíveis e as permissões de cada um',
      ownerOnly: false,
    },
    {
      id: 'departamentos',
      icon: Users2,
      title: 'Departamentos',
      description: 'Agrupamentos organizacionais (Diretoria, Sócio, Torcedor...) — não concedem permissão, servem para organizar e escopar gestão',
      ownerOnly: false,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-8 py-5">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Configurações</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">

          {sections.map((section) => {
            const Icon = section.icon
            const blocked = section.ownerOnly && !isOwner

            return (
              <div
                key={section.id}
                className={[
                  'overflow-hidden rounded-2xl border bg-[rgb(var(--surface))]',
                  blocked
                    ? 'border-[rgb(var(--border))] opacity-60'
                    : 'border-[rgb(var(--border))]',
                ].join(' ')}
              >
                {/* Cabeçalho da seção */}
                <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--surface))] border border-[rgb(var(--border))]">
                    <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-[rgb(var(--foreground))]">
                        {section.title}
                      </h2>
                      {section.ownerOnly && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          Somente owner
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                      {section.description}
                    </p>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="px-6 py-5">
                  {blocked ? (
                    <p className="text-sm text-[rgb(var(--foreground-muted))]">
                      Apenas o owner da torcida pode alterar esta configuração.
                    </p>
                  ) : section.id === 'perfil' ? (
                    <PerfilTenantForm
                      nome={tenant.nome}
                      corPrimaria={tenant.corPrimaria}
                    />
                  ) : section.id === 'discord' ? (
                    <DiscordForm discordGuildId={tenant.discordGuildId ?? null} />
                  ) : section.id === 'cargos' ? (
                    <RolesManager roles={roles} />
                  ) : section.id === 'departamentos' ? (
                    <DepartamentosManager departamentos={departamentos} />
                  ) : null}
                </div>
              </div>
            )
          })}

          {/* Info de plano */}
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden">
            <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                <Settings className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              </div>
              <div>
                <h2 className="font-semibold text-[rgb(var(--foreground))]">Plano atual</h2>
                <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                  Informações da sua assinatura
                </p>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[rgb(var(--foreground))]">
                    {tenant.plano === 'FREE'
                      ? 'Gratuito'
                      : tenant.plano === 'BASIC'
                      ? 'Básico'
                      : 'Premium'}
                  </p>
                  <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                    {tenant.plano === 'FREE'
                      ? 'Recursos limitados — faça upgrade para desbloquear tudo'
                      : tenant.plano === 'BASIC'
                      ? 'Acesso a recursos essenciais'
                      : 'Acesso completo a todos os recursos'}
                  </p>
                </div>
                <span
                  className={[
                    'rounded-full px-3 py-1 text-xs font-bold',
                    tenant.plano === 'FREE'
                      ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                      : tenant.plano === 'BASIC'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
                  ].join(' ')}
                >
                  {tenant.plano}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
