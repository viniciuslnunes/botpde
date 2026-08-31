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
  { label: 'Lojas', href: '/portal/loja', heading: /Lojas/i },
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

  test('Comunidade: chat colapsado não dispara inbox completa', async ({ page }) => {
    const inboxRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/api/conversas') && !url.includes('/resumo')) {
        inboxRequests.push(url)
      }
    })

    await page.goto('/portal/comunidade', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    expect(inboxRequests).toHaveLength(0)
  })

  test('Comunidade: budget de API no mount', async ({ page }) => {
    const feedApiHits: string[] = []
    const resumoHits: string[] = []

    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/api/comunidade/feed')) feedApiHits.push(url)
      if (url.includes('/api/conversas/resumo')) resumoHits.push(url)
    })

    await page.goto('/portal/comunidade', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    console.log(
      `[nav-benchmark] Comunidade mount: feed=${feedApiHits.length} resumo=${resumoHits.length}`,
    )

    // SSR entrega HTML; client não deve disparar tempestade de feed no mount.
    expect(feedApiHits.length).toBeLessThanOrEqual(2)
  })

  test('Mensagens: shell em <1s após navegação', async ({ page }) => {
    const start = Date.now()
    await page.getByRole('link', { name: /Mensagens/i }).first().click()
    await page.waitForURL('**/portal/mensagens**')
    await expect(page.getByRole('heading', { name: /Mensagens/i })).toBeVisible({ timeout: 1000 })
    console.log(`[nav-benchmark] Mensagens shell: ${Date.now() - start}ms`)
  })
})
