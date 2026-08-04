// Kit admin: compõe primitivos de @torcida/ui; nunca duplica.
// Componentes com Motion vivem aqui (packages/ui não depende de motion).
export { AdminPageHeader, type AdminPageHeaderProps } from './admin-page-header'
export { AdminDetailHeader, type AdminDetailHeaderProps } from './admin-detail-header'
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
export {
  AdminModuleTabs,
  resolveAdminModuleTab,
  type AdminModuleTabItem,
  type AdminModuleTabsProps,
} from './admin-module-tabs'
export { adminTabIds } from './admin-tab-ids'
export {
  AdminCreateDisclosure,
  type AdminCreateDisclosureProps,
} from './admin-create-disclosure'
export {
  AdminExpansionPanel,
  type AdminExpansionPanelProps,
} from './admin-expansion-panel'
export {
  AdminChartPeriodFilter,
  type AdminChartPeriod,
  type AdminChartPeriodFilterProps,
} from './admin-chart-period-filter'
export { AdminInboxList } from './admin-inbox'
export {
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  DirecaoListaSkeleton,
} from './direcao-skeletons'
export { SincronizarCobrancasButton } from './sincronizar-cobrancas-button'
// Listagem paginada com filtro por coluna — ver `@/lib/listagem`.
export {
  ListagemToolbar,
  ListagemTh,
  ListagemPaginacao,
  ListagemVazia,
  ListagemBusca,
  ListagemForm,
  ListagemColunaFiltro,
  ListagemChipFiltro,
  ListagemPersistencia,
  useListagemFormPendente,
  type ListagemToolbarProps,
  type ListagemThProps,
  type ListagemPaginacaoProps,
  type ListagemVaziaProps,
  type ListagemBuscaProps,
  type ListagemFormProps,
  type ListagemColunaFiltroProps,
  type ListagemFiltroOpcaoUI,
  type ListagemPersistenciaProps,
} from './listagem'
