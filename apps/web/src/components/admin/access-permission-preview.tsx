import { PERMISSION_GROUPS } from '@torcida/types'

/** Pré-visualização agrupada das permissões concedidas (somente leitura). */
export function AccessPermissionPreview({
  permissions,
  emptyLabel = 'Nenhuma permissão concedida',
}: {
  permissions: string[]
  emptyLabel?: string
}) {
  const todas = permissions.includes('*')

  if (!todas && permissions.length === 0) {
    return <p className="text-xs text-[rgb(var(--foreground-muted))]">{emptyLabel}</p>
  }

  if (todas) {
    return (
      <p className="text-sm text-[rgb(var(--foreground))]">
        Concede <span className="font-medium">todas as permissões</span> do sistema.
      </p>
    )
  }

  const grupos = PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => permissions.includes(item.key)),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-3">
      {grupos.map((group) => (
        <div key={group.label}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {group.label}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {group.items.map((item) => (
              <li
                key={item.key}
                className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-0.5 text-xs text-[rgb(var(--foreground))]"
                title={item.key}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
