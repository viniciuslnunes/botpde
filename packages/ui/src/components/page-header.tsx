import type { ComponentType, SVGProps } from 'react'

export interface PageHeaderProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  subtitle?: string
}

/** Cabeçalho padrão de página do admin/portal: ícone + título + subtítulo, com borda inferior. */
export function PageHeader({ icon: Icon, title, subtitle }: PageHeaderProps) {
  return (
    <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-8 py-5">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{title}</h1>
          {subtitle && <p className="text-sm text-[rgb(var(--foreground-muted))]">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
