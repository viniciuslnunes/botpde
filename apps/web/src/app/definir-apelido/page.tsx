import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AtSign } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { sugerirNickname } from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { DefinirApelidoForm } from './definir-apelido-form'

export const metadata: Metadata = { title: 'Escolher apelido' }

export default async function DefinirApelidoPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  if (isSuperAdminEmail(session.user.email)) {
    redirect('/super-admin/torcidas')
  }

  const user: { nickname: string | null; nome: string | null } | null = await db.user.findUnique({
    where: { id: session.user.id },
    select: { nickname: true, nome: true },
  })

  // Já tem @ → segue o fluxo normal pós-login
  if (user?.nickname) {
    redirect('/auth/contexto')
  }

  const sugestao = sugerirNickname(user?.nome ?? session.user.name ?? '')

  return (
    <div className="app-shell-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgb(var(--primary)),transparent)]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]">
            <AtSign className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--foreground))]">
            Escolha seu apelido
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
            Antes de entrar na comunidade, defina um @ único. É assim que o pessoal te encontra no
            feed.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-xl shadow-black/5">
          <DefinirApelidoForm sugestao={sugestao} nicknameAtual={null} />
        </div>
      </div>
    </div>
  )
}
