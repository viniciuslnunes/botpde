import { redirect } from 'next/navigation'
import { Search } from 'lucide-react'
import { auth } from '@/lib/auth'
import { BuscaMembrosClient } from './busca-membros-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Buscar na Comunidade' }

export default async function BuscaMembrosPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Search}
        titulo="Buscar na comunidade"
        subtitulo="Encontre membros, hashtags em alta e publicações."
      />
      <BuscaMembrosClient />
    </div>
  )
}
