import Link from 'next/link'
import { UserCog } from 'lucide-react'

export function PerfilAdminLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="app-action inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
    >
      <UserCog className="h-4 w-4" />
      Ver no admin
    </Link>
  )
}
