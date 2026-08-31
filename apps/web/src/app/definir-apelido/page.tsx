import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AtSign } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { candidatosNicknameOAuth } from '@/lib/oauth-perfil'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import { isSuperAdminEmail, usuarioPrecisaNickname } from '@/lib/tenant-context'
import { destinoInternoSeguro } from '@/lib/callback-url'
import { DefinirApelidoForm } from './definir-apelido-form'

export const metadata: Metadata = { title: 'Completar perfil' }

async function primeiraSugestaoLivre(
  seeds: string[],
  nome: string,
  email: string | null,
  userId: string,
): Promise<string> {
  for (const candidato of candidatosNicknameOAuth(seeds, nome, email)) {
    const check = await checarNicknameDisponivel(candidato, userId)
    if (check.ok && check.disponivel) return check.nickname
  }
  return ''
}

export default async function DefinirApelidoPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const destino = destinoInternoSeguro(callbackUrl)

  const session = await auth()
  if (!session?.user?.id) {
    // Sem sessão: retoma o destino (ex.: `/convite/<slug>`) em vez de perder o link.
    redirect(
      destino
        ? `/entrar?callbackUrl=${encodeURIComponent(destino)}`
        : '/entrar',
    )
  }

  const user: {
    nickname: string | null
    nome: string | null
    email: string | null
  } | null = await db.user.findUnique({
    where: { id: session.user.id },
    select: { nickname: true, nome: true, email: true },
  })

  // Perfil completo (nome + e-mail + @) → segue o fluxo normal pós-login.
  if (user && !(await usuarioPrecisaNickname(session.user.id))) {
    redirect(
      destino ??
        (isSuperAdminEmail(session.user.email) ? '/super-admin/torcidas' : '/auth/contexto'),
    )
  }

  const nome = user?.nome?.trim() || session.user.name?.trim() || ''
  const email = (user?.email ?? session.user.email ?? '').trim()
  const pedirNome = nome.length < 3
  const pedirEmail = !email
  const completarMaisQueNick = pedirNome || pedirEmail

  const sugestao = user?.nickname
    ? ''
    : await primeiraSugestaoLivre([], nome, email || null, session.user.id)

  return (
    <div className="app-shell-bg relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgb(var(--primary)),transparent)]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]">
            <AtSign className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--foreground))]">
            {completarMaisQueNick ? 'Complete seu perfil' : 'Escolha seu apelido'}
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
            {completarMaisQueNick
              ? 'Faltam alguns dados da conta social. Defina como você aparece na comunidade.'
              : 'Antes de entrar na comunidade, defina um @ único. É assim que o pessoal te encontra no feed.'}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-xl shadow-black/5">
          <DefinirApelidoForm
            sugestao={sugestao}
            nicknameAtual={user?.nickname ?? null}
            nomeAtual={nome}
            emailAtual={email}
            pedirNome={pedirNome}
            pedirEmail={pedirEmail}
            callbackUrl={destino}
          />
        </div>
      </div>
    </div>
  )
}
