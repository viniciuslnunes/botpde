'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react'
import {
  Toaster,
  toast as sonnerToast,
  type ExternalToast,
  type ToasterProps,
} from 'sonner'

/** Opções comuns do Sonner que exponemos no serviço. */
export type ToastOptions = Pick<
  ExternalToast,
  | 'description'
  | 'duration'
  | 'id'
  | 'action'
  | 'cancel'
  | 'dismissible'
  | 'onDismiss'
  | 'onAutoClose'
  | 'icon'
  | 'className'
  | 'position'
  | 'closeButton'
  | 'richColors'
  | 'invert'
>

export type ToastPromiseData<T> = {
  loading: string | React.ReactNode
  success: string | React.ReactNode | ((data: T) => string | React.ReactNode)
  error: string | React.ReactNode | ((error: unknown) => string | React.ReactNode)
  description?: string | React.ReactNode | ((data: T) => string | React.ReactNode)
  finally?: () => void | Promise<void>
  id?: string | number
  duration?: number
}

export type ToastActionConfig = {
  label: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

/** @deprecated use ToastPromiseData */
export type ToastPromiseMessages<T> = {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((error: unknown) => string)
}

function resolveOptions(
  descriptionOrOptions?: string | ToastOptions,
  options?: ToastOptions,
): ToastOptions {
  if (typeof descriptionOrOptions === 'string') {
    return { description: descriptionOrOptions, ...options }
  }
  return { ...descriptionOrOptions, ...options }
}

/** < sm: mobile — alinhado ao breakpoint do Sonner (~600px) e Tailwind sm. */
const MOBILE_MQ = '(max-width: 639px)'

function useIsMobileToast(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_MQ)
    const apply = () => setIsMobile(mql.matches)
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [])

  return isMobile
}

export function ToastProvider() {
  const { resolvedTheme } = useTheme()
  const isMobile = useIsMobileToast()
  const position: ToasterProps['position'] = isMobile ? 'bottom-center' : 'top-right'

  return (
    <Toaster
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position={position}
      richColors
      closeButton
      expand={!isMobile}
      visibleToasts={isMobile ? 2 : 4}
      duration={4000}
      gap={isMobile ? 8 : 10}
      // Desktop: canto; mobile: polegar + notch/home indicator
      offset={{ top: 16, right: 16, bottom: 16, left: 16 }}
      mobileOffset={{
        top: 'max(12px, env(safe-area-inset-top, 0px))',
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        left: 12,
        right: 12,
      }}
      // Swipe alinhado à posição (baixo no mobile, direita no desktop)
      swipeDirections={isMobile ? ['bottom', 'left', 'right'] : ['right', 'top']}
      pauseWhenPageIsHidden
      containerAriaLabel="Notificações"
      hotkey={['altKey', 'KeyT']}
      className="torcida-toaster"
      icons={{
        success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
        error: <XCircle className="h-4 w-4" aria-hidden />,
        warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
        info: <Info className="h-4 w-4" aria-hidden />,
        loading: <Loader2 className="h-4 w-4 animate-spin" aria-hidden />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'torcida-toast font-sans !bg-[rgb(var(--surface))] !text-[rgb(var(--foreground))] !border-[rgb(var(--border))]',
          title: 'torcida-toast-title',
          description: 'torcida-toast-description !text-[rgb(var(--foreground-muted))]',
          actionButton: '!bg-[rgb(var(--primary))] !text-white',
          cancelButton:
            '!bg-[rgb(var(--background-subtle))] !text-[rgb(var(--foreground-muted))]',
          closeButton: 'torcida-toast-close',
          success: 'torcida-toast-success',
          error: 'torcida-toast-error',
          warning: 'torcida-toast-warning',
          info: 'torcida-toast-info',
          loading: 'torcida-toast-loading',
        },
      }}
    />
  )
}

/**
 * API de toast do Torcida — wrapper tipado sobre Sonner.
 * Preferir este objeto a importar `sonner` direto nos apps.
 */
export const toast = {
  /** Toast neutro (sem ícone semântico). */
  message: (message: string | React.ReactNode, options?: ToastOptions) =>
    sonnerToast(message, options),

  success: (
    message: string | React.ReactNode,
    descriptionOrOptions?: string | ToastOptions,
    options?: ToastOptions,
  ) => sonnerToast.success(message, resolveOptions(descriptionOrOptions, options)),

  error: (
    message: string | React.ReactNode,
    descriptionOrOptions?: string | ToastOptions,
    options?: ToastOptions,
  ) =>
    sonnerToast.error(message, {
      duration: 6000,
      ...resolveOptions(descriptionOrOptions, options),
    }),

  warning: (
    message: string | React.ReactNode,
    descriptionOrOptions?: string | ToastOptions,
    options?: ToastOptions,
  ) => sonnerToast.warning(message, resolveOptions(descriptionOrOptions, options)),

  info: (
    message: string | React.ReactNode,
    descriptionOrOptions?: string | ToastOptions,
    options?: ToastOptions,
  ) => sonnerToast.info(message, resolveOptions(descriptionOrOptions, options)),

  loading: (message: string | React.ReactNode, options?: ToastOptions) =>
    sonnerToast.loading(message, options),

  /**
   * Toast com botão de ação (ex.: Desfazer, Ver pedido).
   * Fecha ao clicar na ação, salvo `event.preventDefault()` no onClick.
   */
  action: (
    message: string | React.ReactNode,
    action: ToastActionConfig,
    options?: ToastOptions,
  ) =>
    sonnerToast(message, {
      ...options,
      action: {
        label: action.label,
        onClick: action.onClick,
      },
    }),

  /**
   * Confirmação não bloqueante: fica até o usuário decidir (duration Infinity).
   * Útil para “Tem certeza?” sem `window.confirm`.
   */
  confirm: (
    message: string | React.ReactNode,
    config: {
      confirmLabel?: string
      cancelLabel?: string
      onConfirm: () => void
      onCancel?: () => void
      description?: string | React.ReactNode
    },
  ) =>
    sonnerToast(message, {
      description: config.description,
      duration: Infinity,
      closeButton: true,
      action: {
        label: config.confirmLabel ?? 'Confirmar',
        onClick: () => config.onConfirm(),
      },
      cancel: {
        label: config.cancelLabel ?? 'Cancelar',
        onClick: () => config.onCancel?.(),
      },
    }),

  /**
   * Toast persistente — só some com dismiss (swipe / X / programático).
   */
  persist: (message: string | React.ReactNode, options?: ToastOptions) =>
    sonnerToast(message, { ...options, duration: Infinity }),

  /**
   * Atualiza um toast existente pelo `id` (loading → success/error manual).
   * Preferir `toast.promise` quando o fluxo for uma Promise única.
   */
  update: (
    id: string | number,
    message: string | React.ReactNode,
    options?: ToastOptions & { type?: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'message' },
  ) => {
    const { type = 'message', ...rest } = options ?? {}
    const payload = { id, ...rest }
    switch (type) {
      case 'success':
        return sonnerToast.success(message, payload)
      case 'error':
        return sonnerToast.error(message, { duration: 6000, ...payload })
      case 'info':
        return sonnerToast.info(message, payload)
      case 'warning':
        return sonnerToast.warning(message, payload)
      case 'loading':
        return sonnerToast.loading(message, payload)
      default:
        return sonnerToast(message, payload)
    }
  },

  /**
   * Loading → success/error automático a partir de uma Promise.
   * Aceita funções/`ToastOptions` no success/error (API completa do Sonner).
   */
  promise: <T,>(promise: Promise<T> | (() => Promise<T>), data: ToastPromiseData<T>) =>
    sonnerToast.promise(promise, data),

  /** JSX custom mantendo o chrome padrão do Sonner. */
  custom: (
    jsx: (id: string | number) => React.ReactElement,
    options?: ToastOptions,
  ) => sonnerToast.custom(jsx, options),

  dismiss: (id?: string | number) => sonnerToast.dismiss(id),

  /** Histórico / fila ativa (útil para debug ou limpar tudo). */
  getHistory: () => sonnerToast.getHistory(),
  getToasts: () => sonnerToast.getToasts(),
}
