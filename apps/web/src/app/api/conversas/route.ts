import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import {
  avaliarAcessoDm,
  canMessageUser,
  criarDmComSolicitacao,
  criarGrupoConversa,
  getOrCreateDmConversa,
  listConversas,
  MAX_CONTEUDO_MENSAGEM,
  MAX_MEMBROS_GRUPO,
  mesmaAfiliacaoComunidade,
  resolveTenantNotificacaoMensageria,
  serializeConversasInbox,
} from '@/lib/mensageria'
import {
  assertContextoMensageria,
  assertPodeEnviarMensagens,
  assertPodeEnviarMensagensNacional,
  getStatusInboxMensageria,
} from '@/lib/mensageria-api'
import { emitMensagemNova } from '@/lib/mensageria-bus'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { criarNotificacao } from '@/lib/notificacoes'
import { isCloudinaryUrl, isSocialUrl, isStickerPath } from '@/lib/social-embed'

const midiaSchema = z
  .string()
  .max(500)
  .refine(
    (url) => isCloudinaryUrl(url) || isSocialUrl(url) || isStickerPath(url),
    'Tipo de anexo não permitido',
  )

const criarDmSchema = z.object({
  tipo: z.literal('DIRETA'),
  destinatarioId: z.string().uuid(),
  conteudo: z.string().trim().max(MAX_CONTEUDO_MENSAGEM).optional(),
  midias: z.array(midiaSchema).max(10).optional(),
})

const criarGrupoSchema = z.object({
  tipo: z.literal('GRUPO'),
  nome: z.string().trim().min(3, 'Nome deve ter ao menos 3 caracteres').max(60),
  membroIds: z
    .array(z.string().uuid())
    .min(1, 'Adicione ao menos um membro')
    .max(MAX_MEMBROS_GRUPO - 1, `Máximo de ${MAX_MEMBROS_GRUPO} participantes`),
})

const criarSchema = z.discriminatedUnion('tipo', [criarDmSchema, criarGrupoSchema])

async function notificarSolicitacaoMensagem(opts: {
  destinatarioId: string
  remetenteId: string
  remetenteNome: string | null | undefined
  tenantIdFallback: string
  conversaId: string
}): Promise<void> {
  const tenantNotif =
    (await resolveTenantNotificacaoMensageria(opts.destinatarioId)) ?? opts.tenantIdFallback
  await criarNotificacao({
    userId: opts.destinatarioId,
    tenantId: tenantNotif,
    tipo: 'MENSAGEM_SOLICITACAO_PENDENTE',
    titulo: 'Nova solicitação de mensagem',
    corpo: `${opts.remetenteNome ?? 'Um torcedor'} quer conversar com você.`,
    link: `/portal/mensagens?c=${opts.conversaId}`,
    atorId: opts.remetenteId,
  })
}

async function criarDmOuSolicitacao(opts: {
  remetenteId: string
  destinatarioId: string
  tenantId: string
  tenantContextoId?: string | null
  conteudo?: string
  midias?: string[]
  remetenteNome?: string | null
}): Promise<NextResponse> {
  const acesso = await avaliarAcessoDm(
    opts.remetenteId,
    opts.destinatarioId,
    opts.tenantContextoId,
  )

  if (acesso === 'bloqueado') {
    return NextResponse.json(
      { error: 'Você não pode conversar com este usuário.' },
      { status: 403 },
    )
  }

  if (acesso === 'direto') {
    const { id, criadaAgora } = await getOrCreateDmConversa(
      opts.remetenteId,
      opts.destinatarioId,
      opts.tenantId,
    )
    return NextResponse.json({ conversaId: id, criadaAgora, solicitacao: false })
  }

  const texto = opts.conteudo?.trim() ?? ''
  if (!texto && (opts.midias?.length ?? 0) === 0) {
    return NextResponse.json(
      {
        error: 'Envie uma mensagem para solicitar a conversa.',
        precisaMensagem: true,
        requerSolicitacao: true,
      },
      { status: 400 },
    )
  }

  const limiterKey = `dm-solic:${opts.tenantId}:${opts.remetenteId}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    return NextResponse.json(
      { error: 'Você está enviando solicitações rápido demais. Aguarde um pouco.' },
      { status: 429 },
    )
  }

  const { id, criadaAgora } = await criarDmComSolicitacao(
    opts.remetenteId,
    opts.destinatarioId,
    opts.tenantId,
    texto,
    opts.midias ?? [],
    opts.tenantContextoId,
  )

  emitMensagemNova(id, [opts.remetenteId, opts.destinatarioId])

  if (criadaAgora) {
    registrarAcaoEngajamento(limiterKey)
    await notificarSolicitacaoMensagem({
      destinatarioId: opts.destinatarioId,
      remetenteId: opts.remetenteId,
      remetenteNome: opts.remetenteNome,
      tenantIdFallback: opts.tenantId,
      conversaId: id,
    })
  }

  return NextResponse.json({ conversaId: id, criadaAgora, solicitacao: true })
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const tenant = await getTenantFromHost()
    if (tenant) {
      const status = await getStatusInboxMensageria(session.user.id, tenant.id)
      if (status.podeListar) {
        const conversas = await listConversas(session.user.id)
        return NextResponse.json({ conversas: serializeConversasInbox(conversas) })
      }
    }

    const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
    if (ctx?.tenantSintetico || ctx?.modo === 'nacional') {
      const conversas = await listConversas(session.user.id)
      return NextResponse.json({ conversas: serializeConversasInbox(conversas) })
    }

    if (!tenant) {
      return NextResponse.json({
        conversas: [],
        semVinculo: true,
      })
    }

    const statusBloqueado = await getStatusInboxMensageria(session.user.id, tenant.id)
    if (statusBloqueado.podeListar) {
      const conversas = await listConversas(session.user.id)
      return NextResponse.json({ conversas: serializeConversasInbox(conversas) })
    }

    return NextResponse.json({
      conversas: [],
      cadastroPendente: statusBloqueado.motivo === 'cadastro_pendente',
      semVinculo: statusBloqueado.motivo === 'sem_vinculo',
      cadastroReprovado: statusBloqueado.motivo === 'cadastro_reprovado',
    })
  } catch (error) {
    console.error('[api/conversas GET]', error)
    const message = error instanceof Error ? error.message : 'Erro ao carregar conversas.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = criarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }

    const contexto = await assertContextoMensageria()

    if (contexto.via === 'nacional') {
      const { userId, tenantSintetico } = await assertPodeEnviarMensagensNacional()
      const tenantId = tenantSintetico.id

      if (parsed.data.tipo === 'DIRETA') {
        const { destinatarioId, conteudo, midias } = parsed.data
        return criarDmOuSolicitacao({
          remetenteId: userId,
          destinatarioId,
          tenantId,
          tenantContextoId: null,
          conteudo,
          midias,
          remetenteNome: contexto.session.user.name,
        })
      }

      const limiterKey = `grupo-cn:${tenantId}:${userId}`
      if (excedeuLimiteEngajamento(limiterKey)) {
        return NextResponse.json(
          { error: 'Você está criando grupos rápido demais. Aguarde um pouco.' },
          { status: 429 },
        )
      }

      const membroIds = [...new Set(parsed.data.membroIds)].filter((id) => id !== userId)
      for (const membroId of membroIds) {
        const pode = await mesmaAfiliacaoComunidade(userId, membroId)
        if (!pode) {
          return NextResponse.json(
            { error: 'Todos os participantes precisam ser torcedores do mesmo clube.' },
            { status: 403 },
          )
        }
      }

      registrarAcaoEngajamento(limiterKey)
      const grupo = await criarGrupoConversa(userId, tenantId, parsed.data.nome, membroIds)

      await db.auditLog.create({
        data: {
          tenantId,
          atorId: userId,
          acao: 'GRUPO_CONVERSA_CRIADO',
          entidade: 'Conversa',
          entidadeId: grupo.id,
          detalhes: {
            nome: parsed.data.nome,
            totalMembros: membroIds.length + 1,
            escopo: 'nacional',
          },
        },
      })

      return NextResponse.json({ conversaId: grupo.id, criadaAgora: true })
    }

    const { userId, tenant, efetivas } = await assertPodeEnviarMensagens()

    if (parsed.data.tipo === 'DIRETA') {
      const { destinatarioId, conteudo, midias } = parsed.data
      return criarDmOuSolicitacao({
        remetenteId: userId,
        destinatarioId,
        tenantId: tenant.id,
        tenantContextoId: tenant.id,
        conteudo,
        midias,
        remetenteNome: contexto.session.user.name,
      })
    }

    if (!hasPermission(efetivas, PERMISSIONS.GROUPS_CREATE)) {
      return NextResponse.json(
        { error: 'Você não tem permissão para criar grupos.' },
        { status: 403 },
      )
    }

    const limiterKey = `grupo:${tenant.id}:${userId}`
    if (excedeuLimiteEngajamento(limiterKey)) {
      return NextResponse.json(
        { error: 'Você está criando grupos rápido demais. Aguarde um pouco.' },
        { status: 429 },
      )
    }

    const membroIds = [...new Set(parsed.data.membroIds)].filter((id) => id !== userId)
    for (const membroId of membroIds) {
      const pode = await canMessageUser(userId, membroId, tenant.id)
      if (!pode) {
        return NextResponse.json(
          { error: 'Todos os participantes precisam ser da sua torcida ou de torcidas aliadas.' },
          { status: 403 },
        )
      }
    }

    registrarAcaoEngajamento(limiterKey)
    const grupo = await criarGrupoConversa(userId, tenant.id, parsed.data.nome, membroIds)

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'GRUPO_CONVERSA_CRIADO',
        entidade: 'Conversa',
        entidadeId: grupo.id,
        detalhes: { nome: parsed.data.nome, totalMembros: membroIds.length + 1 },
      },
    })

    return NextResponse.json({ conversaId: grupo.id, criadaAgora: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar conversa.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
