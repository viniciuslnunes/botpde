import { redirect } from 'next/navigation'

export default async function SedeDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/portal/sedes?sede=${encodeURIComponent(id)}`)
}
