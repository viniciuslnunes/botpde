import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O Bar é da **unidade física** — sede, subsede ou PDE. Ele não existe na
 * Comunidade Nacional (tenant sintético, sem balcão nem caixa) nem em canal
 * temático/público.
 *
 * Estes testes existem porque a primeira versão errou: o link era anexado
 * **depois** dos filtros de escopo, então escapava de `LINKS_SOMENTE_TORCIDA`
 * e de `LINKS_REATIVOS_CANAL` e aparecia na CN. Ler a fonte é grosseiro, mas é
 * o padrão do repo para invariante estrutural em `.tsx` (ver
 * `admin-modulos.test.ts`), e o custo de errar aqui é uma porta para uma sala
 * que não existe.
 */
const NAVBAR = join(process.cwd(), 'src', 'components', 'portal', 'navbar.tsx')
const fonte = readFileSync(NAVBAR, 'utf8')

/** Corpo do `new Set([...])` atribuído a `nome`. */
function conjunto(nome: string): string {
  const m = fonte.match(new RegExp(`const ${nome} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))
  expect(m, `conjunto ${nome} não encontrado na navbar`).not.toBeNull()
  return m![1]!
}

describe('Bar na navbar — escopo', () => {
  it('some no escopo nacional e em canal temático', () => {
    expect(conjunto('LINKS_REATIVOS_CANAL')).toContain('/portal/bar')
  })

  it('some para o torcedor global sem vínculo de torcida', () => {
    expect(conjunto('LINKS_SOMENTE_TORCIDA')).toContain('/portal/bar')
  })

  it('entra na lista ANTES dos filtros de escopo', () => {
    // A ordem é a correção: `navLinksComBar` alimenta `baseLinks`, que é quem
    // aplica os filtros. Anexar depois faz o link escapar de todos eles.
    const posComBar = fonte.indexOf('const navLinksComBar')
    const posBase = fonte.indexOf('const baseLinks')
    expect(posComBar).toBeGreaterThan(-1)
    expect(posBase).toBeGreaterThan(posComBar)
    expect(fonte).toMatch(/const baseLinks[\s\S]{0,160}navLinksComBar/)
  })

  it('não é anexado depois de baseLinks', () => {
    // Guarda contra a regressão exata: `[...baseLinks, barLink]`.
    expect(fonte).not.toMatch(/\.\.\.baseLinks,\s*(\{[^}]*\/portal\/bar|barLink)/)
  })
})
