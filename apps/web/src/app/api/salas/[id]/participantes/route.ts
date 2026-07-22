import { NextRequest, NextResponse } from 'next/server'
import { assertSalaMembro } from '@/lib/salas-api'
import { invalidarCacheSalasPresenca } from '@/lib/comunidade-cache'
import {
  contarParticipantesAtivos,
  listParticipantesAtivos,
  registrarEntradaSala,
  registrarSaidaSala,
} from '@/lib/salas-presenca'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { sala } = await assertSalaMembro(salaId)

    const participantes = await listParticipantesAtivos(sala.tenantId, salaId)
    return NextResponse.json({
      participantes,
      total: participantes.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar participantes.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { session, sala, isHost, tenant } = await assertSalaMembro(salaId)

    const papel = isHost ? 'HOST' : 'PARTICIPANTE'
    await registrarEntradaSala(sala.tenantId, salaId, session.user.id, papel)
    invalidarCacheSalasPresenca(sala.tenantId, tenant.afiliacaoId)

    const total = await contarParticipantesAtivos(sala.tenantId, salaId)
    return NextResponse.json({ ok: true, total })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao entrar na sala.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { session, sala, tenant } = await assertSalaMembro(salaId)

    await registrarSaidaSala(sala.tenantId, salaId, session.user.id)
    invalidarCacheSalasPresenca(sala.tenantId, tenant.afiliacaoId)

    const total = await contarParticipantesAtivos(sala.tenantId, salaId)
    return NextResponse.json({ ok: true, total })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao sair da sala.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
