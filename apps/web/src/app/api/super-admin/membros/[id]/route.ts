import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  executarPurgeMembro,
  membroPurgeSelect,
  motivoImpedeApagar,
  type MembroParaPurge,
} from '@/lib/membros-purge'

/**
 * Hard delete de um cadastro pela operação da plataforma. Fora do RBAC por
 * tenant (gate por allowlist de e-mail), por isso NÃO filtra por `tenantId`:
 * o super-admin age em qualquer torcida.
 *
 * A semântica da remoção é a mesma de `apagarMembroDefinitivo` — as duas portas
 * chamam `executarPurgeMembro`, incluindo a regra de só apagar quem já está
 * reprovado ou desligado. Super-admin não é atalho para pular a regra.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 })
  }
  if (!session.user.id) {
    return NextResponse.json({ error: 'Sessão sem usuário.' }, { status: 401 })
  }

  const { id } = await params
  const membro: MembroParaPurge | null = await db.saasMembro.findUnique({
    where: { id },
    select: membroPurgeSelect,
  })
  if (!membro) {
    return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
  }

  const impedimento = motivoImpedeApagar(membro)
  if (impedimento) {
    return NextResponse.json({ error: impedimento }, { status: 409 })
  }

  await executarPurgeMembro(membro, session.user.id)

  return NextResponse.json({ ok: true })
}
