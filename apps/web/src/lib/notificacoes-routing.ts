import type { TipoNotificacao } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import {
  criarNotificacoesEmLote,
  listarDestinatariosAdmin,
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
  NOVA_MENSAGEM: { escopo: 'social' },
  COMUNICADO_URGENTE: { escopo: 'hibrido' },
  MEMBRO_APROVADO: { escopo: 'hibrido' },
  MEMBRO_REPROVADO: { escopo: 'hibrido' },
  MEMBRO_SOLICITADO: {
    escopo: 'hibrido',
    permissoesAdminOr: [PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW],
  },
  DENUNCIA_NOVA: { escopo: 'admin', permissaoAdmin: PERMISSIONS.COMMUNITY_MODERATE },
  ALIANCA_PROPOSTA: { escopo: 'admin', permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE },
  ALIANCA_ACEITA: { escopo: 'admin', permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE },
  ALIANCA_REJEITADA: { escopo: 'admin', permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE },
  ALIANCA_ENCERRADA: { escopo: 'admin', permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE },
  ALIANCA_CANCELADA: { escopo: 'admin', permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE },
}

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
  const merged = new Set<string>()
  for (const permission of permissions) {
    const ids = await listarDestinatariosAdmin(tenantId, permission, excetoUserId)
    for (const id of ids) merged.add(id)
  }
  if (excetoUserId) merged.delete(excetoUserId)
  return Array.from(merged)
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
    notificarAdminsPorPermissao(
      [PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW],
      {
        tenantId,
        tipo: 'MEMBRO_SOLICITADO',
        titulo: `Nova solicitação de ${label}`,
        corpo: `${solicitanteNome} solicitou ingresso como ${label} em ${tenantNome}.`,
        link: '/admin/membros?status=PENDENTE',
        atorId: solicitanteUserId,
        excetoUserId: solicitanteUserId,
      },
    ),
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

/** Denúncia de post — moderadores de comunidade com permissão efetiva. */
export async function notificarDenunciaPost(params: {
  tenantId: string
  motivo: string
  denuncianteUserId: string
}): Promise<number> {
  return notificarAdminsPorPermissao(PERMISSIONS.COMMUNITY_MODERATE, {
    tenantId: params.tenantId,
    tipo: 'DENUNCIA_NOVA',
    titulo: 'Nova denúncia pendente',
    corpo: params.motivo.slice(0, 140),
    link: '/admin/comunidade/moderacao',
    atorId: params.denuncianteUserId,
    excetoUserId: params.denuncianteUserId,
  })
}

/** Denúncia de mensagem — moderadores de mensagens com permissão efetiva. */
export async function notificarDenunciaMensagem(params: {
  tenantId: string
  motivo: string
  denuncianteUserId: string
}): Promise<number> {
  return notificarAdminsPorPermissao(PERMISSIONS.MESSAGES_MODERATE, {
    tenantId: params.tenantId,
    tipo: 'DENUNCIA_NOVA',
    titulo: 'Nova denúncia de mensagem',
    corpo: params.motivo.slice(0, 140),
    link: '/admin/comunidade/moderacao',
    atorId: params.denuncianteUserId,
    excetoUserId: params.denuncianteUserId,
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
