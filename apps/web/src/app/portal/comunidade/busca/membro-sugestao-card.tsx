'use client'

import { useRouter } from 'next/navigation'
import { m } from 'motion/react'
import { FileText, Lock, MapPin, Users } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { formatUnidadeLabel } from '@/lib/torcida-labels'
import { menuItemStagger } from '@/lib/motion-presets'
import type { SugestaoMembroBusca } from '@/lib/comunidade-busca'

function formatContagem(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function subtituloMembro(membro: SugestaoMembroBusca): string {
  const partes: string[] = [membro.tenantNome]
  // Unidade só entra quando não repete a torcida (Caso B / "Sede — <Torcida>");
  // sem ela, a cidade é o dado de origem que sobra.
  const unidade = formatUnidadeLabel({
    nome: membro.unidadeNome,
    tipo: membro.unidadeTipo,
    torcidaNome: membro.tenantNome,
  })
  if (unidade) {
    partes.push(unidade)
  } else if (membro.cidade) {
    partes.push(membro.cidade)
  }
  return partes.join(' · ')
}

export function MembroSugestaoCard({
  membro,
  index,
}: {
  membro: SugestaoMembroBusca
  index: number
}) {
  const router = useRouter()
  const perfilHref = `/portal/comunidade/perfil/${membro.id}`

  return (
    <m.article
      custom={index}
      variants={menuItemStagger}
      role="link"
      tabIndex={0}
      onClick={() => router.push(perfilHref)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(perfilHref)
        }
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-colors hover:border-[rgb(var(--color-primary)_/_0.4)] hover:shadow-[0_8px_24px_rgb(0_0_0_/_0.06)]"
    >
      <div className="flex flex-1 gap-3 p-4">
        <div className="shrink-0 self-start">
          <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="lg" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
                {membro.nome ?? 'Membro'}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                {subtituloMembro(membro)}
              </p>
            </div>

            {membro.podeSeguir && (
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <SeguimentoButtons userId={membro.id} status={membro.statusSeguimento} />
              </div>
            )}
          </div>

          {membro.bio && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
              {membro.bio}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[rgb(var(--foreground-muted))]">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {formatContagem(membro.seguidores)} seguidor{membro.seguidores === 1 ? '' : 'es'}
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {formatContagem(membro.publicacoes)} publicaç{membro.publicacoes === 1 ? 'ão' : 'ões'}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {membro.mesmaUnidade && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-primary-fg))]">
                <MapPin className="h-3 w-3" />
                Sua unidade
              </span>
            )}
            <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
              {membro.tipoMembro === 'SOCIO' ? 'Sócio' : 'Torcedor'}
            </span>
            {membro.perfilPrivado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                <Lock className="h-3 w-3" />
                Privado
              </span>
            )}
          </div>
        </div>
      </div>
    </m.article>
  )
}
