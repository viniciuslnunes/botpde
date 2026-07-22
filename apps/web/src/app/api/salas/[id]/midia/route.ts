import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { assertSalaAnfitriao } from '@/lib/salas-api'
import {
  grantParticipantMedia,
  revokeParticipantMedia,
  type MidiaSalaKind,
} from '@/lib/livekit-room'
import { excedeuLimiteMidiaSala, registrarAcaoMidiaSala } from '@/lib/sala-midia-rate-limit'

const midiaSchema = z.object({
  userId: z.string().uuid(),
  kind: z.enum(['speak', 'screen']),
  approved: z.boolean().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { session, sala } = await assertSalaAnfitriao(salaId)

    if (excedeuLimiteMidiaSala(session.user.id)) {
      return NextResponse.json({ error: 'Muitas ações em pouco tempo. Aguarde um momento.' }, { status: 429 })
    }

    const body: unknown = await request.json()
    const parsed = midiaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }

    const approved = parsed.data.approved ?? true
    const kind = parsed.data.kind as MidiaSalaKind

    if (approved) {
      await grantParticipantMedia(sala.livekitRoomName, parsed.data.userId, kind)
    }

    registrarAcaoMidiaSala(session.user.id)

    await db.auditLog.create({
      data: {
        tenantId: sala.tenantId,
        atorId: session.user.id,
        acao: approved ? 'SALA_MIDIA_APROVADA' : 'SALA_MIDIA_NEGADA',
        entidade: 'SalaReuniao',
        entidadeId: sala.id,
        detalhes: { userId: parsed.data.userId, kind, approved },
      },
    })

    return NextResponse.json({ ok: true, kind, userId: parsed.data.userId, approved })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao moderar mídia.'
    const status = message.includes('anfitrião') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { session, sala } = await assertSalaAnfitriao(salaId)

    if (excedeuLimiteMidiaSala(session.user.id)) {
      return NextResponse.json({ error: 'Muitas ações em pouco tempo. Aguarde um momento.' }, { status: 429 })
    }

    const body: unknown = await request.json()
    const parsed = midiaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }

    const kind = parsed.data.kind as MidiaSalaKind
    await revokeParticipantMedia(sala.livekitRoomName, parsed.data.userId, kind)

    registrarAcaoMidiaSala(session.user.id)

    await db.auditLog.create({
      data: {
        tenantId: sala.tenantId,
        atorId: session.user.id,
        acao: 'SALA_MIDIA_REVOGADA',
        entidade: 'SalaReuniao',
        entidadeId: sala.id,
        detalhes: { userId: parsed.data.userId, kind },
      },
    })

    return NextResponse.json({ ok: true, kind, userId: parsed.data.userId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao revogar mídia.'
    const status = message.includes('anfitrião') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
