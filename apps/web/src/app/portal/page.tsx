import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import Link from 'next/link'
import {
  CreditCard,
  Calendar,
  ShoppingBag,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meu Portal' }

export default async function PortalPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  const userId = session!.user!.id

  const [membro, socio] = await Promise.all([
    tenant
      ? db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId } },
        })
      : null,
    tenant
      ? db.saasSocio.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId } },
        })
      : null,
  ])

  const primeiroNome = session?.user?.name?.split(' ')[0] ?? 'Torcedor'
  const avatarUrl = session?.user?.image

  const statusInfo = resolveStatus(membro)

  const quickAccess = [
    {
      href: '/portal/carteirinha',
      icon: CreditCard,
      label: 'Carteirinha',
      description: socio ? `Sócio Nº ${socio.numeroSocio}` : 'Digital e sempre à mão',
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950',
    },
    {
      href: '/portal/eventos',
      icon: Calendar,
      label: 'Eventos',
      description: 'Partidas, caravanas e mais',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      href: '/portal/loja',
      icon: ShoppingBag,
      label: 'Loja',
      description: 'Camisas, produtos oficiais',
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950',
    },
    {
      href: '/portal/comunidade',
      icon: Users,
      label: 'Comunidade',
      description: 'Feed da torcida',
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
  ]

  return (
    <div className="space-y-6">

      {/* Hero — boas-vindas */}
      <div className="relative overflow-hidden rounded-2xl bg-[rgb(var(--surface))] p-6 shadow-sm ring-1 ring-[rgb(var(--border))]">
        {/* Faixa decorativa de cor primária */}
        <div
          className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
          style={{ backgroundColor: tenant?.corPrimaria ?? '#7c3aed' }}
        />

        <div className="flex items-start gap-4 pt-2">
          {/* Avatar */}
          <div className="shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={primeiroNome}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-[rgb(var(--border))]"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{ backgroundColor: tenant?.corPrimaria ?? '#7c3aed' }}
              >
                {primeiroNome.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Texto */}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">
              Olá, {primeiroNome}!
            </h1>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {tenant ? `Bem-vindo à ${tenant.nome}` : 'Bem-vindo à plataforma'}
            </p>

            {/* Badge de status */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                  statusInfo.badgeClass,
                ].join(' ')}
              >
                <statusInfo.Icon className="h-3.5 w-3.5" />
                {statusInfo.label}
              </span>

              {socio && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-900 dark:text-violet-200">
                  <CreditCard className="h-3.5 w-3.5" />
                  Sócio Nº {socio.numeroSocio}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Aviso de pendência */}
        {membro?.status === 'PENDENTE' && (
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-yellow-50 p-4 dark:bg-yellow-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Cadastro em análise
              </p>
              <p className="mt-0.5 text-xs text-yellow-700 dark:text-yellow-300">
                Sua solicitação foi enviada e está sendo analisada pelos administradores. Em breve você receberá uma resposta.
              </p>
            </div>
          </div>
        )}

        {!membro && (
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-[rgb(var(--background-subtle))] p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                Ainda não é membro
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Solicite seu cadastro para ter acesso completo às funcionalidades da torcida.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Acesso Rápido */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Acesso Rápido
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickAccess.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-all hover:shadow-md hover:ring-1 hover:ring-[rgb(var(--border-strong))]"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                  <Icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[rgb(var(--foreground))]">{item.label}</p>
                  <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{item.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform group-hover:translate-x-0.5" />
              </Link>
            )
          })}
        </div>
      </div>

      {/* Seção de atividade recente — placeholder para módulos futuros */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Próximos eventos */}
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[rgb(var(--foreground))]">Próximos Eventos</h3>
            <Link
              href="/portal/eventos"
              className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
            >
              Ver todos →
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Calendar className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum evento próximo</p>
          </div>
        </div>

        {/* Novidades da comunidade */}
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[rgb(var(--foreground))]">Comunidade</h3>
            <Link
              href="/portal/comunidade"
              className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
            >
              Ver feed →
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Users className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhuma publicação recente</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function resolveStatus(membro: { status: string; tipo: string } | null) {
  if (!membro) {
    return {
      label: 'Não cadastrado',
      Icon: XCircle,
      badgeClass: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
    }
  }
  if (membro.status === 'APROVADO') {
    return {
      label: membro.tipo === 'SOCIO' ? 'Sócio ativo' : 'Torcedor ativo',
      Icon: CheckCircle2,
      badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    }
  }
  if (membro.status === 'PENDENTE') {
    return {
      label: 'Cadastro pendente',
      Icon: Clock,
      badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    }
  }
  return {
    label: 'Cadastro reprovado',
    Icon: XCircle,
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }
}
