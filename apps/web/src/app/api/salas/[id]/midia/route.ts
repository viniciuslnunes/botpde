import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'
import { grantParticipantMedia, type MidiaSalaKind } from '@/lib/livekit-room'

const aprovarSchema = z.object({
  userId: z.string().uuid(),
  kind: z.enum(['speak', 'screen']),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertMembroAtivo(tenant.id, session.user.id)

    const sala = await db.salaReuniao.findFirst({
      where: { id: salaId, tenantId: tenant.id, encerradaEm: null },
      select: { id: true, hostId: true, livekitRoomName: true },
    })
    if (!sala) {
      return NextResponse.json({ error: 'Sala indisponível.' }, { status: 404 })
    }
    if (sala.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Somente o anfitrião pode aprovar.' }, { status: 403 })
    }

    const body: unknown = await request.json()
    const parsed = aprovarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }

    await grantParticipantMedia(
      sala.livekitRoomName,
      parsed.data.userId,
      parsed.data.kind as MidiaSalaKind,
    )

    return NextResponse.json({ ok: true, kind: parsed.data.kind, userId: parsed.data.userId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao aprovar mídia.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
