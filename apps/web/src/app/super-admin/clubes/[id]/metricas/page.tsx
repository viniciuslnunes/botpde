import { Suspense, type ReactNode } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  Building2,
  MessageSquare,
  Newspaper,
  Swords,
  Trophy,
  Users,
  UserCheck,
} from 'lucide-react'
import { StatCard } from '@/components/admin/ui'
import { formatTorcedoresEstimados } from '@/lib/format-contagem'
import { carregarMetricasClube, type MetricasClube } from '@/lib/super-admin/clubes-metricas'
import { TorcidasVinculadas } from '../../_components/torcidas-vinculadas'

export const metadata: Metadata = { title: 'Métricas do clube — Super Admin' }

const numero = (n: number) => n.toLocaleString('pt-BR')

function SkeletonMetricas() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-12 max-w-xl animate-pulse rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
          />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]" />
    </div>
  )
}

/** Grid estático — sem Motion `initial="hidden"`, que deixava a página em branco até hidratar. */
function GradeKpis({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
      {children}
    </div>
  )
}

function PainelMetricas({ metricas }: { metricas: MetricasClube }) {
  const torcedoresNaPlataforma = metricas.torcedoresPerfil + metricas.torcedoresMembro
  const previewEstimativa =
    metricas.estimativa != null
      ? formatTorcedoresEstimados(
          metricas.estimativa.total,
          metricas.estimativa.tipo as 'PESQUISA' | 'IBOPE_DIGITAL' | 'LIMITE_ATE' | 'PLATAFORMA' | null,
        )
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Métricas do clube
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[rgb(var(--foreground-muted))]">
            Uso na plataforma
            {metricas.apelido ? ` do ${metricas.apelido}` : ` de ${metricas.nome}`} — gente,
            publicações e conteúdo ligados a este catálogo.
          </p>
        </div>
        {previewEstimativa ? (
          <div className="rounded-xl border border-[rgb(var(--color-primary)_/_0.28)] bg-[rgb(var(--color-primary)_/_0.08)] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
              Base digital (estimativa)
            </p>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{previewEstimativa}</p>
            {metricas.estimativa?.fonte ? (
              <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                {metricas.estimativa.fonte}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <GradeKpis>
        <StatCard
          label="Torcidas na plataforma"
          value={numero(metricas.torcidas)}
          icon={<Building2 className="h-5 w-5" />}
          badge={
            metricas.torcidasConhecidas > 0
              ? `${numero(metricas.torcidasConhecidas)} no catálogo nacional`
              : undefined
          }
        />
        <StatCard
          label="Sócios aprovados"
          value={numero(metricas.socios)}
          icon={<UserCheck className="h-5 w-5" />}
          badge="Nas torcidas deste clube"
          badgeTone="default"
        />
        <StatCard
          label="Torcedores na plataforma"
          value={numero(torcedoresNaPlataforma)}
          icon={<Users className="h-5 w-5" />}
          badge={`${numero(metricas.torcedoresPerfil)} perfil · ${numero(metricas.torcedoresMembro)} membro`}
          badgeTone="default"
        />
        <StatCard
          label="Publicações"
          value={numero(metricas.publicacoes)}
          icon={<MessageSquare className="h-5 w-5" />}
          badge="Posts nas comunidades do clube"
          badgeTone="default"
        />
        <StatCard
          label="Notícias"
          value={numero(metricas.noticias)}
          icon={<Newspaper className="h-5 w-5" />}
        />
        <StatCard
          label="Partidas · Rivais"
          value={`${numero(metricas.partidas)} · ${numero(metricas.rivalidades)}`}
          icon={metricas.rivalidades > 0 ? <Swords className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
        />
      </GradeKpis>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Torcidas vinculadas
          </h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Só torcidas-raiz — expanda para ver unidades (Caso A) e portais promovidos (Caso B).
          </p>
          <TorcidasVinculadas torcidas={metricas.torcidasLista} />
        </section>

        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Leitura rápida</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Sócios / torcidas</dt>
              <dd className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {metricas.torcidas === 0
                  ? '—'
                  : `${numero(Math.round(metricas.socios / metricas.torcidas))} méd.`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Posts / torcida</dt>
              <dd className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {metricas.torcidasLista.length === 0
                  ? '—'
                  : `${numero(
                      Math.round(
                        metricas.torcidasLista.reduce((a, t) => a + t.posts, 0) /
                          metricas.torcidasLista.length,
                      ),
                    )} méd.`}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-[rgb(var(--border))] pt-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Perfil torcedor global</dt>
              <dd className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {numero(metricas.torcedoresPerfil)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Membro torcedor (torcidas)</dt>
              <dd className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {numero(metricas.torcedoresMembro)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Notícias do clube</dt>
              <dd className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {numero(metricas.noticias)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Partidas · rivais</dt>
              <dd className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {numero(metricas.partidas)} · {numero(metricas.rivalidades)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}

async function ConteudoMetricas({ id }: { id: string }) {
  const metricas = await carregarMetricasClube(id)
  if (!metricas) notFound()
  return <PainelMetricas metricas={metricas} />
}

/**
 * Métricas **deste** clube — não o painel nacional de `/clubes/metricas`.
 * Skeleton no Suspense evita tela vazia enquanto o proxy do banco responde.
 */
export default async function ClubeMetricasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Suspense fallback={<SkeletonMetricas />}>
      <ConteudoMetricas id={id} />
    </Suspense>
  )
}
