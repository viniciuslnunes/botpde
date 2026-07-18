// Serviços
export {
  ThemeProvider,
  useTenantTheme,
  hexToRgb,
  applyTenantDesign,
  tenantDesignCriticalCss,
  type TenantDesign,
  type TenantTheme,
} from './services/theme'
export {
  ToastProvider,
  toast,
  type ToastOptions,
  type ToastPromiseData,
  type ToastPromiseMessages,
  type ToastActionConfig,
} from './services/toast'
export {
  DialogProvider,
  useDialog,
  type ConfirmOptions,
  type ConfirmVariant,
  type ConfirmDismissReason,
} from './services/dialog'
export { PermissionProvider, usePermission, PermissionGate } from './services/permission'
export { useUpload } from './services/upload'
export { useRealtime } from './services/realtime'
export { useAppForm } from './services/form'
export { api, ApiError } from './services/api'

// Componentes
export { FieldError } from './components/field-error'
export { Input, Select, Textarea } from './components/input'
export { SubmitButton, type SubmitButtonProps } from './components/submit-button'
export { Badge, type BadgeProps, type BadgeVariant } from './components/badge'
export { PageHeader, type PageHeaderProps } from './components/page-header'
export { Card, type CardProps } from './components/card'
