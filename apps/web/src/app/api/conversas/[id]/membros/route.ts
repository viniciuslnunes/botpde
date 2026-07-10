import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { canMessageUser, listMembrosConversa, MAX_MEMBROS_GRUPO } from '@/lib/mensageria'
import { isConversaGrupoLike } from '@/lib/canais'
import { assertConversaAccess } from '@/lib/mensageria-api'

const adicionarSchema = z.object({
  userId: z.string().uuid(),
})

const removerSchema = z.object({
  // Sem userId = sair da conversa (self)
  userId: z.string().uuid().optional(),
})

const transferirAdminSchema = z.object({
  userId: z.string().uuid(),
})

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    await assertConversaAccess(conversaId)
    const membros = await listMembrosConversa(conversaId)
    return NextResponse.json({ membros })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar membros.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId, tenant, membro, conversa } = await assertConversaAccess(conversaId)

    if (!isConversaGrupoLike(conversa.tipo)) {
      return NextResponse.json({ error: 'DMs não aceitam novos participantes.' }, { status: 400 })
    }
    if (membro.papel !== 'ADMIN') {
      return NextResponse.json({ error: 'Somente admins do grupo podem adicionar.' }, { status: 403 })
    }

    const body: unknown = await request.json()
    const parsed = adicionarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
    const novoId = parsed.data.userId

    const ativos = await listMembrosConversa(conversaId)
    if (ativos.length >= MAX_MEMBROS_GRUPO) {
      return NextResponse.json(
        { error: `O grupo já atingiu o limite de ${MAX_MEMBROS_GRUPO} participantes.` },
        { status: 400 },
      )
    }
    if (ativos.some((m) => m.userId === novoId)) {
      return NextResponse.json({ error: 'Este membro já está no grupo.' }, { status: 400 })
    }

    const pode = await canMessageUser(userId, novoId, tenant.id)
    if (!pode) {
      return NextResponse.json(
        { error: 'O participante precisa ser da sua torcida ou de uma torcida aliada.' },
        { status: 403 },
      )
    }

    // Reativa quem já saiu ou cria participação nova
    await db.membroConversa.upsert({
      where: { conversaId_userId: { conversaId, userId: novoId } },
      create: { conversaId, userId: novoId, papel: 'MEMBRO' },
      update: { saiuEm: null, papel: 'MEMBRO' },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'GRUPO_MEMBRO_ADICIONADO',
        entidade: 'Conversa',
        entidadeId: conversaId,
        detalhes: { membroId: novoId },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao adicionar membro.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** Transfere a administração do grupo para outro membro ativo. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId, tenant, membro, conversa } = await assertConversaAccess(conversaId)

    if (!isConversaGrupoLike(conversa.tipo)) {
      return NextResponse.json({ error: 'Somente grupos e canais aceitam transferência de admin.' }, { status: 400 })
    }
    if (membro.papel !== 'ADMIN') {
      return NextResponse.json({ error: 'Somente o admin atual pode transferir.' }, { status: 403 })
    }

    const body: unknown = await request.json()
    const parsed = transferirAdminSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
    const novoAdminId = parsed.data.userId
    if (novoAdminId === userId) {
      return NextResponse.json({ error: 'Escolha outro membro para receber a administração.' }, { status: 400 })
    }

    const alvo: { userId: string } | null = await db.membroConversa.findFirst({
      where: { conversaId, userId: novoAdminId, saiuEm: null },
      select: { userId: true },
    })
    if (!alvo) {
      return NextResponse.json({ error: 'Membro não encontrado no grupo.' }, { status: 404 })
    }

    await db.$transaction([
      db.membroConversa.updateMany({
        where: { conversaId, userId: novoAdminId, saiuEm: null },
        data: { papel: 'ADMIN' },
      }),
      db.membroConversa.updateMany({
        where: { conversaId, userId, saiuEm: null },
        data: { papel: 'MEMBRO' },
      }),
    ])

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'GRUPO_ADMIN_TRANSFERIDO',
        entidade: 'Conversa',
        entidadeId: conversaId,
        detalhes: { novoAdminId },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao transferir admin.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId, tenant, membro, conversa } = await assertConversaAccess(conversaId)

    const body: unknown = await request.json().catch(() => ({}))
    const parsed = removerSchema.safeParse(body)
    const alvoId = parsed.success && parsed.data.userId ? parsed.data.userId : userId

    if (!isConversaGrupoLike(conversa.tipo)) {
      return NextResponse.json({ error: 'Não é possível sair de uma DM.' }, { status: 400 })
    }

    // Remover OUTRO exige ser admin; sair (self) é livre
    if (alvoId !== userId && membro.papel !== 'ADMIN') {
      return NextResponse.json({ error: 'Somente admins do grupo podem remover.' }, { status: 403 })
    }

    // Último admin não abandona o grupo sem passar o bastão
    if (alvoId === userId && membro.papel === 'ADMIN') {
      const admins: { userId: string }[] = await db.membroConversa.findMany({
        where: { conversaId, papel: 'ADMIN', saiuEm: null },
        select: { userId: true },
      })
      if (admins.length === 1) {
        const outros = await db.membroConversa.count({
          where: { conversaId, saiuEm: null, userId: { not: userId } },
        })
        if (outros > 0) {
          return NextResponse.json(
            { error: 'Promova outro admin antes de sair do grupo.' },
            { status: 400 },
          )
        }
      }
    }

    await db.membroConversa.updateMany({
      where: { conversaId, userId: alvoId, saiuEm: null },
      data: { saiuEm: new Date() },
    })

    if (alvoId !== userId) {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: userId,
          acao: 'GRUPO_MEMBRO_REMOVIDO',
          entidade: 'Conversa',
          entidadeId: conversaId,
          detalhes: { membroId: alvoId },
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao remover membro.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
