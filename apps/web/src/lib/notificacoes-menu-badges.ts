import type { TipoNotificacao } from '@torcida/db'

/**
 * Mapa tipo → id de ADMIN_MENU para badges no sidebar.
 * Mantido espelhado com `menuId` em POLITICA_POR_TIPO (notificacoes-routing).
 * Arquivo separado para evitar ciclo notificacoes ↔ notificacoes-routing.
 */
export const MENU_ID_POR_TIPO: Partial<Record<TipoNotificacao, string>> = {
  MEMBRO_SOLICITADO: 'membros',
  DENUNCIA_NOVA: 'comunidade-moderacao',
  ALIANCA_PROPOSTA: 'aliancas',
  ALIANCA_ACEITA: 'aliancas',
  ALIANCA_REJEITADA: 'aliancas',
  ALIANCA_ENCERRADA: 'aliancas',
  ALIANCA_CANCELADA: 'aliancas',
  COBRANCA_VENCIDA: 'cobrancas',
  EVENTO_RSVP: 'eventos',
  EVENTO_DIA_GESTOR: 'eventos',
  PEDIDO_RECEBIDO: 'loja-pedidos',
  SOLICITACAO_UNIDADE_CRIADA: 'afiliacoes',
  BAR_ESTOQUE_BAIXO: 'bar-estoque',
  BAR_FIADO_VENCIDO: 'bar-fiado',
  BAR_TURNO_DIVERGENCIA: 'bar-pdv',
  BAR_ESTORNO_ANOMALO: 'bar-estornos',
}

/** Menu do sidebar admin associado ao tipo, se houver badge operacional. */
export function menuIdParaTipo(tipo: TipoNotificacao): string | null {
  return MENU_ID_POR_TIPO[tipo] ?? null
}

/**
 * Agrega contagens groupBy(tipo) em badges por id de menu (só entradas > 0).
 */
export function agregarBadgesPorMenu(
  rows: Array<{ tipo: TipoNotificacao; _count: number | { tipo?: number } }>,
): Record<string, number> {
  const badges: Record<string, number> = {}
  for (const row of rows) {
    const menuId = menuIdParaTipo(row.tipo)
    if (!menuId) continue
    const n =
      typeof row._count === 'number'
        ? row._count
        : typeof row._count.tipo === 'number'
          ? row._count.tipo
          : 0
    if (n <= 0) continue
    badges[menuId] = (badges[menuId] ?? 0) + n
  }
  return badges
}
