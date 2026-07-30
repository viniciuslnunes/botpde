import Image from 'next/image'
import { Lock, Globe } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

interface PerfilHeaderProps {
  nome: string | null
  nickname?: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  bannerPos?: number | null
  perfilPrivado: boolean
  tenantNome: string
  segueVoce: boolean
  isSelf: boolean
  acoes?: React.ReactNode
}

export function PerfilHeader({
  nome,
  nickname,
  avatarUrl,
  bannerUrl,
  bannerPos,
  perfilPrivado,
  tenantNome,
  segueVoce,
  isSelf,
  acoes,
}: PerfilHeaderProps) {
  const objectPosition = `center ${Math.min(100, Math.max(0, bannerPos ?? 50))}%`
  return (
    <section className="card-soft overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {/* Faixa de topo: banner do membro quando existe, senão gradiente da torcida. */}
      <div className="relative h-[clamp(7rem,4rem+12vw,9.875rem)]">
        {bannerUrl ? (
          canOptimizeImageUrl(bannerUrl) ? (
            <Image
              src={bannerUrl}
              alt=""
              fill
              aria-hidden
              sizes="(max-width: 640px) 100vw, 42rem"
              className="object-cover"
              style={{ objectPosition }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition }}
            />
          )
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-[rgb(var(--primary)_/_0.28)] via-[rgb(var(--primary)_/_0.10)] to-[rgb(var(--surface))]" />
        )}
      </div>

      <div className="relative flex flex-col items-center px-5 pb-5 text-center">
        <div className="-mt-12 rounded-full ring-4 ring-[rgb(var(--surface))] sm:-mt-14">
          <Avatar nome={nome} avatarUrl={avatarUrl} size="xl" />
        </div>

        <h1 className="mt-3 w-full max-w-full break-words px-2 text-xl font-bold text-[rgb(var(--foreground))] sm:text-2xl">
          {nome ?? 'Membro'}
        </h1>
        {nickname && (
          <p className="mt-0.5 text-sm font-medium text-[rgb(var(--color-primary-fg))]">@{nickname}</p>
        )}
        <p className="mt-0.5 text-sm uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          {tenantNome}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
              perfilPrivado
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
            ].join(' ')}
          >
            {perfilPrivado ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
            {perfilPrivado ? 'Perfil privado' : 'Perfil público'}
          </span>
          {segueVoce && !isSelf && (
            <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
              Segue você
            </span>
          )}
        </div>

        {acoes && (
          <div className="mt-4 flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
            {acoes}
          </div>
        )}
      </div>
    </section>
  )
}
