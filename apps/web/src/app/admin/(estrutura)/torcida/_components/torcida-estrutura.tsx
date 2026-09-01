import { Lock, Network } from 'lucide-react'
import {
  getAncestorTenantIds,
  getHierarquiaVisivelParaFilhos,
  getWorktreeParaDescendente,
  type TorcidaWorktreeNode,
} from '@/lib/hierarquia'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { sedeTipoBadgeClass } from '@/lib/sede-tipo-badge'

const TIPO_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

/**
 * Visão da estrutura da torcida para uma unidade DESCENDENTE (subsede/PDE com
 * tenant próprio). Respeita R3: `getWorktreeParaDescendente` só devolve a árvore
 * completa da torcida quando o Presidente habilitou o toggle na raiz; caso
 * contrário, a unidade vê apenas a si mesma (+ um aviso).
 */
export async function TorcidaEstrutura({
  tenantId,
  tenantNome,
}: {
  tenantId: string
  tenantNome: string
}) {
  const ancestrais: string[] = await getAncestorTenantIds(tenantId)
  const temAncestral = ancestrais.length > 0
  const rootId = temAncestral ? ancestrais[ancestrais.length - 1] : tenantId

  const [nodes, visivel]: [TorcidaWorktreeNode[], boolean] = await Promise.all([
    getWorktreeParaDescendente(tenantId),
    temAncestral ? getHierarquiaVisivelParaFilhos(rootId) : Promise.resolve(true),
  ])

  const bloqueado = temAncestral && !visivel

  return (
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <div className="space-y-3">
          <p className="portal-kicker text-[rgb(var(--color-primary-fg))]">
            Estrutura
          </p>
          <h1 className="portal-display text-2xl text-[rgb(var(--foreground))]">
            Estrutura da torcida
          </h1>
          <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">{tenantNome}</p>
        </div>
      </MotionReveal>

      {bloqueado && (
        <MotionReveal index={1}>
          <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              A visão completa da hierarquia da torcida ainda não foi liberada pelo Presidente.
              Você enxerga a sua própria unidade e as suas sub-unidades.
            </p>
          </div>
        </MotionReveal>
      )}

      <MotionReveal index={2}>
        <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <ul className="divide-y divide-[rgb(var(--border))]">
            {nodes.map((n) => (
              <li key={n.key} className="flex items-center gap-2 px-4 py-3">
                <span style={{ paddingLeft: `${n.depth * 1.25}rem` }} className="flex items-center gap-2">
                  {n.depth > 0 && (
                    <span
                      aria-hidden
                      className="mr-1 inline-block h-3 w-3 shrink-0 border-b border-l border-[rgb(var(--border))]"
                    />
                  )}
                  <Network className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
                  <span className="font-medium text-[rgb(var(--foreground))]">{n.nome}</span>
                </span>
                <span
                  className={[
                    'ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                    sedeTipoBadgeClass(n.tipo),
                  ].join(' ')}
                >
                  {TIPO_LABEL[n.tipo] ?? n.tipo}
                </span>
                {n.cidade && (
                  <span className="hidden shrink-0 text-xs text-[rgb(var(--foreground-muted))] sm:inline">
                    {n.cidade}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </MotionReveal>
    </div>
  )
}
