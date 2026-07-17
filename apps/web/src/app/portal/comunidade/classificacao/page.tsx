import { redirect } from 'next/navigation'
import { ListOrdered } from 'lucide-react'
import { getWidgetsForContexto } from '@torcida/types'
import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { WidgetSection } from '@/components/sofascore/widget-section'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Classificação — Comunidade' }

export default async function ClassificacaoPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/')

  const afiliacaoSlug = ctx.afiliacao?.slug ?? null
  const widgets = getWidgetsForContexto({
    contexto: 'classificacao',
    afiliacaoSlug,
  })
  const nomeClube = ctx.afiliacao
    ? ctx.afiliacao.apelido || ctx.afiliacao.nome
    : null

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ComunidadePageHeader
        icon={ListOrdered}
        titulo="Classificação"
        subtitulo={
          nomeClube
            ? `Tabela ao vivo do campeonato — ${nomeClube}`
            : 'Tabela ao vivo do campeonato do seu clube'
        }
      />

      {widgets.length > 0 ? (
        <WidgetSection
          contexto="classificacao"
          afiliacaoSlug={afiliacaoSlug}
          loading="eager"
          hideTitulo
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center">
          <ListOrdered className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">
            Classificação indisponível
          </p>
          <p className="mt-1 max-w-sm text-sm text-[rgb(var(--foreground-muted))]">
            {afiliacaoSlug
              ? 'Ainda não há tabela Sofascore cadastrada para o seu clube.'
              : 'Associe um clube no perfil para ver a classificação do campeonato.'}
          </p>
        </div>
      )}
    </div>
  )
}
