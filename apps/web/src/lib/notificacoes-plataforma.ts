import type { TipoNotificacao } from '@torcida/db'

/**
 * Tipos que o operador da plataforma precisa ver no sino do super-admin.
 * Cross-tenant — denúncia e solicitação de unidade de qualquer torcida.
 * NÃO inclui BAR/EVENTO/PEDIDO: isso é operação do tenant, não da plataforma.
 */
export const TIPOS_NOTIFICACAO_PLATAFORMA: TipoNotificacao[] = [
  'SOLICITACAO_UNIDADE_CRIADA',
  'DENUNCIA_NOVA',
]

/** Deep-link do tenant → console da plataforma (layout isolado). */
export function remapLinkInboxPlataforma(link: string | null): string | null {
  if (!link) return null
  if (link.startsWith('/admin/afiliacoes')) {
    return `/super-admin/unidades${link.slice('/admin/afiliacoes'.length)}`
  }
  if (link.startsWith('/admin/comunidade/moderacao')) {
    return `/super-admin/moderacao${link.slice('/admin/comunidade/moderacao'.length)}`
  }
  return link
}
