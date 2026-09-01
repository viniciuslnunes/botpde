import { notFound } from 'next/navigation'
import { getDepartamentoContexto } from '../../_lib/contexto'
import { carregarProjetos } from '../../_lib/carregar-cockpit'
import { DepartamentoProjetoCard } from '../../_components/departamento-projetos-block'
import type { Metadata } from 'next'

type Params = { slug: string; projetoId: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Projeto · ${slug}` }
}

export default async function DepartamentoProjetoFichaPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug, projetoId } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) notFound()

  const { tenant, departamento: depto, podeGerirEquipe, areas } = ctx
  const isGestor = podeGerirEquipe
  const { projetos, areasOpcoes } = await carregarProjetos({
    tenantId: tenant.id,
    departamentoId: depto.id,
    areas,
  })
  const projeto = projetos.find((p) => p.id === projetoId)
  if (!projeto) notFound()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="portal-display text-base text-[rgb(var(--foreground))]">{projeto.titulo}</h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          {projeto.descricao?.trim() ||
            'Meta, orçamento do caixa, status e agenda deste projeto. Gasto vem do livro-caixa, não de um número digitado aqui.'}
        </p>
      </div>
      <DepartamentoProjetoCard
        departamentoId={depto.id}
        slug={depto.slug}
        projeto={projeto}
        areas={areasOpcoes}
        podeGerir={isGestor}
        foco
      />
    </div>
  )
}
