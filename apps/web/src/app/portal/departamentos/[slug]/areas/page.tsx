import { notFound } from 'next/navigation'
import { Layers } from 'lucide-react'
import {
  checklistProgress,
  hrefHomeDepartamento,
  STATUS_PROJETO_ABERTOS,
} from '@torcida/types'
import { db } from '@torcida/db'
import { getDepartamentoContexto } from '../_lib/contexto'
import {
  carregarAreaMembros,
  carregarCanaisDisponiveis,
  carregarSlugsCampanhaAno,
  montarAreasResumo,
  type AreaMembrosMapa,
} from '../_lib/carregar-cockpit'
import { AreaSaudeGrupo, AreaSaudeRow } from '@/components/departamentos/area-saude-lista'
import { KpiGrid, StatCard } from '@/components/admin/ui'
import {
  DepartamentoAreasBlock,
  DepartamentoAreasCabecalho,
} from '../_components/departamento-areas-block'
import type { Metadata } from 'next'

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Áreas · ${slug}` }
}

export default async function DepartamentoAreasPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) notFound()

  const { tenant, departamento: depto, podeGerirEquipe, areas } = ctx
  const isGestor = podeGerirEquipe

  const [areaMembros, slugsCampanha, projetosAgg, canaisDisponiveis]: [
    AreaMembrosMapa,
    Set<string>,
    Array<{ areaId: string | null; _count: number }>,
    Array<{ id: string; nome: string | null }>,
  ] = await Promise.all([
    carregarAreaMembros(areas.map((a) => a.id)),
    carregarSlugsCampanhaAno(tenant.id, depto.id),
    db.projeto.groupBy({
      by: ['areaId'],
      where: {
        tenantId: tenant.id,
        departamentoId: depto.id,
        status: { in: [...STATUS_PROJETO_ABERTOS] },
      },
      _count: true,
    }),
    isGestor ? carregarCanaisDisponiveis(tenant.id) : Promise.resolve([]),
  ])

  const areasResumo = montarAreasResumo(areas, areaMembros.membrosPorArea, slugsCampanha)
  const projetosPorArea = new Map(
    projetosAgg.filter((r) => r.areaId).map((r) => [r.areaId as string, r._count]),
  )

  const ativas = areasResumo.filter((a) => a.ativa)
  const semResponsavel = ativas.filter(
    (a) => !a.membros.some((m) => m.papel === 'RESPONSAVEL'),
  )

  const itens = areasResumo.map((a) => {
    const progress = checklistProgress(a.meta)
    const responsaveis = a.membros
      .filter((m) => m.papel === 'RESPONSAVEL')
      .map((m) => m.nome?.trim() || (m.nickname ? `@${m.nickname}` : 'Pessoa'))
    return {
      id: a.id,
      nome: a.nome,
      descricao: a.descricao,
      ativa: a.ativa,
      sazonal: a.sazonal,
      href: hrefHomeDepartamento(depto.slug, 'areas', { area: a.id }),
      pessoas: a.membros.length,
      responsaveis,
      checklistDone: progress.done,
      checklistTotal: progress.total,
      projetosAbertos: projetosPorArea.get(a.id) ?? 0,
    }
  })

  return (
    <div className="space-y-5">
      <DepartamentoAreasCabecalho
        departamentoId={depto.id}
        slug={depto.slug}
        podeGerir={isGestor}
      />

      <KpiGrid cols={3}>
        <StatCard label="Áreas ativas" value={ativas.length} icon={<Layers className="h-5 w-5" />} />
        <StatCard
          label="Sem responsável"
          value={semResponsavel.length}
          tone={semResponsavel.length > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Pessoas nas frentes"
          value={areasResumo.reduce((n, a) => n + a.membros.length, 0)}
        />
      </KpiGrid>

      {itens.length === 0 ? (
        <DepartamentoAreasBlock
          departamentoId={depto.id}
          slug={depto.slug}
          areas={areasResumo}
          podeGerir={isGestor}
          canaisDisponiveis={canaisDisponiveis}
        />
      ) : (
        <AreaSaudeGrupo nome={depto.nome} cor={depto.cor}>
          {itens.map((item) => (
            <AreaSaudeRow key={item.id} item={item} />
          ))}
        </AreaSaudeGrupo>
      )}
    </div>
  )
}
