/**
 * Denúncia e intervenção de staff no brechó (padrão do ticket da loja).
 */
import { db, type Prisma } from '@torcida/db'
import { ExpectedError } from '@/lib/expected-error'
import { garantirMembroConversaTicket } from '@/lib/loja-ticket'
import { userTemPermissaoLojaTicket } from '@/lib/loja-ticket'
import { criarMensagem } from '@/lib/mensageria'
import { notificarSafe } from '@/lib/notificacoes'
import { DenunciaBrechoSchema, podeAtenderDenunciaBrecho } from '@torcida/types'
import type { BrechoContexto } from '@/lib/brecho-escopo'
import { notificarStaffBrechoLinhaagem, recalcularScoreLoja } from '@/lib/brecho'
import type { InboxItemDto } from '@/lib/mensageria-client'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export type DenunciaBrechoLite = {
  id: string
  tenantId: string
  motivo: string
  status: 'PENDENTE' | 'RESOLVIDA' | 'DESCARTADA'
  anuncioId: string | null
  lojaId: string | null
  interesseId: string | null
  atendenteId: string | null
  criadoEm: Date
}

export async function denunciarBrecho(
  ctx: BrechoContexto,
  raw: unknown,
): Promise<{ id: string }> {
  const parsed = DenunciaBrechoSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Denúncia inválida.')
  }
  const data = parsed.data

  const anuncio = data.anuncioId
    ? await db.brechoAnuncio.findFirst({
        where: { id: data.anuncioId, tenantId: { in: ctx.raizesFeed } },
        select: { id: true, tenantId: true, lojaId: true, titulo: true, vendedorId: true },
      })
    : null
  if (data.anuncioId && !anuncio) throw new ExpectedError('Anúncio não encontrado.')

  const loja = data.lojaUserId
    ? await db.brechoLoja.findFirst({
        where: { tenantId: { in: ctx.raizesFeed }, userId: data.lojaUserId },
        select: { id: true, tenantId: true, nome: true },
      })
    : anuncio
      ? { id: anuncio.lojaId, tenantId: anuncio.tenantId, nome: null as string | null }
      : null

  const interesse = data.interesseId
    ? await db.brechoInteresse.findFirst({
        where: { id: data.interesseId, tenantId: { in: ctx.raizesFeed } },
        select: { id: true, tenantId: true, anuncioId: true },
      })
    : null
  if (data.interesseId && !interesse) throw new ExpectedError('Conversa não encontrada.')

  if (anuncio && anuncio.vendedorId === ctx.userId) {
    throw new ExpectedError('Você não pode denunciar o próprio anúncio.')
  }

  const tenantId = anuncio?.tenantId ?? loja?.tenantId ?? interesse?.tenantId ?? ctx.raizId

  const criado: { id: string } = await db.denunciaBrecho.create({
    data: {
      tenantId,
      denuncianteId: ctx.userId,
      motivo: data.motivo,
      anuncioId: anuncio?.id ?? interesse?.anuncioId ?? null,
      lojaId: loja?.id ?? anuncio?.lojaId ?? null,
      interesseId: interesse?.id ?? null,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId,
      atorId: ctx.userId,
      acao: 'BRECHO_DENUNCIA_ABERTA',
      entidade: 'DenunciaBrecho',
      entidadeId: criado.id,
      detalhes: { anuncioId: anuncio?.id ?? null, motivo: data.motivo.slice(0, 80) },
    },
  })

  await notificarStaffBrechoLinhaagem({
    raizId: tenantId,
    titulo: 'Denúncia no brechó',
    corpo: anuncio?.titulo ? `Má fé alegada em “${anuncio.titulo}”.` : data.motivo.slice(0, 120),
    link: `/admin/loja/brecho?denuncia=${criado.id}`,
    atorId: ctx.userId,
  })

  return criado
}

export async function listarDenunciasBrecho(
  raizId: string,
  opts: { filtro: 'pendentes' | 'todas'; skip: number; take: number },
): Promise<{
  denuncias: Array<
    DenunciaBrechoLite & {
      denunciante: { nome: string | null; nickname: string | null }
      atendente: { nome: string | null } | null
      anuncio: { id: string; titulo: string } | null
      loja: { id: string; nome: string; userId: string } | null
      interesse: { id: string; conversaId: string } | null
    }
  >
  total: number
}> {
  const where: Prisma.DenunciaBrechoWhereInput = {
    tenantId: raizId,
    ...(opts.filtro === 'pendentes' ? { status: 'PENDENTE' } : {}),
  }
  const [rows, total] = await Promise.all([
    db.denunciaBrecho.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip: opts.skip,
      take: opts.take,
      select: {
        id: true,
        tenantId: true,
        motivo: true,
        status: true,
        anuncioId: true,
        lojaId: true,
        interesseId: true,
        atendenteId: true,
        criadoEm: true,
        denunciante: { select: { nome: true, nickname: true } },
        atendente: { select: { nome: true } },
        anuncio: { select: { id: true, titulo: true } },
        loja: { select: { id: true, nome: true, userId: true } },
        interesse: { select: { id: true, conversaId: true } },
      },
    }),
    db.denunciaBrecho.count({ where }),
  ])
  return { denuncias: rows, total }
}

export async function atenderDenunciaBrecho(
  denunciaId: string,
  staffUserId: string,
  raizId: string,
): Promise<{ conversaId: string | null }> {
  const denuncia = await db.denunciaBrecho.findFirst({
    where: { id: denunciaId, tenantId: raizId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      atendenteId: true,
      interesse: { select: { conversaId: true } },
      anuncio: {
        select: {
          interesses: {
            take: 1,
            orderBy: { criadoEm: 'desc' },
            select: { conversaId: true },
          },
        },
      },
    },
  })
  if (!denuncia) throw new ExpectedError('Denúncia não encontrada.')

  const pode = await userTemStoreNaLinhaagem(staffUserId, raizId)
  if (!pode) throw new ExpectedError('Sem permissão para atender.')

  const check = podeAtenderDenunciaBrecho({
    atendenteId: denuncia.atendenteId,
    status: denuncia.status,
  })
  if (!check.ok) throw new ExpectedError(check.erro)

  const claimed: { count: number } = await db.denunciaBrecho.updateMany({
    where: { id: denunciaId, atendenteId: null, status: 'PENDENTE' },
    data: { atendenteId: staffUserId, atendidoEm: new Date() },
  })
  if (claimed.count !== 1) throw new ExpectedError('Esta denúncia já está em atendimento.')

  const conversaId =
    denuncia.interesse?.conversaId ?? denuncia.anuncio?.interesses[0]?.conversaId ?? null
  if (conversaId) {
    await garantirMembroConversaTicket(conversaId, staffUserId)
    await criarMensagem(
      conversaId,
      staffUserId,
      'A equipe de Materiais/Loja entrou nesta conversa para apurar uma denúncia.',
      [],
    )
  }

  await db.auditLog.create({
    data: {
      tenantId: denuncia.tenantId,
      atorId: staffUserId,
      acao: 'BRECHO_STAFF_ENTROU',
      entidade: 'DenunciaBrecho',
      entidadeId: denunciaId,
      detalhes: { conversaId },
    },
  })

  return { conversaId }
}

export async function resolverDenunciaBrecho(
  denunciaId: string,
  staffUserId: string,
  raizId: string,
  decisao: 'RESOLVIDA' | 'DESCARTADA',
  ocultarAnuncio?: boolean,
): Promise<void> {
  const denuncia = await db.denunciaBrecho.findFirst({
    where: { id: denunciaId, tenantId: raizId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      anuncioId: true,
      lojaId: true,
      anuncio: { select: { vendedorId: true } },
    },
  })
  if (!denuncia) throw new ExpectedError('Denúncia não encontrada.')
  if (denuncia.status !== 'PENDENTE') throw new ExpectedError('Esta denúncia já foi encerrada.')

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.denunciaBrecho.update({
      where: { id: denunciaId },
      data: {
        status: decisao,
        resolvidoPorId: staffUserId,
        resolvidoEm: new Date(),
      },
    })
    if (decisao === 'RESOLVIDA' && ocultarAnuncio && denuncia.anuncioId) {
      await tx.brechoAnuncio.update({
        where: { id: denuncia.anuncioId },
        data: { status: 'OCULTO' },
      })
    }
    if (denuncia.anuncio?.vendedorId) {
      await recalcularScoreLoja(tx, denuncia.tenantId, denuncia.anuncio.vendedorId)
    }
  })

  await db.auditLog.create({
    data: {
      tenantId: denuncia.tenantId,
      atorId: staffUserId,
      acao: decisao === 'RESOLVIDA' ? 'BRECHO_DENUNCIA_RESOLVIDA' : 'BRECHO_DENUNCIA_DESCARTADA',
      entidade: 'DenunciaBrecho',
      entidadeId: denunciaId,
      detalhes: { ocultarAnuncio: Boolean(ocultarAnuncio) },
    },
  })
}

export async function congelarLojaBrecho(
  lojaId: string,
  staffUserId: string,
  raizId: string,
  congelar: boolean,
): Promise<void> {
  const loja: { id: string; tenantId: string; userId: string } | null = await db.brechoLoja.findFirst({
    where: { id: lojaId, tenantId: raizId },
    select: { id: true, tenantId: true, userId: true },
  })
  if (!loja) throw new ExpectedError('Loja não encontrada.')

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.brechoLoja.update({
      where: { id: lojaId },
      data: congelar
        ? { congeladaEm: new Date(), congeladaPorId: staffUserId, ativa: false }
        : { congeladaEm: null, congeladaPorId: null, ativa: true },
    })
    await recalcularScoreLoja(tx, loja.tenantId, loja.userId)
  })

  await db.auditLog.create({
    data: {
      tenantId: loja.tenantId,
      atorId: staffUserId,
      acao: congelar ? 'BRECHO_LOJA_CONGELADA' : 'BRECHO_LOJA_REATIVADA',
      entidade: 'BrechoLoja',
      entidadeId: lojaId,
    },
  })

  await notificarSafe({
    userId: loja.userId,
    tenantId: loja.tenantId,
    tipo: 'BRECHO_DENUNCIA',
    titulo: congelar ? 'Sua loja no brechó foi suspensa' : 'Sua loja no brechó foi reativada',
    corpo: congelar
      ? 'A equipe de Materiais suspendeu sua loja enquanto apura uma denúncia.'
      : 'Você já pode anunciar de novo.',
    link: '/portal/loja/brecho/minha-loja',
    atorId: staffUserId,
  })
}

async function userTemStoreNaLinhaagem(userId: string, raizId: string): Promise<boolean> {
  const { getTorcidaLineageTenantIds } = await import('@/lib/hierarquia')
  const lineage: string[] = await getTorcidaLineageTenantIds(raizId)
  const checks: Array<{ podeVer: boolean }> = await Promise.all(
    lineage.map((id) => userTemPermissaoLojaTicket(userId, id)),
  )
  return checks.some((c) => c.podeVer)
}

export async function staffPodeLerBrechoConversa(
  conversaId: string,
  userId: string,
): Promise<boolean> {
  const interesse: { tenantId: string } | null = await db.brechoInteresse.findUnique({
    where: { conversaId },
    select: { tenantId: true },
  })
  if (!interesse) return false
  return userTemStoreNaLinhaagem(userId, interesse.tenantId)
}

export async function montarInboxItemBrechoStaff(
  conversaId: string,
  userId: string,
): Promise<InboxItemDto | null> {
  const pode = await staffPodeLerBrechoConversa(conversaId, userId)
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

export async function listarLojasAdminBrecho(raizId: string): Promise<
  Array<{
    id: string
    nome: string
    userId: string
    userNome: string | null
    scoreConfianca: number
    trocasConcluidas: number
    congeladaEm: Date | null
    anunciosAtivos: number
  }>
> {
  type LojaAdminRow = {
    id: string
    nome: string
    userId: string
    scoreConfianca: number
    trocasConcluidas: number
    congeladaEm: Date | null
    user: { nome: string | null }
    _count: { anuncios: number }
  }
  const rows: LojaAdminRow[] = await db.brechoLoja.findMany({
    where: { tenantId: raizId },
    orderBy: [{ scoreConfianca: 'desc' }, { trocasConcluidas: 'desc' }],
    take: 100,
    select: {
      id: true,
      nome: true,
      userId: true,
      scoreConfianca: true,
      trocasConcluidas: true,
      congeladaEm: true,
      user: { select: { nome: true } },
      _count: { select: { anuncios: { where: { status: 'ATIVO' } } } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    userId: r.userId,
    userNome: r.user.nome,
    scoreConfianca: r.scoreConfianca,
    trocasConcluidas: r.trocasConcluidas,
    congeladaEm: r.congeladaEm,
    anunciosAtivos: r._count.anuncios,
  }))
}
