import { Prisma } from '@torcida/db'
import { db } from '@torcida/db'
import type { InboxItemDto } from './mensageria-client'
import { canFollowUser } from './social'

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
  return membro?.tenant.afiliacaoId ?? null
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

/** Participação ativa na conversa (não saiu). Lança erro se não participa. */
export async function assertMembroConversa(
  conversaId: string,
  userId: string,
): Promise<MembroAtivoRow> {
  const membro: MembroAtivoRow | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null, status: 'ATIVO' },
    select: {
      id: true,
      papel: true,
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
  const existente: { id: string } | null = await db.conversa.findFirst({
    where: {
      tipo: 'DIRETA',
      AND: [
        { membros: { some: { userId } } },
        { membros: { some: { userId: outroId } } },
      ],
    },
    select: { id: true },
  })
  if (existente) return { id: existente.id, criadaAgora: false }

  const conversa: { id: string } = await db.conversa.create({
    data: {
      tipo: 'DIRETA',
      tenantId: tenantContextoId,
      criadoPorId: userId,
      membros: {
        create: [
          { userId, papel: 'MEMBRO' },
          { userId: outroId, papel: 'MEMBRO' },
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
    where: { userId, saiuEm: null },
    select: {
      id: true,
      papel: true,
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

  const [naoLidasMap, outrosDm] = await Promise.all([
    contarNaoLidasPorConversa(userId, { conversaIds }),
    dmIds.length === 0
      ? Promise.resolve(
          [] as Array<{ conversaId: string; user: AutorLite }>,
        )
      : db.membroConversa.findMany({
          where: {
            conversaId: { in: dmIds },
            userId: { not: userId },
            saiuEm: null,
          },
          select: {
            conversaId: true,
            user: { select: { id: true, nome: true, avatarUrl: true } },
          },
        }),
  ])

  const outroPorConversa = new Map<string, AutorLite>()
  for (const row of outrosDm) {
    outroPorConversa.set(row.conversaId, row.user)
  }

  return rows.map((row) => {
    const ultima = row.conversa.mensagens[0] ?? null
    return {
      id: row.conversa.id,
      tipo: row.conversa.tipo,
      nome: row.conversa.nome,
      avatarUrl: row.conversa.avatarUrl,
      atualizadoEm: row.conversa.atualizadoEm,
      meuPapel: row.papel,
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
