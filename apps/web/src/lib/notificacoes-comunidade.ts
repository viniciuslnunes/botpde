import { cache } from 'react'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'

/**
 * Tipos exibidos na central social da Comunidade / sino do portal.
 * NOVA_MENSAGEM fica de fora: mensagens diretas já têm inbox e badge
 * próprios (ícone de chat na navbar) — não duplicam no sino.
 */
export const TIPOS_NOTIFICACAO_SOCIAL: TipoNotificacao[] = [
  'MENCAO',
  'REPOST',
  'NOVO_COMENTARIO',
  'NOVA_REACAO',
  'SEGUIMENTO_PENDENTE',
  'SEGUIMENTO_APROVADO',
  'COMUNICADO_URGENTE',
  'MEMBRO_APROVADO',
  'MEMBRO_REPROVADO',
  'MEMBRO_SOLICITADO',
]

/** Tipos operacionais do admin (alianças, denúncias…). */
export const TIPOS_NOTIFICACAO_ADMIN: TipoNotificacao[] = [
  'ALIANCA_PROPOSTA',
  'ALIANCA_ACEITA',
  'ALIANCA_REJEITADA',
  'ALIANCA_ENCERRADA',
  'ALIANCA_CANCELADA',
  'DENUNCIA_NOVA',
  'COMUNICADO_URGENTE',
  'MEMBRO_APROVADO',
  'MEMBRO_REPROVADO',
]

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
