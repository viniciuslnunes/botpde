import { permanentRedirect } from 'next/navigation'

/**
 * Rota legada — Notificacao.link e bookmarks apontam para /admin/bar/fiado.
 * Mantém permanentRedirect (308) para /admin/bar/comandas (CLAUDE.md §Tabs).
 */
export default function AdminBarFiadoRedirectPage() {
  permanentRedirect('/admin/bar/comandas')
}
