import 'server-only'
import { db } from '@torcida/db'
import type { TipoSalaReuniao } from '@torcida/db'
import { generateInviteSlug } from '@/lib/invite-slug'

export type SalaAtivaListItem = {
  id: string
  tenantId: string
  hostId: string
  titulo: string
  tipo: TipoSalaReuniao
  linkConvite: string
  criadoEm: Date
  eventoId: string | null
  host: { id: string; nome: string | null; avatarUrl: string | null }
  evento: { id: string; titulo: string; data: Date } | null
  _count: { participantes: number }
}

export type SalaDetalhe = {
  id: string
  tenantId: string
  hostId: string
  titulo: string
  tipo: TipoSalaReuniao
  livekitRoomName: string
  linkConvite: string
  encerradaEm: Date | null
  criadoEm: Date
  eventoId: string | null
  host: { id: string; nome: string | null; avatarUrl: string | null }
  evento: { id: string; titulo: string; data: Date } | null
  mensagens: {
    id: string
    conteudo: string
    criadoEm: Date
    autorId: string
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }[]
  _count: { participantes: number }
}

type CreateSalaInput = {
  tenantId: string
  hostId: string
  titulo: string
  tipo: TipoSalaReuniao
  eventoId?: string
}

export async function listSalasAtivas(tenantId: string): Promise<SalaAtivaListItem[]> {
  const salas: SalaAtivaListItem[] = await (db.salaReuniao.findMany({
    where: { tenantId, encerradaEm: null },
    include: {
      host: { select: { id: true, nome: true, avatarUrl: true } },
      evento: { select: { id: true, titulo: true, data: true } },
      _count: { select: { participantes: true } },
    },
    orderBy: [{ tipo: 'asc' }, { criadoEm: 'desc' }],
  }) as Promise<SalaAtivaListItem[]>)

  return salas
}

export async function getSalaById(tenantId: string, salaId: string): Promise<SalaDetalhe | null> {
  const sala: SalaDetalhe | null = await (db.salaReuniao.findFirst({
    where: { id: salaId, tenantId },
    include: {
      host: { select: { id: true, nome: true, avatarUrl: true } },
      evento: { select: { id: true, titulo: true, data: true } },
      mensagens: {
        include: { autor: { select: { id: true, nome: true, avatarUrl: true } } },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      },
      _count: { select: { participantes: true } },
    },
  }) as Promise<SalaDetalhe | null>)

  return sala
}

export async function createSala(input: CreateSalaInput): Promise<SalaAtivaListItem> {
  let slug: string | null = null
  for (let i = 0; i < 5; i++) {
    const candidate = generateInviteSlug()
    const existing = await db.salaReuniao.findUnique({
      where: { linkConvite: candidate },
      select: { id: true },
    })
    if (!existing) {
      slug = candidate
      break
    }
  }

  if (!slug) throw new Error('Não foi possível gerar link da sala.')

  const sala: SalaAtivaListItem = await (db.salaReuniao.create({
    data: {
      tenantId: input.tenantId,
      hostId: input.hostId,
      titulo: input.titulo,
      tipo: input.tipo,
      eventoId: input.eventoId,
      livekitRoomName: `${input.tenantId}:${slug}`,
      linkConvite: slug,
    },
    include: {
      host: { select: { id: true, nome: true, avatarUrl: true } },
      evento: { select: { id: true, titulo: true, data: true } },
      _count: { select: { participantes: true } },
    },
  }) as Promise<SalaAtivaListItem>)

  return sala
}

export async function encerrarSala(tenantId: string, salaId: string): Promise<boolean> {
  const result = await db.salaReuniao.updateMany({
    where: { id: salaId, tenantId, encerradaEm: null },
    data: { encerradaEm: new Date() },
  })

  return result.count > 0
}
