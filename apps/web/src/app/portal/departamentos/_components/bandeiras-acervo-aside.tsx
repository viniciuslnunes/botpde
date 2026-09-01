import Link from 'next/link'
import { ArrowRight, Flag, Shield, ShieldAlert } from 'lucide-react'
import { carregarDirecaoBandeiras } from '@/lib/bandeiras'
import { listarCandidatosResponsavelPatrimonio } from '@/lib/patrimonio'
import { acervoItemParaRow } from '@/lib/patrimonio-row'
import { PatrimonioItensLista } from '@/components/patrimonio/patrimonio-itens-lista'
import { DepartamentoAcervoGradeSkeleton } from './departamento-acervo-grade'

/**
 * Painel de domínio do cockpit de Bandeiras: a grade com foto é o acervo.
 * Números e liberação de entrada ficam como contexto, não como o conteúdo.
 *
 * CRUD segue `flags:manage` / `patrimony:manage` (`podeGerirAcervo`) — gestor
 * do departamento sem essa permissão vê as peças, não edita.
 */
export async function BandeirasAcervoAside({
  tenantId,
  isGestor,
  podeGerirAcervo,
  moduloHref,
  operacaoHref,
  basePath,
}: {
  tenantId: string
  isGestor: boolean
  podeGerirAcervo: boolean
  moduloHref: string | null
  operacaoHref: string | null
  basePath: string
}) {
  const [ops, candidatos] = await Promise.all([
    carregarDirecaoBandeiras(tenantId),
    podeGerirAcervo ? listarCandidatosResponsavelPatrimonio(tenantId) : Promise.resolve([]),
  ])
  const semLiberacao = ops.semVistoria + ops.vistoriaVencendo
  const itens = ops.itens.map(acervoItemParaRow)

  return (
    <div className="space-y-5">
      <div id="acervo" className="scroll-mt-20 space-y-3">
        {ops.resumo.totalAtivos > 0 ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[rgb(var(--foreground-muted))]">Ativas</dt>
              <dd className="font-semibold tabular-nums">{ops.resumo.totalAtivos}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[rgb(var(--foreground-muted))]">Guardadas</dt>
              <dd className="font-semibold tabular-nums text-success">{ops.resumo.disponiveis}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[rgb(var(--foreground-muted))]">Fora / conserto</dt>
              <dd className="font-semibold tabular-nums">
                {ops.resumo.emUso + ops.resumo.manutencao}
              </dd>
            </div>
          </dl>
        ) : null}

        {ops.resumo.totalAtivos > 0 ? (
          <div
            className={
              semLiberacao > 0
                ? 'flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-sm'
                : 'flex gap-2 text-sm text-[rgb(var(--foreground-muted))]'
            }
          >
            {semLiberacao > 0 ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            <p>
              {semLiberacao > 0
                ? `${semLiberacao} bandeira${semLiberacao === 1 ? '' : 's'} sem liberação em dia — na revista, essa peça fica na porta.`
                : 'Todas as bandeiras ativas com vistoria registrada e dentro do prazo.'}
            </p>
          </div>
        ) : null}

        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {podeGerirAcervo
            ? 'A foto diferencia bandeirões, faixas e mastros parecidos. Cadastre, edite e registre a vistoria da peça.'
            : 'A foto diferencia bandeirões, faixas e mastros parecidos. Quem gere o acervo cadastra e atualiza as peças.'}
        </p>

        <PatrimonioItensLista
          itens={itens}
          podeGerir={podeGerirAcervo}
          candidatos={candidatos}
          tenantId={tenantId}
          total={itens.length}
          page={1}
          pageSize={Math.max(itens.length, 1)}
          basePath={basePath}
          categoriaTravada="BANDEIRA"
          emptyTitle="Nenhuma bandeira no acervo"
          emptyDescription={
            podeGerirAcervo
              ? 'Cadastre bandeirões, faixas e mastros com foto — é o que diferencia peças parecidas.'
              : 'Quem gere o acervo cadastra as peças com foto. Enquanto isso, o trapo ainda não tem ficha aqui.'
          }
          emptyIcon={<Flag className="mb-3 h-8 w-8 text-[rgb(var(--color-primary-fg))]" />}
          gridClassName="grid grid-cols-2 content-start gap-3 sm:grid-cols-3"
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

export function BandeirasAcervoSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-4 w-48 animate-pulse rounded bg-[rgb(var(--border))]" />
      <DepartamentoAcervoGradeSkeleton />
    </div>
  )
}
