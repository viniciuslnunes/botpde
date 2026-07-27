import type { TipoNotificacao } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import {
  criarNotificacoesEmLote,
  listarDestinatariosAdminPorPermissoes,
  listarUserIdsMembrosAprovados,
  notificarMembrosAprovados,
  notificarSafe,
  notificarUsuariosComPermissao,
  type CriarNotificacaoInput,
} from '@/lib/notificacoes'

/** Escopo de exibição da notificação na inbox. */
export type EscopoNotificacao = 'social' | 'admin' | 'hibrido'

type PoliticaRoteamento = {
  escopo: EscopoNotificacao
  /** Permissão necessária para receber quando escopo inclui admin. */
  permissaoAdmin?: string
  /** Permissões alternativas (OR) para destinatários administrativos. */
  permissoesAdminOr?: string[]
  /** Id do item em ADMIN_MENU para badge no sidebar (só tipos operacionais). */
  menuId?: string
}

/**
 * Catálogo declarativo: cada tipo de notificação e sua política de roteamento.
 * Fonte única para fan-out, filtros de inbox e elegibilidade no portal.
 */
export const POLITICA_POR_TIPO: Record<TipoNotificacao, PoliticaRoteamento> = {
  MENCAO: { escopo: 'social' },
  REPOST: { escopo: 'social' },
  NOVO_COMENTARIO: { escopo: 'social' },
  NOVA_REACAO: { escopo: 'social' },
  SEGUIMENTO_PENDENTE: { escopo: 'social' },
  SEGUIMENTO_APROVADO: { escopo: 'social' },
  SEGUIMENTO_REJEITADO: { escopo: 'social' },
  NOVA_MENSAGEM: { escopo: 'social' },
  MENSAGEM_SOLICITACAO_PENDENTE: { escopo: 'social' },
  MENSAGEM_SOLICITACAO_APROVADA: { escopo: 'social' },
  MENSAGEM_SOLICITACAO_REJEITADA: { escopo: 'social' },
  GRUPO_PEDIDO: { escopo: 'social' },
  GRUPO_APROVADO: { escopo: 'social' },
  GRUPO_REJEITADO: { escopo: 'social' },
  GRUPO_ADMIN: { escopo: 'social' },
  GRUPO_REMOVIDO: { escopo: 'social' },
  CANAL_PEDIDO: { escopo: 'social' },
  CANAL_APROVADO: { escopo: 'social' },
  CANAL_REJEITADO: { escopo: 'social' },
  COMUNICADO_URGENTE: { escopo: 'hibrido' },
  MEMBRO_APROVADO: { escopo: 'hibrido' },
  MEMBRO_REPROVADO: { escopo: 'hibrido' },
  MEMBRO_SOLICITADO: {
    escopo: 'hibrido',
    permissoesAdminOr: [PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW],
    menuId: 'membros',
  },
  COBRANCA_PENDENTE: { escopo: 'hibrido' },
  COBRANCA_VENCIDA: {
    escopo: 'hibrido',
    permissaoAdmin: PERMISSIONS.FINANCE_MANAGE,
    menuId: 'cobrancas',
  },
  EVENTO_LEMBRETE: { escopo: 'hibrido' },
  EVENTO_RSVP: {
    escopo: 'hibrido',
    permissaoAdmin: PERMISSIONS.EVENTS_MANAGE,
    menuId: 'eventos',
  },
  EVENTO_DIA_GESTOR: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.EVENTS_MANAGE,
    menuId: 'eventos',
  },
  DENUNCIA_NOVA: {
    escopo: 'admin',
    permissoesAdminOr: [PERMISSIONS.COMMUNITY_MODERATE, PERMISSIONS.MESSAGES_MODERATE],
    menuId: 'comunidade-moderacao',
  },
  DENUNCIA_RESOLVIDA: { escopo: 'social' },
  ALIANCA_PROPOSTA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    menuId: 'aliancas',
  },
  ALIANCA_ACEITA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    menuId: 'aliancas',
  },
  ALIANCA_REJEITADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    menuId: 'aliancas',
  },
  ALIANCA_ENCERRADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    menuId: 'aliancas',
  },
  ALIANCA_CANCELADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    menuId: 'aliancas',
  },
  PEDIDO_CONFIRMADO: { escopo: 'social' },
  PEDIDO_CANCELADO: { escopo: 'social' },
  PEDIDO_ENTREGUE: { escopo: 'social' },
  SOCIO_CARTEIRINHA_EMITIDA: { escopo: 'social' },
  SOCIO_CARTEIRINHA_RENOVADA: { escopo: 'social' },
  SOCIO_CARTEIRINHA_REVOGADA: { escopo: 'social' },
  ACESSO_ATUALIZADO: { escopo: 'social' },
  DEPARTAMENTO_ADICIONADO: { escopo: 'social' },
  DEPARTAMENTO_REMOVIDO: { escopo: 'social' },
  SEDE_RESPONSAVEL_DEFINIDO: { escopo: 'social' },
  BAR_VENDA_ESTORNADA: { escopo: 'social' },
  BAR_ESTOQUE_BAIXO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    menuId: 'bar-estoque',
  },
  BAR_FIADO_VENCIDO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    menuId: 'bar-fiado',
  },
  BAR_TURNO_DIVERGENCIA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    menuId: 'bar-pdv',
  },
  BAR_ESTORNO_ANOMALO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    menuId: 'bar-estornos',
  },
  PATRIMONIO_RESPONSAVEL_DEFINIDO: { escopo: 'social' },
  PEDIDO_RECEBIDO: {
    escopo: 'admin',
    permissoesAdminOr: [PERMISSIONS.STORE_VIEW_ORDERS, PERMISSIONS.STORE_MANAGE],
    menuId: 'loja-pedidos',
  },
  SOLICITACAO_UNIDADE_CRIADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.AFFILIATION_MANAGE,
    menuId: 'afiliacoes',
  },
}

export { agregarBadgesPorMenu, menuIdParaTipo } from '@/lib/notificacoes-menu-badges'

/** Tipos puramente sociais — sino do portal para qualquer membro ativo. */
export const TIPOS_NOTIFICACAO_SOCIAL: TipoNotificacao[] = (
  Object.entries(POLITICA_POR_TIPO) as Array<[TipoNotificacao, PoliticaRoteamento]>
)
  .filter(([, p]) => p.escopo === 'social' || p.escopo === 'hibrido')
  .map(([tipo]) => tipo)

/** Tipos operacionais — sino do admin e do portal para quem tem permissão. */
export const TIPOS_NOTIFICACAO_ADMIN: TipoNotificacao[] = (
  Object.entries(POLITICA_POR_TIPO) as Array<[TipoNotificacao, PoliticaRoteamento]>
)
  .filter(([, p]) => p.escopo === 'admin' || p.escopo === 'hibrido')
  .map(([tipo]) => tipo)

type DestinoNotificacao = {
  tenantId: string
  tipo: TipoNotificacao
  titulo: string
  corpo?: string
  link?: string
  atorId?: string
  excetoUserId?: string
}

/** Resolve destinatários admin por uma ou várias permissões (OR). */
export async function listarDestinatariosPorPermissoes(
  tenantId: string,
  permissions: string[],
  excetoUserId?: string,
): Promise<string[]> {
  return listarDestinatariosAdminPorPermissoes(tenantId, permissions, excetoUserId)
}

/** Fan-out administrativo por permissão única ou OR de permissões. */
export async function notificarAdminsPorPermissao(
  permissions: string | string[],
  destino: DestinoNotificacao,
): Promise<number> {
  const perms = Array.isArray(permissions) ? permissions : [permissions]
  try {
    const targets = await listarDestinatariosPorPermissoes(
      destino.tenantId,
      perms,
      destino.excetoUserId,
    )
    return criarNotificacoesEmLote(
      targets.map((userId) => ({
        userId,
        tenantId: destino.tenantId,
        tipo: destino.tipo,
        titulo: destino.titulo,
        corpo: destino.corpo,
        link: destino.link,
        atorId: destino.atorId,
      })),
    )
  } catch {
    return 0
  }
}

/** Notifica um usuário específico (best-effort). */
export async function notificarUsuario(input: CriarNotificacaoInput): Promise<void> {
  await notificarSafe(input)
}

/**
 * Novo sócio pendente: avisa a diretoria (members:approve ou members:view)
 * e mantém confirmação ao solicitante.
 */
export async function notificarNovoMembroPendente(params: {
  tenantId: string
  tenantNome: string
  solicitanteUserId: string
  solicitanteNome: string
  tipoVinculo: 'SOCIO' | 'TORCEDOR'
}): Promise<void> {
  const { tenantId, tenantNome, solicitanteUserId, solicitanteNome, tipoVinculo } = params
  const label = tipoVinculo === 'SOCIO' ? 'sócio' : 'torcedor'

  await Promise.all([
    notificarAdminsPorPermissao([PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW], {
      tenantId,
      tipo: 'MEMBRO_SOLICITADO',
      titulo: `Nova solicitação de ${label}`,
      corpo: `${solicitanteNome} solicitou ingresso como ${label} em ${tenantNome}.`,
      link: '/admin/membros?status=PENDENTE',
      atorId: solicitanteUserId,
      excetoUserId: solicitanteUserId,
    }),
    notificarSafe({
      userId: solicitanteUserId,
      tenantId,
      tipo: 'MEMBRO_SOLICITADO',
      titulo: 'Solicitação enviada',
      corpo: `Sua solicitação para ${tenantNome} está em análise pela diretoria.`,
      link: '/portal/comunidade',
    }),
  ])
}

/**
 * Fan-out de denúncia: notifica todos os elegíveis (moderadores + super-admins),
 * inclusive o denunciante se ele também for elegível.
 *
 * Membros comuns não entram na lista (sem permissão de moderação) — o `exceto`
 * antigo só silenciava operador/mod que testava a própria denúncia quando havia
 * outro destinatário, deixando sino e badge da Moderação mudos.
 */
async function notificarDenunciaAdmins(
  permissions: string | string[],
  params: {
    tenantId: string
    motivo: string
    denuncianteUserId: string
    titulo: string
  },
): Promise<number> {
  return notificarAdminsPorPermissao(permissions, {
    tenantId: params.tenantId,
    tipo: 'DENUNCIA_NOVA',
    titulo: params.titulo,
    corpo: params.motivo.slice(0, 140),
    link: '/admin/comunidade/moderacao',
    atorId: params.denuncianteUserId,
  })
}

/** Denúncia de post — moderadores de comunidade com permissão efetiva. */
export async function notificarDenunciaPost(params: {
  tenantId: string
  motivo: string
  denuncianteUserId: string
}): Promise<number> {
  return notificarDenunciaAdmins([PERMISSIONS.COMMUNITY_MODERATE, PERMISSIONS.MESSAGES_MODERATE], {
    ...params,
    titulo: 'Nova denúncia pendente',
  })
}

/** Denúncia de mensagem — moderadores de mensagens/comunidade (OR). */
export async function notificarDenunciaMensagem(params: {
  tenantId: string
  motivo: string
  denuncianteUserId: string
}): Promise<number> {
  return notificarDenunciaAdmins([PERMISSIONS.MESSAGES_MODERATE, PERMISSIONS.COMMUNITY_MODERATE], {
    ...params,
    titulo: 'Nova denúncia de mensagem',
  })
}

/** Comunicado urgente: membros aprovados + admins de comunicados (sem duplicar). */
export async function notificarComunicadoUrgente(destino: DestinoNotificacao): Promise<number> {
  try {
    const [membroIds, adminIds] = await Promise.all([
      listarUserIdsMembrosAprovados(destino.tenantId),
      listarDestinatariosPorPermissoes(destino.tenantId, [
        PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
        PERMISSIONS.COMMUNITY_MANAGE,
      ]),
    ])
    const targets = new Set<string>([...membroIds, ...adminIds])
    if (destino.excetoUserId) targets.delete(destino.excetoUserId)
    return criarNotificacoesEmLote(
      Array.from(targets).map((userId) => ({
        userId,
        tenantId: destino.tenantId,
        tipo: destino.tipo,
        titulo: destino.titulo,
        corpo: destino.corpo,
        link: destino.link,
        atorId: destino.atorId,
      })),
    )
  } catch {
    return 0
  }
}

/** Reexporta helpers usados por alianças e outros módulos. */
export { notificarUsuariosComPermissao, notificarMembrosAprovados, notificarSafe }
