'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Clock,
  CreditCard,
  MapPin,
  TrendingUp,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

const ICONS: Record<string, LucideIcon> = {
  Users,
  Clock,
  CreditCard,
  Calendar,
  MapPin,
  XCircle,
  AlertTriangle,
}

export interface AdminAlertaItem {
  href: string
  label: string
  variant: 'yellow' | 'red' | 'orange'
}

export interface AdminKpiItem {
  label: string
  value: number
  icon: string
  href?: string
  badge?: string
}

export interface AdminKpiSecundario {
  label: string
  value: string | number
  icon: string
  href?: string
  cor?: string
}

const ALERTA_CLASS: Record<AdminAlertaItem['variant'], string> = {
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  orange: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200',
}

export function AdminDashboardKpis({
  alertas,
  kpis,
  secundarios,
}: {
  alertas: AdminAlertaItem[]
  kpis: AdminKpiItem[]
  secundarios: AdminKpiSecundario[]
}) {
  return (
    <div className="space-y-7">
      {alertas.length > 0 && (
        <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
          {alertas.map((a) => (
            <m.div key={a.label} variants={staggerItem} whileTap={{ scale: 0.99 }} transition={springSnappy}>
              <Link
                href={a.href}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm hover:brightness-95 ${ALERTA_CLASS[a.variant]}`}
              >
                <span className="flex items-center gap-2 font-medium">{a.label}</span>
                <ArrowRight className="h-4 w-4 opacity-70" />
              </Link>
            </m.div>
          ))}
        </m.div>
      )}

      <m.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = ICONS[k.icon] ?? Users
          const inner = (
            <m.div
              variants={staggerItem}
              whileTap={k.href ? { scale: 0.98 } : undefined}
              transition={springSnappy}
              className="h-full"
            >
              <div className="flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
                <div className="flex flex-1 items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                      {k.label}
                    </p>
                    <p className="mt-1.5 text-3xl font-bold tabular-nums text-[rgb(var(--foreground))] sm:mt-2 sm:text-4xl">{k.value}</p>
                    <div className="mt-1 min-h-5">
                      {k.badge ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <TrendingUp className="h-3 w-3 shrink-0" />
                          {k.badge}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                </div>
              </div>
            </m.div>
          )
          return k.href ? (
            <Link key={k.label} href={k.href} className="block h-full">
              {inner}
            </Link>
          ) : (
            <div key={k.label} className="h-full">
              {inner}
            </div>
          )
        })}
      </m.div>

      <m.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {secundarios.map((s) => {
          const Icon = ICONS[s.icon] ?? MapPin
          const inner = (
            <m.div variants={staggerItem} whileTap={s.href ? { scale: 0.98 } : undefined} transition={springSnappy}>
              <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
                <Icon className={`h-4 w-4 shrink-0 ${s.cor ?? 'text-[rgb(var(--foreground-muted))]'}`} />
                <div>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">{s.label}</p>
                  <p className="font-semibold text-[rgb(var(--foreground))]">{s.value}</p>
                </div>
              </div>
            </m.div>
          )
          return s.href ? (
            <Link key={s.label} href={s.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={s.label}>{inner}</div>
          )
        })}
      </m.div>
    </div>
  )
}
