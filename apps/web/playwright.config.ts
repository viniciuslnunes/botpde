import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

// Node não lê .env.local sozinho (isso é feature do Next.js) — carrega manual
// aqui pra E2E_TEST_EMAIL/SENHA chegarem no processo do Playwright.
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const linha of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}
loadEnvLocal()

/**
 * Suíte de captura visual: não é regressão pixel-a-pixel, é "andar pelos
 * fluxos principais e salvar PNGs" para depois alimentar uma sessão de
 * Claude Code (agente `ux-review` + skill `impeccable`) com evidência real
 * de tela. Ver apps/web/e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e/.test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'sem-auth',
      testMatch: /.*\.publico\.spec\.ts/,
    },
    {
      name: 'autenticado',
      testMatch: /.*\.portal\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        storageState: './e2e/.auth/user.json',
      },
    },
  ],
})
