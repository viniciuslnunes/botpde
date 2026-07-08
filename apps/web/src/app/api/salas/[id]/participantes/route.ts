import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'
import {
  contarParticipantesAtivos,
  listParticipantesAtivos,
  registrarEntradaSala,
  registrarSaidaSala,
} from '@/lib/salas-presenca'

async function assertSalaAtiva(tenantId: string, salaId: string) {
  const sala = await db.salaReuniao.findFirst({
    where: { id: salaId, tenantId, encerradaEm: null },
    select: { id: true, hostId: true },
  })
  if (!sala) throw new Error('Sala indisponível.')
  return sala
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertMembroAtivo(tenant.id, session.user.id)
    await assertSalaAtiva(tenant.id, salaId)

    const participantes = await listParticipantesAtivos(tenant.id, salaId)
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
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertMembroAtivo(tenant.id, session.user.id)
    const sala = await assertSalaAtiva(tenant.id, salaId)

    const papel = sala.hostId === session.user.id ? 'HOST' : 'PARTICIPANTE'
    await registrarEntradaSala(tenant.id, salaId, session.user.id, papel)

    const total = await contarParticipantesAtivos(tenant.id, salaId)
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
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await registrarSaidaSala(tenant.id, salaId, session.user.id)
    const total = await contarParticipantesAtivos(tenant.id, salaId)
    return NextResponse.json({ ok: true, total })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao sair da sala.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
