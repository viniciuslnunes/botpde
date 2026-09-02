import { db } from '@torcida/db'
import { MEMORIA_ESCOPO } from '@torcida/types'
import {
  addCalendarDays,
  formatDateOnlyIso,
  parseDateOnly,
  startOfZonedDayUtc,
  zonedDateParts,
} from '@/lib/format-datetime'
import { criarNotificacoesEmLoteSePendentes, listarUserIdsMembrosAprovados } from '@/lib/notificacoes'

/** Link estável para deduplicar notificações do mesmo dia. */
export function hrefMemoriaDia(diaIso: string, escopo: string): string {
  const p = new URLSearchParams()
  p.set('dia', diaIso)
  p.set('escopo', escopo)
  return `/portal/memoria?${p.toString()}`
}

function janelaDiaCivilSp(ref = new Date()) {
  const diaIso = formatDateOnlyIso(zonedDateParts(ref))
  const gte = startOfZonedDayUtc(parseDateOnly(diaIso))
  const lt = startOfZonedDayUtc(addCalendarDays(parseDateOnly(diaIso), 1))
  return { diaIso, gte, lt }
}

/**
 * Notifica sócios aprovados quando o dia da Memória “abre” — jogo do clube ou
 * evento da unidade hoje. Idempotente via `criarNotificacoesEmLoteSePendentes`.
 * Rodar 1×/dia (ex.: cron às 08h SP).
 */
export async function dispatchMemoriaDiaAberto(now = new Date()): Promise<{
  jogos: number
  eventos: number
}> {
  const horaSp = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  if (horaSp !== 8) {
    return { jogos: 0, eventos: 0 }
  }

  const { diaIso, gte, lt } = janelaDiaCivilSp(now)
  let jogos = 0
  let eventos = 0

  const partidas: Array<{
    id: string
    afiliacaoId: string
    adversario: string
  }> = await db.partida.findMany({
    where: {
      dataHora: { gte, lt },
      status: { in: ['AGENDADA', 'AO_VIVO', 'ENCERRADA'] },
    },
    select: { id: true, afiliacaoId: true, adversario: true },
  })

  for (const p of partidas) {
    const tenants: Array<{ id: string }> = await db.tenant.findMany({
      where: { afiliacaoId: p.afiliacaoId, ativo: true, sintetico: false },
      select: { id: true },
      take: 120,
    })
    const link = hrefMemoriaDia(diaIso, MEMORIA_ESCOPO.CLUBE)
    for (const t of tenants) {
      const userIds = await listarUserIdsMembrosAprovados(t.id)
      jogos += await criarNotificacoesEmLoteSePendentes(
        userIds.map((userId) => ({
          userId,
          tenantId: t.id,
          tipo: 'MEMORIA_DIA_ABERTO' as const,
          titulo: 'Memória do jogo aberta',
          corpo: `Hoje tem jogo contra ${p.adversario} — a linha do clube já está no ar.`,
          link,
        })),
      )
    }
  }

  const evs: Array<{ id: string; tenantId: string; titulo: string }> = await db.evento.findMany({
    where: { data: { gte, lt } },
    select: { id: true, tenantId: true, titulo: true },
    take: 200,
  })

  for (const ev of evs) {
    const userIds = await listarUserIdsMembrosAprovados(ev.tenantId)
    const link = hrefMemoriaDia(diaIso, MEMORIA_ESCOPO.UNIDADE)
    eventos += await criarNotificacoesEmLoteSePendentes(
      userIds.map((userId) => ({
        userId,
        tenantId: ev.tenantId,
        tipo: 'MEMORIA_DIA_ABERTO' as const,
        titulo: 'Memória do dia aberta',
        corpo: `Hoje: “${ev.titulo}” — conte o que rolou na linha da torcida.`,
        link,
      })),
    )
  }

  return { jogos, eventos }
}
