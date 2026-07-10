import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { BuscaMembrosClient } from './busca-membros-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Buscar Membros' }

export default async function BuscaMembrosPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade"
        className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Buscar membros</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Encontre torcedores da sua torcida e aliadas para seguir.
        </p>
      </div>
      <BuscaMembrosClient />
    </div>
  )
}
