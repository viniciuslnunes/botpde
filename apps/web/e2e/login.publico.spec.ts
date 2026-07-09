import { test } from '@playwright/test'
import { snapshot } from './snapshot'

test('home institucional', async ({ page }) => {
  await page.goto('/')
  await snapshot(page, 'home-institucional', '01-pagina')
})

test('tela de entrada (login)', async ({ page }) => {
  await page.goto('/entrar')
  await snapshot(page, 'login', '01-opcoes-de-entrada')
})

test('criar conta com e-mail', async ({ page }) => {
  await page.goto('/entrar/criar-conta')
  await snapshot(page, 'login', '02-criar-conta')
})
