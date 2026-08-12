import { APP_TIME_ZONE } from '@/lib/format-datetime'

export type AppBuildMeta = {
  /** Semver do produto (raiz do monorepo). */
  version: string
  /** SHA completo ou curto; `dev` em desenvolvimento local sem Railway. */
  commit: string
  /** ISO 8601 do momento do build (ou env injetada). */
  publishedAt: string
  /** `owner/repo` para link do commit; null se desconhecido. */
  repo: string | null
}

const DEFAULT_REPO = 'viniciuslnunes/botpde'

export type AppBuildEnv = {
  NEXT_PUBLIC_APP_VERSION?: string
  NEXT_PUBLIC_APP_COMMIT?: string
  NEXT_PUBLIC_APP_PUBLISHED_AT?: string
  NEXT_PUBLIC_APP_REPO?: string
}

function readEnv(): AppBuildEnv {
  return {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_APP_COMMIT: process.env.NEXT_PUBLIC_APP_COMMIT,
    NEXT_PUBLIC_APP_PUBLISHED_AT: process.env.NEXT_PUBLIC_APP_PUBLISHED_AT,
    NEXT_PUBLIC_APP_REPO: process.env.NEXT_PUBLIC_APP_REPO,
  }
}

/** Resolve a identidade de build a partir de env (injetada no `next.config`). */
export function getAppVersion(env: AppBuildEnv = readEnv()): AppBuildMeta {
  const version = env.NEXT_PUBLIC_APP_VERSION?.trim() || '0.0.0'
  const commit = env.NEXT_PUBLIC_APP_COMMIT?.trim() || 'dev'
  const publishedAt = env.NEXT_PUBLIC_APP_PUBLISHED_AT?.trim() || new Date(0).toISOString()
  const repoRaw = env.NEXT_PUBLIC_APP_REPO?.trim()
  const repo = repoRaw && repoRaw.includes('/') ? repoRaw : DEFAULT_REPO

  return { version, commit, publishedAt, repo }
}

export function shortCommit(commit: string, len = 7): string {
  if (!commit || commit === 'dev') return commit || 'dev'
  return commit.slice(0, len)
}

export function commitUrl(meta: AppBuildMeta): string | null {
  if (!meta.repo || !meta.commit || meta.commit === 'dev') return null
  return `https://github.com/${meta.repo}/commit/${meta.commit}`
}

/** Data de publicação no fuso America/Sao_Paulo (dd/mm/aaaa). */
export function formatPublishedAtPt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

/** Data + hora curta no fuso SP. */
export function formatPublishedAtDateTimePt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

/** `v0.2.0 · 11/08/2026 · a1b2c3d` — rodapé discreto. */
export function formatAppBuildCompact(meta: AppBuildMeta = getAppVersion()): string {
  const data = formatPublishedAtPt(meta.publishedAt)
  const sha = shortCommit(meta.commit)
  return `v${meta.version} · ${data} · ${sha}`
}

/** Versão curta só com versão + commit (sidebar). */
export function formatAppBuildSidebar(meta: AppBuildMeta = getAppVersion()): string {
  return `v${meta.version} · ${shortCommit(meta.commit)}`
}
