'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Lock } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { menuItemStagger } from '@/lib/motion-presets'
import type { SugestaoMembroBusca } from '@/lib/comunidade-busca'

function formatContagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

export function MembroSugestaoCard({
  membro,
  index,
}: {
  membro: SugestaoMembroBusca
  index: number
}) {
  const perfilHref = `/portal/comunidade/perfil/${membro.id}`

  return (
    <m.article
      custom={index}
      variants={menuItemStagger}
      className="flex flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)]"
    >
      <div className="flex flex-col items-center text-center">
        <Link href={perfilHref} className="shrink-0">
          <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="xl" />
        </Link>

        <Link
          href={perfilHref}
          className="mt-3 line-clamp-1 text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
        >
          {membro.nome ?? 'Membro'}
        </Link>

        <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--foreground-muted))]">
          {membro.tenantNome}
        </p>

        {membro.bio && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
            {membro.bio}
          </p>
        )}

        <p className="mt-2 text-[11px] text-[rgb(var(--foreground-muted))]">
          {formatContagem(membro.seguidores, 'seguidor', 'seguidores')}
          {' · '}
          {formatContagem(membro.publicacoes, 'publicação', 'publicações')}
        </p>

        {membro.perfilPrivado && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
            <Lock className="h-3 w-3" />
            Perfil privado
          </span>
        )}
      </div>

      {membro.podeSeguir && (
        <div className="mt-4 flex justify-center">
          <SeguimentoButtons userId={membro.id} status={membro.statusSeguimento} />
        </div>
      )}
    </m.article>
  )
}
