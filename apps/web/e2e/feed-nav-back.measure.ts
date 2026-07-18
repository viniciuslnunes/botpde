/**
 * Mede o custo de voltar ao feed após Buscar / Classificação.
 *
 *   pnpm --filter @torcida/web exec playwright test e2e/feed-nav-back.measure.ts --project=measure
 */
import path from 'node:path'
import { test, expect, type Page, type Request } from '@playwright/test'

const AUTH_FILE = path.join(__dirname, '.auth/measure-user.json')

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

async function login(page: Page) {
  const email = process.env.E2E_TEST_EMAIL
  const senha = process.env.E2E_TEST_PASSWORD
  if (!email || !senha) {
    throw new Error('Defina E2E_TEST_EMAIL e E2E_TEST_PASSWORD em apps/web/.env.local')
  }
  await page.goto('/entrar')
  await page.locator('#email-senha').fill(email)
  await page.locator('#senha').fill(senha)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await page.waitForURL(/\/(portal|super-admin)/, { timeout: 60_000 })
  if (page.url().includes('/super-admin')) {
    await page.goto('/portal/comunidade')
    await page.waitForURL('**/portal/**')
  }
  await page.context().storageState({ path: AUTH_FILE })
}

function classifyRequest(url: string): string | null {
  if (url.includes('/api/conversas/resumo')) return 'conversas_resumo'
  if (url.includes('/api/conversas') && !url.includes('resumo')) return 'conversas_inbox'
  if (url.includes('/api/comunidade/feed') && !url.includes('stream')) return 'feed_api'
  if (url.includes('/api/portal/navbar-context')) return 'navbar_context'
  if (url.includes('/portal/comunidade') && url.includes('_rsc')) return 'rsc_comunidade'
  return null
}

async function measureNavBack(
  page: Page,
  leaveHref: string,
  leaveLabel: string,
): Promise<Record<string, number | string>> {
  await page.goto('/portal/comunidade')
  await expect(page.locator('.feed-post-window').first()).toBeVisible({ timeout: 45_000 })

  await page.goto(leaveHref)
  await page.waitForLoadState('domcontentloaded')

  const counts: Record<string, number> = {
    conversas_resumo: 0,
    conversas_inbox: 0,
    feed_api: 0,
    navbar_context: 0,
    rsc_comunidade: 0,
  }

  const onRequest = (req: Request) => {
    const key = classifyRequest(req.url())
    if (key) counts[key] = (counts[key] ?? 0) + 1
  }
  page.on('request', onRequest)

  const t0 = Date.now()
  await page.goto('/portal/comunidade')
  await expect(page.locator('.feed-post-window').first()).toBeVisible({ timeout: 45_000 })
  const firstPostMs = Date.now() - t0

  // Deixa requests tardios (resumo/SSE) assentar um pouco.
  await page.waitForTimeout(800)
  page.off('request', onRequest)

  return {
    leave: leaveLabel,
    firstPostMs,
    ...counts,
  }
}

test('medir nav-back Buscar e Classificação → Feed', async ({ page }) => {
  await login(page)

  const busca = await measureNavBack(page, '/portal/comunidade/busca', 'busca')
  const classificacao = await measureNavBack(
    page,
    '/portal/comunidade/classificacao',
    'classificacao',
  )

  const report = {
    at: new Date().toISOString(),
    note:
      'firstPostMs = clique/goto Feed até 1º .feed-post-window. Cache quente: TanStack + rail de chat no layout.',
    busca,
    classificacao,
  }

  // eslint-disable-next-line no-console
  console.log('\n[feed-nav-back]\n' + JSON.stringify(report, null, 2) + '\n')

  expect(Number(busca.firstPostMs)).toBeLessThan(20_000)
  expect(Number(classificacao.firstPostMs)).toBeLessThan(20_000)
})
