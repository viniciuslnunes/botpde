'use client'

import { GitCommitHorizontal, Package, CalendarClock } from 'lucide-react'
import {
  commitUrl,
  formatAppBuildSidebar,
  formatPublishedAtDateTimePt,
  getAppVersion,
  shortCommit,
  type AppBuildMeta,
} from '@/lib/app-version'

/** Card da visão geral — versão · publicação · commit. */
export function AppBuildMetaCard({ meta = getAppVersion() }: { meta?: AppBuildMeta }) {
  const url = commitUrl(meta)
  const sha = shortCommit(meta.commit)

  return (
    <section
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5"
      aria-label="Identidade de build da plataforma"
    >
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Build da plataforma</h2>
      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
        Versão semântica, data de publicação deste deploy e commit.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="flex items-start gap-2.5">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" aria-hidden />
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Versão
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-[rgb(var(--foreground))]">
              v{meta.version}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <CalendarClock
            className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]"
            aria-hidden
          />
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Publicação
            </dt>
            <dd className="mt-0.5 text-sm text-[rgb(var(--foreground))]">
              {formatPublishedAtDateTimePt(meta.publishedAt)}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <GitCommitHorizontal
            className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]"
            aria-hidden
          />
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Commit
            </dt>
            <dd className="mt-0.5 font-mono text-sm text-[rgb(var(--foreground))]">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[rgb(var(--border))] underline-offset-2 hover:decoration-[rgb(var(--foreground-muted))]"
                >
                  {sha}
                </a>
              ) : (
                sha
              )}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  )
}

/** Rodapé discreto da sidebar do Super Admin. */
export function AppBuildMetaSidebar({ meta = getAppVersion() }: { meta?: AppBuildMeta }) {
  const url = commitUrl(meta)
  const label = formatAppBuildSidebar(meta)

  return (
    <p className="px-3 py-2 text-[10px] leading-tight text-[rgb(var(--foreground-muted))]">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[rgb(var(--foreground))]"
          title={`Build v${meta.version}`}
        >
          {label}
        </a>
      ) : (
        <span title={`Build v${meta.version}`}>{label}</span>
      )}
    </p>
  )
}
