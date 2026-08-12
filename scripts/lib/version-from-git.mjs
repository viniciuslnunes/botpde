/**
 * Versão do produto a partir do histórico Git.
 *
 * major  = 1 (fixo)
 * minor  = commits alcançáveis a partir de `main` (o que já entrou na linha principal)
 * patch  = número total de commits no repositório (`git rev-list --count --all`)
 */
import { execSync } from 'node:child_process'

export const APP_VERSION_MAJOR = 1

/**
 * @param {string} command
 * @param {string} [cwd]
 */
function gitCount(command, cwd) {
  try {
    const out = execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const n = Number.parseInt(out, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

/**
 * Resolve ref de main: origin/main → main → HEAD.
 * @param {string} [cwd]
 */
function resolveMainRef(cwd) {
  for (const ref of ['origin/main', 'main']) {
    try {
      execSync(`git rev-parse --verify ${ref}`, {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return ref
    } catch {
      // try next
    }
  }
  return 'HEAD'
}

/**
 * @param {{ cwd?: string; mainRef?: string }} [opts]
 * @returns {{ version: string; major: number; minor: number; patch: number; source: 'git' | 'fallback'; mainRef: string }}
 */
export function computeVersionFromGit(opts = {}) {
  const cwd = opts.cwd
  const mainRef = opts.mainRef ?? resolveMainRef(cwd)

  let minor = gitCount(`git rev-list --count ${mainRef}`, cwd)
  let patch = gitCount('git rev-list --count --all', cwd)

  if (minor === null && patch !== null) minor = patch
  if (patch === null && minor !== null) patch = minor

  if (minor === null || patch === null) {
    return {
      version: `${APP_VERSION_MAJOR}.0.0`,
      major: APP_VERSION_MAJOR,
      minor: 0,
      patch: 0,
      source: 'fallback',
      mainRef,
    }
  }

  // patch (total) nunca menor que minor (main ⊆ all)
  if (patch < minor) patch = minor

  return {
    version: `${APP_VERSION_MAJOR}.${minor}.${patch}`,
    major: APP_VERSION_MAJOR,
    minor,
    patch,
    source: 'git',
    mainRef,
  }
}
