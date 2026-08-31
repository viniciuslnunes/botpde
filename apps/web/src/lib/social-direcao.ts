import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { hrefHomeDepartamento, saudeOrcamento, STATUS_PROJETO_ABERTOS } from '@torcida/types'
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

export type SocialOpsResumo = {
  departamentoId: string | null
  departamentoSlug: string
  campanhasAbertas: number
  orcamentosEstourados: number
  proximosEventos: number
  pendencias: AdminInboxItem[]
  lista: AdminEventoListaItem[]
  semana: AgendaSemanaCompactItem[]
  partidasSemana: AgendaSemanaPartidaItem[]
}

async function fetchDirecaoSocial(
  tenantId: string,
  opts?: { incluirOrcamento?: boolean },
): Promise<SocialOpsResumo> {
  const incluirOrcamento = opts?.incluirOrcamento ?? false
  const agora = new Date()
  const horizonte = new Date(agora.getTime() + 45 * DIA_MS)

  type DeptoRow = { id: string; slug: string; nome: string }
  const depto: DeptoRow | null = await db.departamento.findFirst({
    where: { tenantId, slug: 'social-e-eventos' },
    select: { id: true, slug: true, nome: true },
  })

  if (!depto) {
    return {
      departamentoId: null,
      departamentoSlug: 'social-e-eventos',
      campanhasAbertas: 0,
      orcamentosEstourados: 0,
      proximosEventos: 0,
      pendencias: [
        {
          id: 'sem-depto',
          titulo: 'Departamento Social não encontrado',
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

  type ProjetoRow = {
    id: string
    titulo: string
    orcamentoPrevisto: { toNumber(): number } | number | null
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

  const [projetos, proximos, eventosSemProjeto]: [ProjetoRow[], EventoRow[], number] =
    await Promise.all([
      db.projeto.findMany({
        where: {
          tenantId,
          departamentoId: depto.id,
          status: { in: [...STATUS_PROJETO_ABERTOS] },
        },
        take: 80,
        orderBy: { titulo: 'asc' },
        select: { id: true, titulo: true, orcamentoPrevisto: true },
      }),
      db.evento.findMany({
        where: {
          tenantId,
          data: { gte: agora, lte: horizonte },
          projeto: { departamentoId: depto.id },
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
      db.evento.count({
        where: {
          tenantId,
          tipo: 'GERAL',
          data: { gte: agora, lte: horizonte },
          projetoId: null,
        },
      }),
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
  let orcamentosEstourados = 0

  if (incluirOrcamento && projetos.length > 0) {
    const ids = projetos.map((p) => p.id)
    const somas: Array<{ projetoId: string | null; _sum: { valor: unknown } }> =
      await db.financeiroLancamento.groupBy({
        by: ['projetoId'],
        where: { tenantId, tipo: 'DESPESA', projetoId: { in: ids } },
        _sum: { valor: true },
      })
    const gastoPorId = new Map<string, number>()
    for (const s of somas) {
      if (s.projetoId) gastoPorId.set(s.projetoId, Number(s._sum.valor ?? 0))
    }

    for (const p of projetos) {
      const previsto =
        p.orcamentoPrevisto == null
          ? null
          : typeof p.orcamentoPrevisto === 'number'
            ? p.orcamentoPrevisto
            : p.orcamentoPrevisto.toNumber()
      const saude = saudeOrcamento(gastoPorId.get(p.id) ?? 0, previsto)
      if (saude?.estourou) {
        orcamentosEstourados += 1
        pendencias.push({
          id: `orc-${p.id}`,
          titulo: `Orçamento estourado · ${p.titulo}`,
          detalhe: `${saude.percentual}% do previsto consumido.`,
          href: hrefHomeDepartamento(depto.slug, 'projetos'),
          tom: 'danger',
        })
      }
    }
  }

  if (projetos.length === 0) {
    pendencias.push({
      id: 'sem-campanhas',
      titulo: 'Nenhuma campanha aberta',
      detalhe: 'Abra uma campanha/projeto no cockpit do departamento.',
      href: hrefHomeDepartamento(depto.slug, 'projetos'),
      tom: 'warning',
    })
  }

  if (proximos.length === 0 && eventosSemProjeto > 0) {
    pendencias.push({
      id: 'eventos-sem-projeto',
      titulo: `${eventosSemProjeto} evento${eventosSemProjeto === 1 ? '' : 's'} geral${eventosSemProjeto === 1 ? '' : 'is'} sem projeto`,
      detalhe: 'Vincule à campanha do Social para acompanhar por aqui.',
      href: '/admin/eventos?tipo=GERAL',
      tom: 'default',
    })
  }

  if (proximos.length > 0) {
    const primeiro = proximos[0]!
    pendencias.push({
      id: 'proximos',
      titulo: `${proximos.length} ação${proximos.length === 1 ? '' : 'ões'} nos próximos 45 dias`,
      detalhe: 'Eventos ligados a projetos do Social.',
      href: '/admin/social',
      tom: 'default',
      sla: slaLabel(primeiro.data, { agora, modo: 'ate' }),
    })
  }

  return {
    departamentoId: depto.id,
    departamentoSlug: depto.slug,
    campanhasAbertas: projetos.length,
    orcamentosEstourados,
    proximosEventos: proximos.length,
    pendencias: pendencias.slice(0, 10),
    lista,
    semana: [],
    partidasSemana: [],
  }
}

/**
 * Inbox do Social — campanhas + agenda vinculada (lista na mesma carga).
 */
export const carregarDirecaoSocial = cache(async function carregarDirecaoSocial(
  tenantId: string,
  opts?: { incluirOrcamento?: boolean },
): Promise<SocialOpsResumo> {
  const incluir = opts?.incluirOrcamento ?? false
  const semanaWin = janelaSemanaCorrente()
  const [ops, partidasSemana] = await Promise.all([
    unstable_cache(
      () => fetchDirecaoSocial(tenantId, { incluirOrcamento: incluir }),
      ['admin-direcao-social', tenantId, incluir ? '1' : '0'],
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
    semana: serializarEventosSemana(eventosSemana, (e) => `/admin/social/${e.id}`),
    partidasSemana,
  }
})
