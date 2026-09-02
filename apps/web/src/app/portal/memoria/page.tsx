import { Suspense } from 'react'
import type { Metadata } from 'next'
import { MEMORIA_ESCOPO } from '@torcida/types'
import { MemoriaMark } from '@/components/portal/memoria-mark'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { todayDateOnlyIso } from '@/lib/format-datetime'
import { isMemoriaDiaIso } from '@/lib/memoria-dia'
import { tituloMemoriaDia } from '@/lib/memoria-meta'
import { carregarMemoria } from './_lib/carregar-memoria'
import { MemoriaExplorer } from './_components/memoria-explorer'

type Search = { dia?: string; f?: string; escopo?: string; cap?: string }

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>
}): Promise<Metadata> {
  const sp = await searchParams
  const escopo = sp.escopo ?? MEMORIA_ESCOPO.UNIDADE
  if (!sp.dia || !isMemoriaDiaIso(sp.dia)) {
    return {
      title: 'Memórias',
      description: 'Acervo da torcida — linha do tempo por dia civil.',
    }
  }
  const titulo = tituloMemoriaDia(sp.dia, escopo)
  return {
    title: titulo,
    description: `Reviva o dia ${sp.dia} no acervo da torcida.`,
    openGraph: {
      title: titulo,
      description: `Memória de ${sp.dia} — acervo da torcida.`,
      type: 'article',
    },
  }
}

export default async function MemoriaPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const ctx = await carregarMemoria({
    escopoRaw: sp.escopo,
    diaRaw: sp.dia,
    capRaw: sp.cap,
  })

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
        estatisticas={ctx.estatisticas}
        paralelos={ctx.paralelos}
        capitulos={ctx.capitulos}
        capituloAtivo={ctx.capituloAtivo}
        podeGerirAcervo={ctx.podeGerirAcervo}
      />
    </Suspense>
  )
}

function MemoriaSkeleton() {
  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] animate-pulse flex-col gap-5 lg:flex-row lg:gap-8">
      <div className="rounded-2xl border border-[rgb(var(--border))] p-4 lg:w-80">
        <div className="space-y-3">
          <div className="h-4 w-20 rounded bg-[rgb(var(--border))]" />
          <div className="h-8 w-40 rounded bg-[rgb(var(--border))]" />
          <div className="flex gap-1.5">
            <div className="h-8 w-16 rounded-full bg-[rgb(var(--border))]" />
            <div className="h-8 w-16 rounded-full bg-[rgb(var(--border))]" />
            <div className="h-8 w-16 rounded-full bg-[rgb(var(--border))]" />
          </div>
          <div className="h-10 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
          <div className="hidden space-y-2 lg:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
            ))}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="h-28 rounded-3xl bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-32 rounded-3xl bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-24 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      </div>
    </div>
  )
}
