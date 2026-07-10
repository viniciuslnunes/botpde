import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { serializeMensagem, MAX_CONTEUDO_MENSAGEM, type MensagemItem } from '@/lib/mensageria'
import { assertConversaAccess } from '@/lib/mensageria-api'

const editarSchema = z.object({
  conteudo: z.string().trim().min(1, 'Mensagem vazia').max(MAX_CONTEUDO_MENSAGEM),
})

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; mensagemId: string }> },
) {
  try {
    const { id: conversaId, mensagemId } = await context.params
    const { userId } = await assertConversaAccess(conversaId)

    const body: unknown = await request.json()
    const parsed = editarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' },
        { status: 400 },
      )
    }

    // Só o próprio autor edita a mensagem (e nunca uma removida)
    const alvo: { id: string } | null = await db.mensagemDireta.findFirst({
      where: { id: mensagemId, conversaId, autorId: userId, removidaEm: null },
      select: { id: true },
    })
    if (!alvo) {
      return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })
    }

    const mensagem: MensagemItem = await db.mensagemDireta.update({
      where: { id: alvo.id },
      data: { conteudo: parsed.data.conteudo, editadaEm: new Date() },
      select: MENSAGEM_SELECT,
    })

    return NextResponse.json({ mensagem: serializeMensagem(mensagem) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao editar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; mensagemId: string }> },
) {
  try {
    const { id: conversaId, mensagemId } = await context.params
    const { userId, tenant, conversa } = await assertConversaAccess(conversaId)

    const alvo: { id: string; autorId: string } | null = await db.mensagemDireta.findFirst({
      where: { id: mensagemId, conversaId, removidaEm: null },
      select: { id: true, autorId: true },
    })
    if (!alvo) {
      return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })
    }

    // Autor sempre pode remover a própria mensagem. Moderador
    // (messages:moderate) pode remover mensagens de conversas do seu tenant.
    let moderacao = false
    if (alvo.autorId !== userId) {
      if (conversa.tenantId !== tenant.id) {
        return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
      }
      const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenant.id)
      const efetivas: string[] = calculateEffectivePermissions(rolePermissions, overrides)
      if (!hasPermission(efetivas, PERMISSIONS.MESSAGES_MODERATE)) {
        return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
      }
      moderacao = true
    }

    await db.mensagemDireta.update({
      where: { id: alvo.id },
      data: { removidaEm: new Date() },
      select: { id: true },
    })

    if (moderacao) {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: userId,
          acao: 'MENSAGEM_REMOVIDA_MODERACAO',
          entidade: 'MensagemDireta',
          entidadeId: alvo.id,
          detalhes: { conversaId, autorOriginalId: alvo.autorId },
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao remover mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
