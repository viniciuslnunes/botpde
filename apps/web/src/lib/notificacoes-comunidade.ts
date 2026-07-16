import { cache } from 'react'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import {
  TIPOS_NOTIFICACAO_ADMIN,
  TIPOS_NOTIFICACAO_SOCIAL,
} from '@/lib/notificacoes-routing'

export { TIPOS_NOTIFICACAO_ADMIN, TIPOS_NOTIFICACAO_SOCIAL }

export type FiltroNotificacaoSocial = 'todas' | 'mencoes' | 'reposts' | 'reacoes' | 'seguimento'

export interface NotificacaoSocialItem {
  id: string
  tipo: TipoNotificacao
  titulo: string
  corpo: string | null
  link: string | null
  lida: boolean
  criadoEm: Date
  ator: { id: string; nome: string | null; avatarUrl: string | null } | null
}

const FILTRO_POR_TIPO: Record<Exclude<FiltroNotificacaoSocial, 'todas'>, TipoNotificacao[]> = {
  mencoes: ['MENCAO'],
  reposts: ['REPOST'],
  reacoes: ['NOVO_COMENTARIO', 'NOVA_REACAO'],
  seguimento: ['SEGUIMENTO_PENDENTE', 'SEGUIMENTO_APROVADO'],
}

function tiposDoFiltro(filtro: FiltroNotificacaoSocial): TipoNotificacao[] {
  if (filtro === 'todas') return TIPOS_NOTIFICACAO_SOCIAL
  return FILTRO_POR_TIPO[filtro]
}

/** Tipos do sino do portal: sociais + operacionais se o usuário tem acesso admin. */
export function tiposInboxPortal(incluirAdmin: boolean): TipoNotificacao[] {
  if (!incluirAdmin) return [...TIPOS_NOTIFICACAO_SOCIAL]
  return [...new Set<TipoNotificacao>([...TIPOS_NOTIFICACAO_SOCIAL, ...TIPOS_NOTIFICACAO_ADMIN])]
}

export const contarNotificacoesSociaisNaoLidas = cache(
  async function contarNotificacoesSociaisNaoLidas(
    tenantId: string,
    userId: string,
  ): Promise<number> {
    return db.notificacao.count({
      where: {
        tenantId,
        userId,
        lida: false,
        tipo: { in: TIPOS_NOTIFICACAO_SOCIAL },
      },
    })
  },
)

export const contarNotificacoesAdminNaoLidas = cache(
  async function contarNotificacoesAdminNaoLidas(
    tenantId: string,
    userId: string,
  ): Promise<number> {
    return db.notificacao.count({
      where: {
        tenantId,
        userId,
        lida: false,
        tipo: { in: TIPOS_NOTIFICACAO_ADMIN },
      },
    })
  },
)

export async function contarNotificacoesPortalNaoLidas(
  tenantId: string,
  userId: string,
  incluirAdmin: boolean,
): Promise<number> {
  const tipos = tiposInboxPortal(incluirAdmin)
  return db.notificacao.count({
    where: { tenantId, userId, lida: false, tipo: { in: tipos } },
  })
}

export const contarSolicitacoesSeguimentoPendentes = cache(
  async function contarSolicitacoesSeguimentoPendentes(
    userId: string,
    tenantId: string,
  ): Promise<number> {
    return db.seguimento.count({
      where: {
        seguidoId: userId,
        tenantContextoId: tenantId,
        status: 'PENDENTE',
      },
    })
  },
)

export async function listarNotificacoesSociais(
  tenantId: string,
  userId: string,
  filtro: FiltroNotificacaoSocial = 'todas',
  limite = 40,
): Promise<NotificacaoSocialItem[]> {
  const rows: NotificacaoSocialItem[] = await db.notificacao.findMany({
    where: {
      tenantId,
      userId,
      tipo: { in: tiposDoFiltro(filtro) },
    },
    orderBy: { criadoEm: 'desc' },
    take: limite,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      corpo: true,
      link: true,
      lida: true,
      criadoEm: true,
      ator: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })
  return rows
}

export async function getResumoBadgesComunidade(
  tenantId: string,
  userId: string,
): Promise<{ notificacoesNaoLidas: number; solicitacoesPendentes: number }> {
  const [notificacoesNaoLidas, solicitacoesPendentes] = await Promise.all([
    contarNotificacoesSociaisNaoLidas(tenantId, userId),
    contarSolicitacoesSeguimentoPendentes(userId, tenantId),
  ])
  return { notificacoesNaoLidas, solicitacoesPendentes }
}
