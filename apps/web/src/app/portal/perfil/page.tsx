import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { PerfilForm } from '@/components/portal/perfil-form'
import Link from 'next/link'
import {
  UserCircle2,
  Mail,
  Shield,
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Tv2,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meu Perfil' }

export default async function PerfilPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id) redirect('/entrar')

  const [user, membro, socio] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        nome: true,
        email: true,
        avatarUrl: true,
        discordId: true,
        googleId: true,
        criadoEm: true,
      },
    }),
    tenant
      ? db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
          select: { id: true, status: true, tipo: true, nome: true, idade: true, telefone: true, cidade: true, discordTag: true },
        })
      : null,
    tenant
      ? db.saasSocio.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
          select: { numeroSocio: true, validade: true },
        })
      : null,
  ])

  if (!user) redirect('/entrar')

  const avatarUrl = user.avatarUrl ?? session.user.image
  const displayName = user.nome ?? session.user.name ?? 'Usuário'
  const membroNome = membro?.nome ?? displayName

  const statusBadge = () => {
    if (!membro) return null
    const map = {
      APROVADO: { label: 'Membro ativo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', Icon: CheckCircle2 },
      PENDENTE: { label: 'Cadastro pendente', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', Icon: Clock },
      REPROVADO: { label: 'Cadastro reprovado', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', Icon: XCircle },
    }
    const info = map[membro.status as keyof typeof map]
    if (!info) return null
    const Icon = info.Icon
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${info.cls}`}>
        <Icon className="h-3.5 w-3.5" />
        {info.label}
      </span>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Meu Perfil</h1>

      {/* Card de identidade */}
      <div className="relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <div
          className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
          style={{ backgroundColor: tenant?.corPrimaria ?? '#7c3aed' }}
        />

        <div className="flex items-start gap-5 pt-2">
          {/* Avatar */}
          <div className="shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-[rgb(var(--border))]"
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white"
                style={{ backgroundColor: tenant?.corPrimaria ?? '#7c3aed' }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-[rgb(var(--foreground))]">{displayName}</h2>
            {user.email && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </p>
            )}
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Membro desde {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(user.criadoEm))}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {statusBadge()}
              {membro?.status === 'APROVADO' && membro.tipo && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-3 py-1 text-xs font-semibold text-[rgb(var(--foreground-muted))]">
                  <UserCircle2 className="h-3.5 w-3.5" />
                  {membro.tipo === 'SOCIO' ? 'Sócio' : 'Torcedor'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Provedores conectados */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[rgb(var(--border))] pt-4">
          <span className="text-xs text-[rgb(var(--foreground-muted))]">Conectado via:</span>
          {user.googleId && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--foreground))]">
              <Shield className="h-3 w-3 text-blue-500" />
              Google
            </span>
          )}
          {user.discordId && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--foreground))]">
              <Tv2 className="h-3 w-3 text-indigo-500" />
              Discord
            </span>
          )}
        </div>
      </div>

      {/* Carteirinha de sócio */}
      {socio && (
        <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-5 py-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-violet-500" />
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Carteirinha Nº {socio.numeroSocio}
              </p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Válida até {new Intl.DateTimeFormat('pt-BR').format(new Date(socio.validade))}
              </p>
            </div>
          </div>
          <Link
            href="/portal/carteirinha"
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Ver carteirinha →
          </Link>
        </div>
      )}

      {/* Cadastro pendente / reprovado — CTA */}
      {(!membro || membro.status === 'REPROVADO') && (
        <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-5 py-4">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {!membro ? 'Ainda não é membro desta torcida.' : 'Seu cadastro foi reprovado.'}
          </p>
          <Link
            href="/portal/cadastro"
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: tenant?.corPrimaria ?? '#7c3aed' }}
          >
            {!membro ? 'Cadastrar-se' : 'Reenviar'}
          </Link>
        </div>
      )}

      {/* Formulário de edição */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <UserCircle2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          Dados pessoais
        </h2>
        <PerfilForm
          nome={membroNome}
          idade={membro?.idade}
          telefone={membro?.telefone}
          cidade={membro?.cidade}
          discordTag={membro?.discordTag}
          temMembro={!!membro}
        />
      </div>

      {/* Nota sobre avatar */}
      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        A foto de perfil é sincronizada automaticamente com o provedor OAuth (Google ou Discord).
      </p>
    </div>
  )
}
