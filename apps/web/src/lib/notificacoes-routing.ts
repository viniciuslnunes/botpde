import type { TipoNotificacao } from '@torcida/db'
import { hrefHomeDepartamento, labelCategoriaViolacao, PERMISSIONS } from '@torcida/types'
import {
  criarNotificacoesEmLote,
  criarNotificacoesEmLoteSePendentes,
  listarDestinatariosAdminPorPermissoes,
  listarUserIdsGestoresDepartamento,
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
  /**
   * Rota onde o gestor resolve a pendência — vira badge no sidebar, na entrada
   * de menu que hoje contém essa rota (ver `resolverMenuIdDeRota`).
   * Só tipos operacionais.
   */
  rota?: string
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
  COMUNICADO_URGENTE: {
    escopo: 'hibrido',
    rota: '/admin/comunidade/comunicados',
  },
  COMUNICADO_NOVO: { escopo: 'social' },
  MEMBRO_APROVADO: { escopo: 'hibrido' },
  MEMBRO_REPROVADO: { escopo: 'hibrido' },
  MEMBRO_SOLICITADO: {
    escopo: 'hibrido',
    permissoesAdminOr: [PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW],
    rota: '/admin/socios?status=solicitacoes',
  },
  COBRANCA_PENDENTE: {
    escopo: 'hibrido',
  },
  COBRANCA_VENCIDA: {
    escopo: 'hibrido',
    permissaoAdmin: PERMISSIONS.FINANCE_MANAGE,
    rota: '/admin/financeiro/cobrancas?status=VENCIDA',
  },
  EVENTO_LEMBRETE: {
    escopo: 'hibrido',
  },
  EVENTO_RSVP: {
    escopo: 'hibrido',
    permissaoAdmin: PERMISSIONS.EVENTS_MANAGE,
    rota: '/admin/eventos',
  },
  EVENTO_DIA_GESTOR: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.EVENTS_MANAGE,
    rota: '/admin/eventos',
  },
  EVENTO_CANCELADO: { escopo: 'social' },
  EVENTO_ALTERADO: { escopo: 'social' },
  EVENTO_CHECKIN: { escopo: 'social' },
  DENUNCIA_NOVA: {
    escopo: 'admin',
    permissoesAdminOr: [PERMISSIONS.COMMUNITY_MODERATE, PERMISSIONS.MESSAGES_MODERATE],
    rota: '/admin/comunidade/moderacao',
  },
  DENUNCIA_RESOLVIDA: { escopo: 'social' },
  ALIANCA_PROPOSTA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    rota: '/admin/aliancas?tab=recebidas',
  },
  ALIANCA_ACEITA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    rota: '/admin/aliancas?tab=ativas',
  },
  ALIANCA_REJEITADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    rota: '/admin/aliancas?tab=historico',
  },
  ALIANCA_ENCERRADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    rota: '/admin/aliancas?tab=historico',
  },
  ALIANCA_CANCELADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.ALLIANCES_MANAGE,
    rota: '/admin/aliancas?tab=historico',
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
    rota: '/admin/bar/estoque',
  },
  BAR_FIADO_VENCIDO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    rota: '/admin/bar/comandas',
  },
  BAR_COMANDA_VENCIDA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    rota: '/admin/bar/comandas',
  },
  BAR_TURNO_DIVERGENCIA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    rota: '/admin/bar/pdv',
  },
  BAR_ESTORNO_ANOMALO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.BAR_MANAGE,
    rota: '/admin/bar/estornos',
  },
  PATRIMONIO_RESPONSAVEL_DEFINIDO: {
    escopo: 'hibrido',
    rota: '/admin/patrimonio?tab=pendencias',
  },
  FINANCEIRO_LANCAMENTO: {
    escopo: 'hibrido',
    permissaoAdmin: PERMISSIONS.FINANCE_MANAGE,
    rota: '/admin/financeiro/lancamentos',
  },
  DESIGN_ATUALIZADO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.SETTINGS_MANAGE,
    rota: '/admin/design',
  },
  PEDIDO_RECEBIDO: {
    escopo: 'admin',
    permissoesAdminOr: [PERMISSIONS.STORE_VIEW_ORDERS, PERMISSIONS.STORE_MANAGE],
    rota: '/admin/loja/pedidos',
  },
  BRECHO_INTERESSE: { escopo: 'social' },
  BRECHO_TROCA_CONFIRMADA: { escopo: 'social' },
  MEMORIA_FATO_DECIDIDA: { escopo: 'social' },
  BRECHO_DENUNCIA: {
    escopo: 'hibrido',
    permissoesAdminOr: [PERMISSIONS.STORE_VIEW_ORDERS, PERMISSIONS.STORE_MANAGE],
    rota: '/admin/loja/brecho',
  },
  SOLICITACAO_UNIDADE_CRIADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.AFFILIATION_MANAGE,
    rota: '/admin/afiliacoes',
  },
  SOLICITACAO_UNIDADE_APROVADA: { escopo: 'social' },
  SOLICITACAO_UNIDADE_RECUSADA: { escopo: 'social' },
  // R5 — canal restrito. A unidade recebe o pedido da Sede em Configurações
  // (é lá que a liderança decide); a Sede recebe o desfecho em /admin/sedes.
  CANAL_RESTRITO_ATIVADO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.TORCIDA_GLOBAL_VIEW,
    rota: '/admin/sedes',
  },
  CANAL_REATIVACAO_SOLICITADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.SETTINGS_MANAGE,
    rota: '/admin/configuracoes',
  },
  CANAL_REATIVACAO_RECUSADA: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.TORCIDA_GLOBAL_VIEW,
    rota: '/admin/sedes',
  },
  CANAL_REATIVADO: {
    escopo: 'admin',
    permissaoAdmin: PERMISSIONS.TORCIDA_GLOBAL_VIEW,
    rota: '/admin/sedes',
  },
}

export {
  agregarBadgesDeInbox,
  agregarBadgesPorMenu,
  menuIdParaTipo,
} from '@/lib/notificacoes-menu-badges'

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
  /** Default true. Use false ao fan-out para a Sede (não duplicar aviso ao solicitante). */
  notificarSolicitante?: boolean
  /** Texto do corpo para admins; default menciona tenantNome. */
  corpoAdmin?: string
}): Promise<void> {
  const {
    tenantId,
    tenantNome,
    solicitanteUserId,
    solicitanteNome,
    tipoVinculo,
    notificarSolicitante = true,
    corpoAdmin,
  } = params
  const label = tipoVinculo === 'SOCIO' ? 'sócio' : 'torcedor'

  const tasks: Promise<unknown>[] = [
    notificarAdminsPorPermissao([PERMISSIONS.MEMBERS_APPROVE, PERMISSIONS.MEMBERS_VIEW], {
      tenantId,
      tipo: 'MEMBRO_SOLICITADO',
      titulo: `Nova solicitação de ${label}`,
      corpo:
        corpoAdmin ??
        `${solicitanteNome} solicitou ingresso como ${label} em ${tenantNome}.`,
      link:
        tipoVinculo === 'SOCIO'
          ? '/admin/socios?status=solicitacoes'
          : '/admin/torcedores?status=PENDENTE',
      atorId: solicitanteUserId,
      excetoUserId: solicitanteUserId,
    }),
  ]

  if (notificarSolicitante) {
    tasks.push(
      notificarSafe({
        userId: solicitanteUserId,
        tenantId,
        tipo: 'MEMBRO_SOLICITADO',
        titulo: 'Solicitação enviada',
        corpo: `Sua solicitação para ${tenantNome} está em análise pela diretoria.`,
        link: '/portal/comunidade',
      }),
    )
  }

  await Promise.all(tasks)
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

/**
 * Corpo da notificação de denúncia do fórum/praça.
 *
 * A reconciliação de leitura amarra a notificação à denúncia por
 * `(tipo, atorId, corpo)` — a notificação não guarda o id. Então este texto
 * precisa ser **determinístico** a partir do que fica gravado na denúncia
 * (categoria + complemento), e truncado nos mesmos 140 do fan-out.
 */
export function corpoDenunciaModeracao(categoria: string, motivo: string | null): string {
  const label = labelCategoriaViolacao(categoria)
  const complemento = motivo?.trim()
  return (complemento ? `${label} — ${complemento}` : label).slice(0, 140)
}

/**
 * Denúncia no fórum/praça — moderadores de comunidade do tenant que responde
 * pelo canal. Escopo CLUBE não tem tenant: a fila é da plataforma e aqui não há
 * quem notificar (retorna 0 em vez de quebrar).
 */
export async function notificarDenunciaModeracao(params: {
  tenantId: string | null
  categoria: string
  motivo: string | null
  denuncianteUserId: string
  escalado: boolean
}): Promise<number> {
  if (!params.tenantId) return 0
  return notificarDenunciaAdmins([PERMISSIONS.COMMUNITY_MODERATE, PERMISSIONS.MESSAGES_MODERATE], {
    tenantId: params.tenantId,
    motivo: corpoDenunciaModeracao(params.categoria, params.motivo),
    denuncianteUserId: params.denuncianteUserId,
    titulo: params.escalado
      ? 'Denúncia crítica no fórum — em análise da plataforma'
      : 'Nova denúncia no fórum',
  })
}

/** Comunicado: membros aprovados + quem publica/gerencia a comunidade (sem duplicar). */
export async function notificarComunicado(destino: DestinoNotificacao): Promise<number> {
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

/** @deprecated Use `notificarComunicado`. */
export const notificarComunicadoUrgente = notificarComunicado

/**
 * Avisa gestores da área (e quem tem `roles:manage`) de um pedido no cockpit.
 * Idempotente por `(destinatário, tipo, link, atorId)` — o mesmo sócio não
 * re-dispara enquanto a notificação anterior estiver pendente.
 */
export async function notificarGestoresDepartamento(opts: {
  tenantId: string
  departamentoId: string
  slug: string
  tab: 'pedidos' | 'equipe' | 'areas' | 'projetos' | 'fila'
  tipo: TipoNotificacao
  titulo: string
  corpo: string
  atorId?: string
  excetoUserId?: string
}): Promise<number> {
  try {
    const targets = await listarUserIdsGestoresDepartamento(
      opts.tenantId,
      opts.departamentoId,
      opts.excetoUserId,
    )
    const destinatarios = opts.atorId
      ? targets.filter((id) => id !== opts.atorId)
      : targets
    return criarNotificacoesEmLoteSePendentes(
      destinatarios.map((userId) => ({
        userId,
        tenantId: opts.tenantId,
        tipo: opts.tipo,
        titulo: opts.titulo,
        corpo: opts.corpo,
        link: hrefHomeDepartamento(opts.slug, opts.tab),
        atorId: opts.atorId,
      })),
    )
  } catch {
    return 0
  }
}

/** Reexporta helpers usados por alianças e outros módulos. */
export { notificarUsuariosComPermissao, notificarMembrosAprovados, notificarSafe }
