/**
 * Auditoria de responsividade mobile-first (2026-08-27).
 *
 * Complementa `mobile-audit.measure.ts` (que só mede estouro horizontal em 25
 * rotas) cobrindo as rotas do trabalho recente e medindo tres classes de
 * defeito que quebram o app em telefone:
 *
 *  1. overflow — elemento empurra a pagina alem da viewport
 *  2. clip     — conteudo cortado por ancestral `overflow-x: hidden`
 *  3. alvo     — controle interativo abaixo do minimo de toque (44x44)
 *
 * NAO mede safe-area: em Chrome headless env(safe-area-inset-bottom) resolve
 * para 0, entao a utilidade com max(folga, env(safe-area-inset-bottom)) e o
 * padding fixo `p-3` computam valores indistinguiveis. Esse achado e
 * verificado estaticamente — ver `scripts/lint-mobile.mjs`.
 *
 *   npx playwright test e2e/responsivo.measure.ts --project=measure
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'

const OUT = path.join(__dirname, 'screenshots', 'responsivo')
const AUTH = path.join(__dirname, '.auth', 'user.json')
/**
 * Retrato de telefone (o alvo), tablet (o app vai pra iPad) e **paisagem**.
 * Paisagem nao e capricho: 390x844 deitado vira 844x390, e viewport baixa e
 * exatamente o que o teclado virtual produz. Como o Playwright nao emula
 * teclado de iOS, paisagem e o proxy testavel do layout espremido na vertical.
 */
const VIEWPORTS = [
  { nome: '320', w: 320, h: 844 },
  { nome: '390', w: 390, h: 844 },
  { nome: '430', w: 430, h: 932 },
  { nome: '768-tablet', w: 768, h: 1024 },
  { nome: '844-paisagem', w: 844, h: 390 },
]

const ROTAS = [
  '/portal/departamentos',
  '/portal/patrimonio',
  '/portal/loja',
  '/portal/loja/sacola',
  '/portal/loja/checkout',
  '/portal/comunidade/notificacoes',
  '/portal/eventos',
  '/portal/memoria',
  '/portal/perfil',
  '/admin/departamentos',
  '/admin/departamentos/areas',
  '/admin/departamentos/equipes',
  '/admin/departamentos/projetos',
  '/admin/bandeiras',
  '/admin/bateria',
  '/admin/patrimonio',
  '/admin/socios',
  '/admin/membros',
  '/admin/torcedores',
  '/admin/aliancas',
  '/admin/notificacoes',
  '/admin/social',
  '/admin/configuracoes',
  '/admin/acessos',
  '/admin/relatorios',
  '/admin/financeiro',
  '/admin/eventos',
  '/admin/loja',
  '/admin/presidencia',
]

const SEL_ALVO =
  'a[href], button, [role="button"], [role="tab"], [role="switch"], select, summary, input[type="checkbox"], input[type="radio"]'

async function medir(page: Page, selAlvo: string) {
  return page.evaluate((SEL) => {
    const vw = window.innerWidth
    const doc = document.documentElement
    const pageOverflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth

    const achados: Array<{ tipo: string; tag: string; cls: string; detalhe: string }> = []
    const vistos = new Set<string>()
    const rotulo = (el: Element) => (el.className?.toString?.() ?? '').slice(0, 110)
    const push = (tipo: string, el: Element, detalhe: string) => {
      const chave = `${tipo}|${el.tagName}|${rotulo(el)}`
      if (vistos.has(chave)) return
      vistos.add(chave)
      achados.push({ tipo, tag: el.tagName.toLowerCase(), cls: rotulo(el), detalhe })
    }

    /** Elemento dentro de um scroller horizontal intencional nao e defeito:
     *  a aba fora de vista tem `right > vw` por projeto, nao por bug. */
    function dentroDeScrollerX(el: Element): boolean {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
        p = p.parentElement
      }
      return false
    }

    /** Ancestral que contem o estouro — ele nao chega a empurrar a pagina. */
    function contido(el: Element): boolean {
      let p = el.parentElement
      while (p && p !== document.body) {
        const st = getComputedStyle(p)
        if (st.overflowX === 'hidden' || st.overflowX === 'clip') return true
        if (st.position === 'fixed' && p.getBoundingClientRect().right <= vw + 2) return true
        p = p.parentElement
      }
      return false
    }

    const visivel = (st: CSSStyleDeclaration) =>
      st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0'

    /** `sr-only` e uma caixa de 1x1 recortada: existe pro leitor de tela e
     *  some pro olho. Reportar "corta 197px" nela e ruido puro. */
    const ehSrOnly = (el: Element) => /(^|\s|:)sr-only(\s|$)/.test(el.className.toString())

    /** Estouro filtrado pelos guardas. Se a pagina estoura e NADA passou nos
     *  filtros, o relatorio ficaria com "overflow: 20" e zero pistas — pior
     *  que ruido. Nesse caso os suspeitos entram como fallback. */
    const suspeitos: Array<{ el: Element; detalhe: string }> = []

    for (const el of document.querySelectorAll('body *')) {
      if (!(el instanceof HTMLElement)) continue
      const st = getComputedStyle(el)
      if (!visivel(st)) continue
      if (ehSrOnly(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue

      // 1. estouro — so quando a PAGINA de fato estoura, e so para o elemento
      //    que e a causa (nao contido, nao scroller intencional)
      if (pageOverflow > 2 && r.right > vw + 2) {
        if (!dentroDeScrollerX(el) && !contido(el)) {
          push('overflow', el, `right=${Math.round(r.right)} vw=${vw} w=${Math.round(r.width)}`)
        } else {
          suspeitos.push({
            el,
            detalhe: `right=${Math.round(r.right)} vw=${vw} w=${Math.round(r.width)}`,
          })
        }
      }

      // 2. corte por overflow-x hidden, quando nao e elipse/clamp intencional
      if (
        (st.overflowX === 'hidden' || st.overflowX === 'clip') &&
        el.scrollWidth - el.clientWidth > 4
      ) {
        // `.skeleton-sweep` recorta de proposito: o ::after da varredura vive
        // em `translate3d(±105%)`, o que dobra o scrollWidth, e o
        // `overflow: hidden` do cartao e justamente o que contem a animacao.
        // Sem esta excecao a auditoria acusa "corta 399px" em toda tela que
        // for capturada em estado de carregamento.
        const intencional =
          st.textOverflow === 'ellipsis' ||
          el.className.toString().includes('line-clamp') ||
          el.className.toString().includes('skeleton-sweep')
        if (!intencional) {
          push(
            'clip',
            el,
            `corta ${el.scrollWidth - el.clientWidth}px (scrollW=${el.scrollWidth} clientW=${el.clientWidth})`,
          )
        }
      }
    }

    // Fallback de atribuicao: pagina estourou e nenhum elemento passou nos
    // guardas — reporta os mais largos para a investigacao ter por onde comecar.
    if (pageOverflow > 2 && !achados.some((a) => a.tipo === 'overflow')) {
      for (const s of suspeitos.slice(0, 6)) push('overflow-suspeito', s.el, s.detalhe)
    }

    // 4. campo que abre teclado com fonte < 16px: o iOS amplia a pagina ao
    //    focar e nao desfaz o zoom. Inclui `contenteditable`, que a regra CSS
    //    de piso nao alcanca por nao ser um controle de formulario.
    const SEL_CAMPO =
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="hidden"]), select, textarea, [contenteditable="true"]'
    for (const el of document.querySelectorAll(SEL_CAMPO)) {
      if (!(el instanceof HTMLElement)) continue
      const st = getComputedStyle(el)
      if (!visivel(st)) continue
      const fs = parseFloat(st.fontSize)
      if (fs < 16)
        push('zoom-ios', el, `font-size=${fs}px (< 16px) em <${el.tagName.toLowerCase()}>`)
    }

    // 3. alvos de toque. Se o elemento esta dentro de outro alvo, quem vale e
    //    o de fora (link envolvendo icone).
    for (const el of document.querySelectorAll(SEL)) {
      if (!(el instanceof HTMLElement)) continue
      const st = getComputedStyle(el)
      if (!visivel(st)) continue
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue
      if (el.tagName === 'A' && st.display === 'inline') continue
      if (el.parentElement?.closest(SEL)) continue
      // `.app-touch-line` amplia a area de toque por ::after de 44px. O
      // getBoundingClientRect() do elemento nao enxerga o pseudo-elemento,
      // entao sem esta linha a auditoria reprova justamente o que ja foi
      // corrigido.
      if (el.className.toString().includes('app-touch-line')) continue
      // Caixa de marcacao com rotulo associado: o alvo e o rotulo, nao a
      // caixa de 24px (WCAG 2.5.8 conta o rotulo como parte do alvo).
      if (
        (el.getAttribute('type') === 'checkbox' || el.getAttribute('type') === 'radio') &&
        (el.closest('label') ??
          (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)))
      ) {
        continue
      }
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // `sr-only` e visivel para o leitor de tela e some para o mouse via
      // caixa de 1x1 recortada — nao e alvo de toque, e falso positivo.
      if (el.className.toString().includes('sr-only') || (r.width <= 2 && r.height <= 2)) continue
      if (r.height < 44 || r.width < 44) {
        const texto = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28)
        push('alvo', el, `${Math.round(r.width)}x${Math.round(r.height)} "${texto}"`)
      }
    }

    // `totalElementos` distingue "rota sem defeito" de "rota que nao renderizou"
    // — sem isso um dev server travado vira um relatorio limpo e mentiroso.
    return {
      pageOverflow,
      vw,
      achados,
      totalElementos: document.querySelectorAll('body *').length,
    }
  }, selAlvo)
}

/**
 * `hasTouch`/`isMobile` nao sao cosmeticos: eles fazem o Chrome casar
 * `@media (pointer: coarse)`. Sem isso a auditoria mede a versao "mouse" do
 * layout mobile — `.app-action` reportaria 40px em vez dos 44px que a regra
 * coarse aplica, e o piso de 16px nos campos (que evita o zoom do iOS) nem
 * entraria em vigor. O resultado seria uma lista de falsos defeitos.
 */
test.use({
  storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  hasTouch: true,
  isMobile: true,
})

test('auditoria de responsividade', async ({ page }) => {
  test.setTimeout(2_400_000)
  fs.mkdirSync(OUT, { recursive: true })
  const relatorio: unknown[] = []

  // Rotas dinamicas: e onde o dado REAL (nome de membro, titulo de evento)
  // define a largura e estoura o layout — o modo de falha numero 1 da §5.20.
  //
  // Os ids vem do BANCO (`scripts/rotas-dinamicas.mjs`), nao de varredura da
  // UI. Varrer a listagem atras de `<a href>` para o detalhe achava quase
  // nada, e a causa nao era falta de dado semeado — era a premissa: canal abre
  // com `<button>` + `router.push` (`AbrirCanalNaBarraLink`), `/portal/sedes`
  // e master-detail na propria pagina (nada aponta para `/portal/sedes/[id]`),
  // e `/admin/torcedores/[id]` so e linkado de dentro de um modal.
  const rotas = [...ROTAS]
  const ARQ_DINAMICAS = path.join(__dirname, '.rotas-dinamicas.json')
  if (fs.existsSync(ARQ_DINAMICAS)) {
    const extras: string[] = JSON.parse(fs.readFileSync(ARQ_DINAMICAS, 'utf-8'))
    for (const r of extras) if (!rotas.includes(r)) rotas.push(r)
    console.log(`Rotas dinamicas (do banco): ${rotas.length - ROTAS.length}`)
    for (const r of rotas.slice(ROTAS.length)) console.log(`  + ${r}`)
  } else {
    console.log('AVISO: e2e/.rotas-dinamicas.json ausente — rode rotas:dinamicas antes.')
  }

  // Ordem rota-major: o Turbopack compila a rota uma vez e as larguras
  // seguintes reaproveitam. Rota-menor recompilava tudo a cada passe e era o
  // que derrubava o dev server em timeout no meio da auditoria.
  // `try/finally`: o relatorio e o produto da varredura e leva ~8 min para
  // existir. Qualquer erro tardio nao pode levar junto tudo o que ja foi medido.
  try {
    for (const rota of rotas) {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.w, height: vp.h })
        let res
        try {
          res = await page.goto(rota, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        } catch {
          // Uma segunda chance: a primeira visita paga a compilação da rota.
          try {
            res = await page.goto(rota, { waitUntil: 'domcontentloaded', timeout: 90_000 })
          } catch {
            relatorio.push({ largura: vp.nome, rota, erro: 'timeout' })
            console.log(JSON.stringify({ largura: vp.nome, rota, erro: 'timeout' }))
            continue
          }
        }
        await page.waitForTimeout(1200)
        let m
        try {
          m = await medir(page, SEL_ALVO)
        } catch {
          await page.waitForTimeout(1500)
          try {
            m = await medir(page, SEL_ALVO)
          } catch {
            continue
          }
        }
        const urlFinal = new URL(page.url()).pathname
        if (vp.nome === '390') {
          // Rota com query (`/admin/patrimonio?item=<id>`) vira nome de arquivo
          // invalido no Windows — `?` derruba o screenshot e, com ele, o teste
          // inteiro antes de gravar o relatorio.
          const nome =
            rota
              .replace(/^\//, '')
              .replace(/[/?=&#:*"<>|]/g, '_')
              .slice(0, 120) || 'raiz'
          // Screenshot e ilustracao, nao medicao: falha nele nao pode derrubar a
          // varredura inteira (foi o que aconteceu — 8 min de medicao perdidos
          // porque um `?` de query string virou nome de arquivo invalido).
          await page
            .screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: false })
            .catch(() => {})
        }
        relatorio.push({
          largura: vp.nome,
          rota,
          urlFinal,
          status: res?.status() ?? 0,
          pageOverflow: m.pageOverflow,
          totalElementos: m.totalElementos,
          achados: m.achados,
        })
        const resumo = m.achados.reduce<Record<string, number>>((a, x) => {
          a[x.tipo] = (a[x.tipo] ?? 0) + 1
          return a
        }, {})
        console.log(
          JSON.stringify({
            largura: vp.nome,
            rota,
            redir: urlFinal === rota ? undefined : urlFinal,
            els: m.totalElementos,
            overflow: m.pageOverflow,
            ...resumo,
          }),
        )
      }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(relatorio, null, 2))
    console.log(`\nRelatorio: ${path.join(OUT, 'report.json')} (${relatorio.length} entradas)`)
  }
})

/**
 * Estados ABERTOS: modal, bottom sheet e drawer.
 *
 * A auditoria acima mede a pagina em repouso, entao ela nunca ve justamente
 * onde moram as correcoes de safe-area e de `dvh` — o painel do AppModal. Aqui
 * a gente abre o que da pra abrir e mede dentro.
 *
 * Tambem checa uma invariante que so existe no estado aberto: o painel nao
 * pode ser mais alto que a viewport (senao o rodape de acoes fica inalcancavel
 * — era o defeito do `92vh` em telefone).
 */
const GATILHOS: Array<{ rota: string; nome: string; sel?: string }> = [
  { rota: '/admin/patrimonio', nome: 'patrimonio' },
  { rota: '/admin/socios', nome: 'socios' },
  // `/admin/membros` faz `permanentRedirect` para `/admin/torcedores` — usar a
  // rota antiga so gastava um redirect antes de medir.
  { rota: '/admin/torcedores', nome: 'torcedores' },
  // Aqui "Novo evento" abre um DRAWER (`evento-form-drawer`, `role="dialog"`),
  // nao o disclosure inline que a convencao usa em outros modulos — por isso
  // precisa de gatilho proprio, fora da heuristica de "Editar".
  { rota: '/admin/eventos', nome: 'eventos', sel: 'main button:has-text("Novo evento")' },
  { rota: '/admin/bandeiras', nome: 'bandeiras' },
]

/**
 * "Novo item" NAO serve de gatilho: por convencao do repo o formulario de
 * criar e um disclosure inline (`AdminCreateDisclosure`), nao um modal. Quem
 * abre `[role="dialog"]` de verdade e a acao do item — "Editar", "Detalhes".
 */
const RE_ABRIR = /^(editar|detalh|abrir|ver detalhes|gerenciar|configurar)\b/i

test('auditoria de responsividade — estados abertos', async ({ page }) => {
  test.setTimeout(1_200_000)
  const relatorio: unknown[] = []

  for (const vp of [
    { nome: '390', w: 390, h: 844 },
    { nome: '844-paisagem', w: 844, h: 390 },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h })
    for (const g of GATILHOS) {
      try {
        await page.goto(g.rota, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      } catch {
        // Registra: silenciar aqui foi o que fez 4 gatilhos sumirem do
        // relatorio, e ausencia parecia sucesso.
        relatorio.push({ vp: vp.nome, gatilho: g.nome, estado: 'timeout-navegacao' })
        console.log(JSON.stringify({ vp: vp.nome, gatilho: g.nome, estado: 'timeout-navegacao' }))
        continue
      }
      // A lista precisa ter renderizado ANTES de procurar o gatilho: com
      // 1500ms so o chrome existia, `button:visible` nao continha "Editar" e
      // o teste concluia "nao abriu" sem nunca ter tentado.
      await page
        .locator('main button:visible')
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => {})
      await page.waitForTimeout(1500)

      const dialogVisivel = () =>
        page
          .locator('[role="dialog"]')
          .first()
          .isVisible()
          .catch(() => false)

      // Gatilho declarado para a rota tem prioridade sobre a heuristica.
      let abriuPorSel = false
      if (g.sel) {
        const alvo = page.locator(g.sel).first()
        if (await alvo.isVisible().catch(() => false)) {
          await alvo.click({ timeout: 8_000 }).catch(() => {})
          await page.waitForTimeout(1800)
          abriuPorSel = await dialogVisivel()
        }
      }

      // Gatilho por BOTAO, em ordem de probabilidade.
      const CANDIDATOS = [
        'button[aria-label^="Editar"]',
        'button[aria-label^="Detalh"]',
        'main button:has-text("Editar")',
        'main button:has-text("Detalhes")',
        'main button:has-text("Gerenciar")',
      ]
      let abriu = abriuPorSel
      for (const sel of CANDIDATOS) {
        const alvo = page.locator(sel).first()
        if (!(await alvo.isVisible().catch(() => false))) continue
        const rotulo = ((await alvo.textContent().catch(() => '')) ?? '').trim()
        const aria = (await alvo.getAttribute('aria-label').catch(() => null)) ?? ''
        if (!RE_ABRIR.test(rotulo) && !RE_ABRIR.test(aria)) continue
        await alvo.click({ timeout: 8_000 }).catch(() => {})
        await page.waitForTimeout(1800)
        if (await dialogVisivel()) {
          abriu = true
          break
        }
      }

      // Gatilho por LINHA/CARD clicavel. Membros e socios abrem o
      // `MembroDetalheModal` no `onClick` do proprio `<tr>` — nao existe botao
      // "Editar" para achar, e era por isso que esses gatilhos apareciam como
      // "nao abriu" mesmo com o modal funcionando.
      if (!abriu) {
        const CLICAVEIS = [
          'tbody tr.cursor-pointer',
          'tbody tr[class*="cursor-pointer"]',
          'main li[class*="cursor-pointer"]',
          'main [role="row"][class*="cursor-pointer"]',
        ]
        for (const sel of CLICAVEIS) {
          const alvo = page.locator(sel).first()
          if (!(await alvo.isVisible().catch(() => false))) continue
          await alvo.click({ timeout: 8_000 }).catch(() => {})
          await page.waitForTimeout(1800)
          if (await dialogVisivel()) {
            abriu = true
            break
          }
        }
      }
      if (!abriu) {
        relatorio.push({ vp: vp.nome, gatilho: g.nome, estado: 'nao-abriu' })
        console.log(JSON.stringify({ vp: vp.nome, gatilho: g.nome, estado: 'nao-abriu' }))
        continue
      }

      const m = await medir(page, SEL_ALVO)
      const painel = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]')
        if (!d) return null
        const r = d.getBoundingClientRect()
        return {
          altura: Math.round(r.height),
          vh: window.innerHeight,
          // Rodape inalcancavel: o painel passa da borda de baixo da tela.
          estouraAltura: Math.round(r.bottom - window.innerHeight),
          // Informativo, NAO verificacao: sem notch `env(safe-area-inset-bottom)`
          // vale 0, entao 0px aqui e o esperado e nao diz nada sobre o iPhone.
          // Quem verifica safe-area e `scripts/lint-mobile.mjs`.
          paddingBottom: getComputedStyle(d).paddingBottom,
        }
      })
      await page.screenshot({
        path: path.join(OUT, `aberto-${g.nome}-${vp.nome}.png`),
        fullPage: false,
      })
      relatorio.push({ vp: vp.nome, gatilho: g.nome, painel, achados: m.achados })
      const resumo = m.achados.reduce<Record<string, number>>((a, x) => {
        a[x.tipo] = (a[x.tipo] ?? 0) + 1
        return a
      }, {})
      console.log(JSON.stringify({ vp: vp.nome, gatilho: g.nome, ...painel, ...resumo }))
    }
  }

  fs.writeFileSync(path.join(OUT, 'report-abertos.json'), JSON.stringify(relatorio, null, 2))
})
