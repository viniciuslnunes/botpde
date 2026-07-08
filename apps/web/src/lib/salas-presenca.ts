import 'server-only'
import { db } from '@torcida/db'
import type { PapelParticipanteReuniao } from '@torcida/db'

export type ParticipanteSalaAtivo = {
  userId: string
  nome: string | null
  avatarUrl: string | null
  papel: PapelParticipanteReuniao
  entrouEm: Date
}

export async function registrarEntradaSala(
  tenantId: string,
  salaId: string,
  userId: string,
  papel: PapelParticipanteReuniao,
): Promise<void> {
  const sala = await db.salaReuniao.findFirst({
    where: { id: salaId, tenantId, encerradaEm: null },
    select: { id: true },
  })
  if (!sala) throw new Error('Sala indisponível.')

  await db.participanteReuniao.upsert({
    where: { salaId_userId: { salaId, userId } },
    create: { salaId, userId, papel },
    update: { saiuEm: null, entrouEm: new Date(), papel },
  })
}

export async function registrarSaidaSala(
  tenantId: string,
  salaId: string,
  userId: string,
): Promise<void> {
  await db.participanteReuniao.updateMany({
    where: {
      salaId,
      userId,
      saiuEm: null,
      sala: { tenantId },
    },
    data: { saiuEm: new Date() },
  })
}

export async function listParticipantesAtivos(
  tenantId: string,
  salaId: string,
): Promise<ParticipanteSalaAtivo[]> {
  const rows = await db.participanteReuniao.findMany({
    where: { salaId, saiuEm: null, sala: { tenantId, encerradaEm: null } },
    include: {
      user: { select: { id: true, nome: true, avatarUrl: true } },
    },
    orderBy: [{ papel: 'asc' }, { entrouEm: 'asc' }],
  })

  return rows.map((row: (typeof rows)[number]) => ({
    userId: row.user.id,
    nome: row.user.nome,
    avatarUrl: row.user.avatarUrl,
    papel: row.papel,
    entrouEm: row.entrouEm,
  }))
}

export async function contarParticipantesAtivos(tenantId: string, salaId: string): Promise<number> {
  return db.participanteReuniao.count({
    where: { salaId, saiuEm: null, sala: { tenantId, encerradaEm: null } },
  })
}
