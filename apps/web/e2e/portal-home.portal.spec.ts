import { test } from '@playwright/test'
import { snapshot } from './snapshot'

test('home do associado', async ({ page }) => {
  await page.goto('/portal')
  await snapshot(page, 'portal-home', '01-home')
})
