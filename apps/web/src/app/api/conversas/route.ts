import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import {
  canMessageUser,
  criarGrupoConversa,
  getOrCreateDmConversa,
  listConversas,
  MAX_MEMBROS_GRUPO,
  mesmaAfiliacaoComunidade,
  serializeConversasInbox,
} from '@/lib/mensageria'
import {
  assertContextoMensageria,
  assertPodeEnviarMensagens,
  assertPodeEnviarMensagensNacional,
  getStatusInboxMensageria,
} from '@/lib/mensageria-api'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'

const criarDmSchema = z.object({
  tipo: z.literal('DIRETA'),
  destinatarioId: z.string().uuid(),
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
        const { destinatarioId } = parsed.data
        const pode = await mesmaAfiliacaoComunidade(userId, destinatarioId)
        if (!pode) {
          return NextResponse.json(
            { error: 'Você só pode conversar com torcedores do mesmo clube.' },
            { status: 403 },
          )
        }
        const { id, criadaAgora } = await getOrCreateDmConversa(userId, destinatarioId, tenantId)
        return NextResponse.json({ conversaId: id, criadaAgora })
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
      const { destinatarioId } = parsed.data
      const pode = await canMessageUser(userId, destinatarioId, tenant.id)
      if (!pode) {
        return NextResponse.json(
          { error: 'Você só pode conversar com membros da sua torcida ou de torcidas aliadas.' },
          { status: 403 },
        )
      }
      const { id, criadaAgora } = await getOrCreateDmConversa(userId, destinatarioId, tenant.id)
      return NextResponse.json({ conversaId: id, criadaAgora })
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
