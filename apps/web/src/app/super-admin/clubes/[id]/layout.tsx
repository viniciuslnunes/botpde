import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { db } from '@torcida/db'
import { Badge } from '@torcida/ui'
import { bloqueiosExclusaoClube, completudeClube, rotuloSerieClube } from '@torcida/types'
import { AdminDetailHeader } from '@/components/admin/ui'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { ClubeSituacaoAcoes } from '../_components/clube-situacao-acoes'

/**
 * Shell do detalhe: header + alerta de completude valem para Dados, Métricas e
 * Qualidade do clube. As tabs do módulo (pai) já apontam para rotas aninhadas.
 */
export default async function ClubeDetalheLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const clube = await db.afiliacao.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      apelido: true,
      slug: true,
      serie: true,
      estado: true,
      cidade: true,
      escudoUrl: true,
      torcedoresEstimados: true,
      ativo: true,
      _count: {
        select: {
          tenants: true,
          torcedores: true,
          partidas: true,
          noticias: true,
          rivalClubeA: true,
          rivalClubeB: true,
          torcidasConhecidas: true,
        },
      },
    },
  })
  if (!clube) notFound()

  const contagens = {
    tenants: clube._count.tenants,
    torcedores: clube._count.torcedores,
    partidas: clube._count.partidas,
    noticias: clube._count.noticias,
    rivalidades: clube._count.rivalClubeA + clube._count.rivalClubeB,
    torcidasConhecidas: clube._count.torcidasConhecidas,
  }
  const { podeExcluir, bloqueios } = bloqueiosExclusaoClube(contagens)
  const { completo, faltando, percentual } = completudeClube(clube)

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        title={clube.nome}
        eyebrow="Catálogo de clubes"
        description={[
          rotuloSerieClube(clube.serie),
          [clube.cidade, clube.estado].filter(Boolean).join('/') || 'Sem praça',
        ].join(' · ')}
        backHref="/super-admin/clubes"
        backLabel="Voltar ao catálogo"
        icon={
          <EscudoClube
            nome={clube.nome}
            apelido={clube.apelido}
            escudoUrl={clube.escudoUrl}
            size="sm"
            priority
          />
        }
        badges={
          <>
            <Badge variant={clube.ativo ? 'success' : 'neutral'}>
              {clube.ativo ? 'Ativo' : 'Arquivado'}
            </Badge>
            <Badge variant={completo ? 'success' : 'warning'}>
              {completo ? 'Cadastro completo' : `Cadastro ${percentual}%`}
            </Badge>
          </>
        }
        actions={
          <ClubeSituacaoAcoes
            clubeId={clube.id}
            nome={clube.nome}
            ativo={clube.ativo}
            podeExcluir={podeExcluir}
            motivoBloqueio={bloqueios.map((b) => `${b.total} ${b.label}`).join(', ')}
          />
        }
      />

      {!completo ? (
        <p className="rounded-xl border border-[rgb(var(--color-warning)_/_0.4)] bg-[rgb(var(--color-warning)_/_0.08)] px-4 py-3 text-sm text-[rgb(var(--color-warning-fg))]">
          Faltam <strong>{faltando.join(', ')}</strong>. Cadastro incompleto não quebra a página —
          apaga funcionalidade em silêncio (widget que não resolve, clube fora do mapa).
        </p>
      ) : null}

      {children}
    </div>
  )
}
