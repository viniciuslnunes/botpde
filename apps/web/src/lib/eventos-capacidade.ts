/**
 * Capacidade efetiva = override do evento, senão capacidade da sede.
 * Sem nenhum dos dois → sem teto (lotação livre).
 */
import { db } from '@torcida/db'
import { temValorVaga } from '@torcida/types'

export function capacidadeEfetiva(evento: {
  capacidade?: number | null
  sede?: { capacidade: number | null } | null
}): number | null {
  if (evento.capacidade != null && evento.capacidade > 0) return evento.capacidade
  const sedeCap = evento.sede?.capacidade
  if (sedeCap != null && sedeCap > 0) return sedeCap
  return null
}

export function lotacaoCheia(ocupados: number, capacidade: number | null): boolean {
  return capacidade != null && ocupados >= capacidade
}

/**
 * Conta quem ocupa a vaga de verdade.
 * Caravana paga → cobranças PAGA; demais → RSVP CONFIRMADO.
 */
export async function contarOcupacaoEvento(opts: {
  tenantId: string
  eventoId: string
  valorVaga: number | string | null | undefined
}): Promise<number> {
  if (temValorVaga(opts.valorVaga)) {
    return db.cobrancaAssociacao.count({
      where: {
        tenantId: opts.tenantId,
        eventoId: opts.eventoId,
        status: 'PAGA',
      },
    })
  }
  return db.eventoRsvp.count({
    where: { eventoId: opts.eventoId, status: 'CONFIRMADO' },
  })
}
