import { test, expect } from '@playwright/test'

test('debug notification bell opacity after click', async ({ page }) => {
  await page.goto('/portal/comunidade', { waitUntil: 'domcontentloaded' })

  const bell = page.locator('button[aria-label="Notificações"]')
  await expect(bell).toBeVisible({ timeout: 20000 })

  await bell.click()
  const menu = page.getByRole('menu')
  await expect(menu).toHaveCount(1)

  for (const wait of [0, 100, 300, 800, 2000]) {
    if (wait > 0) await page.waitForTimeout(wait - (wait === 100 ? 0 : 100))
    const style = await menu.evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return { opacity: cs.opacity, transform: cs.transform, inline: (el as HTMLElement).getAttribute('style') }
    })
    console.log(`AT_${wait}ms`, JSON.stringify(style))
  }

  // Segundo clique: fecha e reabre para ver se persiste
  await bell.click()
  await page.waitForTimeout(400)
  await bell.click()
  await page.waitForTimeout(600)
  const style2 = await menu.evaluate((el) => {
    const cs = window.getComputedStyle(el)
    return { opacity: cs.opacity, transform: cs.transform }
  })
  console.log('AFTER_REOPEN', JSON.stringify(style2))
})
