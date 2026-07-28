// Kit admin: compõe primitivos de @torcida/ui; nunca duplica.
// Componentes com Motion vivem aqui (packages/ui não depende de motion).
export { AdminPageHeader, type AdminPageHeaderProps } from './admin-page-header'
export { StatCard, type StatCardProps, type StatCardTone } from './stat-card'
export { KpiGrid, type KpiGridProps } from './kpi-grid'
export {
  StatusBadge,
  statusBadgeLabel,
  type StatusBadgeProps,
  type StatusBadgeDominio,
} from './status-badge'
export { TableShell, type TableShellProps } from './table-shell'
export { TablePagination, type TablePaginationProps } from './table-pagination'
export { InsightSection, type InsightSectionProps } from './insight-section'
export { SortableTh, type SortableThProps } from './sortable-th'
export { AdminTabs, type AdminTabItem, type AdminTabsProps } from './admin-tabs'
export { adminTabIds } from './admin-tab-ids'
