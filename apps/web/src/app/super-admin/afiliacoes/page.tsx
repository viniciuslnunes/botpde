import { permanentRedirect } from 'next/navigation'

/**
 * Rota antiga da fila de solicitações de unidade. Renomeada para
 * `/super-admin/unidades` quando o catálogo de clubes ganhou casa própria —
 * "Afiliações" significava duas coisas no mesmo menu (`Afiliacao` = clube ×
 * `SolicitacaoUnidade` = subsede/PDE).
 *
 * O redirect fica: `Notificacao.link` já gravado no banco aponta para cá.
 */
export default function AfiliacoesRedirectPage() {
  permanentRedirect('/super-admin/unidades')
}
