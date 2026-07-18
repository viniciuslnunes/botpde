import path from 'node:path'
import { test as setup } from '@playwright/test'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

/**
 * Login via Credentials (e-mail/senha) — evita depender de OAuth interativo
 * (Google bloqueia login em browser controlado por automação; Discord exige
 * autorização manual a cada sessão). Credenciais só em E2E_TEST_EMAIL/
 * E2E_TEST_PASSWORD (apps/web/.env.local, nunca commitado).
 *
 * Requer ROOT_DOMAIN comentado em .env.local (modo single-tenant) — com
 * ROOT_DOMAIN=lvh.me setado, o cookie de sessão usa Domain=.lvh.me, que o
 * navegador rejeita em localhost:3000 e a sessão nunca é persistida.
 */
setup('autenticar usuário de teste', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const senha = process.env.E2E_TEST_PASSWORD
  if (!email || !senha) {
    throw new Error(
      'Defina E2E_TEST_EMAIL e E2E_TEST_PASSWORD em apps/web/.env.local — ver apps/web/e2e/README.md.',
    )
  }

  await page.goto('/entrar')
  await page.locator('#email-senha').fill(email)
  await page.locator('#senha').fill(senha)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  // Super-admin pode ir para /super-admin/torcidas; sócio comum para /portal.
  await page.waitForURL(/\/(portal|super-admin)/, { timeout: 60_000 })
  if (page.url().includes('/super-admin')) {
    await page.goto('/portal/comunidade', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForURL('**/portal/**')
  }

  const cookies = await page.context().cookies()
  if (!cookies.some((c) => c.name.includes('session-token'))) {
    throw new Error(
      'Login concluiu mas a sessão não persistiu — confirme que ROOT_DOMAIN está comentado ' +
        'em apps/web/.env.local (ver apps/web/e2e/README.md).',
    )
  }

  await page.context().storageState({ path: AUTH_FILE })
})
