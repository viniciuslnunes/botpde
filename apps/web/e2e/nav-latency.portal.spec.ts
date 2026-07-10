import { test, expect } from '@playwright/test'

/**
 * Benchmark de navegação portal — mede tempo até skeleton/conteúdo.
 * Baseline Fase 3 documentado no plano Navegação Instantânea.
 *
 * Rodar em prod:
 *   PLAYWRIGHT_BASE_URL=https://torcidaweb-production.up.railway.app pnpm --filter @torcida/web test:e2e e2e/nav-latency.portal.spec.ts
 */

const ROUTES = [
  { label: 'Comunidade', href: '/portal/comunidade', heading: /Comunidade|Feed da comunidade/i },
  { label: 'Eventos', href: '/portal/eventos', heading: /Eventos/i },
  { label: 'Sedes', href: '/portal/sedes', heading: /Sedes/i },
  { label: 'Loja', href: '/portal/loja', heading: /Loja oficial/i },
  { label: 'Mensagens', href: '/portal/mensagens', heading: /Mensagens/i },
] as const

test.describe('Navegação portal — latência percebida', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portal/comunidade', { waitUntil: 'domcontentloaded' })
  })

  for (const route of ROUTES) {
    test(`${route.label}: feedback visual em <500ms`, async ({ page }) => {
      const start = Date.now()

      await page.getByRole('link', { name: new RegExp(route.label, 'i') }).first().click()

      await page.waitForURL(`**${route.href}**`, { timeout: 5000 })
      const urlMs = Date.now() - start

      // Skeleton (animate-pulse) ou heading da página
      const visual = page.locator('.animate-pulse').first().or(page.getByRole('heading', { name: route.heading }).first())
      await expect(visual).toBeVisible({ timeout: 500 })

      const visualMs = Date.now() - start

      console.log(`[nav-benchmark] ${route.label}: url=${urlMs}ms visual=${visualMs}ms`)

      expect(urlMs).toBeLessThan(500)
      expect(visualMs).toBeLessThan(500)
    })
  }

  test('Comunidade: conteúdo útil em <3s', async ({ page }) => {
    await page.getByRole('link', { name: /Comunidade/i }).first().click()
    await page.waitForURL('**/portal/comunidade**')

    const start = Date.now()
    const feed = page.getByRole('heading', { name: /Feed da comunidade/i })
    await expect(feed).toBeVisible({ timeout: 3000 })
    console.log(`[nav-benchmark] Comunidade conteúdo: ${Date.now() - start}ms`)
  })

  test('Mensagens: shell em <1s após navegação', async ({ page }) => {
    const start = Date.now()
    await page.getByRole('link', { name: /Mensagens/i }).first().click()
    await page.waitForURL('**/portal/mensagens**')
    await expect(page.getByRole('heading', { name: /Mensagens/i })).toBeVisible({ timeout: 1000 })
    console.log(`[nav-benchmark] Mensagens shell: ${Date.now() - start}ms`)
  })
})
