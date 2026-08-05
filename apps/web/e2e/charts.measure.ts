/**
 * Mede gráficos admin no mobile (390×844): overflow da página e colunas do
 * MiniBarChart (largura mínima, texto vazando, rótulo cortado por truncate).
 *
 * pnpm --filter @torcida/web exec playwright test e2e/charts.measure.ts --project=measure
 *
 * Precisa do dev server e de `--project=setup` para renovar `e2e/.auth`.
 * O relatório guia fixes; overflow > 2px falha o teste.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const AUTH = path.join(__dirname, '.auth', 'user.json')
const OUT = path.join(__dirname, 'screenshots', 'charts')

const ROTAS = [
  { nome: 'admin-relatorios', path: '/admin/relatorios' },
  { nome: 'admin-financeiro-evolucao', path: '/admin/financeiro/evolucao' },
  { nome: 'admin-financeiro-cobrancas', path: '/admin/financeiro/cobrancas' },
  { nome: 'admin-comunidade', path: '/admin/comunidade' },
  { nome: 'admin-eventos', path: '/admin/eventos?vista=comparecimento' },
  { nome: 'admin-departamentos', path: '/admin/departamentos' },
  { nome: 'admin-loja-desempenho', path: '/admin/loja/desempenho' },
  { nome: 'admin-bar-desempenho', path: '/admin/bar/desempenho' },
] as const

async function medirOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const pageOverflow = Math.max(0, doc.scrollWidth - doc.clientWidth)
    return { pageOverflow }
  })
}

async function medirBarras(page: Page) {
  return page.evaluate(() => {
    const out: Array<{
      label: string
      larguraGrafico: number
      colunas: number
      colMin: number
      colMax: number
      textoVazando: number
      rotuloCortado: number
    }> = []
    for (const g of Array.from(document.querySelectorAll('[role="img"]'))) {
      const rot = g.getAttribute('aria-label') ?? ''
      if (!rot.includes('Gráfico de barras')) continue
      if (!(g instanceof HTMLElement)) continue
      const r = g.getBoundingClientRect()
      const colunas = Array.from(g.children) as HTMLElement[]
      if (colunas.length === 0) continue
      const larguras = colunas.map((c) => Math.round(c.getBoundingClientRect().width))
      let vazando = 0
      let rotuloCortado = 0
      for (const c of colunas) {
        const cw = c.getBoundingClientRect().width
        for (const span of Array.from(c.querySelectorAll('span'))) {
          if (span.getBoundingClientRect().width > cw + 1) vazando++
          const st = getComputedStyle(span)
          if (st.textOverflow === 'ellipsis' && span.scrollWidth > span.clientWidth + 1) {
            rotuloCortado++
          }
        }
      }
      out.push({
        label: rot,
        larguraGrafico: Math.round(r.width),
        colunas: colunas.length,
        colMin: Math.min(...larguras),
        colMax: Math.max(...larguras),
        textoVazando: vazando,
        rotuloCortado,
      })
    }
    return out
  })
}

test.use({
  viewport: { width: 390, height: 844 },
  storageState: fs.existsSync(AUTH) ? AUTH : undefined,
})

test('charts no mobile — overflow e colunas', async ({ page }) => {
  test.setTimeout(600_000)
  fs.mkdirSync(OUT, { recursive: true })

  const report: Array<{
    nome: string
    path: string
    status: number
    pageOverflow: number
    barras: Awaited<ReturnType<typeof medirBarras>>
  }> = []

  for (const rota of ROTAS) {
    let res
    try {
      res = await page.goto(rota.path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(1800)
    } catch {
      continue
    }

    let pageOverflow = 0
    let barras: Awaited<ReturnType<typeof medirBarras>> = []
    try {
      ;({ pageOverflow } = await medirOverflow(page))
      barras = await medirBarras(page)
    } catch {
      await page.waitForTimeout(1500)
      ;({ pageOverflow } = await medirOverflow(page))
      barras = await medirBarras(page)
    }

    if (barras.length > 0) {
      await page.screenshot({
        path: path.join(OUT, `${rota.nome}.png`),
        fullPage: true,
      })
    }

    report.push({
      nome: rota.nome,
      path: rota.path,
      status: res?.status() ?? 0,
      pageOverflow,
      barras,
    })

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        rota: rota.nome,
        status: res?.status(),
        pageOverflow,
        barras: barras.map((b) => ({
          colunas: b.colunas,
          colMin: b.colMin,
          textoVazando: b.textoVazando,
        })),
      }),
    )
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))

  const broken = report.filter((r) => r.pageOverflow > 2)
  // eslint-disable-next-line no-console
  console.log(
    `Overflow pages: ${broken.map((b) => `${b.nome}(+${b.pageOverflow})`).join(', ') || 'none'}`,
  )
  expect(broken, `páginas com overflow horizontal: ${broken.map((b) => b.nome).join(', ')}`).toHaveLength(
    0,
  )

  const textoVazando = report.flatMap((r) =>
    r.barras.filter((b) => b.textoVazando > 0).map((b) => `${r.nome}:${b.label}`),
  )
  expect(textoVazando, `texto vazando da coluna: ${textoVazando.join(', ')}`).toHaveLength(0)
})
