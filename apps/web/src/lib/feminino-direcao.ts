import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { STATUS_PROJETO_ABERTOS } from '@torcida/types'
import { diasParaEvento } from '@/lib/eventos'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import {
  formatarDataEventoAdmin,
  slaLabel,
  type AdminEventoListaItem,
  type AdminInboxItem,
} from '@/lib/admin-inbox'
import {
  carregarPartidasSemanaTenant,
  janelaSemanaCorrente,
  serializarEventosSemana,
} from '@/lib/departamento-semana'
import type { AgendaSemanaCompactItem, AgendaSemanaPartidaItem } from '@/components/eventos/agenda-semana-compact'

const DIA_MS = 24 * 60 * 60 * 1000

export type FemininoOpsResumo = {
  departamentoId: string | null
  departamentoSlug: string
  equipe: number
  gestores: number
  campanhasAbertas: number
  proximosEventos: number
  pendencias: AdminInboxItem[]
  lista: AdminEventoListaItem[]
  semana: AgendaSemanaCompactItem[]
  partidasSemana: AgendaSemanaPartidaItem[]
}

async function fetchDirecaoFeminino(tenantId: string): Promise<FemininoOpsResumo> {
  const agora = new Date()
  const horizonte = new Date(agora.getTime() + 60 * DIA_MS)

  type DeptoRow = { id: string; slug: string }
  const depto: DeptoRow | null = await db.departamento.findFirst({
    where: { tenantId, slug: 'feminino' },
    select: { id: true, slug: true },
  })

  if (!depto) {
    return {
      departamentoId: null,
      departamentoSlug: 'feminino',
      equipe: 0,
      gestores: 0,
      campanhasAbertas: 0,
      proximosEventos: 0,
      pendencias: [
        {
          id: 'sem-depto',
          titulo: 'Departamento Feminino não encontrado',
          detalhe: 'Rode o seed de departamentos neste tenant.',
          href: '/admin/departamentos',
          tom: 'warning',
        },
      ],
      lista: [],
      semana: [],
      partidasSemana: [],
    }
  }

  type EventoRow = {
    id: string
    titulo: string
    descricao: string | null
    data: Date
    local: string | null
    fotoUrl: string | null
    tipo: string
    capacidade: number | null
    serieId: string | null
    sede: { capacidade: number | null } | null
    projeto: { titulo: string } | null
    _count: { rsvps: number }
  }

  const [equipe, gestores, campanhasAbertas, proximos]: [
    number,
    number,
    number,
    EventoRow[],
  ] = await Promise.all([
    db.userDepartamento.count({ where: { departamentoId: depto.id } }),
    db.departamentoGestor.count({ where: { departamentoId: depto.id } }),
    db.projeto.count({
      where: {
        tenantId,
        departamentoId: depto.id,
        status: { in: [...STATUS_PROJETO_ABERTOS] },
      },
    }),
    db.evento.findMany({
      where: {
        tenantId,
        data: { gte: agora, lte: horizonte },
        // Dono operacional OU herança do projeto: evento avulso da frente
        // (ensaio, escala) deixou de ficar órfão do hub.
        OR: [
          { departamentoId: depto.id },
          { projeto: { departamentoId: depto.id } },
        ],
      },
      orderBy: { data: 'asc' },
      take: 40,
      select: {
        id: true,
        titulo: true,
        descricao: true,
        data: true,
        local: true,
        fotoUrl: true,
        tipo: true,
        capacidade: true,
        serieId: true,
        sede: { select: { capacidade: true } },
        projeto: { select: { titulo: true } },
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
      },
    }) as Promise<EventoRow[]>,
  ])

  const lista: AdminEventoListaItem[] = proximos.map((evento) => {
    const cap = capacidadeEfetiva({
      capacidade: evento.capacidade,
      sede: evento.sede,
    })
    const confirmados = evento._count.rsvps
    const campanha = evento.projeto?.titulo
    return {
      id: evento.id,
      titulo: evento.titulo,
      descricao: campanha
        ? `${campanha}${evento.descricao ? ` · ${evento.descricao}` : ''}`
        : evento.descricao,
      dataLabel: formatarDataEventoAdmin(evento.data),
      local: evento.local,
      fotoUrl: evento.fotoUrl,
      confirmados,
      capacidade: cap,
      passado: false,
      tipo: evento.tipo,
      serieId: evento.serieId,
      lotacaoLabel:
        cap != null
          ? `${confirmados}/${cap} confirmados`
          : `${confirmados} confirmado${confirmados !== 1 ? 's' : ''}`,
      diasLabel: diasParaEvento(evento.data),
    }
  })

  const pendencias: AdminInboxItem[] = []

  if (gestores === 0) {
    pendencias.push({
      id: 'sem-gestor',
      titulo: 'Sem gestora designada',
      detalhe: 'Nomeie ao menos uma gestora na equipe do departamento.',
      href: `/portal/departamentos/${depto.slug}`,
      tom: 'danger',
    })
  }

  if (equipe === 0) {
    pendencias.push({
      id: 'sem-equipe',
      titulo: 'Equipe vazia',
      detalhe: 'Convide colaboradores no cockpit do portal.',
      href: `/portal/departamentos/${depto.slug}`,
      tom: 'warning',
    })
  }

  if (proximos.length === 0) {
    pendencias.push({
      id: 'sem-agenda',
      titulo: 'Nenhuma ação nos próximos 60 dias',
      detalhe: 'Crie o evento e vincule a um projeto do Feminino.',
      href: '/admin/feminino',
      tom: 'default',
    })
  } else {
    const primeiro = proximos[0]!
    pendencias.push({
      id: 'proximos',
      titulo: `${proximos.length} ação${proximos.length === 1 ? '' : 'ões'} no horizonte`,
      detalhe: 'Eventos ligados a projetos do departamento.',
      href: '/admin/feminino#agenda',
      tom: 'default',
      sla: slaLabel(primeiro.data, { agora, modo: 'ate' }),
    })
  }

  return {
    departamentoId: depto.id,
    departamentoSlug: depto.slug,
    equipe,
    gestores,
    campanhasAbertas,
    proximosEventos: proximos.length,
    pendencias: pendencias.slice(0, 8),
    lista,
    semana: [],
    partidasSemana: [],
  }
}

/**
 * Inbox do Feminino — equipe + agenda (lista na mesma carga).
 */
export const carregarDirecaoFeminino = cache(async function carregarDirecaoFeminino(
  tenantId: string,
): Promise<FemininoOpsResumo> {
  const semanaWin = janelaSemanaCorrente()
  const [ops, partidasSemana] = await Promise.all([
    unstable_cache(
      () => fetchDirecaoFeminino(tenantId),
      ['admin-direcao-feminino', tenantId],
      { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
    )(),
    carregarPartidasSemanaTenant(tenantId),
  ])

  if (!ops.departamentoId) {
    return { ...ops, partidasSemana }
  }

  const projetosIds: { id: string }[] = await db.projeto.findMany({
    where: { tenantId, departamentoId: ops.departamentoId },
    select: { id: true },
    take: 80,
  })
  const ids = projetosIds.map((p) => p.id)
  const eventosSemana =
    ids.length === 0
      ? []
      : await db.evento.findMany({
          where: {
            tenantId,
            projetoId: { in: ids },
            data: { gte: semanaWin.gte, lt: semanaWin.lt },
          },
          orderBy: { data: 'asc' },
          take: 40,
          select: {
            id: true,
            titulo: true,
            tipo: true,
            data: true,
            local: true,
            partidaId: true,
            projetoId: true,
            serieId: true,
          },
        })

  return {
    ...ops,
    semana: serializarEventosSemana(eventosSemana, (e) => `/admin/feminino/${e.id}`),
    partidasSemana,
  }
})
