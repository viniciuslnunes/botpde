/**
 * Auditoria mobile: visita rotas chave em 390×844, detecta overflow
 * horizontal e salva screenshots em e2e/screenshots/mobile-audit/.
 *
 * pnpm --filter @torcida/web exec playwright test e2e/mobile-audit.measure.ts --project=measure
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

const OUT = path.join(__dirname, 'screenshots', 'mobile-audit')
const AUTH = path.join(__dirname, '.auth', 'user.json')

const ROTAS = [
  { nome: '01-comunidade', path: '/portal/comunidade' },
  { nome: '02-busca', path: '/portal/comunidade/busca' },
  { nome: '03-loja', path: '/portal/loja' },
  { nome: '04-eventos', path: '/portal/eventos' },
  { nome: '05-carteirinha', path: '/portal/carteirinha' },
  { nome: '06-sedes', path: '/portal/sedes' },
  { nome: '07-mensagens', path: '/portal/mensagens' },
  { nome: '08-perfil', path: '/portal/perfil' },
  { nome: '09-departamentos', path: '/portal/departamentos' },
  { nome: '10-admin', path: '/admin' },
  { nome: '11-admin-membros', path: '/admin/membros' },
  { nome: '12-admin-financeiro', path: '/admin/financeiro' },
  { nome: '13-admin-eventos', path: '/admin/eventos' },
  { nome: '14-admin-bar-pdv', path: '/admin/bar/pdv' },
  { nome: '15-entrar', path: '/entrar' },
] as const

async function medirOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const pageOverflow = Math.max(doc.scrollWidth, body.scrollWidth) - doc.clientWidth

    const offenders: Array<{
      tag: string
      cls: string
      w: number
      sw: number
      overflow: number
    }> = []

    const nodes = document.querySelectorAll('body *')
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const overflow = el.scrollWidth - el.clientWidth
      // Só elementos que estouram a viewport (não overflow-x intencional interno)
      if (rect.right > window.innerWidth + 2 || rect.left < -2) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString?.() ?? '').slice(0, 120),
          w: Math.round(rect.width),
          sw: el.scrollWidth,
          overflow: Math.round(Math.max(rect.right - window.innerWidth, -rect.left)),
        })
      } else if (overflow > 8 && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
        const parentScroll =
          style.overflowX === 'hidden' ||
          el.closest('[class*="overflow-x-auto"], [class*="overflow-x-scroll"], .app-scrollbar-none')
        if (!parentScroll && rect.right > window.innerWidth - 4) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.toString?.() ?? '').slice(0, 120),
            w: Math.round(rect.width),
            sw: el.scrollWidth,
            overflow,
          })
        }
      }
    }

    offenders.sort((a, b) => b.overflow - a.overflow)
    return {
      pageOverflow,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      offenders: offenders.slice(0, 12),
    }
  })
}

test.use({
  viewport: { width: 390, height: 844 },
  storageState: fs.existsSync(AUTH) ? AUTH : undefined,
})

test('mobile audit screenshots + overflow', async ({ page }) => {
  test.setTimeout(180_000)
  fs.mkdirSync(OUT, { recursive: true })
  const report: Array<{
    nome: string
    path: string
    status: number
    pageOverflow: number
    offenders: unknown[]
  }> = []

  for (const rota of ROTAS) {
    const res = await page.goto(rota.path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(800)
    const shot = path.join(OUT, `${rota.nome}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    const metrics = await medirOverflow(page)
    report.push({
      nome: rota.nome,
      path: rota.path,
      status: res?.status() ?? 0,
      pageOverflow: metrics.pageOverflow,
      offenders: metrics.offenders,
    })
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        rota: rota.nome,
        status: res?.status(),
        pageOverflow: metrics.pageOverflow,
        top: metrics.offenders.slice(0, 5),
      }),
    )
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  const broken = report.filter((r) => r.pageOverflow > 2)
  // Não falha o teste — o relatório guia os fixes. Só asserta que rodou.
  expect(report.length).toBe(ROTAS.length)
  // eslint-disable-next-line no-console
  console.log(`Overflow pages: ${broken.map((b) => b.nome).join(', ') || 'none'}`)
})
