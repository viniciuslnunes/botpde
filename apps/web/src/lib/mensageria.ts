import { db } from '@torcida/db'
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

export type TipoConversa = 'DIRETA' | 'GRUPO'
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

/** Participação ativa na conversa (não saiu). Lança erro se não participa. */
export async function assertMembroConversa(
  conversaId: string,
  userId: string,
): Promise<MembroAtivoRow> {
  const membro: MembroAtivoRow | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null },
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
      membros: { userId: string; saiuEm: Date | null; user: AutorLite }[]
      mensagens: {
        conteudo: string
        criadoEm: Date
        removidaEm: Date | null
        autor: { nome: string | null }
      }[]
    }
  }

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
          membros: {
            select: {
              userId: true,
              saiuEm: true,
              user: { select: { id: true, nome: true, avatarUrl: true } },
            },
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

  const naoLidasPorConversa = await Promise.all(
    rows.map((row) =>
      db.mensagemDireta.count({
        where: {
          conversaId: row.conversa.id,
          autorId: { not: userId },
          removidaEm: null,
          ...(row.ultimaLeituraEm ? { criadoEm: { gt: row.ultimaLeituraEm } } : {}),
        },
      }),
    ),
  )

  return rows.map((row, i) => {
    const ativos = row.conversa.membros.filter((m) => m.saiuEm === null)
    const outro = row.conversa.tipo === 'DIRETA'
      ? (ativos.find((m) => m.userId !== userId)?.user ?? null)
      : null
    const ultima = row.conversa.mensagens[0] ?? null
    return {
      id: row.conversa.id,
      tipo: row.conversa.tipo,
      nome: row.conversa.nome,
      avatarUrl: row.conversa.avatarUrl,
      atualizadoEm: row.conversa.atualizadoEm,
      meuPapel: row.papel,
      silenciada: row.silenciada,
      totalMembros: ativos.length,
      outroMembro: outro,
      ultimaMensagem: ultima
        ? {
            conteudo: ultima.removidaEm ? 'Mensagem removida' : ultima.conteudo,
            autorNome: ultima.autor.nome,
            criadoEm: ultima.criadoEm,
            removida: ultima.removidaEm !== null,
          }
        : null,
      naoLidas: naoLidasPorConversa[i],
    }
  })
}

/** Mensagens da conversa (ascendente). `after` = polling incremental. */
export async function listMensagens(
  conversaId: string,
  opts: { after?: Date; take?: number } = {},
): Promise<MensagemItem[]> {
  const take = Math.min(opts.take ?? 100, 200)
  const mensagens: MensagemItem[] = await db.mensagemDireta.findMany({
    where: {
      conversaId,
      ...(opts.after ? { criadoEm: { gt: opts.after } } : {}),
    },
    orderBy: { criadoEm: 'asc' },
    // Sem `after`, queremos as ÚLTIMAS `take`: busca desc e reverte
    ...(opts.after ? { take } : {}),
    select: MENSAGEM_SELECT,
  })
  if (!opts.after && mensagens.length > take) {
    return mensagens.slice(mensagens.length - take)
  }
  return mensagens
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
  interface LeituraRow {
    ultimaLeituraEm: Date | null
    conversaId: string
  }
  const membros: LeituraRow[] = await db.membroConversa.findMany({
    where: { userId, saiuEm: null, silenciada: false },
    select: { conversaId: true, ultimaLeituraEm: true },
  })
  if (membros.length === 0) return 0

  const counts = await Promise.all(
    membros.map((m) =>
      db.mensagemDireta.count({
        where: {
          conversaId: m.conversaId,
          autorId: { not: userId },
          removidaEm: null,
          ...(m.ultimaLeituraEm ? { criadoEm: { gt: m.ultimaLeituraEm } } : {}),
        },
      }),
    ),
  )
  return counts.reduce((acc, n) => acc + n, 0)
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
