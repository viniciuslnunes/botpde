import Link from 'next/link'
import { UserRound, Shield, Users2, type LucideIcon } from 'lucide-react'

export type AccessSecao = 'pessoas' | 'cargos' | 'departamentos'

const SECOES: {
  id: AccessSecao
  label: string
  short: string
  icon: LucideIcon
  countKey: 'pessoas' | 'cargos' | 'departamentos'
}[] = [
  { id: 'pessoas', label: 'Pessoas', short: 'Atribuir', icon: UserRound, countKey: 'pessoas' },
  { id: 'cargos', label: 'Cargos', short: 'Papéis', icon: Shield, countKey: 'cargos' },
  { id: 'departamentos', label: 'Departamentos', short: 'Áreas', icon: Users2, countKey: 'departamentos' },
]

export function parseAccessSecao(raw: string | undefined): AccessSecao {
  if (raw === 'cargos' || raw === 'departamentos' || raw === 'pessoas') return raw
  return 'pessoas'
}

interface AccessControlNavProps {
  secao: AccessSecao
  counts: { pessoas: number; cargos: number; departamentos: number }
}

/** Três eixos do Controle de acesso: atribuir · cargos · departamentos. */
export function AccessControlNav({ secao, counts }: AccessControlNavProps) {
  return (
    <nav aria-label="Seções do controle de acesso" className="mt-4">
      <div className="app-scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {SECOES.map((item) => {
          const active = secao === item.id
          const Icon = item.icon
          const count = counts[item.countKey]
          return (
            <Link
              key={item.id}
              href={`/admin/acessos?secao=${item.id}`}
              aria-current={active ? 'page' : undefined}
              className={[
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                  : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                  active
                    ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {count}
              </span>
            </Link>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
        {secao === 'pessoas' && (
          <>
            Atribua perfis a cada pessoa — a área vem com o perfil de departamento.{' '}
            <Link href="/admin/acessos?secao=cargos" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
              Edite cargos
            </Link>
            {' · '}
            <Link href="/admin/acessos?secao=departamentos" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
              edite departamentos
            </Link>
            .
          </>
        )}
        {secao === 'cargos' && (
          <>
            Papéis transversais (Presidente, Recrutador…). Depois, em{' '}
            <Link href="/admin/acessos?secao=pessoas" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
              Pessoas
            </Link>
            , atribua o cargo a quem deve tê-lo.
          </>
        )}
        {secao === 'departamentos' && (
          <>
            Áreas com colaborador e gestor. Depois, em{' '}
            <Link href="/admin/acessos?secao=pessoas" className="font-medium text-[rgb(var(--primary))] underline-offset-2 hover:underline">
              Pessoas
            </Link>
            , coloque cada um na área certa.
          </>
        )}
      </p>
    </nav>
  )
}
