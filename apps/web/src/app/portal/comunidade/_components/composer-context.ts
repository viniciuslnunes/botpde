import { cache } from 'react'
import { db } from '@torcida/db'
import { checarPodePublicarNoFeed } from '@/lib/authz'
import { getPerfilMembroForPortal } from '@/lib/social'
import { getEventosParaComposer, type EventoComposerItem } from '@/lib/eventos'

export type ComposerContext = {
  nome: string | null
  perfilPrivado: boolean
  eventosComposer: EventoComposerItem[]
  bloqueioPublicacao: string | null
  somentePublico: boolean
  userCard: {
    numeroSocio: number | null
    numeroAssociado: string | null
    tipo: 'SOCIO' | 'TORCEDOR' | null
    departamentos: string[]
  }
}

/** Uma leitura por request — card esquerdo + composer compartilham. */
export const getComposerContext = cache(async function getComposerContext(
  tenantId: string,
  userId: string,
  sessionNome: string | null,
): Promise<ComposerContext> {
  const [perfil, eventos, bloqueio, membro, socio, deptos] = await Promise.all([
    getPerfilMembroForPortal(userId, tenantId),
    getEventosParaComposer(tenantId, userId),
    checarPodePublicarNoFeed(userId, tenantId),
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { status: true, tipo: true, numeroAssociado: true, nome: true },
    }),
    db.saasSocio.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { numeroSocio: true },
    }),
    db.userDepartamento.findMany({
      where: { tenantId, userId },
      select: { departamento: { select: { nome: true, ordem: true } } },
      orderBy: { departamento: { ordem: 'asc' } },
    }) as Promise<Array<{ departamento: { nome: string; ordem: number } }>>,
  ])

  return {
    nome: membro?.nome?.trim() || sessionNome,
    perfilPrivado: perfil.perfilPrivado,
    eventosComposer: eventos,
    bloqueioPublicacao: bloqueio,
    somentePublico: bloqueio === null && membro?.status !== 'APROVADO',
    userCard: {
      numeroSocio: socio?.numeroSocio ?? null,
      numeroAssociado: membro?.numeroAssociado ?? null,
      tipo: membro?.tipo ?? null,
      departamentos: deptos.map((d) => d.departamento.nome),
    },
  }
})
