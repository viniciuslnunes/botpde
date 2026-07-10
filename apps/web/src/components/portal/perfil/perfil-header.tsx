import Link from 'next/link'
import { Lock, Globe } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'

interface PerfilHeaderProps {
  nome: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  perfilPrivado: boolean
  tenantNome: string
  segueVoce: boolean
  isSelf: boolean
  acoes?: React.ReactNode
}

export function PerfilHeader({
  nome,
  avatarUrl,
  bannerUrl,
  perfilPrivado,
  tenantNome,
  segueVoce,
  isSelf,
  acoes,
}: PerfilHeaderProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="relative h-32 sm:h-40">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[rgb(var(--primary))]/30 to-[rgb(var(--background-subtle))]" />
        )}
      </div>
      <div className="relative px-4 pb-4 sm:px-5">
        <div className="-mt-10 mb-3 flex items-end justify-between gap-3 sm:-mt-12">
          <div className="rounded-full ring-4 ring-[rgb(var(--surface))]">
            <Avatar nome={nome} avatarUrl={avatarUrl} size="xl" />
          </div>
          {acoes && <div className="mb-1 flex shrink-0 flex-col items-end gap-2">{acoes}</div>}
        </div>
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{nome ?? 'Membro'}</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{tenantNome}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                perfilPrivado
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
              ].join(' ')}
            >
              {perfilPrivado ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
              {perfilPrivado ? 'Perfil privado' : 'Perfil público'}
            </span>
            {segueVoce && !isSelf && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                Segue você
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
