import Link from 'next/link'
import { ArrowRight, Landmark, Shield } from 'lucide-react'
import {
  CATEGORIA_PATRIMONIO_LABEL,
  STATUS_PATRIMONIO_LABEL,
} from '@torcida/types'
import { carregarPainelPatrimonio } from '@/lib/patrimonio'

export async function PatrimonioInventarioAside({
  tenantId,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVerPatrimonio,
}: {
  tenantId: string
  nome: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVerPatrimonio: boolean
}) {
  if (!podeVerPatrimonio) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Inventário</h2>
        </div>
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Você faz parte de {nome}, mas não tem permissão para ver o inventário. Peça
            acesso ao patrimônio ao gestor ou à Presidência.
          </p>
      </div>
    )
  }

  const { resumo, recentes } = await carregarPainelPatrimonio(tenantId, 5)

  return (
    <div className="space-y-4">
      <div id="inventario" className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-stone-600 dark:text-stone-300" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Inventário</h2>
        </div>
        {resumo.quantidadeItens - resumo.baixados > 0 || resumo.totalAtivos > 0 ? (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Ativos (qtde)</dt>
              <dd className="font-semibold tabular-nums">{resumo.totalAtivos}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Disponíveis</dt>
              <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {resumo.disponiveis}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Em uso / manutenção</dt>
              <dd className="font-semibold tabular-nums">
                {resumo.emUso + resumo.manutencao}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Ainda sem itens ativos. Gestores cadastram o inventário no módulo Patrimônio.
          </p>
        )}

        {recentes.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
            {recentes.map((i) => (
              <li key={i.id} className="text-xs">
                <p className="truncate font-medium text-[rgb(var(--foreground))]">{i.nome}</p>
                <p className="text-[rgb(var(--foreground-muted))]">
                  {CATEGORIA_PATRIMONIO_LABEL[i.categoria]} ·{' '}
                  {STATUS_PATRIMONIO_LABEL[i.status]} · qtd {i.quantidade}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {moduloHref && (
        <Link
          href={moduloHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Abrir patrimônio
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

export function PatrimonioInventarioSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="h-4 w-24 rounded bg-[rgb(var(--border))]" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded bg-[rgb(var(--border))]" />
          <div className="h-4 w-full rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
