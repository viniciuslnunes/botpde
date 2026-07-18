/**
 * Medição local do fluxo publicar → card no feed.
 *
 *   pnpm --filter @torcida/web exec playwright test e2e/publish-latency.measure.ts --project=measure
 *
 * Conta E2E é SUPER_ADMIN: pós-login pode cair em `/super-admin/torcidas`.
 * Em seguida abrimos `/portal/comunidade` (TENANT_SLUG no .env.local).
 */
import path from 'node:path'
import { test, expect } from '@playwright/test'

const AUTH_FILE = path.join(__dirname, '.auth/measure-user.json')

test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

test('medir latência de publicação no feed', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const senha = process.env.E2E_TEST_PASSWORD
  if (!email || !senha) {
    throw new Error('Defina E2E_TEST_EMAIL e E2E_TEST_PASSWORD em apps/web/.env.local')
  }

  const tLogin0 = Date.now()
  await page.goto('/entrar')
  await page.locator('#email-senha').fill(email)
  await page.locator('#senha').fill(senha)
  await page.getByRole('button', { name: /entrar com e-mail/i }).click()
  await page.waitForURL(/\/(portal|super-admin)/, { timeout: 60_000 })
  const loginMs = Date.now() - tLogin0
  await page.context().storageState({ path: AUTH_FILE })

  await page.goto('/portal/comunidade?compose=1')
  const textarea = page.locator('textarea[name="conteudo"]')
  await expect(textarea).toBeVisible({ timeout: 45_000 })

  const marker = `bench-publish-${Date.now()}`
  await textarea.fill(marker)

  const t0 = Date.now()
  await page.getByRole('button', { name: /^publicar$/i }).click()

  await expect(page.getByText(marker).first()).toBeVisible({ timeout: 60_000 })
  const cardMs = Date.now() - t0
  // Aproxima actionMs: card otimista costuma aparecer no mesmo tick do success.
  const actionMs = cardMs

  const report = {
    at: new Date().toISOString(),
    account: email,
    note:
      'Conta E2E é SUPER_ADMIN — assertAutorPublicacaoPost early-return (sem double-fetch de membro). cardMs = clique Publicar → texto no feed (otimista).',
    loginMs,
    actionMs,
    cardMs,
    deltaCardAfterActionMs: 0,
  }

  // eslint-disable-next-line no-console
  console.log('\n[publish-latency]\n' + JSON.stringify(report, null, 2) + '\n')

  expect(actionMs).toBeLessThan(30_000)
  expect(cardMs).toBeLessThan(35_000)
})
