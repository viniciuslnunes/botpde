import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import {
  canMessageUser,
  criarGrupoConversa,
  getOrCreateDmConversa,
  listConversas,
  MAX_MEMBROS_GRUPO,
  serializeConversasInbox,
} from '@/lib/mensageria'
import { assertPodeEnviarMensagens, assertUsuarioMensageria } from '@/lib/mensageria-api'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'

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

export async function GET() {
  try {
    const { userId } = await assertUsuarioMensageria()
    const conversas = await listConversas(userId)
    return NextResponse.json({ conversas: serializeConversasInbox(conversas) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar conversas.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, tenant, efetivas } = await assertPodeEnviarMensagens()

    const body: unknown = await request.json()
    const parsed = criarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }

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

    // GRUPO
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
