import { describe, expect, it } from 'vitest'
import {
  commitUrl,
  formatAppBuildCompact,
  formatAppBuildSidebar,
  formatPublishedAtPt,
  getAppVersion,
  shortCommit,
  type AppBuildEnv,
} from '../app-version'

const baseEnv: AppBuildEnv = {
  NEXT_PUBLIC_APP_VERSION: '1.768.779',
  NEXT_PUBLIC_APP_COMMIT: 'a1b2c3d4e5f6789',
  NEXT_PUBLIC_APP_PUBLISHED_AT: '2026-08-11T18:00:00.000Z',
  NEXT_PUBLIC_APP_REPO: 'viniciuslnunes/botpde',
}

describe('app-version', () => {
  it('getAppVersion lê versão, commit, publicação e repo', () => {
    const meta = getAppVersion(baseEnv)
    expect(meta).toEqual({
      version: '1.768.779',
      commit: 'a1b2c3d4e5f6789',
      publishedAt: '2026-08-11T18:00:00.000Z',
      repo: 'viniciuslnunes/botpde',
    })
  })

  it('getAppVersion aplica defaults seguros', () => {
    const meta = getAppVersion({})
    expect(meta.version).toBe('0.0.0')
    expect(meta.commit).toBe('dev')
    expect(meta.repo).toBe('viniciuslnunes/botpde')
    expect(meta.publishedAt).toBe(new Date(0).toISOString())
  })

  it('shortCommit trunca SHA e preserva dev', () => {
    expect(shortCommit('abcdef123456')).toBe('abcdef1')
    expect(shortCommit('dev')).toBe('dev')
  })

  it('commitUrl monta link do GitHub e omite em dev', () => {
    expect(commitUrl(getAppVersion(baseEnv))).toBe(
      'https://github.com/viniciuslnunes/botpde/commit/a1b2c3d4e5f6789',
    )
    expect(commitUrl(getAppVersion({ ...baseEnv, NEXT_PUBLIC_APP_COMMIT: 'dev' }))).toBeNull()
  })

  it('formatPublishedAtPt usa America/Sao_Paulo', () => {
    expect(formatPublishedAtPt('2026-08-11T18:00:00.000Z')).toBe('11/08/2026')
  })

  it('formatAppBuildCompact e sidebar', () => {
    const meta = getAppVersion(baseEnv)
    expect(formatAppBuildCompact(meta)).toBe('v1.768.779 · 11/08/2026 · a1b2c3d')
    expect(formatAppBuildSidebar(meta)).toBe('v1.768.779 · a1b2c3d')
  })

  it('fórmula de produto: major fixo 1; minor=main; patch=total', () => {
    const version = getAppVersion(baseEnv).version
    const [major, minor, patch] = version.split('.').map((n) => Number.parseInt(n, 10))
    expect(major).toBe(1)
    expect(minor).toBe(768)
    expect(patch).toBe(779)
  })
})
