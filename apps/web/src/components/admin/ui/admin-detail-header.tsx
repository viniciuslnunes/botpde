import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export interface AdminDetailHeaderProps {
  title: string
  /** Linha de contexto sob o título (tipo, local, status textual). */
  description?: string
  /** Rótulo acima do título — o "onde estou" (ex.: "Administração da unidade"). */
  eyebrow?: string
  backHref: string
  /** Texto do link de volta — default "Voltar". */
  backLabel?: string
  /** Ícone já dimensionado (`h-5 w-5`). */
  icon?: ReactNode
  /** Selos de estado (tipo, ativo/inativo). */
  badges?: ReactNode
  /** Ações da entidade (promover, exportar). */
  actions?: ReactNode
}

/**
 * Cabeçalho de página de **detalhe** — versão leve do `AdminPageHeader`, sem a
 * faixa de superfície própria.
 *
 * Existe porque detalhe sob shell de módulo (`/admin/sedes/[id]` dentro de
 * Estrutura) ganhava dois cabeçalhos full-bleed empilhados: o do módulo e o da
 * entidade. Aqui o título da entidade vive *dentro* do painel da tab, com o
 * link de volta explícito — o cabeçalho do módulo continua sendo o do topo.
 */
export function AdminDetailHeader({
  title,
  description,
  eyebrow,
  backHref,
  backLabel = 'Voltar',
  icon,
  badges,
  actions,
}: AdminDetailHeaderProps) {
  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            // Escudo/foto: sem tint roxo nem caixa menor que a arte (`:has(img)`).
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] [&:has(img)]:bg-transparent">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{title}</h1>
              {badges}
            </div>
            {description ? (
              <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
