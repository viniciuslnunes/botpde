import { permanentRedirect } from 'next/navigation'

/**
 * Detalhe de membro migrou para `/admin/torcedores/[id]` (torcedor) —
 * o hub Sócios abre o card em modal. Redirect 308 mantém bookmarks.
 */
export default async function MembroDetalheLegadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  permanentRedirect(`/admin/torcedores/${id}`)
}
