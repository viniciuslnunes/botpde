import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { listarEmprestimosPatrimonio, listarPatrimonio } from '@/lib/patrimonio'
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

const DIA_MS = 24 * 60 * 60 * 1000

export type BateriaOpsResumo = {
  proximos: number
  confirmadosProximos: number
  faltososUltimo: number
  instrumentosEmUso: number
  pendencias: AdminInboxItem[]
  lista: AdminEventoListaItem[]
}

async function fetchDirecaoBateria(
  tenantId: string,
  opts?: { incluirInstrumentos?: boolean },
): Promise<BateriaOpsResumo> {
  const agora = new Date()
  const horizonte = new Date(agora.getTime() + 45 * DIA_MS)
  const incluirInstrumentos = opts?.incluirInstrumentos ?? false

  type EnsaioRow = {
    id: string
    titulo: string
    descricao: string | null
    data: Date
    local: string | null
    fotoUrl: string | null
    serieId: string | null
    capacidade: number | null
    sede: { capacidade: number | null } | null
    rsvps: Array<{ status: string; checkedInAt: Date | null }>
  }

  const [proximos, ultimoPassado, instrumentosLista, emprestimosInstr]: [
    EnsaioRow[],
    EnsaioRow | null,
    Awaited<ReturnType<typeof listarPatrimonio>> | null,
    Awaited<ReturnType<typeof listarEmprestimosPatrimonio>> | null,
  ] = await Promise.all([
    db.evento.findMany({
      where: {
        tenantId,
        tipo: 'ENSAIO',
        data: { gte: agora, lte: horizonte },
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
        serieId: true,
        capacidade: true,
        sede: { select: { capacidade: true } },
        rsvps: {
          where: { status: 'CONFIRMADO' },
          select: { status: true, checkedInAt: true },
        },
      },
    }),
    db.evento.findFirst({
      where: { tenantId, tipo: 'ENSAIO', data: { lt: agora } },
      orderBy: { data: 'desc' },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        data: true,
        local: true,
        fotoUrl: true,
        serieId: true,
        capacidade: true,
        sede: { select: { capacidade: true } },
        rsvps: {
          where: { status: 'CONFIRMADO' },
          select: { status: true, checkedInAt: true },
        },
      },
    }),
    incluirInstrumentos
      ? listarPatrimonio(tenantId, {
          filtro: { categoria: 'INSTRUMENTO', status: 'EM_USO', page: 1 },
          pageSize: 40,
        })
      : Promise.resolve(null),
    incluirInstrumentos
      ? listarEmprestimosPatrimonio(tenantId, { status: 'ABERTO', limite: 40 })
      : Promise.resolve(null),
  ])

  const confirmadosProximos = proximos.reduce((acc, e) => acc + e.rsvps.length, 0)

  const lista: AdminEventoListaItem[] = proximos.map((evento) => {
    const cap = capacidadeEfetiva({
      capacidade: evento.capacidade,
      sede: evento.sede,
    })
    const confirmados = evento.rsvps.length
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
      tipo: 'ENSAIO',
      serieId: evento.serieId,
      lotacaoLabel:
        cap != null
          ? `${confirmados}/${cap} confirmados`
          : `${confirmados} confirmado${confirmados !== 1 ? 's' : ''}`,
      diasLabel: diasParaEvento(evento.data),
    }
  })

  let faltososUltimo = 0
  const pendencias: AdminInboxItem[] = []

  if (ultimoPassado) {
    const faltosos = ultimoPassado.rsvps.filter((r) => !r.checkedInAt)
    faltososUltimo = faltosos.length
    if (faltosos.length > 0) {
      pendencias.push({
        id: `falt-${ultimoPassado.id}`,
        titulo: `${faltosos.length} faltoso${faltosos.length === 1 ? '' : 's'} · ${ultimoPassado.titulo}`,
        detalhe: 'Confirmados sem presença no último ensaio.',
        href: `/admin/eventos/${ultimoPassado.id}?tab=presenca`,
        tom: faltosos.length >= 5 ? 'danger' : 'warning',
        sla: slaLabel(ultimoPassado.data, { agora, modo: 'idade' }),
      })
    }
  }

  for (const e of proximos.slice(0, 4)) {
    if (e.rsvps.length === 0) {
      pendencias.push({
        id: `sem-rsvp-${e.id}`,
        titulo: `Sem confirmações · ${e.titulo}`,
        detalhe: 'Ninguém confirmou presença ainda — divulgar o ensaio.',
        href: `/admin/eventos/${e.id}`,
        tom: 'warning',
        sla: slaLabel(e.data, { agora, modo: 'ate' }),
      })
    }
  }

  const instrumentosEmUso = instrumentosLista?.total ?? 0
  if (incluirInstrumentos && instrumentosEmUso > 0) {
    const abertosInstr =
      emprestimosInstr?.filter((e) => e.item.categoria === 'INSTRUMENTO').length ?? 0
    pendencias.push({
      id: 'instr-em-uso',
      titulo: `${instrumentosEmUso} instrumento${instrumentosEmUso === 1 ? '' : 's'} em uso`,
      detalhe:
        abertosInstr > 0
          ? `${abertosInstr} empréstimo${abertosInstr === 1 ? '' : 's'} aberto${abertosInstr === 1 ? '' : 's'} com foto de saída.`
          : 'Itens marcados EM_USO no inventário.',
      href: '/admin/patrimonio?categoria=INSTRUMENTO&status=EM_USO',
      tom: 'default',
    })
  }

  for (const e of proximos) {
    const horas = (e.data.getTime() - agora.getTime()) / (60 * 60 * 1000)
    if (horas <= 24 && e.rsvps.length > 0) {
      const presentes = e.rsvps.filter((r) => r.checkedInAt).length
      const sla = slaLabel(e.data, { agora, modo: 'ate' })
      pendencias.push({
        id: `hoje-${e.id}`,
        titulo: `Ensaio em ${Math.max(1, Math.round(horas))}h · ${e.titulo}`,
        detalhe: `${e.rsvps.length} confirmado${e.rsvps.length === 1 ? '' : 's'}${presentes > 0 ? ` · ${presentes} já com presença` : ''}.`,
        href: `/admin/eventos/${e.id}?tab=presenca`,
        tom: horas <= 3 ? 'danger' : 'warning',
        sla,
      })
      break
    }
  }

  return {
    proximos: proximos.length,
    confirmadosProximos,
    faltososUltimo,
    instrumentosEmUso,
    pendencias: pendencias.slice(0, 10),
    lista,
  }
}

/**
 * Inbox ops da Bateria — ensaios + lista serializada (1 query principal).
 */
export const carregarDirecaoBateria = cache(async function carregarDirecaoBateria(
  tenantId: string,
  opts?: { incluirInstrumentos?: boolean },
): Promise<BateriaOpsResumo> {
  const incluir = opts?.incluirInstrumentos ?? false
  return unstable_cache(
    () => fetchDirecaoBateria(tenantId, { incluirInstrumentos: incluir }),
    ['admin-direcao-bateria', tenantId, incluir ? '1' : '0'],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
