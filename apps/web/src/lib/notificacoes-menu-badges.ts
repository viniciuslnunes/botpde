import type { TipoNotificacao } from '@torcida/db'
import { resolverMenuIdDeRota } from '@torcida/types'

/**
 * Mapa tipo → **rota que resolve a pendência** (a tab/página onde o gestor age).
 * Mantido espelhado com `rota` em POLITICA_POR_TIPO (notificacoes-routing).
 * Arquivo separado para evitar ciclo notificacoes ↔ notificacoes-routing.
 *
 * Por que rota e não id de menu: ao promover uma rota a tab de módulo, a
 * entrada some de ADMIN_MENU e um id fixo apontaria para o nada — o badge
 * sumiria em silêncio (aconteceu com estoque/fiado/estorno/pedidos na wave 1).
 * Resolvendo por rota, o badge sobe sozinho para a entrada do módulo.
 */
export const ROTA_POR_TIPO: Partial<Record<TipoNotificacao, string>> = {
  MEMBRO_SOLICITADO: '/admin/membros',
  DENUNCIA_NOVA: '/admin/comunidade/moderacao',
  ALIANCA_PROPOSTA: '/admin/aliancas',
  ALIANCA_ACEITA: '/admin/aliancas',
  ALIANCA_REJEITADA: '/admin/aliancas',
  ALIANCA_ENCERRADA: '/admin/aliancas',
  ALIANCA_CANCELADA: '/admin/aliancas',
  COBRANCA_VENCIDA: '/admin/financeiro/cobrancas',
  EVENTO_RSVP: '/admin/eventos',
  EVENTO_DIA_GESTOR: '/admin/eventos',
  PEDIDO_RECEBIDO: '/admin/loja/pedidos',
  SOLICITACAO_UNIDADE_CRIADA: '/admin/afiliacoes',
  BAR_ESTOQUE_BAIXO: '/admin/bar/estoque',
  BAR_FIADO_VENCIDO: '/admin/bar/comandas',
  BAR_COMANDA_VENCIDA: '/admin/bar/comandas',
  BAR_TURNO_DIVERGENCIA: '/admin/bar/pdv',
  BAR_ESTORNO_ANOMALO: '/admin/bar/estornos',
  CANAL_RESTRITO_ATIVADO: '/admin/sedes',
  CANAL_REATIVACAO_SOLICITADA: '/admin/configuracoes',
  CANAL_REATIVACAO_RECUSADA: '/admin/sedes',
  CANAL_REATIVADO: '/admin/sedes',
}

/** Menu do sidebar admin associado ao tipo, se houver badge operacional. */
export function menuIdParaTipo(tipo: TipoNotificacao): string | null {
  const rota = ROTA_POR_TIPO[tipo]
  return rota ? resolverMenuIdDeRota(rota) : null
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
