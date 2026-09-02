import Link from 'next/link'
import { ScrollRail } from '@/components/ui/scroll-rail'

export function PracaPills({
  items,
  ativo,
}: {
  items: { id: string; label: string; href: string }[]
  ativo: string
}) {
  return (
    <ScrollRail as="nav" className="-mx-1 flex gap-1 px-1">
      {items.map((item) => {
        const ativoAgora = item.id === ativo
        return (
          <Link
            key={item.id}
            href={item.href}
            className={
              ativoAgora
                ? 'app-touch-target inline-flex shrink-0 items-center rounded-full bg-[rgb(var(--color-primary)_/_0.16)] px-3 text-xs font-semibold text-[rgb(var(--color-primary-fg))]'
                : 'app-touch-target inline-flex shrink-0 items-center rounded-full px-3 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]'
            }
            aria-current={ativoAgora ? 'page' : undefined}
          >
            {item.label}
          </Link>
        )
      })}
    </ScrollRail>
  )
}
