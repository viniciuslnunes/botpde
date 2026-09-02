import { cache } from 'react'
import { db, withDbRetry } from '@torcida/db'
import { auth } from '@/lib/auth'
import {
  getOrCreateComunidadeNacionalTenant,
  resolverContextoComunidade,
  resolverEscopoComunidade,
} from '@/lib/comunidade-contexto'
import { lerEscopoComunidadePersistido } from '@/lib/comunidade-escopo-cookie'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import { filtrarPostsVisiveis } from '@/lib/feed'
import { getAlliedTenantIds, getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { filtrarTenantsRestritos } from '@/lib/isolamento'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import { getUserPermissionsInTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import { durableImageUrl, filterDurableImageUrls } from '@/lib/optimizable-image'
import { escopoFeedSemConversa } from '@/lib/grupos-scope'
import {
  parseDateOnly,
  startOfZonedDayUtc,
  addCalendarDays,
  todayDateOnlyIso,
} from '@/lib/format-datetime'
import {
  janelaEmTorno,
  limitesCalendarioMemoria,
  clampDiaIso,
  montarMemoria,
  montarEspinhaCalendario,
  diasEmTorno,
  isMemoriaDiaIso,
  resolverDiaInicial,
  LIMITE_EVENTOS_MEMORIA,
  LIMITE_FATOS_MEMORIA,
  LIMITE_PARTIDAS_MEMORIA,
  LIMITE_POSTS_MEMORIA,
  LIMITE_PRESENCA_DIA,
  type MemoriaEventoTipo,
  type MemoriaMando,
  type MemoriaMontada,
} from '@/lib/memoria-dia'
import {
  calcularEstatisticas,
  diasParalelosNesteDia,
  montarParalelos,
  type MemoriaEstatisticas,
  type MemoriaParalelo,
} from '@/lib/memoria-acervo'
import { filtrarDiasPorCapitulo } from '@torcida/types'
import {
  carregarCapitulosMemoria,
  carregarMarcosMemoria,
  podeGerirAcervoMemoria,
  resolverCapituloAtivo,
  type MemoriaCapituloResumo,
} from './memoria-capitulos'
import {
  MEMORIA_ESCOPO,
  MemoriaEscopoSchema,
  calculateEffectivePermissions,
  escoposMemoriaDoCanal,
  formatNomeAfiliacao,
  formatNomeTorcida,
  hasPermission,
  itemEntraNoEscopoClube,
  partidaAbreEspinha,
  PERMISSIONS,
  resolverEscopoMemoriaPadrao,
  type MemoriaEscopo,
} from '@torcida/types'

export type MemoriaFatoFila = {
  id: string
  conteudo: string
  status: 'PENDENTE' | 'REJEITADA'
  motivoRejeicao: string | null
}

export type MemoriaPresencaPessoa = {
  userId: string
  nome: string
  avatarUrl: string | null
}

export type MemoriaPresenca = {
  pessoas: MemoriaPresencaPessoa[]
  total: number
  viewerCheckIn: boolean
  viewerOptIn: boolean
  viewerUserId: string
}

export type MemoriaContexto =
  | { ok: false; motivo: 'sem-sessao' | 'sem-unidade' | 'sem-clube' }
  | {
      ok: true
      escopo: MemoriaEscopo
      escoposDisponiveis: MemoriaEscopo[]
      mostrarChips: boolean
      tenantNome: string
      clubeNome: string | null
      logoUrl: string | null
      tenantId: string | null
      montada: MemoriaMontada
      podeCriarFato: boolean
      fatosDoAutor: MemoriaFatoFila[]
      presenca: MemoriaPresenca | null
      estatisticas: MemoriaEstatisticas
      paralelos: MemoriaParalelo[]
      capitulos: MemoriaCapituloResumo[]
      capituloAtivo: MemoriaCapituloResumo | null
      podeGerirAcervo: boolean
    }

type PostMemoriaRow = {
  id: string
  conteudo: string
  criadoEm: Date
  imagemUrl: string | null
  midiaUrls: string[]
  autorId: string
  tenantId: string
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  oculto: boolean
  tipo: string
  comunicadoOrigemId: string | null
  alcanceNacional: boolean
  autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  tenant: { id: string; nome: string }
}

type EventoMemoriaRow = {
  id: string
  titulo: string
  tipo: MemoriaEventoTipo
  data: Date
  local: string | null
  fotoUrl: string | null
  partidaId: string | null
}

type PartidaMemoriaRow = {
  id: string
  adversario: string
  competicao: string | null
  dataHora: Date
  mando: MemoriaMando
  status: string
  placarCasa: number | null
  placarFora: number | null
}

type FatoMemoriaRow = {
  id: string
  dia: Date
  conteudo: string
  midiaUrls: string[]
  autorId: string
  postId: string | null
  visibilidade: 'PUBLICO' | 'TENANT'
  criadoEm: Date
  autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
}

const POST_SELECT = {
  id: true,
  conteudo: true,
  criadoEm: true,
  imagemUrl: true,
  midiaUrls: true,
  autorId: true,
  tenantId: true,
  visibilidade: true,
  oculto: true,
  tipo: true,
  comunicadoOrigemId: true,
  alcanceNacional: true,
  autor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
  tenant: { select: { id: true, nome: true } },
} as const

const EVENTO_SELECT = {
  id: true,
  titulo: true,
  tipo: true,
  data: true,
  local: true,
  fotoUrl: true,
  partidaId: true,
} as const

const PARTIDA_SELECT = {
  id: true,
  adversario: true,
  competicao: true,
  dataHora: true,
  mando: true,
  status: true,
  placarCasa: true,
  placarFora: true,
} as const

const FATO_SELECT = {
  id: true,
  dia: true,
  conteudo: true,
  midiaUrls: true,
  autorId: true,
  postId: true,
  visibilidade: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
} as const

/** @deprecated Use `carregarMemoria`. Mantido para imports da fase 1. */
export const carregarMemoriaUnidade = cache(async function carregarMemoriaUnidade(): Promise<MemoriaContexto> {
  return carregarMemoria({})
})

export const carregarMemoria = cache(async function carregarMemoria(opts: {
  escopoRaw?: string | null
  diaRaw?: string | null
  capRaw?: string | null
} = {}): Promise<MemoriaContexto> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, motivo: 'sem-sessao' }

  const userId = session.user.id
  const ctxCom = await resolverContextoComunidade(userId, session.user.email)
  if (!ctxCom) return { ok: false, motivo: 'sem-unidade' }

  const canal = resolverEscopoComunidade(ctxCom, await lerEscopoComunidadePersistido())
  const temTorcida = Boolean(
    ctxCom.escopos.torcida &&
      (ctxCom.torcidaReal || (ctxCom.modo === 'torcida' && ctxCom.tenant)),
  )
  const escoposDisponiveis = escoposMemoriaDoCanal({ canal, temTorcida })
  const padrao = resolverEscopoMemoriaPadrao({ canal })
  const pedido = MemoriaEscopoSchema.safeParse(opts.escopoRaw)
  const escopo: MemoriaEscopo =
    pedido.success && escoposDisponiveis.includes(pedido.data) ? pedido.data : padrao

  const hojeIso = todayDateOnlyIso()
  const { minIso, maxIso } = limitesCalendarioMemoria(hojeIso)
  const ancora = clampDiaIso(
    isMemoriaDiaIso(opts.diaRaw) ? opts.diaRaw : hojeIso,
    minIso,
    maxIso,
  )
  const janela = janelaEmTorno(ancora, minIso, maxIso)
  const diasJanelaBase = diasEmTorno(ancora, minIso, maxIso)

  if (escopo === MEMORIA_ESCOPO.CLUBE) {
    if (!ctxCom.afiliacao) return { ok: false, motivo: 'sem-clube' }
    return carregarEscopoClube({
      userId,
      afiliacaoId: ctxCom.afiliacao.id,
      janela,
      escoposDisponiveis,
      diaAberto: ancora,
      hojeIso,
      diasJanela: diasJanelaBase,
    })
  }

  const homeTenantId =
    canal === 'unidade'
      ? (ctxCom.unidade?.tenantId ?? null)
      : (ctxCom.torcidaReal?.id ?? (ctxCom.modo === 'torcida' ? ctxCom.tenant.id : null))
  if (!homeTenantId) return { ok: false, motivo: 'sem-unidade' }

  const tenant: {
    id: string
    nome: string
    afiliacaoId: string | null
    logoUrl: string | null
    sintetico: boolean
  } | null = await db.tenant.findUnique({
    where: { id: homeTenantId },
    select: { id: true, nome: true, afiliacaoId: true, logoUrl: true, sintetico: true },
  })
  if (!tenant || tenant.sintetico) return { ok: false, motivo: 'sem-unidade' }

  const nomeUnidade = ctxCom.unidade?.nome ?? tenant.nome
  const logoUnidade = ctxCom.unidade?.logoUrl ?? tenant.logoUrl
  const logoTorcida =
    ctxCom.torcidaReal?.logoUrl ??
    (ctxCom.modo === 'torcida' ? ctxCom.tenant.logoUrl : null) ??
    tenant.logoUrl
  const afiliacaoId = tenant.afiliacaoId ?? ctxCom.afiliacao?.id ?? null

  return carregarEscopoTorcidaOuUnidade({
    userId,
    unidade: {
      id: tenant.id,
      nome: nomeUnidade,
      afiliacaoId,
      logoUrl: logoUnidade,
    },
    logoHint: escopo === MEMORIA_ESCOPO.TORCIDA ? logoTorcida : logoUnidade,
    afiliacaoId,
    escopo,
    janela,
    escoposDisponiveis,
    diaAberto: ancora,
    hojeIso,
    diasJanela: diasJanelaBase,
    capRaw: opts.capRaw,
  })
})

export async function idsAliadosComMemoria(tenantId: string): Promise<string[]> {
  const raizId = await resolverTenantRaizId(tenantId)
  const raiz: { memoriaAliados: boolean } | null = await db.tenant.findUnique({
    where: { id: raizId },
    select: { memoriaAliados: true },
  })
  if (!raiz?.memoriaAliados) return []

  const aliados = await getAlliedTenantIds(tenantId)
  if (aliados.length === 0) return []

  const raizPorAliado: Array<{ id: string; raiz: string }> = await Promise.all(
    aliados.map(async (id) => ({ id, raiz: await resolverTenantRaizId(id) })),
  )
  const raizesUnicas = [...new Set(raizPorAliado.map((x) => x.raiz).filter((r) => r !== raizId))]
  if (raizesUnicas.length === 0) return []

  const flags: Array<{ id: string; memoriaAliados: boolean }> = await db.tenant.findMany({
    where: { id: { in: raizesUnicas } },
    select: { id: true, memoriaAliados: true },
  })
  const raizesOk = new Set(flags.filter((f) => f.memoriaAliados).map((f) => f.id))
  return raizPorAliado.filter((x) => raizesOk.has(x.raiz)).map((x) => x.id)
}

async function podeCriarFatoAtrasado(userId: string, tenantId: string): Promise<boolean> {
  const membro: { tipo: 'SOCIO' | 'TORCEDOR'; status: string } | null =
    await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { tipo: true, status: true },
    })
  if (membro?.status !== 'APROVADO') return false
  if (membro.tipo === 'TORCEDOR') return true
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  return hasPermission(effective, PERMISSIONS.COMMUNITY_POST)
}

async function carregarEscopoClube(opts: {
  userId: string
  afiliacaoId: string
  janela: { gte: Date; lt: Date }
  escoposDisponiveis: MemoriaEscopo[]
  diaAberto: string
  hojeIso: string
  diasJanela: string[]
}): Promise<MemoriaContexto> {
  const montada = await carregarMontadaClube(opts.userId, opts.afiliacaoId, opts.janela)
  const afiliacao: { nome: string; apelido: string | null; escudoUrl: string | null } | null =
    await db.afiliacao.findUnique({
      where: { id: opts.afiliacaoId },
      select: { nome: true, apelido: true, escudoUrl: true },
    })
  const clubeNome = afiliacao
    ? formatNomeAfiliacao(afiliacao.apelido || afiliacao.nome)
    : 'Clube'

  const { estatisticas, paralelos } = await montarMetaAcervo({
    montada,
    diasJanela: opts.diasJanela,
    diaAberto: opts.diaAberto,
    hojeIso: opts.hojeIso,
    hidratarParalelos: (janela) => carregarMontadaClube(opts.userId, opts.afiliacaoId, janela),
  })

  return {
    ok: true,
    escopo: MEMORIA_ESCOPO.CLUBE,
    escoposDisponiveis: opts.escoposDisponiveis,
    tenantNome: clubeNome,
    clubeNome,
    logoUrl: durableImageUrl(afiliacao?.escudoUrl ?? null),
    tenantId: null,
    montada,
    podeCriarFato: false,
    fatosDoAutor: [],
    presenca: null,
    mostrarChips: false,
    estatisticas,
    paralelos,
    capitulos: [],
    capituloAtivo: null,
    podeGerirAcervo: false,
  }
}

async function carregarMontadaClube(
  userId: string,
  afiliacaoId: string,
  janela: { gte: Date; lt: Date },
): Promise<MemoriaMontada> {
  const sintetico = await getOrCreateComunidadeNacionalTenant(afiliacaoId)
  const [postsBrutos, partidas]: [PostMemoriaRow[], PartidaMemoriaRow[]] = await Promise.all([
    withDbRetry(
      () =>
        db.post.findMany({
          where: {
            oculto: false,
            visibilidade: 'PUBLICO',
            criadoEm: { gte: janela.gte, lt: janela.lt },
            ...escopoFeedSemConversa,
            OR: [{ tenantId: sintetico.id }, { alcanceNacional: true }],
          },
          select: POST_SELECT,
          orderBy: { criadoEm: 'desc' },
          take: LIMITE_POSTS_MEMORIA,
        }) as Promise<PostMemoriaRow[]>,
    ),
    withDbRetry(
      () =>
        db.partida.findMany({
          where: {
            afiliacaoId,
            status: { in: ['AGENDADA', 'AO_VIVO', 'ENCERRADA'] },
            dataHora: { gte: janela.gte, lt: janela.lt },
          },
          select: PARTIDA_SELECT,
          orderBy: { dataHora: 'desc' },
          take: LIMITE_PARTIDAS_MEMORIA,
        }) as Promise<PartidaMemoriaRow[]>,
    ),
  ])

  const postsClube = postsBrutos.filter((p) =>
    itemEntraNoEscopoClube({
      alcanceNacional: p.alcanceNacional,
      visibilidade: p.visibilidade,
      tenantSintetico: p.tenantId === sintetico.id,
    }),
  )
  const postsVisiveis = await filtrarPostsVisiveis(userId, postsClube)
  return montarMemoria(
    {
      posts: mapPosts(postsVisiveis),
      eventos: [],
      partidas,
    },
    { abrirPartidaOrfa: partidaAbreEspinha(MEMORIA_ESCOPO.CLUBE, false) },
  )
}

async function carregarEscopoTorcidaOuUnidade(opts: {
  userId: string
  unidade: { id: string; nome: string; afiliacaoId: string | null; logoUrl: string | null }
  logoHint: string | null
  afiliacaoId: string | null
  escopo: typeof MEMORIA_ESCOPO.UNIDADE | typeof MEMORIA_ESCOPO.TORCIDA
  janela: { gte: Date; lt: Date }
  escoposDisponiveis: MemoriaEscopo[]
  diaAberto: string | null
  hojeIso: string
  diasJanela: string[]
  capRaw?: string | null
}): Promise<MemoriaContexto> {
  const { userId, unidade, escopo, janela } = opts
  const [lineage, aliados, escopoEventosUnidade, raizId, capitulos, podeGerir] =
    await Promise.all([
    getTorcidaLineageTenantIds(unidade.id),
    idsAliadosComMemoria(unidade.id),
    getEscopoEventosVisiveis(unidade.id, userId),
    resolverTenantRaizId(unidade.id),
    carregarCapitulosMemoria(unidade.id),
    podeGerirAcervoMemoria(userId, unidade.id),
  ])
  const capituloAtivo = resolverCapituloAtivo(capitulos, opts.capRaw)
  const diasJanela = capituloAtivo
    ? filtrarDiasPorCapitulo(capituloAtivo.dias, opts.diasJanela)
    : opts.diasJanela
  const lineageAberta = await filtrarTenantsRestritos(lineage, unidade.id)

  const tenantIdsProprios =
    escopo === MEMORIA_ESCOPO.UNIDADE ? [unidade.id] : lineageAberta
  const tenantIdsPostsAliados = aliados
  const tenantIdsPostsTodos = [...new Set([...tenantIdsProprios, ...tenantIdsPostsAliados])]

  const [afiliacao, raiz, podeCriar, logoRaw] = await Promise.all([
    opts.afiliacaoId
      ? db.afiliacao.findUnique({
          where: { id: opts.afiliacaoId },
          select: { nome: true, apelido: true },
        })
      : Promise.resolve(null),
    db.tenant.findUnique({ where: { id: raizId }, select: { nome: true, logoUrl: true } }),
    podeCriarFatoAtrasado(userId, unidade.id),
    resolveTenantLogoUrl(
      escopo === MEMORIA_ESCOPO.TORCIDA ? raizId : unidade.id,
      opts.logoHint ?? unidade.logoUrl,
    ),
  ])

  const montada = await carregarMontadaTorcidaOuUnidade({
    userId,
    unidade,
    afiliacaoId: opts.afiliacaoId,
    escopo,
    janela,
    lineageAberta,
    tenantIdsProprios,
    tenantIdsPostsTodos,
    tenantIdsPostsAliados,
    escopoEventosUnidade,
  })

  const diaPainel = isMemoriaDiaIso(opts.diaAberto)
    ? opts.diaAberto
    : resolverDiaInicial(montada.espinha, opts.diaAberto, todayDateOnlyIso())

  const [fatosDoAutor, presenca, meta] = await Promise.all([
    diaPainel && podeCriar
      ? carregarFatosDoAutor(unidade.id, userId, diaPainel)
      : Promise.resolve([] as MemoriaFatoFila[]),
    diaPainel
      ? carregarPresenca({
          userId,
          tenantId: unidade.id,
          escopo,
          diaIso: diaPainel,
          tenantIdsEvento: tenantIdsProprios,
        })
      : Promise.resolve(null),
    diaPainel
      ? montarMetaAcervo({
          montada,
          diasJanela,
          diaAberto: diaPainel,
          hojeIso: opts.hojeIso,
          hidratarParalelos: (janelaPar) =>
            carregarMontadaTorcidaOuUnidade({
              userId,
              unidade,
              afiliacaoId: opts.afiliacaoId,
              escopo,
              janela: janelaPar,
              lineageAberta,
              tenantIdsProprios,
              tenantIdsPostsTodos,
              tenantIdsPostsAliados,
              escopoEventosUnidade,
            }),
        })
      : Promise.resolve({
          estatisticas: calcularEstatisticas(
            montarEspinhaCalendario(diasJanela, montada.porDia),
            null,
            montada.espinha.at(-1)?.dia ?? null,
          ),
          paralelos: [] as MemoriaParalelo[],
        }),
  ])

  const clubeNome = afiliacao
    ? formatNomeAfiliacao(afiliacao.apelido || afiliacao.nome)
    : null
  const tenantNome =
    escopo === MEMORIA_ESCOPO.TORCIDA
      ? formatNomeTorcida(raiz?.nome ?? unidade.nome)
      : formatNomeTorcida(unidade.nome)

  return {
    ok: true,
    escopo,
    escoposDisponiveis: opts.escoposDisponiveis,
    mostrarChips: opts.escoposDisponiveis.length > 1,
    tenantNome,
    clubeNome,
    logoUrl: durableImageUrl(logoRaw ?? opts.logoHint) ?? opts.logoHint,
    tenantId: unidade.id,
    montada,
    podeCriarFato: podeCriar,
    fatosDoAutor,
    presenca,
    estatisticas: meta.estatisticas,
    paralelos: meta.paralelos,
    capitulos,
    capituloAtivo,
    podeGerirAcervo: podeGerir,
  }
}

async function carregarMontadaTorcidaOuUnidade(opts: {
  userId: string
  unidade: { id: string }
  afiliacaoId: string | null
  escopo: typeof MEMORIA_ESCOPO.UNIDADE | typeof MEMORIA_ESCOPO.TORCIDA
  janela: { gte: Date; lt: Date }
  lineageAberta: string[]
  tenantIdsProprios: string[]
  tenantIdsPostsTodos: string[]
  tenantIdsPostsAliados: string[]
  escopoEventosUnidade: Awaited<ReturnType<typeof getEscopoEventosVisiveis>>
}): Promise<MemoriaMontada> {
  const { userId, unidade, escopo, janela } = opts
  const [postsBrutos, eventos, fatos]: [
    PostMemoriaRow[],
    EventoMemoriaRow[],
    FatoMemoriaRow[],
  ] = await Promise.all([
    opts.tenantIdsPostsTodos.length === 0
      ? Promise.resolve([] as PostMemoriaRow[])
      : withDbRetry(
          () =>
            db.post.findMany({
              where: {
                tenantId: { in: opts.tenantIdsPostsTodos },
                oculto: false,
                criadoEm: { gte: janela.gte, lt: janela.lt },
                ...escopoFeedSemConversa,
                OR: [{ tenantId: unidade.id }, { visibilidade: 'PUBLICO' }],
              },
              select: POST_SELECT,
              orderBy: { criadoEm: 'desc' },
              take: LIMITE_POSTS_MEMORIA,
            }) as Promise<PostMemoriaRow[]>,
        ),
    withDbRetry(
      () =>
        db.evento.findMany({
          where:
            escopo === MEMORIA_ESCOPO.UNIDADE
              ? { ...opts.escopoEventosUnidade, data: { gte: janela.gte, lt: janela.lt } }
              : {
                  tenantId: { in: opts.tenantIdsProprios },
                  data: { gte: janela.gte, lt: janela.lt },
                },
          select: EVENTO_SELECT,
          orderBy: { data: 'desc' },
          take: LIMITE_EVENTOS_MEMORIA,
        }) as Promise<EventoMemoriaRow[]>,
    ),
    withDbRetry(
      () =>
        db.memoriaFato.findMany({
          where: {
            status: 'APROVADA',
            dia: { gte: janela.gte, lt: janela.lt },
            OR: [
              { tenantId: unidade.id },
              {
                tenantId: {
                  in: opts.tenantIdsPostsTodos.filter((id) => id !== unidade.id),
                },
                visibilidade: 'PUBLICO',
              },
            ],
          },
          select: FATO_SELECT,
          orderBy: { criadoEm: 'desc' },
          take: LIMITE_FATOS_MEMORIA,
        }) as Promise<FatoMemoriaRow[]>,
    ),
  ])

  const postsVisiveis = await filtrarPostsVisiveis(userId, postsBrutos)

  let partidas: PartidaMemoriaRow[] = []
  if (opts.afiliacaoId) {
    partidas = await withDbRetry(
      () =>
        db.partida.findMany({
          where: {
            afiliacaoId: opts.afiliacaoId,
            status: { in: ['AGENDADA', 'AO_VIVO', 'ENCERRADA'] },
            dataHora: { gte: janela.gte, lt: janela.lt },
          },
          select: PARTIDA_SELECT,
          orderBy: { dataHora: 'desc' },
          take: LIMITE_PARTIDAS_MEMORIA,
        }) as Promise<PartidaMemoriaRow[]>,
    )
  }

  const marcos = await carregarMarcosMemoria(opts.tenantIdsProprios, janela)

  return montarMemoria({
    posts: mapPosts(postsVisiveis),
    eventos: eventos.map((e) => ({ ...e, fotoUrl: durableImageUrl(e.fotoUrl) })),
    partidas,
    marcos,
    fatos: fatos.map((f) => ({
      id: f.id,
      dia: f.dia,
      conteudo: f.conteudo,
      midiaUrls: filterDurableImageUrls(f.midiaUrls),
      autorId: f.autorId,
      autorNome: f.autor.nickname || f.autor.nome,
      autorAvatar: durableImageUrl(f.autor.avatarUrl),
      criadoEm: f.criadoEm,
      postId: f.postId,
    })),
  }, {
    homeTenantId: unidade.id,
    idsAliados: opts.tenantIdsPostsAliados,
  })
}

async function montarMetaAcervo(opts: {
  montada: MemoriaMontada
  diasJanela: string[]
  diaAberto: string
  hojeIso: string
  hidratarParalelos: (janela: { gte: Date; lt: Date }) => Promise<MemoriaMontada>
}): Promise<{ estatisticas: MemoriaEstatisticas; paralelos: MemoriaParalelo[] }> {
  const espinha = montarEspinhaCalendario(opts.diasJanela, opts.montada.porDia)
  const primeiro = opts.montada.espinha.at(-1)?.dia ?? null
  const estatisticas = calcularEstatisticas(espinha, null, primeiro)

  const diasPar = diasParalelosNesteDia(opts.diaAberto, opts.hojeIso)
  if (diasPar.length === 0) {
    return { estatisticas, paralelos: [] }
  }

  const sorted = [...diasPar].sort()
  const gte = startOfZonedDayUtc(parseDateOnly(sorted[0]!))
  const lt = startOfZonedDayUtc(addCalendarDays(parseDateOnly(sorted[sorted.length - 1]!), 1))
  const montadaPar = await opts.hidratarParalelos({ gte, lt })
  const paralelos = montarParalelos(opts.diaAberto, diasPar, montadaPar.porDia).filter(
    (p) => p.temConteudo,
  )

  return { estatisticas, paralelos }
}

function mapPosts(posts: PostMemoriaRow[]) {
  return posts.map((p) => ({
    id: p.id,
    conteudo: p.conteudo,
    criadoEm: p.criadoEm,
    imagemUrl: durableImageUrl(p.imagemUrl),
    midiaUrls: filterDurableImageUrls(p.midiaUrls),
    autorId: p.autorId,
    autorNome: p.autor.nickname || p.autor.nome,
    autorAvatar: durableImageUrl(p.autor.avatarUrl),
    tenantId: p.tenantId,
    tenantNome: p.tenant?.nome ?? null,
  }))
}

async function carregarFatosDoAutor(
  tenantId: string,
  userId: string,
  diaIso: string,
): Promise<MemoriaFatoFila[]> {
  const parts = parseDateOnly(diaIso)
  const gte = startOfZonedDayUtc(parts)
  const lt = startOfZonedDayUtc(addCalendarDays(parts, 1))
  const rows: Array<{
    id: string
    conteudo: string
    status: 'PENDENTE' | 'APROVADA' | 'REJEITADA'
    motivoRejeicao: string | null
  }> = await db.memoriaFato.findMany({
    where: {
      tenantId,
      autorId: userId,
      dia: { gte, lt },
      status: { in: ['PENDENTE', 'REJEITADA'] },
    },
    select: { id: true, conteudo: true, status: true, motivoRejeicao: true },
    orderBy: { criadoEm: 'desc' },
    take: 8,
  })
  return rows
    .filter((r): r is MemoriaFatoFila & { status: 'PENDENTE' | 'REJEITADA' } => r.status !== 'APROVADA')
    .map((r) => ({
      id: r.id,
      conteudo: r.conteudo,
      status: r.status,
      motivoRejeicao: r.motivoRejeicao,
    }))
}

async function carregarPresenca(opts: {
  userId: string
  tenantId: string
  escopo: MemoriaEscopo
  diaIso: string
  tenantIdsEvento: string[]
}): Promise<MemoriaPresenca | null> {
  if (opts.escopo === MEMORIA_ESCOPO.CLUBE) return null
  if (opts.tenantIdsEvento.length === 0) {
    return {
      pessoas: [],
      total: 0,
      viewerCheckIn: false,
      viewerOptIn: false,
      viewerUserId: opts.userId,
    }
  }

  const parts = parseDateOnly(opts.diaIso)
  const gte = startOfZonedDayUtc(parts)
  const lt = startOfZonedDayUtc(addCalendarDays(parts, 1))

  type RsvpRow = {
    userId: string
    user: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  }
  const [rsvps, perfilViewer]: [RsvpRow[], { memoriaPresencaVisivel: boolean } | null] =
    await Promise.all([
      db.eventoRsvp.findMany({
        where: {
          checkedInAt: { not: null },
          evento: {
            tenantId: { in: opts.tenantIdsEvento },
            data: { gte, lt },
          },
        },
        select: {
          userId: true,
          user: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
        },
        distinct: ['userId'],
        take: 80,
      }) as Promise<RsvpRow[]>,
      db.perfilMembro.findUnique({
        where: { userId_tenantId: { userId: opts.userId, tenantId: opts.tenantId } },
        select: { memoriaPresencaVisivel: true },
      }),
    ])

  const viewerCheckIn = rsvps.some((r) => r.userId === opts.userId)
  const viewerOptIn = Boolean(perfilViewer?.memoriaPresencaVisivel)
  const candidatos = rsvps.filter((r) => r.userId !== opts.userId)
  const userIds = candidatos.map((r) => r.userId)
  const perfis: Array<{ userId: string; memoriaPresencaVisivel: boolean }> =
    userIds.length === 0
      ? []
      : await db.perfilMembro.findMany({
          where: {
            tenantId: opts.tenantId,
            userId: { in: userIds },
            memoriaPresencaVisivel: true,
          },
          select: { userId: true, memoriaPresencaVisivel: true },
        })
  const visiveis = new Set(perfis.map((p) => p.userId))
  const pessoas = candidatos
    .filter((r) => visiveis.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      nome: (r.user.nickname || r.user.nome || 'Membro').trim(),
      avatarUrl: durableImageUrl(r.user.avatarUrl),
    }))
  const total = pessoas.length
  return {
    pessoas: pessoas.slice(0, LIMITE_PRESENCA_DIA),
    total,
    viewerCheckIn,
    viewerOptIn,
    viewerUserId: opts.userId,
  }
}
