import Link from 'next/link'
import { Avatar } from '@/components/portal/avatar'
import { getComposerContext } from './composer-context'

export async function ComunidadeUserCardSection({
  tenantId,
  tenantNome,
  userId,
  userName,
  userAvatar,
}: {
  tenantId: string
  tenantNome: string
  userId: string
  userName: string | null
  userAvatar: string | null
}) {
  const ctx = await getComposerContext(tenantId, userId, userName)
  const userCard = ctx.userCard
  const nome = ctx.nome

  const numeroExibido =
    userCard.numeroSocio != null
      ? String(userCard.numeroSocio).padStart(5, '0')
      : userCard.numeroAssociado?.trim() || null
  const departamentosLabel =
    userCard.departamentos.length > 0 ? userCard.departamentos.join(' · ') : null

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <Link
        href={`/portal/comunidade/perfil/${userId}`}
        className="flex items-start gap-3 rounded-xl outline-offset-2 transition-opacity hover:opacity-90"
      >
        <Avatar nome={nome} avatarUrl={userAvatar} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
            {nome ?? 'Torcedor'}
          </p>
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{tenantNome}</p>
          {userCard.cargoNome && (
            <p className="truncate text-[11px] font-medium text-[rgb(var(--color-primary-fg))]">
              {userCard.cargoNome}
            </p>
          )}
          {(numeroExibido || departamentosLabel) && (
            <div className="mt-1.5 space-y-0.5">
              {numeroExibido && (
                <p className="truncate text-[11px] font-medium tabular-nums text-[rgb(var(--foreground-muted))]">
                  Nº {numeroExibido}
                  {userCard.tipo === 'SOCIO' ? ' · Sócio' : ''}
                </p>
              )}
              {departamentosLabel && (
                <p className="truncate text-[11px] text-[rgb(var(--color-primary-fg))]">
                  {departamentosLabel}
                </p>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  )
}

export function ComunidadeUserCardFallback({
  tenantNome,
  userName,
  userAvatar,
}: {
  tenantNome: string
  userName: string | null
  userAvatar: string | null
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex items-start gap-3">
        <Avatar nome={userName} avatarUrl={userAvatar} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
            {userName ?? 'Torcedor'}
          </p>
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{tenantNome}</p>
        </div>
      </div>
    </div>
  )
}
