import Link from 'next/link'

export type PerfilAba = 'sobre' | 'publicacoes' | 'fotos' | 'atividade'

interface PerfilTabsProps {
  userId: string
  abaAtiva: PerfilAba
}

const ABAS: { id: PerfilAba; label: string }[] = [
  { id: 'sobre', label: 'Sobre' },
  { id: 'publicacoes', label: 'Publicações' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'atividade', label: 'Atividade' },
]

export function PerfilTabs({ userId, abaAtiva }: PerfilTabsProps) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
      {ABAS.map((aba) => {
        const ativo = aba.id === abaAtiva
        return (
          <Link
            key={aba.id}
            href={`/portal/comunidade/perfil/${userId}?aba=${aba.id}`}
            className={[
              'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              ativo
                ? 'bg-[rgb(var(--primary))] text-white'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {aba.label}
          </Link>
        )
      })}
    </nav>
  )
}
