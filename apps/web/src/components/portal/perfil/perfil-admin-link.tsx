import Link from 'next/link'
import { UserCog } from 'lucide-react'
import { PERFIL_ACAO, PERFIL_ACAO_ICON } from './perfil-acao'

export function PerfilAdminLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={`${PERFIL_ACAO} border border-[rgb(var(--border))] text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]`}
    >
      <UserCog className={PERFIL_ACAO_ICON} />
      Ver no admin
    </Link>
  )
}
