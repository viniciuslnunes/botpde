import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { UserCheck } from 'lucide-react'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { BuscaUsuarioClient } from './busca-usuario-client'

export const metadata: Metadata = { title: 'Usuários — Super Admin' }

export default async function UsuariosSuperAdminPage() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Usuários"
        description="Localize uma pessoa por e-mail, nome ou @nickname e veja em quais torcidas ela tem vínculo."
        icon={<UserCheck className="h-5 w-5" />}
      />
      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
        <BuscaUsuarioClient />
      </div>
    </div>
  )
}
