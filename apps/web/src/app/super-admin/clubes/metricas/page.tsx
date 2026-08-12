import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Building2, Image as ImageIcon, Shield, Trophy, Users } from 'lucide-react'
import { InsightSection, KpiGrid, StatCard } from '@/components/admin/ui'
import { DonutChart, MiniBarChart, Sparkline } from '@/components/admin/charts'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import {
  carregarAdesaoClubesPorMes,
  carregarDistribuicoesClubes,
  carregarKpisClubes,
  carregarRankingsClubes,
  type TopClube,
} from '@/lib/super-admin/clubes-metricas'

export const metadata: Metadata = { title: 'Métricas de clubes — Super Admin' }

const numero = (n: number) => n.toLocaleString('pt-BR')
const pct = (parte: number, total: number) =>
  total === 0 ? '0%' : `${Math.round((parte / total) * 100)}%`

function BlocoCarregando({ altura = 'h-32' }: { altura?: string }) {
  return (
    <div
      className={`${altura} animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]`}
      aria-hidden
    />
  )
}

async function BlocoKpis() {
  const kpis = await carregarKpisClubes()
  return (
    <KpiGrid>
      <StatCard
        label="Clubes no catálogo"
        value={numero(kpis.total)}
        icon={<Shield className="h-5 w-5" />}
        badge={kpis.novos30d > 0 ? `+${kpis.novos30d} em 30 dias` : undefined}
      />
      <StatCard
        label="Com torcida na plataforma"
        value={numero(kpis.comTorcida)}
        icon={<Building2 className="h-5 w-5" />}
        badge={`${pct(kpis.comTorcida, kpis.total)} do catálogo`}
        badgeTone="default"
      />
      <StatCard
        label="Com escudo"
        value={pct(kpis.comEscudo, kpis.total)}
        icon={<ImageIcon className="h-5 w-5" />}
        badge={`${numero(kpis.total - kpis.comEscudo)} sem escudo`}
        badgeTone={kpis.comEscudo === kpis.total ? 'success' : 'warning'}
      />
      <StatCard
        label="Com série definida"
        value={pct(kpis.comSerie, kpis.total)}
        icon={<Trophy className="h-5 w-5" />}
        badge={`${numero(kpis.arquivados)} arquivados`}
        badgeTone="default"
      />
    </KpiGrid>
  )
}

async function BlocoDistribuicoes() {
  const { porSerie, porEstado } = await carregarDistribuicoesClubes()
  const total = porSerie.reduce((acc, f) => acc + f.total, 0)

  return (
    <InsightSection
      title="Como o catálogo se distribui"
      description="Divisão e praça de todos os clubes cadastrados — inclusive os sem torcida na plataforma."
    >
      <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[rgb(var(--foreground))]">Por divisão</h3>
        <DonutChart
          data={porSerie.map((f) => ({ rotulo: f.rotulo, valor: f.total }))}
          centro={numero(total)}
        />
      </div>
      <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[rgb(var(--foreground))]">
          Top 10 estados
        </h3>
        <MiniBarChart
          data={porEstado.map((f) => ({ rotulo: f.rotulo, valor: f.total }))}
          formato="numero"
        />
      </div>
    </InsightSection>
  )
}

function ListaTop({ titulo, subtitulo, itens, sufixo }: {
  titulo: string
  subtitulo: string
  itens: TopClube[]
  sufixo: string
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</h3>
      <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{subtitulo}</p>
      {itens.length === 0 ? (
        <p className="mt-4 text-sm text-[rgb(var(--foreground-muted))]">Ainda sem dados.</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {itens.map((clube, indice) => (
            <li key={clube.id}>
              <Link
                href={`/super-admin/clubes/${clube.id}`}
                className="app-action flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <span className="w-4 text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                  {indice + 1}
                </span>
                <EscudoClube nome={clube.nome} escudoUrl={clube.escudoUrl} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                  {clube.nome}
                </span>
                <span className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
                  {numero(clube.total)}
                  <span className="ml-1 text-xs font-normal text-[rgb(var(--foreground-muted))]">
                    {sufixo}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

async function BlocoRankings() {
  const { porTorcidas, porTorcedores } = await carregarRankingsClubes()
  return (
    <InsightSection
      title="Onde o catálogo está sendo usado"
      description="Clube não é só cadastro: estes são os que sustentam torcidas e torcedores de verdade."
    >
      <ListaTop
        titulo="Mais torcidas na plataforma"
        subtitulo="Tenants reais (sintéticos fora)."
        itens={porTorcidas}
        sufixo="torcidas"
      />
      <ListaTop
        titulo="Mais torcedores globais"
        subtitulo="Perfis que escolheram este clube no onboarding."
        itens={porTorcedores}
        sufixo="torcedores"
      />
    </InsightSection>
  )
}

async function BlocoAdesao() {
  const serie = await carregarAdesaoClubesPorMes(12)
  const valores = serie.map((p) => p.valor)
  const total = valores.reduce((acc, v) => acc + v, 0)

  return (
    <InsightSection
      title="Adesão ao catálogo"
      description="Torcedores globais que escolheram um clube, por mês (fuso de São Paulo)."
    >
      <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-baseline gap-2">
          <Users className="h-4 w-4 text-[rgb(var(--foreground-muted))]" aria-hidden />
          <span className="text-2xl font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {numero(total)}
          </span>
          <span className="text-xs text-[rgb(var(--foreground-muted))]">nos últimos 12 meses</span>
        </div>
        <div className="mt-3">
          <Sparkline data={valores} width={480} height={64} className="w-full" />
        </div>
      </div>
      <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[rgb(var(--foreground))]">Mês a mês</h3>
        <MiniBarChart
          data={serie.map((p) => ({ rotulo: p.rotulo, valor: p.valor }))}
          formato="numero"
        />
      </div>
    </InsightSection>
  )
}

/**
 * Painel de métricas do catálogo. Cada bloco é uma fronteira de Suspense
 * própria: as agregações são independentes, então a página pinta o que já
 * resolveu em vez de esperar a mais lenta.
 */
export default function ClubesMetricasPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<BlocoCarregando />}>
        <BlocoKpis />
      </Suspense>
      <Suspense fallback={<BlocoCarregando altura="h-64" />}>
        <BlocoDistribuicoes />
      </Suspense>
      <Suspense fallback={<BlocoCarregando altura="h-64" />}>
        <BlocoRankings />
      </Suspense>
      <Suspense fallback={<BlocoCarregando altura="h-48" />}>
        <BlocoAdesao />
      </Suspense>
    </div>
  )
}
