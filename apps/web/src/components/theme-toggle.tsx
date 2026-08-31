'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@torcida/ui/services/theme'
import { useHidratado } from '@/lib/use-hidratado'

interface ThemeToggleProps {
  variant?: 'icon' | 'row' | 'dropdown'
}

export function ThemeToggle({ variant = 'icon' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const hidratado = useHidratado()
  const isDark = !hidratado || resolvedTheme !== 'light'
  const Icon = isDark ? Sun : Moon
  const label = isDark ? 'Usar tema claro' : 'Usar tema escuro'

  if (variant === 'row' || variant === 'dropdown') {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={
          variant === 'dropdown'
            ? 'app-action flex w-full items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]'
            : 'app-action flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]'
        }
      >
        <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="app-action flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
