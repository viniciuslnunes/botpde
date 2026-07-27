import { Prisma } from '@torcida/db'
import { db } from '@torcida/db'
import type { InboxItemDto } from './mensageria-client'
import { canFollowUser } from './social'
import { criarNotificacao } from '@/lib/notificacoes'
import { emitNotificacaoPing } from '@/lib/notificacoes-bus'

/**
 * Mensageria (DM 1×1 e grupos) — ver ARCHITECTURE.md §6 item 27.
 *
 * Regra central de acesso: a LEITURA é chaveada por participação
 * (`MembroConversa`), não por tenant — é o que permite DM entre membros de
 * torcidas aliadas. O `tenantId` da conversa é contexto/auditoria.
 */

export const MAX_MEMBROS_GRUPO = 50
export const MAX_CONTEUDO_MENSAGEM = 2000

export type TipoConversa = 'DIRETA' | 'GRUPO' | 'CANAL'
export type PapelConversa = 'ADMIN' | 'MEMBRO'
export type StatusParticipacaoConversa = 'ATIVO' | 'PENDENTE' | 'REJEITADO'
export type AcessoDm = 'direto' | 'solicitacao' | 'bloqueado'

export interface AutorLite {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export interface MensagemItem {
  id: string
  conversaId: string
  conteudo: string
  midiaUrls: string[]
  respostaAId: string | null
  editadaEm: Date | null
  removidaEm: Date | null
  criadoEm: Date
  autor: AutorLite
}

export interface ConversaInboxItem {
  id: string
  tipo: TipoConversa
  nome: string | null
  avatarUrl: string | null
  atualizadoEm: Date
  meuPapel: PapelConversa
  meuStatus: StatusParticipacaoConversa
  solicitacaoRecebida: boolean
  aguardandoAprovacao: boolean
  silenciada: boolean
  totalMembros: number
  /** No caso de DM, o outro participante (para nome/avatar da linha). */
  outroMembro: AutorLite | null
  ultimaMensagem: {
    conteudo: string
    autorNome: string | null
    criadoEm: Date
    removida: boolean
  } | null
  naoLidas: number
}

interface MembroAtivoRow {
  id: string
  papel: PapelConversa
  status: StatusParticipacaoConversa
  ultimaLeituraEm: Date | null
  silenciada: boolean
  conversa: {
    id: string
    tipo: TipoConversa
    tenantId: string
    nome: string | null
    avatarUrl: string | null
    atualizadoEm: Date
  }
}

/** Formato JSON do inbox nas APIs e hidratação SSR do shell de mensagens. */
export function serializeConversasInbox(conversas: ConversaInboxItem[]): InboxItemDto[] {
  return conversas.map((c) => ({
    ...c,
    atualizadoEm: c.atualizadoEm.toISOString(),
    ultimaMensagem: c.ultimaMensagem
      ? { ...c.ultimaMensagem, criadoEm: c.ultimaMensagem.criadoEm.toISOString() }
      : null,
  }))
}

/**
 * Canais oficiais sem `avatarUrl` herdam a foto da unidade (`Sede.fotoUrl`
 * via `canalConversaId`) — mesmo critério da listagem de canais da comunidade.
 */
async function resolveAvatarCanalPorSede(
  conversaIds: string[],
): Promise<Map<string, string>> {
  if (conversaIds.length === 0) return new Map()
  const sedes: Array<{ canalConversaId: string | null; fotoUrl: string | null }> =
    await db.sede.findMany({
      where: { canalConversaId: { in: conversaIds }, fotoUrl: { not: null } },
      select: { canalConversaId: true, fotoUrl: true },
    })
  const map = new Map<string, string>()
  for (const s of sedes) {
    if (s.canalConversaId && s.fotoUrl) map.set(s.canalConversaId, s.fotoUrl)
  }
  return map
}

/** Formato JSON da mensagem nas APIs (datas ISO, conteúdo removido zerado). */
export function serializeMensagem(m: MensagemItem) {
  return {
    id: m.id,
    conversaId: m.conversaId,
    conteudo: m.removidaEm ? '' : m.conteudo,
    midiaUrls: m.removidaEm ? [] : m.midiaUrls,
    respostaAId: m.respostaAId,
    editadaEm: m.editadaEm?.toISOString() ?? null,
    removida: m.removidaEm !== null,
    criadoEm: m.criadoEm.toISOString(),
    autor: m.autor,
  }
}

const MENSAGEM_SELECT = {
  id: true,
  conversaId: true,
  conteudo: true,
  midiaUrls: true,
  respostaAId: true,
  editadaEm: true,
  removidaEm: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true, avatarUrl: true } },
} as const

interface UnreadCountRow {
  conversaId: string
  count: number
}

/** Contagens de não-lidas por conversa em uma única query (evita N+1). */
async function contarNaoLidasPorConversa(
  userId: string,
  opts: { excludeSilenciadas?: boolean; conversaIds?: string[] } = {},
): Promise<Map<string, number>> {
  const { excludeSilenciadas = false, conversaIds } = opts
  if (conversaIds && conversaIds.length === 0) return new Map()

  const silenciadaClause = excludeSilenciadas
    ? Prisma.sql`AND mc.silenciada = false`
    : Prisma.empty
  const conversaClause =
    conversaIds && conversaIds.length > 0
      ? Prisma.sql`AND m.conversa_id IN (${Prisma.join(conversaIds)})`
      : Prisma.empty

  const rows: UnreadCountRow[] = await db.$queryRaw`
    SELECT m.conversa_id AS "conversaId", COUNT(*)::int AS count
    FROM saas_mensagens_diretas m
    INNER JOIN saas_membros_conversa mc ON mc.conversa_id = m.conversa_id
    WHERE mc.user_id = ${userId}
      AND mc.saiu_em IS NULL
      ${silenciadaClause}
      AND m.autor_id != ${userId}
      AND m.removida_em IS NULL
      AND (mc.ultima_leitura_em IS NULL OR m.criado_em > mc.ultima_leitura_em)
      ${conversaClause}
    GROUP BY m.conversa_id
  `

  return new Map(rows.map((r) => [r.conversaId, r.count]))
}

/**
 * Pode `remetenteId` conversar com `destinatarioId` neste contexto?
 * Mesma regra do seguir (mesmo tenant ou torcida aliada — `canFollowUser`)
 * + bloqueio usuário↔usuário em qualquer direção.
 */
export async function canMessageUser(
  remetenteId: string,
  destinatarioId: string,
  tenantContextoId: string,
): Promise<boolean> {
  if (remetenteId === destinatarioId) return false

  const bloqueio: { id: string } | null = await db.bloqueioUsuario.findFirst({
    where: {
      OR: [
        { bloqueadorId: remetenteId, bloqueadoId: destinatarioId },
        { bloqueadorId: destinatarioId, bloqueadoId: remetenteId },
      ],
    },
    select: { id: true },
  })
  if (bloqueio) return false

  return canFollowUser(remetenteId, destinatarioId, tenantContextoId)
}

/**
 * Pode convidar `alvoId` para um grupo de chat?
 * - Rede de conexão: seguimento APROVADO em qualquer direção
 * - Associados da comunidade: mesmo tenant / torcida aliada (`canMessageUser`)
 *
 * Na Comunidade Nacional (`tenantContextoId` null) **não** basta o mesmo clube —
 * perfil privado de sócio fora da rede não entra no grupo.
 */
export async function podeConvidarParaGrupoChat(
  convidanteId: string,
  alvoId: string,
  tenantContextoId?: string | null,
): Promise<boolean> {
  if (convidanteId === alvoId) return false

  const bloqueio: { id: string } | null = await db.bloqueioUsuario.findFirst({
    where: {
      OR: [
        { bloqueadorId: convidanteId, bloqueadoId: alvoId },
        { bloqueadorId: alvoId, bloqueadoId: convidanteId },
      ],
    },
    select: { id: true },
  })
  if (bloqueio) return false

  const conexao: { id: string } | null = await db.seguimento.findFirst({
    where: {
      status: 'APROVADO',
      OR: [
        { seguidorId: convidanteId, seguidoId: alvoId },
        { seguidorId: alvoId, seguidoId: convidanteId },
      ],
    },
    select: { id: true },
  })
  if (conexao) return true

  if (tenantContextoId) {
    return canMessageUser(convidanteId, alvoId, tenantContextoId)
  }

  return false
}

/** Afiliação (clube) do usuário para fins de mensageria na Comunidade Nacional. */
async function resolveAfiliacaoParaMensageria(userId: string): Promise<string | null> {
  const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
    where: { userId },
    select: { afiliacaoId: true },
  })
  if (perfil?.afiliacaoId) return perfil.afiliacaoId

  const membro: { tenant: { afiliacaoId: string | null } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO', tipo: 'SOCIO' },
    orderBy: { criadoEm: 'desc' },
    select: { tenant: { select: { afiliacaoId: true } } },
  })
  if (membro?.tenant.afiliacaoId) return membro.tenant.afiliacaoId

  // Owner/admin legado: tem UserRole na TO sem linha SaasMembro.
  const cargo: { tenant: { afiliacaoId: string | null } } | null = await db.userRole.findFirst({
    where: {
      userId,
      tenant: { ativo: true, sintetico: false, afiliacaoId: { not: null } },
    },
    select: { tenant: { select: { afiliacaoId: true } } },
  })
  return cargo?.tenant.afiliacaoId ?? null
}

/**
 * Ambos os usuários têm o mesmo clube vinculado (torcedor global ou sócio) —
 * gate de DM/grupo no caminho Comunidade Nacional, onde não há hierarquia de
 * tenant para `canFollowUser`/`canMessageUser`.
 */
export async function mesmaAfiliacaoComunidade(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false
  const [afiliacaoA, afiliacaoB] = await Promise.all([
    resolveAfiliacaoParaMensageria(userA),
    resolveAfiliacaoParaMensageria(userB),
  ])
  return Boolean(afiliacaoA && afiliacaoB && afiliacaoA === afiliacaoB)
}

/**
 * Sócio aprovado **ou** cargo em TO real (owner/admin legado sem SaasMembro).
 * Usado no gate de solicitação de DM — presidente sem linha de membro ainda
 * exige solicitação de torcedores e aparece como destinatário “sócio”.
 */
export async function isSocioAprovado(userId: string): Promise<boolean> {
  const membro: { id: string } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO', tipo: 'SOCIO' },
    select: { id: true },
  })
  if (membro) return true

  const cargo: { id: string } | null = await db.userRole.findFirst({
    where: { userId, tenant: { ativo: true, sintetico: false } },
    select: { id: true },
  })
  return cargo !== null
}

async function temBloqueioMutuo(userA: string, userB: string): Promise<boolean> {
  const bloqueio: { id: string } | null = await db.bloqueioUsuario.findFirst({
    where: {
      OR: [
        { bloqueadorId: userA, bloqueadoId: userB },
        { bloqueadorId: userB, bloqueadoId: userA },
      ],
    },
    select: { id: true },
  })
  return bloqueio !== null
}

async function vinculosSocioOuCargo(userIds: string[]): Promise<Array<{ userId: string; tenantId: string }>> {
  const [membros, cargos] = await Promise.all([
    db.saasMembro.findMany({
      where: { userId: { in: userIds }, status: 'APROVADO', tipo: 'SOCIO' },
      select: { userId: true, tenantId: true },
    }) as Promise<Array<{ userId: string; tenantId: string }>>,
    db.userRole.findMany({
      where: {
        userId: { in: userIds },
        tenant: { ativo: true, sintetico: false },
      },
      select: { userId: true, tenantId: true },
    }) as Promise<Array<{ userId: string; tenantId: string }>>,
  ])
  const vistos = new Set<string>()
  const out: Array<{ userId: string; tenantId: string }> = []
  for (const v of [...membros, ...cargos]) {
    const key = `${v.userId}:${v.tenantId}`
    if (vistos.has(key)) continue
    vistos.add(key)
    out.push(v)
  }
  return out
}

async function isParRivalSocio(userA: string, userB: string): Promise<boolean> {
  const vinculos = await vinculosSocioOuCargo([userA, userB])
  const aV = vinculos.filter((v) => v.userId === userA)
  const bV = vinculos.filter((v) => v.userId === userB)
  if (aV.length === 0 || bV.length === 0) return false

  const { getTenantRelation } = await import('./hierarquia')
  const { saoRivais } = await import('@torcida/types')
  for (const va of aV) {
    for (const vb of bV) {
      if (va.tenantId === vb.tenantId) continue
      const rel = await getTenantRelation(va.tenantId, vb.tenantId)
      if (saoRivais(rel)) return true
    }
  }
  return false
}

interface DmExistenteRow {
  id: string
  membros: Array<{ userId: string; status: StatusParticipacaoConversa }>
}

const STATUS_DM_ATIVA: StatusParticipacaoConversa[] = ['ATIVO', 'PENDENTE']

/**
 * Tenant do sino onde a notificação de mensageria deve aparecer para o usuário:
 * torcida do sócio aprovado, senão CN sintética do clube.
 */
export async function resolveTenantNotificacaoMensageria(
  userId: string,
): Promise<string | null> {
  const socio: { tenantId: string } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO', tipo: 'SOCIO' },
    orderBy: { criadoEm: 'desc' },
    select: { tenantId: true },
  })
  if (socio) return socio.tenantId

  const cargo: { tenantId: string } | null = await db.userRole.findFirst({
    where: { userId, tenant: { ativo: true, sintetico: false } },
    select: { tenantId: true },
  })
  if (cargo) return cargo.tenantId

  const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
    where: { userId },
    select: { afiliacaoId: true },
  })
  if (!perfil?.afiliacaoId) return null

  const { getOrCreateComunidadeNacionalTenant } = await import('./comunidade-contexto')
  const sintetico = await getOrCreateComunidadeNacionalTenant(perfil.afiliacaoId)
  return sintetico.id
}

/** DM ativa/pendente entre dois usuários (ignora REJEITADO — permite nova solicitação após desbloqueio). */
export async function findDmEntreUsuarios(
  userA: string,
  userB: string,
): Promise<DmExistenteRow | null> {
  const conversa: DmExistenteRow | null = await db.conversa.findFirst({
    where: {
      tipo: 'DIRETA',
      AND: [
        {
          membros: {
            some: { userId: userA, saiuEm: null, status: { in: STATUS_DM_ATIVA } },
          },
        },
        {
          membros: {
            some: { userId: userB, saiuEm: null, status: { in: STATUS_DM_ATIVA } },
          },
        },
      ],
    },
    select: {
      id: true,
      membros: {
        where: { saiuEm: null, status: { in: STATUS_DM_ATIVA } },
        select: { userId: true, status: true },
      },
    },
  })
  return conversa
}

/**
 * Avalia se a DM é direta, exige solicitação com aprovação ou está bloqueada.
 *
 * Regras (após bloqueio/rival/rejeição):
 * - mesmo tenant ou aliados (`canMessageUser`) → direto
 * - mesmo clube e destinatário é sócio → solicitação (torcedor→sócio ou sócio×sócio sem aliança)
 * - mesmo clube entre torcedores → direto
 * - clubes diferentes → bloqueado
 *
 * `tenantContextoId` null = Comunidade Nacional (sem hierarquia de tenant).
 * Com tenant setado, `canMessageUser` só amplia para direto — nunca transforma
 * par do mesmo clube em bloqueado (bug que gerava 403 na busca de contatos).
 */
export async function avaliarAcessoDm(
  remetenteId: string,
  destinatarioId: string,
  tenantContextoId?: string | null,
): Promise<AcessoDm> {
  if (remetenteId === destinatarioId) return 'bloqueado'
  if (await temBloqueioMutuo(remetenteId, destinatarioId)) return 'bloqueado'
  if (await isParRivalSocio(remetenteId, destinatarioId)) return 'bloqueado'

  const existente = await findDmEntreUsuarios(remetenteId, destinatarioId)
  if (existente) {
    const meu = existente.membros.find((m) => m.userId === remetenteId)
    const outro = existente.membros.find((m) => m.userId === destinatarioId)
    if (meu?.status === 'REJEITADO' || outro?.status === 'REJEITADO') return 'bloqueado'
    if (meu?.status === 'ATIVO' && outro?.status === 'ATIVO') return 'direto'
    if (outro?.status === 'PENDENTE') return 'solicitacao'
    if (meu?.status === 'PENDENTE') return 'solicitacao'
  }

  if (tenantContextoId) {
    const podeDireto = await canMessageUser(remetenteId, destinatarioId, tenantContextoId)
    if (podeDireto) return 'direto'
  }

  const [destSocio, mesmoClube] = await Promise.all([
    isSocioAprovado(destinatarioId),
    mesmaAfiliacaoComunidade(remetenteId, destinatarioId),
  ])

  if (!mesmoClube) return 'bloqueado'
  if (destSocio) return 'solicitacao'
  return 'direto'
}

/** Cria DM com destinatário PENDENTE e primeira mensagem introdutória. */
export async function criarDmComSolicitacao(
  remetenteId: string,
  destinatarioId: string,
  tenantId: string,
  conteudo: string,
  midiaUrls: string[] = [],
  tenantContextoId?: string | null,
): Promise<{ id: string; criadaAgora: boolean }> {
  const acesso = await avaliarAcessoDm(remetenteId, destinatarioId, tenantContextoId)
  if (acesso === 'bloqueado') {
    throw new Error('Você não pode enviar mensagem para este usuário.')
  }
  if (acesso === 'direto') {
    return getOrCreateDmConversa(remetenteId, destinatarioId, tenantId)
  }

  const existente = await findDmEntreUsuarios(remetenteId, destinatarioId)
  if (existente) {
    const outro = existente.membros.find((m) => m.userId === destinatarioId)
    if (outro?.status === 'PENDENTE') {
      // Reenvio da UI de solicitação: anexa nova intro se veio conteúdo.
      if (conteudo.trim() || midiaUrls.length > 0) {
        await criarMensagem(existente.id, remetenteId, conteudo, midiaUrls)
      }
      return { id: existente.id, criadaAgora: false }
    }
    return { id: existente.id, criadaAgora: false }
  }

  const conversa: { id: string } = await db.conversa.create({
    data: {
      tipo: 'DIRETA',
      tenantId,
      criadoPorId: remetenteId,
      membros: {
        create: [
          { userId: remetenteId, papel: 'MEMBRO', status: 'ATIVO' },
          { userId: destinatarioId, papel: 'MEMBRO', status: 'PENDENTE' },
        ],
      },
    },
    select: { id: true },
  })

  await criarMensagem(conversa.id, remetenteId, conteudo, midiaUrls)
  return { id: conversa.id, criadaAgora: true }
}

/** Destinatário aprova solicitação — ambos passam a ATIVO. */
export async function aprovarSolicitacaoMensagem(
  conversaId: string,
  userId: string,
): Promise<void> {
  const membro: { status: StatusParticipacaoConversa; conversa: { tipo: TipoConversa } } | null =
    await db.membroConversa.findFirst({
      where: { conversaId, userId, saiuEm: null },
      select: { status: true, conversa: { select: { tipo: true } } },
    })
  if (!membro || membro.conversa.tipo !== 'DIRETA') {
    throw new Error('Conversa não encontrada.')
  }
  if (membro.status !== 'PENDENTE') {
    throw new Error('Não há solicitação pendente nesta conversa.')
  }

  await db.membroConversa.updateMany({
    where: { conversaId, saiuEm: null, status: { in: ['PENDENTE', 'ATIVO'] } },
    data: { status: 'ATIVO' },
  })
}

/** Destinatário recusa — bloqueia novas solicitações do remetente. */
export async function rejeitarSolicitacaoMensagem(
  conversaId: string,
  userId: string,
): Promise<{ remetenteId: string }> {
  const membro: {
    status: StatusParticipacaoConversa
    conversa: { tipo: TipoConversa; criadoPorId: string }
  } | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null },
    select: {
      status: true,
      conversa: { select: { tipo: true, criadoPorId: true } },
    },
  })
  if (!membro || membro.conversa.tipo !== 'DIRETA') {
    throw new Error('Conversa não encontrada.')
  }
  if (membro.status !== 'PENDENTE') {
    throw new Error('Não há solicitação pendente nesta conversa.')
  }

  const remetenteId = membro.conversa.criadoPorId

  await db.$transaction([
    db.membroConversa.update({
      where: { conversaId_userId: { conversaId, userId } },
      data: { status: 'REJEITADO' },
    }),
    db.membroConversa.updateMany({
      where: { conversaId, userId: remetenteId, saiuEm: null },
      data: { status: 'REJEITADO' },
    }),
    db.bloqueioUsuario.upsert({
      where: {
        bloqueadorId_bloqueadoId: { bloqueadorId: userId, bloqueadoId: remetenteId },
      },
      create: { bloqueadorId: userId, bloqueadoId: remetenteId },
      update: {},
    }),
  ])

  return { remetenteId }
}

/** Verifica se o usuário pode enviar mensagens nesta conversa. */
export async function assertPodeEnviarNaConversa(
  conversaId: string,
  userId: string,
): Promise<{ membro: MembroAtivoRow; conversaTipo: TipoConversa }> {
  const membro = await assertMembroConversa(conversaId, userId)
  if (membro.status === 'REJEITADO') {
    throw new Error('Esta conversa foi encerrada.')
  }

  if (membro.conversa.tipo === 'DIRETA' && membro.status === 'ATIVO') {
    const outro: { status: StatusParticipacaoConversa } | null = await db.membroConversa.findFirst({
      where: { conversaId, userId: { not: userId }, saiuEm: null },
      select: { status: true },
    })
    if (outro?.status === 'PENDENTE') {
      throw new Error('Aguarde a aprovação da sua solicitação antes de enviar mais mensagens.')
    }
  }

  if (membro.status === 'PENDENTE') {
    // DIRETA: destinatário precisa aprovar/recusar. CANAL/GRUPO: quem pediu
    // entrada aguarda decisão do admin — mensagem distinta evita confusão.
    if (membro.conversa.tipo === 'DIRETA') {
      throw new Error('Aprove ou recuse a solicitação antes de responder.')
    }
    throw new Error('Aguarde a aprovação do pedido de entrada antes de enviar mensagens.')
  }

  return { membro, conversaTipo: membro.conversa.tipo }
}

/** Participação ativa na conversa (não saiu). Lança erro se não participa. */
export async function assertMembroConversa(
  conversaId: string,
  userId: string,
): Promise<MembroAtivoRow> {
  const membro: MembroAtivoRow | null = await db.membroConversa.findFirst({
    where: {
      conversaId,
      userId,
      saiuEm: null,
      status: { in: ['ATIVO', 'PENDENTE'] },
    },
    select: {
      id: true,
      papel: true,
      status: true,
      ultimaLeituraEm: true,
      silenciada: true,
      conversa: {
        select: {
          id: true,
          tipo: true,
          tenantId: true,
          nome: true,
          avatarUrl: true,
          atualizadoEm: true,
        },
      },
    },
  })
  if (!membro) throw new Error('Conversa não encontrada')
  return membro
}

/**
 * Busca a DM existente entre os dois usuários ou cria uma nova.
 * DMs são únicas por par — não se cria uma segunda conversa DIRETA.
 */
export async function getOrCreateDmConversa(
  userId: string,
  outroId: string,
  tenantContextoId: string,
): Promise<{ id: string; criadaAgora: boolean }> {
  const existente = await findDmEntreUsuarios(userId, outroId)
  if (existente) return { id: existente.id, criadaAgora: false }

  const conversa: { id: string } = await db.conversa.create({
    data: {
      tipo: 'DIRETA',
      tenantId: tenantContextoId,
      criadoPorId: userId,
      membros: {
        create: [
          { userId, papel: 'MEMBRO', status: 'ATIVO' },
          { userId: outroId, papel: 'MEMBRO', status: 'ATIVO' },
        ],
      },
    },
    select: { id: true },
  })
  return { id: conversa.id, criadaAgora: true }
}

/** Cria um grupo com o criador como ADMIN e os demais como MEMBRO. */
export async function criarGrupoConversa(
  criadorId: string,
  tenantContextoId: string,
  nome: string,
  membroIds: string[],
): Promise<{ id: string }> {
  const unicos = [...new Set(membroIds)].filter((id) => id !== criadorId)
  const conversa: { id: string } = await db.conversa.create({
    data: {
      tipo: 'GRUPO',
      tenantId: tenantContextoId,
      nome,
      criadoPorId: criadorId,
      membros: {
        create: [
          { userId: criadorId, papel: 'ADMIN' },
          ...unicos.map((userId) => ({ userId, papel: 'MEMBRO' as const })),
        ],
      },
    },
    select: { id: true },
  })
  return conversa
}

/** Inbox do usuário: conversas ativas ordenadas por atividade, com não-lidas. */
export async function listConversas(userId: string): Promise<ConversaInboxItem[]> {
  interface InboxRow extends MembroAtivoRow {
    conversa: MembroAtivoRow['conversa'] & {
      _count: { membros: number }
      mensagens: {
        conteudo: string
        criadoEm: Date
        removidaEm: Date | null
        autor: { nome: string | null }
      }[]
    }
  }

  // Sem nested `membros[]` completo — grupos grandes inflavam a payload (N membros × 50 conversas).
  const rows: InboxRow[] = await db.membroConversa.findMany({
    where: { userId, saiuEm: null, status: { in: ['ATIVO', 'PENDENTE'] } },
    select: {
      id: true,
      papel: true,
      status: true,
      ultimaLeituraEm: true,
      silenciada: true,
      conversa: {
        select: {
          id: true,
          tipo: true,
          tenantId: true,
          nome: true,
          avatarUrl: true,
          atualizadoEm: true,
          _count: {
            select: { membros: { where: { saiuEm: null } } },
          },
          mensagens: {
            orderBy: { criadoEm: 'desc' },
            take: 1,
            select: {
              conteudo: true,
              criadoEm: true,
              removidaEm: true,
              autor: { select: { nome: true } },
            },
          },
        },
      },
    },
    orderBy: { conversa: { atualizadoEm: 'desc' } },
    take: 50,
  })

  const conversaIds = rows.map((row) => row.conversa.id)
  const dmIds = rows
    .filter((row) => row.conversa.tipo === 'DIRETA')
    .map((row) => row.conversa.id)
  const canalSemAvatarIds = rows
    .filter((row) => row.conversa.tipo === 'CANAL' && !row.conversa.avatarUrl)
    .map((row) => row.conversa.id)

  const [naoLidasMap, outrosDm, avatarCanalPorSede] = await Promise.all([
    contarNaoLidasPorConversa(userId, { conversaIds }),
    dmIds.length === 0
      ? Promise.resolve(
          [] as Array<{ conversaId: string; user: AutorLite; status: StatusParticipacaoConversa }>,
        )
      : db.membroConversa.findMany({
          where: {
            conversaId: { in: dmIds },
            userId: { not: userId },
            saiuEm: null,
          },
          select: {
            conversaId: true,
            status: true,
            user: { select: { id: true, nome: true, avatarUrl: true } },
          },
        }),
    resolveAvatarCanalPorSede(canalSemAvatarIds),
  ])

  const outroPorConversa = new Map<string, AutorLite>()
  const outroStatusPorConversa = new Map<string, StatusParticipacaoConversa>()
  for (const row of outrosDm) {
    outroPorConversa.set(row.conversaId, row.user)
    outroStatusPorConversa.set(row.conversaId, row.status)
  }

  // Persiste avatar herdado da unidade — canais criados antes do fix ficam
  // sem avatarUrl e a thread/inbox caíam na inicial. Best-effort, sem await.
  if (avatarCanalPorSede.size > 0) {
    void Promise.all(
      [...avatarCanalPorSede.entries()].map(([id, url]) =>
        db.conversa.updateMany({
          where: { id, OR: [{ avatarUrl: null }, { avatarUrl: '' }] },
          data: { avatarUrl: url },
        }),
      ),
    ).catch(() => undefined)
  }

  return rows.map((row) => {
    const ultima = row.conversa.mensagens[0] ?? null
    const outroStatus =
      row.conversa.tipo === 'DIRETA'
        ? (outroStatusPorConversa.get(row.conversa.id) ?? 'ATIVO')
        : 'ATIVO'
    const solicitacaoRecebida = row.conversa.tipo === 'DIRETA' && row.status === 'PENDENTE'
    // DM: remetente aguarda o outro. Canal/grupo: meu status PENDENTE = pedido de entrada.
    const aguardandoAprovacao =
      (row.conversa.tipo === 'DIRETA' && row.status === 'ATIVO' && outroStatus === 'PENDENTE') ||
      (row.conversa.tipo !== 'DIRETA' && row.status === 'PENDENTE')
    return {
      id: row.conversa.id,
      tipo: row.conversa.tipo,
      nome: row.conversa.nome,
      avatarUrl:
        row.conversa.avatarUrl ?? avatarCanalPorSede.get(row.conversa.id) ?? null,
      atualizadoEm: row.conversa.atualizadoEm,
      meuPapel: row.papel,
      meuStatus: row.status,
      solicitacaoRecebida,
      aguardandoAprovacao,
      silenciada: row.silenciada,
      totalMembros: row.conversa._count.membros,
      outroMembro:
        row.conversa.tipo === 'DIRETA'
          ? (outroPorConversa.get(row.conversa.id) ?? null)
          : null,
      ultimaMensagem: ultima
        ? {
            conteudo: ultima.removidaEm ? 'Mensagem removida' : ultima.conteudo,
            autorNome: ultima.autor.nome,
            criadoEm: ultima.criadoEm,
            removida: ultima.removidaEm !== null,
          }
        : null,
      naoLidas: naoLidasMap.get(row.conversa.id) ?? 0,
    }
  })
}

/** Mensagens da conversa (ascendente).
 * - sem cursor: página mais recente
 * - `after`: polling incremental (novas)
 * - `before`: histórico mais antigo (paginação no topo)
 */
export async function listMensagens(
  conversaId: string,
  opts: { after?: Date; before?: Date; take?: number } = {},
): Promise<{ mensagens: MensagemItem[]; hasMore: boolean }> {
  const take = Math.min(opts.take ?? 40, 100)

  if (opts.after) {
    const mensagens: MensagemItem[] = await db.mensagemDireta.findMany({
      where: { conversaId, criadoEm: { gt: opts.after } },
      orderBy: { criadoEm: 'asc' },
      take,
      select: MENSAGEM_SELECT,
    })
    return { mensagens, hasMore: false }
  }

  if (opts.before) {
    const recentes: MensagemItem[] = await db.mensagemDireta.findMany({
      where: { conversaId, criadoEm: { lt: opts.before } },
      orderBy: { criadoEm: 'desc' },
      take: take + 1,
      select: MENSAGEM_SELECT,
    })
    const hasMore = recentes.length > take
    const pagina = hasMore ? recentes.slice(0, take) : recentes
    return { mensagens: pagina.reverse(), hasMore }
  }

  const recentes: MensagemItem[] = await db.mensagemDireta.findMany({
    where: { conversaId },
    orderBy: { criadoEm: 'desc' },
    take: take + 1,
    select: MENSAGEM_SELECT,
  })
  const hasMore = recentes.length > take
  const pagina = hasMore ? recentes.slice(0, take) : recentes
  return { mensagens: pagina.reverse(), hasMore }
}

/** Cria mensagem e bumpa `atualizadoEm` da conversa (ordena a inbox). */
export async function criarMensagem(
  conversaId: string,
  autorId: string,
  conteudo: string,
  midiaUrls: string[],
  respostaAId?: string,
): Promise<MensagemItem> {
  const [mensagem] = await db.$transaction([
    db.mensagemDireta.create({
      data: { conversaId, autorId, conteudo, midiaUrls, respostaAId: respostaAId ?? null },
      select: MENSAGEM_SELECT,
    }),
    db.conversa.update({
      where: { id: conversaId },
      data: { atualizadoEm: new Date() },
      select: { id: true },
    }),
  ])
  return mensagem as MensagemItem
}

/**
 * Notificação persistente de mensagem nova — uma por conversa não lida (não
 * uma por mensagem, evita spam numa conversa ativa). Se o destinatário já
 * tem uma `NOVA_MENSAGEM` não lida dessa conversa, só atualiza o preview e
 * bumpa pro topo; senão cria. Best-effort — nunca deve quebrar o envio.
 */
export async function notificarNovaMensagem(params: {
  conversaId: string
  tenantId: string
  autorId: string
  autorNome: string
  conversaTipo: TipoConversa
  conversaNome: string | null
  preview: string
  destinatarios: string[]
}): Promise<void> {
  const { conversaId, tenantId, autorId, autorNome, conversaTipo, conversaNome, preview, destinatarios } =
    params
  const link = `/portal/mensagens?c=${conversaId}`
  const titulo =
    conversaTipo === 'DIRETA'
      ? `Nova mensagem de ${autorNome}`
      : `Nova mensagem em ${conversaNome ?? 'grupo'}`

  for (const userId of destinatarios) {
    try {
      const existente: { id: string } | null = await db.notificacao.findFirst({
        where: { userId, tenantId, tipo: 'NOVA_MENSAGEM', lida: false, link },
        select: { id: true },
      })
      if (existente) {
        await db.notificacao.update({
          where: { id: existente.id },
          data: { corpo: preview, criadoEm: new Date(), atorId: autorId, titulo },
        })
        emitNotificacaoPing(tenantId, userId)
      } else {
        await criarNotificacao({
          userId,
          tenantId,
          tipo: 'NOVA_MENSAGEM',
          titulo,
          corpo: preview,
          link,
          atorId: autorId,
        })
      }
    } catch {
      // best-effort — falha ao notificar não pode quebrar o envio da mensagem
    }
  }
}

/** Marca a conversa como lida até agora. */
export async function marcarConversaLida(conversaId: string, userId: string): Promise<void> {
  await db.membroConversa.updateMany({
    where: { conversaId, userId, saiuEm: null },
    data: { ultimaLeituraEm: new Date() },
  })
}

/** Total de mensagens não lidas do usuário (badge da navbar). */
export async function contarMensagensNaoLidas(userId: string): Promise<number> {
  const naoLidasMap = await contarNaoLidasPorConversa(userId, { excludeSilenciadas: true })
  let total = 0
  for (const count of naoLidasMap.values()) total += count
  return total
}

/** Membros ativos da conversa (painel do grupo). */
export async function listMembrosConversa(
  conversaId: string,
): Promise<{ userId: string; papel: PapelConversa; user: AutorLite }[]> {
  const membros: { userId: string; papel: PapelConversa; user: AutorLite }[] =
    await db.membroConversa.findMany({
      where: { conversaId, saiuEm: null },
      select: {
        userId: true,
        papel: true,
        user: { select: { id: true, nome: true, avatarUrl: true } },
      },
      orderBy: { entrouEm: 'asc' },
    })
  return membros
}
