import { permanentRedirect } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

/** Alias: detalhe canônico permanece em `/admin/eventos/[id]`. */
export default async function AdminBateriaAliasPage({ params }: Props) {
  const { id } = await params
  permanentRedirect(`/admin/eventos/${id}`)
}
