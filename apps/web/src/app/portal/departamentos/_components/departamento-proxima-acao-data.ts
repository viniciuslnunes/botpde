import { cache } from 'react'
import { db } from '@torcida/db'
import {
  desfileEmFromMeta,
  diasAteDesfile,
  estaNaJanela,
  hasPermission,
  horizonteJogoDias,
  lerFluxoPrefs,
  mesDisparaCampanha,
  PERMISSIONS,
  saudeOrcamento,
  slugCampanhaDoAno,
  STATUS_PROJETO_ABERTOS,
  sugerirFluxosDepartamento,
} from '@torcida/types'
import { listarEventosPorTipo } from '@/lib/eventos-tipo'
import { getAfiliacaoIdDoTenant } from '@/lib/partidas'

const DIA_MS = 24 * 60 * 60 * 1000
const SEMANA_MS = 7 * DIA_MS

function rsvpJaConfirmado(status: string | undefined): boolean {
  return status === 'CONFIRMADO' || status === 'LISTA_ESPERA'
}

function diasAte(alvo: Date, agora: Date): number {
  return Math.max(0, Math.ceil((alvo.getTime() - agora.getTime()) / DIA_MS))
}

export type FluxoSugestao = ReturnType<typeof sugerirFluxosDepartamento>[number]

type PartidaFact = { adversario: string; dias?: number; mando?: string } | null

export const resolverFluxosDepartamento = cache(async function resolverFluxosDepartamento(input: {
  tenantId: string
  departamentoId: string
  slug: string
  panel: string
  userId: string
  isGestor: boolean
  isAtuacao: boolean
  podeAprovar: boolean
  podeVerFinanceiro: boolean
  permissoesEfetivas: string[]
  totalPendentes: number
  totalPedidosArea?: number
  nomeDepartamento?: string
  minhasAreas?: Array<{ id: string; nome: string; slug: string; sazonal: boolean; ativa: boolean }>
  meta?: unknown
}): Promise<FluxoSugestao[]> {
  const {
    tenantId,
    departamentoId,
    slug,
    panel,
    userId,
    isGestor,
    isAtuacao,
    podeAprovar,
    podeVerFinanceiro,
    permissoesEfetivas,
    totalPendentes,
    totalPedidosArea = 0,
    nomeDepartamento = '',
    minhasAreas = [],
    meta,
  } = input

  const prefs = lerFluxoPrefs(meta)
  const podeCriarEvento =
    hasPermission(permissoesEfetivas, PERMISSIONS.EVENTS_CREATE) ||
    hasPermission(permissoesEfetivas, PERMISSIONS.EVENTS_MANAGE)
  const precisaProjetos = isGestor
  const precisaFinanceiro = panel === 'financeiro' && podeVerFinanceiro
  const precisaBateria = panel === 'bateria'
  const precisaCaravana = panel === 'caravanas'
  const precisaBandeiras = panel === 'bandeiras'
  const horizonteCaravana = horizonteJogoDias(prefs, 'partida-fora-sem-caravana')
  const horizonteEscala = horizonteJogoDias(prefs, 'escala-de-bandeira')

  type ProjetoLite = {
    id: string
    titulo: string
    inicio: Date
    fim: Date | null
    recorrenteAnual: boolean
    orcamentoPrevisto: { toNumber(): number } | number | null
  }
  type AreaSazonal = { id: string; nome: string; slug: string }

  const [
    projetosAbertos,
    sazonais,
    cobrancasEmAberto,
    ensaios,
    caravanas,
    partidaForaSemCaravana,
    partidaSemEscala,
  ]: [
    ProjetoLite[],
    AreaSazonal[],
    boolean,
    Awaited<ReturnType<typeof listarEventosPorTipo>>,
    Awaited<ReturnType<typeof listarEventosPorTipo>>,
    PartidaFact,
    PartidaFact,
  ] = await Promise.all([
    precisaProjetos
      ? db.projeto.findMany({
          where: {
            tenantId,
            departamentoId,
            status: { in: [...STATUS_PROJETO_ABERTOS] },
          },
          select: {
            id: true,
            titulo: true,
            inicio: true,
            fim: true,
            recorrenteAnual: true,
            orcamentoPrevisto: true,
          },
          take: 40,
        })
      : Promise.resolve([]),
    isGestor
      ? db.departamentoArea.findMany({
          where: { tenantId, departamentoId, ativa: true, sazonal: true },
          select: { id: true, nome: true, slug: true },
          orderBy: { ordem: 'asc' },
          take: 20,
        })
      : Promise.resolve([]),
    precisaFinanceiro
      ? db.cobrancaAssociacao
          .findFirst({
            where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
            select: { id: true },
          })
          .then((row: { id: string } | null) => Boolean(row))
      : Promise.resolve(false),
    precisaBateria
      ? listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: true, limite: 8, userId })
      : Promise.resolve([]),
    precisaCaravana
      ? listarEventosPorTipo(tenantId, 'CARAVANA', { futuros: true, limite: 1, userId })
      : Promise.resolve([]),
    precisaCaravana && isGestor
      ? carregarPartidaSemCobertura(tenantId, { mando: 'FORA', tipoEvento: 'CARAVANA', horizonteDias: horizonteCaravana })
      : Promise.resolve(null),
    precisaBandeiras && isGestor
      ? carregarPartidaSemCobertura(tenantId, { tipoEvento: 'GERAL', horizonteDias: horizonteEscala })
      : Promise.resolve(null),
  ])

  const projetosEstourados: Array<{ titulo: string }> = []
  let projetoNaJanela: { titulo: string } | null = null
  if (projetosAbertos.length > 0) {
    const ids = projetosAbertos.map((p) => p.id)
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
    for (const p of projetosAbertos) {
      const previsto =
        p.orcamentoPrevisto == null
          ? null
          : typeof p.orcamentoPrevisto === 'number'
            ? p.orcamentoPrevisto
            : p.orcamentoPrevisto.toNumber()
      const saude = saudeOrcamento(gastoPorId.get(p.id) ?? 0, previsto)
      if (saude?.estourou) projetosEstourados.push({ titulo: p.titulo })
    }
    const naJanela = projetosAbertos.find((p) =>
      estaNaJanela({
        inicio: p.inicio,
        fim: p.fim,
        recorrenteAnual: p.recorrenteAnual,
      }),
    )
    if (naJanela) projetoNaJanela = { titulo: naJanela.titulo }
  }

  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth() + 1
  const slugsAnoGestor = sazonais.map((a) => slugCampanhaDoAno(a.slug, ano))
  const slugsAnoMembro = minhasAreas
    .filter((a) => a.ativa && a.sazonal)
    .map((a) => slugCampanhaDoAno(a.slug, ano))
  const slugsAno = [...new Set([...slugsAnoGestor, ...slugsAnoMembro])]
  const campanhasExistentes: Array<{ slug: string }> =
    slugsAno.length > 0
      ? await db.projeto.findMany({
          where: { tenantId, departamentoId, slug: { in: slugsAno } },
          select: { slug: true },
        })
      : []
  const abertos = new Set(campanhasExistentes.map((p) => p.slug))
  const faltando = sazonais.find(
    (a) =>
      !abertos.has(slugCampanhaDoAno(a.slug, ano)) && mesDisparaCampanha(a.slug, mes, prefs),
  )
  const campanhaSazonalFaltando = faltando ? { nome: faltando.nome, slug: faltando.slug } : null

  let minhaCampanhaAberta: { nome: string } | null = null
  if (!isGestor && isAtuacao && minhasAreas.length > 0) {
    const minhaSazonal = minhasAreas.find(
      (a) => a.ativa && a.sazonal && abertos.has(slugCampanhaDoAno(a.slug, ano)),
    )
    if (minhaSazonal) minhaCampanhaAberta = { nome: `${minhaSazonal.nome} ${ano}` }
  }

  const proximoEnsaio = ensaios[0] ? { id: ensaios[0].id, titulo: ensaios[0].titulo } : null
  const ensaioNestaSemana = ensaios.some((e) => e.data.getTime() <= agora.getTime() + SEMANA_MS)
  const proximaCaravana = caravanas[0]
    ? { id: caravanas[0].id, titulo: caravanas[0].titulo }
    : null
  const proximaEscala = await resolverProximaEscala(precisaBandeiras, tenantId, agora, horizonteEscala)

  let rsvpEnsaioConfirmado = false
  let rsvpCaravanaConfirmado = false
  let rsvpEscalaConfirmado = false
  if (!isGestor && isAtuacao) {
    const ids = [proximoEnsaio?.id, proximaCaravana?.id, proximaEscala?.id].filter(
      (id): id is string => Boolean(id),
    )
    if (ids.length > 0) {
      const rsvps: Array<{ eventoId: string; status: string }> = await db.eventoRsvp.findMany({
        where: { userId, eventoId: { in: ids } },
        select: { eventoId: true, status: true },
      })
      const porEvento = new Map(rsvps.map((r) => [r.eventoId, r.status]))
      if (proximoEnsaio) rsvpEnsaioConfirmado = rsvpJaConfirmado(porEvento.get(proximoEnsaio.id))
      if (proximaCaravana) {
        rsvpCaravanaConfirmado = rsvpJaConfirmado(porEvento.get(proximaCaravana.id))
      }
      if (proximaEscala) rsvpEscalaConfirmado = rsvpJaConfirmado(porEvento.get(proximaEscala.id))
    }
  }

  const desfile =
    panel === 'carnaval'
      ? {
          temData: Boolean(desfileEmFromMeta(meta)),
          dias: diasAteDesfile(meta, agora),
        }
      : null

  return sugerirFluxosDepartamento({
    slug,
    panel,
    isGestor,
    isAtuacao,
    podeAprovar,
    podeVerFinanceiro,
    podeCriarEvento,
    totalPendentes,
    totalPedidosArea,
    nomeDepartamento,
    ano,
    mes,
    projetosEstourados,
    projetoNaJanela,
    campanhaSazonalFaltando,
    cobrancasEmAberto,
    proximoEnsaio,
    ensaioNestaSemana,
    rsvpEnsaioConfirmado,
    proximaCaravana,
    rsvpCaravanaConfirmado,
    partidaForaSemCaravana,
    partidaSemEscala,
    desfile,
    proximaEscala,
    rsvpEscalaConfirmado,
    minhaCampanhaAberta,
    prefs,
  })
})

async function resolverProximaEscala(
  precisa: boolean,
  tenantId: string,
  agora: Date,
  horizonteDias: number,
): Promise<{ id: string; titulo: string } | null> {
  if (!precisa) return null
  const ate = new Date(agora.getTime() + horizonteDias * DIA_MS)
  const row: { id: string; titulo: string } | null = await db.evento.findFirst({
    where: {
      tenantId,
      tipo: 'GERAL',
      partidaId: { not: null },
      data: { gte: agora, lte: ate },
    },
    orderBy: { data: 'asc' },
    select: { id: true, titulo: true },
  })
  return row
}

async function carregarPartidaSemCobertura(
  tenantId: string,
  opts: { mando?: 'FORA' | 'CASA'; tipoEvento: 'CARAVANA' | 'GERAL'; horizonteDias: number },
): Promise<PartidaFact> {
  const afiliacaoId = await getAfiliacaoIdDoTenant(tenantId)
  if (!afiliacaoId) return null
  const agora = new Date()
  const ate = new Date(agora.getTime() + opts.horizonteDias * DIA_MS)

  type PartidaRow = { id: string; adversario: string; dataHora: Date; mando: string }
  const [partidas, cobertos]: [PartidaRow[], Array<{ partidaId: string | null }>] = await Promise.all([
    db.partida.findMany({
      where: {
        afiliacaoId,
        ...(opts.mando ? { mando: opts.mando } : {}),
        status: { in: ['AGENDADA', 'AO_VIVO'] },
        dataHora: { gte: agora, lte: ate },
      },
      orderBy: { dataHora: 'asc' },
      take: 8,
      select: { id: true, adversario: true, dataHora: true, mando: true },
    }),
    db.evento.findMany({
      where: {
        tenantId,
        tipo: opts.tipoEvento,
        partidaId: { not: null },
        data: { gte: agora, lte: ate },
      },
      select: { partidaId: true },
      take: 40,
    }),
  ])
  const ids = new Set(cobertos.map((c) => c.partidaId).filter((id): id is string => Boolean(id)))
  const livre = partidas.find((p) => !ids.has(p.id))
  if (!livre) return null
  return { adversario: livre.adversario, dias: diasAte(livre.dataHora, agora), mando: livre.mando }
}
