'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleChecklistItemArea } from '@/app/portal/departamentos/actions'
import { runPersistAction } from '@/lib/toast-action'

export type ChecklistItemLite = { id: string; label: string; done: boolean }

export function AreaChecklistInline({
  areaId,
  departamentoId,
  slug,
  items,
}: {
  areaId: string
  departamentoId: string
  slug: string
  items: ChecklistItemLite[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (items.length === 0) return null

  function toggle(item: ChecklistItemLite) {
    start(async () => {
      const fd = new FormData()
      fd.set('areaId', areaId)
      fd.set('departamentoId', departamentoId)
      fd.set('slug', slug)
      fd.set('itemId', item.id)
      fd.set('done', item.done ? 'false' : 'true')
      const ok = await runPersistAction(() => toggleChecklistItemArea({}, fd), {
        success: item.done ? 'Item reaberto' : 'Item concluído',
      })
      if (ok) router.refresh()
    })
  }

  return (
    <ul className="max-w-xs space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[rgb(var(--foreground))]">
            <input
              type="checkbox"
              checked={item.done}
              disabled={pending}
              onChange={() => toggle(item)}
              className="mt-0.5"
            />
            <span className={item.done ? 'text-[rgb(var(--foreground-muted))] line-through' : ''}>
              {item.label}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
