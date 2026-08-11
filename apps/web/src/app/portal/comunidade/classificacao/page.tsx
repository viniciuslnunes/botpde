import { redirect } from 'next/navigation'
import { ListOrdered } from 'lucide-react'
import { getStandingsPorSerie, resolverWidgetsClassificacao, SERIES_NACIONAIS } from '@torcida/types'
import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { resolverClubeClassificacao } from '@/lib/sofascore-server'
import { WidgetSection } from '@/components/sofascore/widget-section'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Classificação — Comunidade' }

const LABEL_SERIE: Record<string, string> = {
  A: 'Brasileirão Série A',
  B: 'Brasileirão Série B',
  C: 'Brasileirão Série C',
  D: 'Brasileirão Série D',
}

export default async function ClassificacaoPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) {
    if (isSuperAdminEmail(session.user.email)) redirect('/super-admin/torcidas')
    redirect('/onboarding')
  }

  const clube = await resolverClubeClassificacao(session.user.id, session.user.email)
  const afiliacaoSlug = clube?.slug ?? null
  const serie = clube?.serie ?? null
  const nomeClube = clube?.nome ?? null

  const widgets = resolverWidgetsClassificacao({ afiliacaoSlug, serie })
  const competicao = getStandingsPorSerie(serie)
  const serieNacional = Boolean(
    serie && (SERIES_NACIONAIS as readonly string[]).includes(serie),
  )

  let subtitulo = 'Tabela ao vivo do campeonato do seu clube'
  if (nomeClube && competicao) {
    subtitulo = `${competicao.titulo} — ${nomeClube}`
  } else if (nomeClube && serie && LABEL_SERIE[serie]) {
    subtitulo = `${LABEL_SERIE[serie]} — ${nomeClube}`
  } else if (nomeClube) {
    subtitulo = `Tabela ao vivo do campeonato — ${nomeClube}`
  }

  const emptyTitulo = 'Classificação indisponível'
  let emptyTexto = 'Associe um clube no perfil para ver a classificação do campeonato.'
  if (afiliacaoSlug && nomeClube && !serieNacional) {
    emptyTexto = `O ${nomeClube} não disputa uma competição nacional com tabela ao vivo.`
  } else if (afiliacaoSlug && serieNacional && widgets.length === 0) {
    emptyTexto = `Tabela do ${LABEL_SERIE[serie!] ?? 'campeonato'} ainda não disponível.`
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ComunidadePageHeader icon={ListOrdered} titulo="Classificação" subtitulo={subtitulo} />

      {widgets.length > 0 ? (
        <WidgetSection
          contexto="classificacao"
          afiliacaoSlug={afiliacaoSlug}
          serie={serie}
          loading="eager"
          hideTitulo
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center">
          <ListOrdered className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">{emptyTitulo}</p>
          <p className="mt-1 max-w-sm text-sm text-[rgb(var(--foreground-muted))]">{emptyTexto}</p>
        </div>
      )}
    </div>
  )
}
