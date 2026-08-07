import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Crown } from 'lucide-react'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { carregarLiderancas } from '@/lib/liderancas-console'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { LiderancasConsole } from './liderancas-console'

export const metadata: Metadata = { title: 'Lideranças — Super Admin' }

export default async function LiderancasPage() {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const grupos = await carregarLiderancas(session.user.id)

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Lideranças"
        description="Presidência de cada torcida e liderança de cada unidade. Troca de gestão acontece a cada 3–4 anos — aqui a plataforma corrige, transfere ou zera quem lidera o quê."
        icon={<Crown className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
        <LiderancasConsole grupos={grupos} />
      </div>
    </div>
  )
}
