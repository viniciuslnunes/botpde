import { notFound } from 'next/navigation'
import { getDepartamentoContexto } from '../../_lib/contexto'
import {
  carregarAreaMembros,
  carregarCanaisDisponiveis,
  carregarSlugsCampanhaAno,
  montarAreasResumo,
} from '../../_lib/carregar-cockpit'
import { DepartamentoAreaCard } from '../../_components/departamento-areas-block'
import type { Metadata } from 'next'

type Params = { slug: string; areaId: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Área · ${slug}` }
}

export default async function DepartamentoAreaFichaPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug, areaId } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) notFound()

  const { tenant, departamento: depto, podeGerirEquipe, areas } = ctx
  const isGestor = podeGerirEquipe

  const [areaMembros, slugsCampanha, canaisDisponiveis] = await Promise.all([
    carregarAreaMembros(areas.map((a) => a.id)),
    carregarSlugsCampanhaAno(tenant.id, depto.id),
    isGestor ? carregarCanaisDisponiveis(tenant.id) : Promise.resolve([]),
  ])
  const areasResumo = montarAreasResumo(areas, areaMembros.membrosPorArea, slugsCampanha)
  const area = areasResumo.find((a) => a.id === areaId)
  if (!area) notFound()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="portal-display text-base text-[rgb(var(--foreground))]">{area.nome}</h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          {area.descricao?.trim() ||
            'Equipe, checklist e canal desta frente. Responsável é accountability — não abre permissão extra.'}
        </p>
      </div>
      <DepartamentoAreaCard
        departamentoId={depto.id}
        slug={depto.slug}
        area={area}
        podeGerir={isGestor}
        canaisDisponiveis={canaisDisponiveis}
        foco
      />
    </div>
  )
}
