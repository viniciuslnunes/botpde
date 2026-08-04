import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import {
  BARRACAO_CHECKLIST,
  BARRACAO_URGENCIA_DIAS,
  barracaoEmUrgencia,
  barracaoItemsFromMeta,
  barracaoProgress,
  desfileEmFromMeta,
  diasAteDesfile,
} from '@torcida/types'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { diasParaEvento } from '@/lib/eventos'
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

const DIA_MS = 24 * 60 * 60 * 1000

export type CarnavalOpsResumo = {
  departamentoId: string | null
  departamentoSlug: string
  departamentoNome: string
  meta: unknown
  barracaoDone: number
  barracaoTotal: number
  itensPendentes: Array<{ id: string; label: string }>
  proximosEventos: number
  desfileEmIso: string | null
  diasAteDesfile: number | null
  urgenciaBarracao: boolean
  pendencias: AdminInboxItem[]
  /** Lista para a home — evita segundo findMany na page. */
  lista: AdminEventoListaItem[]
}

async function fetchDirecaoCarnaval(tenantId: string): Promise<CarnavalOpsResumo> {
  const agora = new Date()
  const horizonte = new Date(agora.getTime() + 90 * DIA_MS)

  type DeptoRow = { id: string; slug: string; nome: string; meta: unknown }
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
    _count: { rsvps: number }
  }

  const depto: DeptoRow | null = await db.departamento.findFirst({
    where: { tenantId, slug: 'carnaval' },
    select: { id: true, slug: true, nome: true, meta: true },
  })

  if (!depto) {
    return {
      departamentoId: null,
      departamentoSlug: 'carnaval',
      departamentoNome: 'Carnaval',
      meta: null,
      barracaoDone: 0,
      barracaoTotal: BARRACAO_CHECKLIST.length,
      itensPendentes: [...BARRACAO_CHECKLIST],
      proximosEventos: 0,
      desfileEmIso: null,
      diasAteDesfile: null,
      urgenciaBarracao: false,
      pendencias: [
        {
          id: 'sem-depto',
          titulo: 'Departamento Carnaval não encontrado',
          detalhe: 'Rode o seed de departamentos neste tenant.',
          href: '/admin/departamentos',
          tom: 'warning',
        },
      ],
      lista: [],
    }
  }

  const progress = barracaoProgress(depto.meta)
  const items = barracaoItemsFromMeta(depto.meta)
  const itensPendentes = BARRACAO_CHECKLIST.filter((d) => !items[d.id]?.done).map((d) => ({
    id: d.id,
    label: d.label,
  }))

  const desfile = desfileEmFromMeta(depto.meta)
  const diasDesfile = diasAteDesfile(depto.meta, agora)
  const urgencia = barracaoEmUrgencia(depto.meta, agora)

  const proximos: EventoRow[] = await db.evento.findMany({
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
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })

  const lista: AdminEventoListaItem[] = proximos.map((evento) => {
    const cap = capacidadeEfetiva({
      capacidade: evento.capacidade,
      sede: evento.sede,
    })
    const confirmados = evento._count.rsvps
    return {
      id: evento.id,
      titulo: evento.titulo,
      descricao: evento.descricao,
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

  if (urgencia && itensPendentes.length > 0) {
    pendencias.push({
      id: 'barracao-urgente',
      titulo: `Barracão urgente · faltam ${diasDesfile}d para o desfile`,
      detalhe: `${itensPendentes.length} item${itensPendentes.length === 1 ? '' : 's'} pendente${itensPendentes.length === 1 ? '' : 's'} (≤${BARRACAO_URGENCIA_DIAS}d).`,
      href: '/admin/carnaval#barracao',
      tom: 'danger',
      sla: slaLabel(desfile ?? agora, { agora, modo: 'ate' }),
    })
  } else if (itensPendentes.length > 0) {
    pendencias.push({
      id: 'barracao-pendente',
      titulo: `${itensPendentes.length} item${itensPendentes.length === 1 ? '' : 's'} do barracão pendente${itensPendentes.length === 1 ? '' : 's'}`,
      detalhe: itensPendentes
        .slice(0, 3)
        .map((i) => i.label)
        .join(', '),
      href: '/admin/carnaval#barracao',
      tom: itensPendentes.length >= 4 ? 'danger' : 'warning',
      sla: desfile ? slaLabel(desfile, { agora, modo: 'ate' }) : null,
    })
  }

  if (!desfile) {
    pendencias.push({
      id: 'sem-desfile',
      titulo: 'Data do desfile não definida',
      detalhe: 'Informe a data para priorizar o checklist nos 14 dias finais.',
      href: '/admin/carnaval#barracao',
      tom: 'default',
    })
  }

  if (proximos.length === 0) {
    pendencias.push({
      id: 'sem-cronograma',
      titulo: 'Sem eventos no cronograma do Carnaval',
      detalhe: 'Crie ensaios/concentração e vincule a um projeto do departamento.',
      href: '/admin/carnaval#cronograma',
      tom: 'warning',
    })
  } else {
    const primeiro = proximos[0]!
    pendencias.push({
      id: 'cronograma',
      titulo: `${proximos.length} evento${proximos.length === 1 ? '' : 's'} no cronograma`,
      detalhe: 'Próximos 90 dias vinculados a projetos do Carnaval.',
      href: '/admin/carnaval#cronograma',
      tom: 'default',
      sla: slaLabel(primeiro.data, { agora, modo: 'ate' }),
    })
  }

  return {
    departamentoId: depto.id,
    departamentoSlug: depto.slug,
    departamentoNome: depto.nome,
    meta: depto.meta,
    barracaoDone: progress.done,
    barracaoTotal: progress.total,
    itensPendentes,
    proximosEventos: proximos.length,
    desfileEmIso: desfile ? desfile.toISOString().slice(0, 10) : null,
    diasAteDesfile: diasDesfile,
    urgenciaBarracao: urgencia,
    pendencias: pendencias.slice(0, 8),
    lista,
  }
}

/**
 * Inbox do Carnaval — progresso do barracão + cronograma (lista na mesma carga).
 */
export const carregarDirecaoCarnaval = cache(async function carregarDirecaoCarnaval(
  tenantId: string,
): Promise<CarnavalOpsResumo> {
  return unstable_cache(
    () => fetchDirecaoCarnaval(tenantId),
    ['admin-direcao-carnaval', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
