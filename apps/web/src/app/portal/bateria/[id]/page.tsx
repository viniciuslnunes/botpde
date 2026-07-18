import { redirect } from 'next/navigation'

export default async function PortalBateriaDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/portal/eventos/${id}`)
}
