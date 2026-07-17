import 'server-only'
import { cache } from 'react'
import { db } from '@torcida/db'
import { listarProximosEventosTenant, type EventoPorTipoLite } from '@/lib/eventos-tipo'
import { sincronizarCobrancasVencidas } from '@/lib/cobrancas'
import { resolverProximaAcao, type ProximaAcao } from '@/lib/proxima-acao'

export type HomeAssociadoSnapshot = {
  membro: {
    id: string
    nome: string
    tipo: string
    status: string
    adimplente: boolean
    desligadoEm: Date | null
    planoNome: string | null
  } | null
  socio: {
    id: string
    nome: string
    numeroSocio: number
    validade: Date
    qrToken: string | null
    criadoEm: Date
  } | null
  cobrancaAberta: {
    id: string
    descricao: string
    valor: number
    vencimento: Date
    status: string
    pixCopiaCola: string | null
  } | null
  proximoEvento: EventoPorTipoLite | null
  proximaAcao: ProximaAcao | null
}

export const carregarHomeAssociado = cache(async function carregarHomeAssociado(
  tenantId: string,
  userId: string,
): Promise<HomeAssociadoSnapshot> {
  await sincronizarCobrancasVencidas(tenantId)

  type MembroLite = {
    id: string
    nome: string
    tipo: string
    status: string
    adimplente: boolean
    desligadoEm: Date | null
    planoAssociacao: { nome: string } | null
  }
  type SocioLite = {
    id: string
    nome: string
    numeroSocio: number
    validade: Date
    qrToken: string | null
    criadoEm: Date
  }
  type CobLite = {
    id: string
    descricao: string
    valor: { toNumber(): number } | number
    vencimento: Date
    status: string
    pixCopiaCola: string | null
  }

  const [membro, socio, cobrancas, proximos]: [
    MembroLite | null,
    SocioLite | null,
    CobLite[],
    EventoPorTipoLite[],
  ] = await Promise.all([
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        id: true,
        nome: true,
        tipo: true,
        status: true,
        adimplente: true,
        desligadoEm: true,
        planoAssociacao: { select: { nome: true } },
      },
    }),
    db.saasSocio.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        id: true,
        nome: true,
        numeroSocio: true,
        validade: true,
        qrToken: true,
        criadoEm: true,
      },
    }),
    db.cobrancaAssociacao.findMany({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDENTE', 'VENCIDA'] },
      },
      orderBy: { vencimento: 'asc' },
      take: 1,
      select: {
        id: true,
        descricao: true,
        valor: true,
        vencimento: true,
        status: true,
        pixCopiaCola: true,
      },
    }),
    listarProximosEventosTenant(tenantId, 1),
  ])

  const cob = cobrancas[0] ?? null
  const proximoEvento = proximos[0] ?? null

  const eventosParaAcao = proximos.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    data: e.data,
  }))
  const rsvpMap = new Map<string, 'CONFIRMADO' | 'RECUSADO'>()
  if (proximoEvento) {
    type RsvpLite = { status: 'CONFIRMADO' | 'RECUSADO' } | null
    const rsvp: RsvpLite = await db.eventoRsvp.findUnique({
      where: {
        eventoId_userId: { eventoId: proximoEvento.id, userId },
      },
      select: { status: true },
    })
    if (rsvp) rsvpMap.set(proximoEvento.id, rsvp.status)
  }

  const proximaAcao = resolverProximaAcao(
    eventosParaAcao,
    rsvpMap,
    Boolean(membro && membro.status === 'APROVADO' && !membro.desligadoEm),
  )

  return {
    membro: membro
      ? {
          id: membro.id,
          nome: membro.nome,
          tipo: membro.tipo,
          status: membro.status,
          adimplente: membro.adimplente,
          desligadoEm: membro.desligadoEm,
          planoNome: membro.planoAssociacao?.nome ?? null,
        }
      : null,
    socio,
    cobrancaAberta: cob
      ? {
          id: cob.id,
          descricao: cob.descricao,
          valor: typeof cob.valor === 'number' ? cob.valor : cob.valor.toNumber(),
          vencimento: cob.vencimento,
          status: cob.status,
          pixCopiaCola: cob.pixCopiaCola,
        }
      : null,
    proximoEvento,
    proximaAcao,
  }
})
