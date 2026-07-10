import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function PerfilRedirectPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  redirect(`/portal/comunidade/perfil/${session.user.id}?aba=sobre`)
}
