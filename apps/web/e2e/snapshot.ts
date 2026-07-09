import path from 'node:path'
import type { Page } from '@playwright/test'

const OUT_DIR = path.join(__dirname, 'screenshots')

/**
 * Nome de arquivo estável (sem hash de execução) para que o diretório possa
 * ser lido/zipado e enviado direto a uma sessão de Claude Code.
 */
export async function snapshot(page: Page, fluxo: string, etapa: string) {
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: path.join(OUT_DIR, fluxo, `${etapa}.png`),
    fullPage: true,
  })
}
