import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * O `lint-mobile` é quem garante safe-area e unidade de viewport no CI — e
 * safe-area NÃO é verificável em navegador headless (sem notch,
 * `env(safe-area-inset-bottom)` resolve para 0, então o padding correto fica
 * indistinguível do errado). Ou seja: esse lint é a única rede para o achado.
 *
 * Um lint que nunca dispara é pior que nenhum, porque passa a sensação de
 * cobertura. Aqui ele é exercitado contra fixtures — um arquivo que viola cada
 * regra e um que está correto.
 */

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'lint-mobile.mjs')
let dir: string

function rodar(raiz: string): { saida: string; codigo: number } {
  try {
    const saida = execFileSync(process.execPath, [SCRIPT, '--ci'], {
      env: { ...process.env, LINT_MOBILE_RAIZ: raiz },
      encoding: 'utf-8',
    })
    return { saida, codigo: 0 }
  } catch (e) {
    const err = e as { stdout?: string; status?: number }
    return { saida: err.stdout ?? '', codigo: err.status ?? 1 }
  }
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-mobile-'))
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('lint-mobile — dispara nas violações', () => {
  it('acusa barra fixa de rodapé sem inset inferior', () => {
    const raiz = path.join(dir, 'safe-area')
    fs.mkdirSync(raiz, { recursive: true })
    fs.writeFileSync(
      path.join(raiz, 'barra.tsx'),
      `export const A = () => (\n  <div className="fixed inset-x-0 bottom-0 z-40 border-t p-3">CTA</div>\n)\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(saida).toContain('[safe-area]')
    expect(codigo).toBe(1)
  })

  it('acusa altura de viewport em vh fora de breakpoint desktop', () => {
    const raiz = path.join(dir, 'viewport')
    fs.mkdirSync(raiz, { recursive: true })
    fs.writeFileSync(
      path.join(raiz, 'shell.tsx'),
      `export const A = () => <div className="flex h-screen flex-col" />\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(saida).toContain('[viewport]')
    expect(codigo).toBe(1)
  })

  it('acusa barra de tela cheia sem recorte lateral', () => {
    const raiz = path.join(dir, 'inset-lateral')
    fs.mkdirSync(raiz, { recursive: true })
    fs.writeFileSync(
      path.join(raiz, 'dock.tsx'),
      `export const A = () => (\n  <div className="fixed inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" />\n)\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(saida).toContain('[inset-lateral]')
    expect(codigo).toBe(1)
  })
})

describe('lint-mobile — schema do Prisma', () => {
  // Um comentário `///` que contenha a sequência de fechamento de bloco JSDoc
  // encerra o comentário no meio do `index.d.ts` gerado: o resto do arquivo
  // vira código e o `tsc` quebra a dezenas de milhares de linhas da causa.
  // Aconteceu de verdade com um curinga de data num comentário de `fundacao`.
  const FECHA = '*' + '/'

  function comSchema(nome: string, conteudo: string) {
    const raiz = path.join(dir, nome)
    fs.mkdirSync(path.join(raiz, 'apps', 'web', 'src'), { recursive: true })
    fs.mkdirSync(path.join(raiz, 'packages', 'db', 'prisma'), { recursive: true })
    fs.writeFileSync(path.join(raiz, 'apps', 'web', 'src', 'x.tsx'), 'export const A = () => null\n')
    fs.writeFileSync(path.join(raiz, 'packages', 'db', 'prisma', 'schema.prisma'), conteudo)
    return path.join(raiz, 'apps', 'web', 'src')
  }

  it('acusa comentário /// que fecha o bloco JSDoc', () => {
    const raiz = comSchema(
      'schema-ruim',
      `model A {\n  id String @id\n  /// grava "**${FECHA}**${FECHA}2006" e variantes\n  ano Int?\n}\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(saida).toContain('[schema-jsdoc]')
    expect(codigo).toBe(1)
  })

  it('aceita comentário /// comum', () => {
    const raiz = comSchema(
      'schema-ok',
      'model A {\n  id String @id\n  /// Ano extraído da fonte colaborativa.\n  ano Int?\n}\n',
    )
    const { codigo } = rodar(raiz)
    expect(codigo).toBe(0)
  })
})

describe('lint-mobile — não dispara no que está correto', () => {
  it('aceita barra com inset inferior e lateral, e dvh', () => {
    const raiz = path.join(dir, 'ok')
    fs.mkdirSync(raiz, { recursive: true })
    fs.writeFileSync(
      path.join(raiz, 'ok.tsx'),
      `export const A = () => (\n` +
        `  <div className="app-inset-x fixed inset-x-0 bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">\n` +
        `    <div className="flex h-dvh flex-col" />\n` +
        `  </div>\n)\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(saida).toContain('OK')
    expect(codigo).toBe(0)
  })

  it('aceita vh atrás de breakpoint desktop — lá vh e dvh são iguais', () => {
    const raiz = path.join(dir, 'desktop')
    fs.mkdirSync(raiz, { recursive: true })
    fs.writeFileSync(
      path.join(raiz, 'aside.tsx'),
      `export const A = () => <aside className="lg:max-h-[calc(100vh-6rem)]" />\n`,
    )
    const { codigo } = rodar(raiz)
    expect(codigo).toBe(0)
  })

  it('não acusa painel de altura cheia (drawer), cujo inset é do conteúdo', () => {
    const raiz = path.join(dir, 'drawer')
    fs.mkdirSync(raiz, { recursive: true })
    fs.writeFileSync(
      path.join(raiz, 'drawer.tsx'),
      `export const A = () => <div className="fixed inset-x-0 bottom-0 top-14 z-[60] px-4 lg:hidden" />\n`,
    )
    const { codigo } = rodar(raiz)
    expect(codigo).toBe(0)
  })
})
