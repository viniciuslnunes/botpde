'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionTabBar } from '@/components/motion/motion-tab-bar'
import { springSnappy } from '@/lib/motion-presets'
import { AfiliacaoPedidoCard, type SolicitacaoView } from './afiliacao-pedido-card'

type FiltroStatus = 'PENDENTE' | 'APROVADA' | 'RECUSADA' | 'REMOVIDA'

const FILTRO_LABEL: Record<FiltroStatus, string> = {
  PENDENTE: 'Pendentes',
  APROVADA: 'Aprovadas',
  RECUSADA: 'Recusadas',
  REMOVIDA: 'Removidas',
}

export function AfiliacaoPedidosClient({
  pedidos,
  podeDecidir,
}: {
  pedidos: SolicitacaoView[]
  podeDecidir: boolean
}) {
  const [filtro, setFiltro] = useState<FiltroStatus>(() => {
    const primeiroComItens = (['PENDENTE', 'APROVADA', 'RECUSADA', 'REMOVIDA'] as const).find((s) =>
      pedidos.some((p) => p.status === s),
    )
    return primeiroComItens ?? 'PENDENTE'
  })

  const contagens = useMemo(() => {
    const base: Record<FiltroStatus, number> = {
      PENDENTE: 0,
      APROVADA: 0,
      RECUSADA: 0,
      REMOVIDA: 0,
    }
    for (const p of pedidos) base[p.status] += 1
    return base
  }, [pedidos])

  const filtrados = pedidos.filter((p) => p.status === filtro)

  if (pedidos.length === 0) {
    return (
      <MotionReveal>
        <MotionEmptyState
          title="Nenhuma solicitação no momento"
          description="Subsedes e PDEs que pedem cadastro pelo onboarding aparecem aqui para a decisão do Presidente."
        />
      </MotionReveal>
    )
  }

  return (
    <MotionReveal>
      <div className="space-y-4">
        <MotionTabBar
          items={(Object.keys(FILTRO_LABEL) as FiltroStatus[]).map((id) => ({
            id,
            label: FILTRO_LABEL[id],
            count: contagens[id] > 0 ? contagens[id] : undefined,
          }))}
          activeId={filtro}
          onTabChange={(id) => setFiltro(id as FiltroStatus)}
          layoutId="admin-afiliacoes-status-tabs"
        />

        <AnimatePresence mode="wait">
          <m.div
            key={filtro}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="space-y-4"
          >
            {filtrados.length === 0 ? (
              <MotionEmptyState
                title={`Nenhuma solicitação ${FILTRO_LABEL[filtro].toLowerCase()}`}
                description="Troque de aba para ver outros status."
              />
            ) : (
              filtrados.map((pedido) => (
                <AfiliacaoPedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  podeDecidir={podeDecidir}
                />
              ))
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </MotionReveal>
  )
}
