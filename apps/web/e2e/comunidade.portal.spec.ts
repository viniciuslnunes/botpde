import { test } from '@playwright/test'
import { snapshot } from './snapshot'

test('feed da comunidade + composer', async ({ page }) => {
  await page.goto('/portal/comunidade')
  await snapshot(page, 'comunidade', '01-feed')

  const composer = page.getByRole('textbox').first()
  await composer.click()
  await snapshot(page, 'comunidade', '02-composer-expandido')
})

test('salas ao vivo (lobby)', async ({ page }) => {
  await page.goto('/portal/comunidade/salas')
  await snapshot(page, 'salas', '01-lobby')
})
