import { PERMISSION_GROUPS } from '@torcida/types'

/** Pré-visualização agrupada das permissões concedidas (somente leitura). */
export function AccessPermissionPreview({
  permissions,
  emptyLabel = 'Nenhuma permissão concedida',
  compact = false,
}: {
  permissions: string[]
  emptyLabel?: string
  /** Densidade maior para cards lado a lado */
  compact?: boolean
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
    <div className={compact ? 'columns-1 gap-x-4 space-y-0 sm:columns-2' : 'space-y-3'}>
      {grupos.map((group) => (
        <div key={group.label} className={compact ? 'mb-3 break-inside-avoid' : undefined}>
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

/** Comparativo membro × gestor em duas colunas (templates de departamento). */
export function AccessPermissionCompare({
  permissionsMembro,
  permissionsGestor,
}: {
  permissionsMembro: string[]
  permissionsGestor: string[]
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Colaborador (membro)</p>
          <span className="text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
            {permissionsMembro.length} permiss{permissionsMembro.length === 1 ? 'ão' : 'ões'}
          </span>
        </div>
        <AccessPermissionPreview
          permissions={permissionsMembro}
          emptyLabel="Sem permissões de colaborador"
          compact
        />
      </div>
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">A mais para o gestor</p>
          <span className="text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
            {permissionsGestor.length} permiss{permissionsGestor.length === 1 ? 'ão' : 'ões'}
          </span>
        </div>
        <AccessPermissionPreview
          permissions={permissionsGestor}
          emptyLabel="Sem permissões extras de gestão"
          compact
        />
      </div>
    </div>
  )
}
