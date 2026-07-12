'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

interface ThemeToggleProps {
  variant?: 'icon' | 'row'
}

export function ThemeToggle({ variant = 'icon' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()

  const isDark = resolvedTheme !== 'light'
  const Icon = isDark ? Sun : Moon
  const label = isDark ? 'Usar tema claro' : 'Usar tema escuro'

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        suppressHydrationWarning
        className="app-action flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
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
      suppressHydrationWarning
      className="app-action flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
