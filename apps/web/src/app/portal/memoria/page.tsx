import { Suspense } from 'react'
import type { Metadata } from 'next'
import { MemoriaMark } from '@/components/portal/memoria-mark'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { todayDateOnlyIso } from '@/lib/format-datetime'
import { carregarMemoria } from './_lib/carregar-memoria'
import { MemoriaExplorer } from './_components/memoria-explorer'

export const metadata: Metadata = { title: 'Memórias' }

export default async function MemoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; f?: string; escopo?: string }>
}) {
  const sp = await searchParams
  const ctx = await carregarMemoria({ escopoRaw: sp.escopo, diaRaw: sp.dia })

  if (!ctx.ok) {
    const empty =
      ctx.motivo === 'sem-clube'
        ? {
            title: 'Memórias do clube',
            description: 'Escolha um clube no perfil para ver os jogos e o que o torcedor publicou.',
          }
        : {
            title: 'Memórias da unidade',
            description:
              'Entre numa torcida ou unidade — a memória segue o canal da top bar, não mistura a Comunidade Nacional com caravana de unidade.',
          }
    return (
      <MotionEmptyState
        icon={<MemoriaMark className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title={empty.title}
        description={empty.description}
      />
    )
  }

  return (
    <Suspense fallback={<MemoriaSkeleton />}>
      <MemoriaExplorer
        tenantNome={ctx.tenantNome}
        clubeNome={ctx.clubeNome}
        logoUrl={ctx.logoUrl}
        hojeIso={todayDateOnlyIso()}
        montada={ctx.montada}
        escopo={ctx.escopo}
        escoposDisponiveis={ctx.escoposDisponiveis}
        mostrarChips={ctx.mostrarChips}
        podeCriarFato={ctx.podeCriarFato}
        fatosDoAutor={ctx.fatosDoAutor}
        presenca={ctx.presenca}
      />
    </Suspense>
  )
}

function MemoriaSkeleton() {
  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] animate-pulse flex-col gap-4 lg:flex-row lg:gap-8">
      <div className="space-y-3 lg:w-64">
        <div className="h-4 w-20 rounded bg-[rgb(var(--border))]" />
        <div className="h-8 w-40 rounded bg-[rgb(var(--border))]" />
        <div className="flex gap-1">
          <div className="h-8 w-14 rounded-full bg-[rgb(var(--border))]" />
          <div className="h-8 w-14 rounded-full bg-[rgb(var(--border))]" />
        </div>
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="h-10 w-64 rounded bg-[rgb(var(--border))]" />
        <div className="h-32 rounded-3xl bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-24 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      </div>
    </div>
  )
}
