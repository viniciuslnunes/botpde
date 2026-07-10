import { test } from '@playwright/test'
import { snapshot } from './snapshot'

test('home do associado (comunidade)', async ({ page }) => {
  await page.goto('/portal/comunidade')
  await snapshot(page, 'portal-home', '01-comunidade')
})
