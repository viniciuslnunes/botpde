import { cache } from 'react'
import { db } from '@torcida/db'
import { listarEventosPorTipo } from '@/lib/eventos-tipo'
import type { ProximaAcaoArea } from './departamento-proxima-acao'

export const resolverProximaAcaoArea = cache(async function resolverProximaAcaoArea(input: {
  tenantId: string
  slug: string
  panel: string
  isGestor: boolean
  totalPendentes: number
  podeVerFinanceiro: boolean
}): Promise<ProximaAcaoArea> {
  const { tenantId, panel, isGestor, totalPendentes, podeVerFinanceiro } = input

  if (panel === 'diretoria' && isGestor && totalPendentes > 0) {
    return {
      titulo: `${totalPendentes} solicitação${totalPendentes === 1 ? '' : 'ões'} pendente${totalPendentes === 1 ? '' : 's'}`,
      descricao: 'Aprove ou reprove na fila deste departamento.',
      href: '#fila',
      cta: 'Ver fila',
    }
  }

  if (panel === 'financeiro' && podeVerFinanceiro) {
    type Agg = { id: string }
    const vencidas: Agg[] = await db.cobrancaAssociacao.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      select: { id: true },
      take: 1,
    })
    if (vencidas.length > 0) {
      return {
        titulo: 'Há cobranças em aberto',
        descricao: 'Veja inadimplência e mensalidades da associação.',
        href: '/portal/cobrancas',
        cta: 'Mensalidades',
      }
    }
  }

  if (panel === 'bateria') {
    const ensaios = await listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: true, limite: 1 })
    if (ensaios[0]) {
      return {
        titulo: ensaios[0].titulo,
        descricao: 'Próximo ensaio da bateria.',
        href: `/portal/bateria/${ensaios[0].id}`,
        cta: 'Abrir ensaio',
      }
    }
  }

  if (panel === 'caravanas') {
    const cars = await listarEventosPorTipo(tenantId, 'CARAVANA', { futuros: true, limite: 1 })
    if (cars[0]) {
      return {
        titulo: cars[0].titulo,
        descricao: 'Próxima caravana — RSVP e embarque.',
        href: `/portal/caravanas/${cars[0].id}`,
        cta: 'Abrir caravana',
      }
    }
  }

  // Sem urgência: não duplicar CTAs soft do aside (comunidade/loja/eventos).
  return null
})
