import Link from 'next/link'
import type { NoticiaRelacionada } from '@/lib/praca'

import { hrefNoticiaPraca } from '@/lib/noticias-feed-layout'

export function NoticiasRelacionadosLinks({
  itens,
  sufixo,
}: {
  itens: NoticiaRelacionada[]
  sufixo: string
}) {
  if (itens.length === 0) return null

  return (
    <ul className="mt-2 space-y-1">
      {itens.slice(0, 2).map((rel) => (
        <li key={rel.id}>
          <Link
            href={hrefNoticiaPraca(rel.id, sufixo)}
            className="app-touch-line group inline-flex max-w-full items-start gap-2 text-sm leading-snug text-[rgb(var(--color-primary-fg)_/_0.9)] hover:underline"
          >
            <span className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-sm bg-[rgb(var(--color-primary-fg))]" aria-hidden />
            <span className="line-clamp-2">{rel.titulo}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
