import Link from 'next/link'
import { ArrowRight, Shield } from 'lucide-react'
import {
  DepartamentoAcervoGrade,
  DepartamentoAcervoGradeSkeleton,
} from './departamento-acervo-grade'
import { resumirPatrimonio } from '@/lib/patrimonio'

/**
 * Painel de domínio do Patrimônio: a grade com foto é o inventário.
 * CRUD só com `patrimony:manage` — membro com `patrimony:view` vê as peças.
 */
export async function PatrimonioInventarioAside({
  tenantId,
  isGestor,
  podeGerirAcervo,
  moduloHref,
  operacaoHref,
  basePath,
  page,
}: {
  tenantId: string
  isGestor: boolean
  podeGerirAcervo: boolean
  moduloHref: string | null
  operacaoHref: string | null
  basePath: string
  page: number
}) {
  const resumo = await resumirPatrimonio(tenantId)
  const ativos = resumo.quantidadeItens - resumo.baixados

  return (
    <div className="space-y-5">
      <div id="inventario" className="scroll-mt-20 space-y-3">
        {ativos > 0 || resumo.totalAtivos > 0 ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[rgb(var(--foreground-muted))]">Ativos</dt>
              <dd className="font-semibold tabular-nums">{resumo.totalAtivos}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[rgb(var(--foreground-muted))]">Disponíveis</dt>
              <dd className="font-semibold tabular-nums text-success">{resumo.disponiveis}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[rgb(var(--foreground-muted))]">Em uso / manutenção</dt>
              <dd className="font-semibold tabular-nums">
                {resumo.emUso + resumo.manutencao}
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {podeGerirAcervo
            ? 'A foto diferencia peças parecidas no inventário. Cadastre e atualize aqui.'
            : 'A foto diferencia peças parecidas no inventário. Quem gere o patrimônio cadastra e atualiza as peças.'}
        </p>

        <DepartamentoAcervoGrade
          tenantId={tenantId}
          basePath={basePath}
          page={page}
          podeGerir={podeGerirAcervo}
          emptyTitle="Inventário vazio"
          emptyDescription={
            podeGerirAcervo
              ? 'Cadastre instrumentos, bandeirões e outros bens com foto.'
              : 'Quem gere o patrimônio cadastra as peças com foto. O inventário ainda está vazio.'
          }
        />
      </div>

      {moduloHref ? (
        <Link
          href={moduloHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Filtros e empréstimos
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
      {isGestor && operacaoHref ? (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Operação (admin)
        </Link>
      ) : null}
    </div>
  )
}

export function PatrimonioInventarioSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-4 w-48 animate-pulse rounded bg-[rgb(var(--border))]" />
      <DepartamentoAcervoGradeSkeleton />
    </div>
  )
}
