#!/usr/bin/env node
/**
 * Sincroniza package.json + CHANGELOG com a versão derivada do Git
 * (1.<commits_main>.<commits_all>) e cria tag local.
 *
 * Uso:
 *   pnpm release:sync
 *   pnpm release:sync -- --dry-run
 *   pnpm release:sync -- --no-commit   # só grava arquivos, sem commit/tag
 *
 * Push fica explícito: git push --follow-tags
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeVersionFromGit } from './lib/version-from-git.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkgPath = join(root, 'package.json')
const changelogPath = join(root, 'CHANGELOG.md')

const args = process.argv.slice(2).filter((a) => a !== '--')
const dryRun = args.includes('--dry-run')
const noCommit = args.includes('--no-commit')

const computed = computeVersionFromGit({ cwd: root })
const next = computed.version
const tag = `v${next}`

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = String(pkg.version ?? '0.0.0')

console.log(
  `${current} → ${next} (git: main=${computed.minor} @ ${computed.mainRef}, total=${computed.patch}, source=${computed.source})${
    dryRun ? ' [dry-run]' : ''
  }`,
)

if (current === next && !dryRun) {
  console.log('package.json já está sincronizado.')
  process.exit(0)
}

const hoje = new Date().toISOString().slice(0, 10)
const changelogEntry = `## [${next}] — ${hoje}

### Changed

- Versão sincronizada com o histórico Git (\`1.<commits_main>.<commits_all>\`).

`

let changelog = ''
try {
  changelog = readFileSync(changelogPath, 'utf8')
} catch {
  changelog = `# Changelog\n\n`
}

let nextChangelog = changelog
if (!changelog.includes(`## [${next}]`)) {
  const titleMatch = changelog.match(/^#\s+Changelog\s*\n+/i)
  if (titleMatch) {
    nextChangelog = `${titleMatch[0]}${changelogEntry}${changelog.slice(titleMatch[0].length)}`
  } else {
    nextChangelog = `# Changelog\n\n${changelogEntry}${changelog}`
  }
}

if (dryRun) {
  console.log('Arquivos que seriam gravados: package.json, CHANGELOG.md')
  if (!noCommit) {
    console.log(`Commit: chore(release): ${next} [skip ci]`)
    console.log(`Tag: ${tag}`)
  }
  process.exit(0)
}

pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
writeFileSync(changelogPath, nextChangelog)

if (noCommit) {
  console.log('Arquivos gravados (--no-commit).')
  process.exit(0)
}

execSync('git add package.json CHANGELOG.md', { cwd: root, stdio: 'inherit' })
execSync(`git commit -m "chore(release): ${next} [skip ci]"`, { cwd: root, stdio: 'inherit' })

try {
  execSync(`git rev-parse -q --verify refs/tags/${tag}`, {
    cwd: root,
    stdio: 'ignore',
  })
  console.log(`Tag ${tag} já existe — mantida.`)
} catch {
  execSync(`git tag -a ${tag} -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' })
}

console.log(`\nPronto: commit + tag ${tag} locais.`)
console.log('Publique com: git push --follow-tags')
