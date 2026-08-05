'use client'

import {
  AgendaSemanaCompact,
  type AgendaSemanaCompactItem,
  type AgendaSemanaPartidaItem,
} from '@/components/eventos/agenda-semana-compact'

/**
 * Entrada semanal dos hubs thin de departamento (Caravanas, Bateria, …).
 * Reusa o cluster da Agenda — filtro de itens fica no loader `*-direcao`.
 */
export function DepartamentoSemanaOps({
  itens,
  partidas = [],
  semanaHref,
  podeVincularPartida = false,
  titulo = 'Esta semana',
  className,
}: {
  itens: AgendaSemanaCompactItem[]
  partidas?: AgendaSemanaPartidaItem[]
  /** Ex.: `/admin/eventos?vista=semana&tipo=CARAVANA` */
  semanaHref: string
  podeVincularPartida?: boolean
  titulo?: string
  className?: string
}) {
  return (
    <AgendaSemanaCompact
      itens={itens}
      partidas={partidas}
      semanaHref={semanaHref}
      podeVincularPartida={podeVincularPartida}
      titulo={titulo}
      className={className}
    />
  )
}
