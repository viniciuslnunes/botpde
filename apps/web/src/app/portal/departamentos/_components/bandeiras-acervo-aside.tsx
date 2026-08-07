import Link from 'next/link'
import { ArrowRight, Flag, Shield, ShieldAlert } from 'lucide-react'
import { carregarDirecaoBandeiras } from '@/lib/bandeiras'

/**
 * Painel de domínio do cockpit de Bandeiras: o acervo em número e o único
 * alerta que muda o dia do departamento — bandeira sem liberação em dia não
 * entra no estádio.
 */
export async function BandeirasAcervoAside({
  tenantId,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVer,
}: {
  tenantId: string
  nome: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVer: boolean
}) {
  if (!podeVer) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Acervo</h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
          Você faz parte de {nome}, mas não tem permissão para ver o acervo. Peça acesso às
          bandeiras ao gestor da área ou à Presidência.
        </p>
      </div>
    )
  }

  const ops = await carregarDirecaoBandeiras(tenantId)
  const semLiberacao = ops.semVistoria + ops.vistoriaVencendo

  return (
    <div className="space-y-4">
      <div
        id="acervo"
        className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
      >
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Acervo</h2>
        </div>

        {ops.resumo.totalAtivos > 0 ? (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Bandeiras ativas</dt>
              <dd className="font-semibold tabular-nums">{ops.resumo.totalAtivos}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Guardadas</dt>
              <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {ops.resumo.disponiveis}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Fora / em conserto</dt>
              <dd className="font-semibold tabular-nums">
                {ops.resumo.emUso + ops.resumo.manutencao}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma bandeira cadastrada ainda. Comece pelo bandeirão principal — categoria
            Bandeira no inventário.
          </p>
        )}
      </div>

      <div
        id="vistoria"
        className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
      >
        <div className="flex items-center gap-2">
          {semLiberacao > 0 ? (
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Liberação de entrada
          </h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
          {ops.resumo.totalAtivos === 0
            ? 'A ficha de vistoria (medidas, mastro e autorização) aparece aqui assim que houver bandeira cadastrada.'
            : semLiberacao > 0
              ? `${semLiberacao} bandeira${semLiberacao === 1 ? '' : 's'} sem liberação em dia — na revista, essa peça fica na porta.`
              : 'Todas as bandeiras ativas com vistoria registrada e dentro do prazo.'}
        </p>
      </div>

      {moduloHref && (
        <Link
          href={moduloHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Abrir acervo
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Operação (admin)
        </Link>
      )}
    </div>
  )
}

export function BandeirasAcervoSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="h-4 w-20 rounded bg-[rgb(var(--border))]" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded bg-[rgb(var(--border))]" />
          <div className="h-4 w-full rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
