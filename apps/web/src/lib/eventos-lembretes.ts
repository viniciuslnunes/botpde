import { db } from '@torcida/db'
import { criarNotificacoesEmLote } from '@/lib/notificacoes'
import { notificarAdminsPorPermissao } from '@/lib/notificacoes-routing'
import { hrefAdminEvento, slugDepartamentoDoEvento } from '@/lib/eventos-admin-href'
import { PERMISSIONS } from '@torcida/types'

const JANELA_MS = 15 * 60 * 1000 // ±15 min em torno do alvo

function janela(alvo: Date) {
  return {
    gte: new Date(alvo.getTime() - JANELA_MS),
    lte: new Date(alvo.getTime() + JANELA_MS),
  }
}

/**
 * Dispara lembretes T−24h / T−2h para confirmados e resumo do dia para gestores.
 * Idempotente o bastante para cron a cada 10–15 min (usa título+link estáveis;
 * duplicatas raros se o cron sobrepor — aceitável no MVP).
 */
export async function dispatchLembretesEventos(now = new Date()): Promise<{
  lembretes24h: number
  lembretes2h: number
  gestoresDia: number
}> {
  const alvo24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const alvo2 = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const inicioDia = new Date(now)
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(now)
  fimDia.setHours(23, 59, 59, 999)

  type EventoLite = {
    id: string
    tenantId: string
    titulo: string
    data: Date
    tipo: string
    projeto: { departamento: { slug: string } | null } | null
    rsvps: Array<{ userId: string }>
    _count: { rsvps: number }
  }

  const [ev24, ev2, evHoje] = await Promise.all([
    db.evento.findMany({
      where: { data: janela(alvo24) },
      select: {
        id: true,
        tenantId: true,
        titulo: true,
        data: true,
        tipo: true,
        projeto: { select: { departamento: { select: { slug: true } } } },
        rsvps: {
          where: { status: 'CONFIRMADO' },
          select: { userId: true },
        },
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
      },
    }) as Promise<EventoLite[]>,
    db.evento.findMany({
      where: { data: janela(alvo2) },
      select: {
        id: true,
        tenantId: true,
        titulo: true,
        data: true,
        tipo: true,
        projeto: { select: { departamento: { select: { slug: true } } } },
        rsvps: {
          where: { status: 'CONFIRMADO' },
          select: { userId: true },
        },
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
      },
    }) as Promise<EventoLite[]>,
    db.evento.findMany({
      where: { data: { gte: inicioDia, lte: fimDia } },
      select: {
        id: true,
        tenantId: true,
        titulo: true,
        data: true,
        tipo: true,
        projeto: { select: { departamento: { select: { slug: true } } } },
        rsvps: {
          where: { status: 'CONFIRMADO' },
          select: { userId: true },
        },
        _count: {
          select: {
            rsvps: { where: { status: 'CONFIRMADO' } },
          },
        },
      },
    }) as Promise<EventoLite[]>,
  ])

  let lembretes24h = 0
  let lembretes2h = 0
  let gestoresDia = 0

  for (const ev of ev24) {
    lembretes24h += await criarNotificacoesEmLote(
      ev.rsvps.map((r) => ({
        userId: r.userId,
        tenantId: ev.tenantId,
        tipo: 'EVENTO_LEMBRETE' as const,
        titulo: 'Lembrete: evento amanhã',
        corpo: `“${ev.titulo}” começa em cerca de 24 horas.`,
        link: `/portal/eventos/${ev.id}`,
      })),
    )
  }

  for (const ev of ev2) {
    lembretes2h += await criarNotificacoesEmLote(
      ev.rsvps.map((r) => ({
        userId: r.userId,
        tenantId: ev.tenantId,
        tipo: 'EVENTO_LEMBRETE' as const,
        titulo: 'Lembrete: evento em 2 horas',
        corpo: `“${ev.titulo}” começa em breve.`,
        link: `/portal/eventos/${ev.id}`,
      })),
    )
  }

  // Resumo do dia para gestores — uma vez por evento no dia (janela matinal ~08h±15)
  const hora = now.getHours()
  if (hora === 8) {
    for (const ev of evHoje) {
      const embarcados = await db.eventoRsvp.count({
        where: { eventoId: ev.id, checkedInAt: { not: null } },
      })
      gestoresDia += await notificarAdminsPorPermissao(PERMISSIONS.EVENTS_MANAGE, {
        tenantId: ev.tenantId,
        tipo: 'EVENTO_DIA_GESTOR',
        titulo: `Hoje: ${ev.titulo}`,
        corpo: `${ev._count.rsvps} confirmados · ${embarcados} com check-in`,
        link: hrefAdminEvento({
          id: ev.id,
          tipo: ev.tipo,
          departamentoSlug: slugDepartamentoDoEvento(ev),
        }),
      })
    }
  }

  return { lembretes24h, lembretes2h, gestoresDia }
}
