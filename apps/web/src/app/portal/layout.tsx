import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Layout do Portal do Associado.
 * Qualquer membro autenticado tem acesso — sem verificação de permissões avançadas.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/entrar')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--background))' }}>
      {/* Navbar do portal — será implementada como componente separado */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
