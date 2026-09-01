/**
 * Ticket de loja pós-compra: abre conversa, fila de claim e fecho persistente.
 */
import { db, type Prisma } from '@torcida/db'
import {
  idCurtoPedido,
  motivoFechoPorStatusPedido,
  nomeConversaPedidoTicket,
  podeAtenderTicket,
  podeFecharTicket,
  ticketPermiteEnvio,
  STATUS_PEDIDO_TICKET,
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
} from '@torcida/types'
import { criarMensagem } from '@/lib/mensageria'
import type { InboxItemDto } from '@/lib/mensageria-client'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export type PedidoTicketStatus = 'ABERTO' | 'ATENDENDO' | 'FECHADO'
export type PedidoTicketMotivoFecho = 'ENTREGUE' | 'MANUAL' | 'CANCELADO'

export type TicketLite = {
  id: string
  tenantId: string
  pedidoId: string
  conversaId: string
  status: PedidoTicketStatus
  atendenteId: string | null
  abertoEm: Date
  atendidoEm: Date | null
  fechadoEm: Date | null
  fechadoPorId: string | null
  motivoFecho: PedidoTicketMotivoFecho | null
}

const TICKET_SELECT = {
  id: true,
  tenantId: true,
  pedidoId: true,
  conversaId: true,
  status: true,
  atendenteId: true,
  abertoEm: true,
  atendidoEm: true,
  fechadoEm: true,
  fechadoPorId: true,
  motivoFecho: true,
} as const

export type TicketFilaItem = TicketLite & {
  pedido: {
    id: string
    status: string
    total: unknown
    modalidadeEntrega: string
    criadoEm: Date
    user: { id: string; nome: string | null; email: string | null }
    itens: Array<{ produtoNome: string; tamanho: string | null; quantidade: number }>
  }
  atendente: { id: string; nome: string | null } | null
}

/** Staff da loja no tenant do pedido (view_orders ou manage). Super-admin opera fora do RBAC. */
export async function userTemPermissaoLojaTicket(
  userId: string,
  tenantId: string,
): Promise<{ podeVer: boolean; podeGerir: boolean }> {
  const user: { email: string | null } | null = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (isSuperAdminEmail(user?.email)) {
    return { podeVer: true, podeGerir: true }
  }

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  const podeGerir = hasPermission(efetivas, PERMISSIONS.STORE_MANAGE)
  const podeVer =
    podeGerir || hasPermission(efetivas, PERMISSIONS.STORE_VIEW_ORDERS)
  return { podeVer, podeGerir }
}

/** Entra (ou reabre) o staff na conversa do ticket — claim e super-admin. */
export async function garantirMembroConversaTicket(
  conversaId: string,
  userId: string,
): Promise<void> {
  const membroExistente: { id: string; saiuEm: Date | null } | null =
    await db.membroConversa.findUnique({
      where: { conversaId_userId: { conversaId, userId } },
      select: { id: true, saiuEm: true },
    })

  if (!membroExistente) {
    await db.membroConversa.create({
      data: {
        conversaId,
        userId,
        papel: 'ADMIN',
        status: 'ATIVO',
      },
    })
    return
  }

  if (membroExistente.saiuEm) {
    await db.membroConversa.update({
      where: { id: membroExistente.id },
      data: { saiuEm: null, status: 'ATIVO', papel: 'ADMIN' },
    })
  }
}

export function ticketPermiteEnvioStatus(status: PedidoTicketStatus | null | undefined): boolean {
  return ticketPermiteEnvio(status)
}

/** Mensagem inicial com resumo do pedido (autor = comprador). */
function montarMensagemAbertura(input: {
  idCurto: string
  modalidade: string
  itens: Array<{ produtoNome: string; tamanho: string | null; quantidade: number }>
  total: number
}): string {
  const mod = input.modalidade === 'ENVIO' ? 'Envio' : 'Retirada'
  const linhas = input.itens
    .map((i) => `• ${i.produtoNome}${i.tamanho ? ` (${i.tamanho})` : ''} × ${i.quantidade}`)
    .join('\n')
  const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    input.total,
  )
  return [
    `Pedido ${input.idCurto} aberto (${mod}).`,
    '',
    linhas,
    '',
    `Total: ${total}`,
    '',
    'Use esta conversa para combinar retirada, envio ou esclarecer o pedido. A loja vai atender em breve.',
  ].join('\n')
}

/**
 * Cria conversa + ticket ABERTO para um pedido (idempotente se já existir).
 */
export async function abrirTicketPedido(pedidoId: string): Promise<TicketLite> {
  const existente: TicketLite | null = await db.saasPedidoTicket.findUnique({
    where: { pedidoId },
    select: TICKET_SELECT,
  })
  if (existente) return existente

  const pedido: {
    id: string
    tenantId: string
    userId: string
    total: Prisma.Decimal
    modalidadeEntrega: string
    itens: Array<{ produtoNome: string; tamanho: string | null; quantidade: number }>
  } | null = await db.saasPedido.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      total: true,
      modalidadeEntrega: true,
      itens: { select: { produtoNome: true, tamanho: true, quantidade: true } },
    },
  })
  if (!pedido) throw new Error('Pedido não encontrado.')

  const idCurto = idCurtoPedido(pedido.id)
  const nome = nomeConversaPedidoTicket({
    idCurto,
    modalidade: pedido.modalidadeEntrega,
  })

  const ticket: TicketLite = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const conversa: { id: string } = await tx.conversa.create({
      data: {
        tipo: 'GRUPO',
        tenantId: pedido.tenantId,
        nome,
        comunidade: false,
        publica: false,
        criadoPorId: pedido.userId,
        membros: {
          create: [{ userId: pedido.userId, papel: 'MEMBRO', status: 'ATIVO' }],
        },
      },
      select: { id: true },
    })

    const criado: TicketLite = await tx.saasPedidoTicket.create({
      data: {
        tenantId: pedido.tenantId,
        pedidoId: pedido.id,
        conversaId: conversa.id,
        status: 'ABERTO',
      },
      select: TICKET_SELECT,
    })

    return criado
  })

  await criarMensagem(
    ticket.conversaId,
    pedido.userId,
    montarMensagemAbertura({
      idCurto,
      modalidade: pedido.modalidadeEntrega,
      itens: pedido.itens,
      total: Number(pedido.total),
    }),
    [],
  )

  return ticket
}

/**
 * Claim atômico ABERTO → ATENDENDO; adiciona atendente à conversa.
 */
export async function atenderTicket(
  ticketId: string,
  atendenteId: string,
): Promise<TicketLite> {
  const ticket: TicketLite | null = await db.saasPedidoTicket.findUnique({
    where: { id: ticketId },
    select: TICKET_SELECT,
  })
  if (!ticket) throw new Error('Ticket não encontrado.')

  const { podeVer } = await userTemPermissaoLojaTicket(atendenteId, ticket.tenantId)
  if (!podeVer) throw new Error('Sem permissão para atender tickets da loja.')

  const check = podeAtenderTicket(ticket.status)
  if (!check.ok) throw new Error(check.erro)

  const agora = new Date()
  const claimed: { count: number } = await db.saasPedidoTicket.updateMany({
    where: { id: ticketId, status: 'ABERTO' },
    data: {
      status: 'ATENDENDO',
      atendenteId,
      atendidoEm: agora,
    },
  })
  if (claimed.count === 0) {
    throw new Error('Este ticket já foi atendido por outra pessoa.')
  }

  await garantirMembroConversaTicket(ticket.conversaId, atendenteId)

  const atendente: { nome: string | null } | null = await db.user.findUnique({
    where: { id: atendenteId },
    select: { nome: true },
  })
  const nomeAtendente = atendente?.nome?.trim() || 'A loja'
  await criarMensagem(
    ticket.conversaId,
    atendenteId,
    `${nomeAtendente} assumiu o atendimento deste pedido.`,
    [],
  )

  const atualizado: TicketLite | null = await db.saasPedidoTicket.findUnique({
    where: { id: ticketId },
    select: TICKET_SELECT,
  })
  if (!atualizado) throw new Error('Ticket não encontrado.')
  return atualizado
}

/**
 * Fecha ticket (idempotente se já FECHADO com mesmo motivo implícito).
 */
export async function fecharTicket(
  ticketId: string,
  opts: { motivo: PedidoTicketMotivoFecho; atorId: string },
): Promise<TicketLite> {
  const ticket: TicketLite | null = await db.saasPedidoTicket.findUnique({
    where: { id: ticketId },
    select: TICKET_SELECT,
  })
  if (!ticket) throw new Error('Ticket não encontrado.')

  if (ticket.status === 'FECHADO') return ticket

  const check = podeFecharTicket(ticket.status, opts.motivo)
  if (!check.ok) throw new Error(check.erro)

  if (opts.motivo === 'MANUAL') {
    const { podeGerir } = await userTemPermissaoLojaTicket(opts.atorId, ticket.tenantId)
    if (!podeGerir) throw new Error('Sem permissão para fechar o ticket.')
  }

  await db.saasPedidoTicket.update({
    where: { id: ticketId },
    data: {
      status: 'FECHADO',
      fechadoEm: new Date(),
      fechadoPorId: opts.atorId,
      motivoFecho: opts.motivo,
    },
  })

  const atualizado: TicketLite | null = await db.saasPedidoTicket.findUnique({
    where: { id: ticketId },
    select: TICKET_SELECT,
  })
  if (!atualizado) throw new Error('Ticket não encontrado.')
  return atualizado
}

/** Fecha ticket do pedido ao mudar status para ENTREGUE/CANCELADO (no-op se já fechado). */
export async function fecharTicketPorStatusPedido(
  pedidoId: string,
  statusPedido: string,
  atorId: string,
): Promise<TicketLite | null> {
  const motivo = motivoFechoPorStatusPedido(statusPedido)
  if (!motivo) return null

  const ticket: TicketLite | null = await db.saasPedidoTicket.findUnique({
    where: { pedidoId },
    select: TICKET_SELECT,
  })
  if (!ticket) return null
  if (ticket.status === 'FECHADO') return ticket

  return fecharTicket(ticket.id, { motivo, atorId })
}

export async function getTicketPorConversaId(
  conversaId: string,
): Promise<TicketLite | null> {
  return db.saasPedidoTicket.findUnique({
    where: { conversaId },
    select: TICKET_SELECT,
  })
}

export async function getTicketPorPedidoId(pedidoId: string): Promise<TicketLite | null> {
  return db.saasPedidoTicket.findUnique({
    where: { pedidoId },
    select: TICKET_SELECT,
  })
}

/** Staff pode ler a thread do ticket mesmo sem ser membro (após claim costuma ser membro). */
export async function staffPodeLerTicketConversa(
  conversaId: string,
  userId: string,
): Promise<boolean> {
  const ticket: { tenantId: string } | null = await db.saasPedidoTicket.findUnique({
    where: { conversaId },
    select: { tenantId: true },
  })
  if (!ticket) return false
  const { podeVer } = await userTemPermissaoLojaTicket(userId, ticket.tenantId)
  return podeVer
}

/**
 * Item de inbox sintético para staff abrir `/portal/mensagens?c=<ticket>`
 * sem ser `MembroConversa` (ex.: gestor que não claimou).
 * Super-admin sem vínculo na torcida entra na conversa para poder responder.
 */
export async function montarInboxItemTicketStaff(
  conversaId: string,
  userId: string,
): Promise<InboxItemDto | null> {
  const pode = await staffPodeLerTicketConversa(conversaId, userId)
  if (!pode) return null

  const user: { email: string | null } | null = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (isSuperAdminEmail(user?.email)) {
    await garantirMembroConversaTicket(conversaId, userId)
  }

  const conversa: {
    id: string
    tipo: 'DIRETA' | 'GRUPO' | 'CANAL'
    nome: string | null
    avatarUrl: string | null
    atualizadoEm: Date
    _count: { membros: number }
  } | null = await db.conversa.findUnique({
    where: { id: conversaId },
    select: {
      id: true,
      tipo: true,
      nome: true,
      avatarUrl: true,
      atualizadoEm: true,
      _count: { select: { membros: { where: { saiuEm: null } } } },
    },
  })
  if (!conversa) return null

  return {
    id: conversa.id,
    tipo: conversa.tipo,
    nome: conversa.nome,
    avatarUrl: conversa.avatarUrl,
    atualizadoEm: conversa.atualizadoEm.toISOString(),
    meuPapel: 'MEMBRO',
    meuStatus: 'ATIVO',
    solicitacaoRecebida: false,
    aguardandoAprovacao: false,
    silenciada: false,
    totalMembros: conversa._count.membros,
    ehCanalDepartamento: false,
    departamentoSlug: null,
    departamentoAreaId: null,
    outroMembro: null,
    ultimaMensagem: null,
    naoLidas: 0,
  }
}

export async function assertTicketPermiteEnvio(conversaId: string): Promise<void> {
  const ticket = await getTicketPorConversaId(conversaId)
  if (!ticketPermiteEnvio(ticket?.status)) {
    throw new Error('Este ticket foi fechado. A conversa ficou só para consulta.')
  }
}

const FILA_INCLUDE = {
  pedido: {
    select: {
      id: true,
      status: true,
      total: true,
      modalidadeEntrega: true,
      criadoEm: true,
      user: { select: { id: true, nome: true, email: true } },
      itens: { select: { produtoNome: true, tamanho: true, quantidade: true } },
    },
  },
  atendente: { select: { id: true, nome: true } },
} as const

const STATUS_TICKET_ABERTOS: PedidoTicketStatus[] = ['ABERTO', 'ATENDENDO']

export async function listarFilaTickets(tenantId: string): Promise<TicketFilaItem[]> {
  const rows: TicketFilaItem[] = await db.saasPedidoTicket.findMany({
    where: { tenantId, status: { in: STATUS_TICKET_ABERTOS } },
    orderBy: { abertoEm: 'asc' },
    select: { ...TICKET_SELECT, ...FILA_INCLUDE },
  })
  return rows
}

export async function listarHistoricoTickets(
  tenantId: string,
  opts?: { take?: number },
): Promise<TicketFilaItem[]> {
  const take = opts?.take ?? 50
  const rows: TicketFilaItem[] = await db.saasPedidoTicket.findMany({
    where: { tenantId, status: 'FECHADO' },
    orderBy: { fechadoEm: 'desc' },
    take,
    select: { ...TICKET_SELECT, ...FILA_INCLUDE },
  })
  return rows
}

export type ArquivoTicketsFiltro = 'todos' | 'abertos' | 'fechados'

/**
 * Lista do arquivo de tickets — só metadados (sem mensagens).
 * Mensagens só carregam em `carregarMensagensDoTicket` / página de detalhe.
 */
export async function listarArquivoTickets(
  tenantId: string,
  opts?: {
    filtro?: ArquivoTicketsFiltro
    skip?: number
    take?: number
    busca?: string
  },
): Promise<{ tickets: TicketFilaItem[]; total: number }> {
  const take = opts?.take ?? 25
  const skip = opts?.skip ?? 0
  const filtro = opts?.filtro ?? 'fechados'
  const busca = opts?.busca?.trim()

  const where: Prisma.SaasPedidoTicketWhereInput = {
    tenantId,
    ...(filtro === 'abertos'
      ? { status: { in: STATUS_TICKET_ABERTOS } }
      : filtro === 'todos'
        ? {}
        : { status: 'FECHADO' as const }),
    ...(busca
      ? {
          OR: [
            { pedido: { user: { nome: { contains: busca, mode: 'insensitive' } } } },
            { pedido: { user: { email: { contains: busca, mode: 'insensitive' } } } },
            {
              pedido: {
                itens: { some: { produtoNome: { contains: busca, mode: 'insensitive' } } },
              },
            },
          ],
        }
      : {}),
  }

  const [tickets, total]: [TicketFilaItem[], number] = await Promise.all([
    db.saasPedidoTicket.findMany({
      where,
      orderBy: [{ fechadoEm: 'desc' }, { abertoEm: 'desc' }],
      skip,
      take,
      select: { ...TICKET_SELECT, ...FILA_INCLUDE },
    }),
    db.saasPedidoTicket.count({ where }),
  ])

  return { tickets, total }
}

/** Mensagens da conversa do ticket — carregar só ao abrir o detalhe. */
export async function carregarMensagensDoTicket(
  ticketId: string,
  tenantId: string,
): Promise<{
  ticket: TicketFilaItem
  mensagens: Array<{
    id: string
    conteudo: string
    midiaUrls: string[]
    criadoEm: Date
    removidaEm: Date | null
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }>
} | null> {
  const ticket: TicketFilaItem | null = await db.saasPedidoTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: { ...TICKET_SELECT, ...FILA_INCLUDE },
  })
  if (!ticket) return null

  const mensagens: Array<{
    id: string
    conteudo: string
    midiaUrls: string[]
    criadoEm: Date
    removidaEm: Date | null
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }> = await db.mensagemDireta.findMany({
    where: { conversaId: ticket.conversaId },
    orderBy: { criadoEm: 'asc' },
    take: 500,
    select: {
      id: true,
      conteudo: true,
      midiaUrls: true,
      criadoEm: true,
      removidaEm: true,
      autor: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })

  return { ticket, mensagens }
}

export async function listarTicketsPorPedidos(
  pedidoIds: string[],
): Promise<Map<string, TicketLite>> {
  if (pedidoIds.length === 0) return new Map()
  const rows: TicketLite[] = await db.saasPedidoTicket.findMany({
    where: { pedidoId: { in: pedidoIds } },
    select: TICKET_SELECT,
  })
  return new Map(rows.map((t) => [t.pedidoId, t]))
}

export { STATUS_PEDIDO_TICKET }
