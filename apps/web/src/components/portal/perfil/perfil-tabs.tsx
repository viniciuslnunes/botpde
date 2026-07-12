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
    <nav className="app-scrollbar-none flex gap-6 overflow-x-auto border-b border-[rgb(var(--border))] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ABAS.map((aba) => {
        const ativo = aba.id === abaAtiva
        return (
          <Link
            key={aba.id}
            href={`/portal/comunidade/perfil/${userId}?aba=${aba.id}`}
            aria-current={ativo ? 'page' : undefined}
            className={[
              'relative -mb-px shrink-0 pb-3 pt-1 text-sm font-semibold transition-colors',
              ativo
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {aba.label}
            <span
              className={[
                'absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-all duration-200',
                ativo ? 'bg-[rgb(var(--primary))]' : 'bg-transparent',
              ].join(' ')}
            />
          </Link>
        )
      })}
    </nav>
  )
}
