import { permanentRedirect } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

export default async function AdminSocialAliasPage({ params }: Props) {
  const { id } = await params
  permanentRedirect(`/admin/eventos/${id}`)
}
