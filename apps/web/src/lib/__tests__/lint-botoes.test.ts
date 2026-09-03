import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * O `lint-botoes` é a única rede do padrão "botão de ação tem UPPERCASE e
 * ícone à esquerda". A metade da caixa alta é CSS e se cuida sozinha; o ícone
 * depende do significado da ação, então só um lint impede que o próximo botão
 * entre sem ele.
 *
 * O risco aqui não é o lint deixar passar — é ele acusar demais. Aba, chip de
 * seleção, disclosure e card clicável NÃO entram na regra (caixa alta em nome
 * de sócio lê como grito), e um lint barulhento vira `--no-verify`. Por isso
 * metade dos casos abaixo cobre o que ele precisa IGNORAR.
 */

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'lint-botoes.mjs')
let dir: string

function rodar(raiz: string): { saida: string; codigo: number } {
  try {
    const saida = execFileSync(process.execPath, [SCRIPT, '--ci'], {
      env: { ...process.env, LINT_BOTOES_RAIZ: raiz },
      encoding: 'utf-8',
    })
    return { saida, codigo: 0 }
  } catch (e) {
    const err = e as { stdout?: string; status?: number }
    return { saida: err.stdout ?? '', codigo: err.status ?? 1 }
  }
}

/** O lint só olha as áreas migradas — o fixture precisa morar numa delas. */
function escrever(nome: string, conteudo: string): string {
  const raiz = path.join(dir, nome)
  const area = path.join(raiz, 'components', 'admin')
  fs.mkdirSync(area, { recursive: true })
  fs.writeFileSync(path.join(area, 'fixture.tsx'), conteudo)
  return raiz
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-botoes-'))
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('lint-botoes — dispara no que é ação', () => {
  it('acusa botão de ação sem ícone e sugere o do dicionário', () => {
    const raiz = escrever(
      'sem-icone',
      `export const A = () => (\n  <button type="submit" className="rounded-lg px-4 py-2">Excluir</button>\n)\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(codigo).toBe(1)
    expect(saida).toContain('[sem-icone]')
    expect(saida).toContain('icon={Trash2}')
  })

  it('acusa botão que tem ícone mas continua em <button> cru', () => {
    const raiz = escrever(
      'cru',
      `export const A = () => (\n  <button type="submit"><Save className="h-4 w-4" aria-hidden />Salvar</button>\n)\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(codigo).toBe(1)
    expect(saida).toContain('[botao-cru]')
  })

  it('não se engana com a seta de arrow function no lugar do fim da tag', () => {
    // Regressão: `[^>]*>` cortava em `() =>` e lia o handler como rótulo.
    const raiz = escrever(
      'arrow',
      `export const A = () => (\n  <button type="button" onClick={() => salvar(x)} className="px-2">Criar cupom</button>\n)\n`,
    )
    const { saida } = rodar(raiz)
    expect(saida).toContain('"Criar cupom"')
    expect(saida).not.toContain('onClick')
  })
})

describe('lint-botoes — ignora o que não é ação', () => {
  it('aceita AppButton com ícone', () => {
    const raiz = escrever(
      'ok',
      `export const A = () => (\n  <AppButton variant="primary" icon={Plus}>Criar cupom</AppButton>\n)\n`,
    )
    const { saida, codigo } = rodar(raiz)
    expect(codigo).toBe(0)
    expect(saida).toContain('OK')
  })

  it('ignora chip de seleção (className que alterna por estado)', () => {
    const raiz = escrever(
      'chip',
      `export const A = () => (\n  <button type="button" className={[\n    'rounded-lg px-2',\n    ativo ? 'bg-[rgb(var(--primary))]' : 'bg-[rgb(var(--background-subtle))]',\n  ].join(' ')}>Gestor</button>\n)\n`,
    )
    expect(rodar(raiz).codigo).toBe(0)
  })

  it('ignora disclosure com aria-expanded', () => {
    const raiz = escrever(
      'disclosure',
      `export const A = () => (\n  <button type="button" aria-expanded={aberto} className="px-2">Ver permissões</button>\n)\n`,
    )
    expect(rodar(raiz).codigo).toBe(0)
  })

  it('ignora botão de ícone puro (sem rótulo para transformar)', () => {
    const raiz = escrever(
      'icone-puro',
      `export const A = () => (\n  <button type="button" aria-label="Fechar"><X className="h-4 w-4" /></button>\n)\n`,
    )
    expect(rodar(raiz).codigo).toBe(0)
  })

  it('ignora rótulo dinâmico (nome de sócio não vira caixa alta)', () => {
    const raiz = escrever(
      'dinamico',
      `export const A = () => (\n  <button type="button" className="px-2">{membro.nome}</button>\n)\n`,
    )
    expect(rodar(raiz).codigo).toBe(0)
  })

  it('respeita a supressão explícita, nas duas formas que compilam', () => {
    const jsx = escrever(
      'supressao-jsx',
      `export const A = () => (\n  <div>\n    {/* lint-botoes: nao-e-acao — card de laudo */}\n    <button type="button" className="p-3">Reprovado — dados incorretos</button>\n  </div>\n)\n`,
    )
    expect(rodar(jsx).codigo).toBe(0)

    // Dentro de `{cond && (...)}` ou de um ternário, o comentário JSX seria um
    // segundo filho e não compila — ali a forma válida é `//` nos atributos.
    const atributo = escrever(
      'supressao-atributo',
      `export const A = () => (\n  <button\n    // lint-botoes: nao-e-acao — trilho vertical\n    type="button"\n    className="p-3"\n  >Turno</button>\n)\n`,
    )
    expect(rodar(atributo).codigo).toBe(0)
  })

  it('ignora <button> citado dentro de comentário', () => {
    // Regressão real: o JSDoc de `scroll-rail.tsx` explica que "as setas são
    // `<button>` e não podem morar dentro de um `role=tablist`". Não há botão
    // ali, há prosa — o lint acusava a frase como rótulo.
    const raiz = escrever(
      'comentario',
      `/**\n * As setas são \`<button>\` e não podem morar num role="tablist".\n */\nexport const A = () => <div />\n`,
    )
    expect(rodar(raiz).codigo).toBe(0)
  })
})

describe('lint-botoes — cobertura', () => {
  it('cobre o src inteiro, não só as pastas do admin', () => {
    // O primeiro recorte era `components/admin` + `app/admin`, e deixou passar
    // o "Novo evento" do admin — que mora em `components/eventos`. Caminho de
    // pasta não é proxy para área do produto.
    const raiz = path.join(dir, 'cobertura')
    for (const area of [
      ['app', 'portal'],
      ['components', 'eventos'],
      ['components', 'financeiro'],
    ]) {
      const d = path.join(raiz, ...area)
      fs.mkdirSync(d, { recursive: true })
      fs.writeFileSync(
        path.join(d, 'fixture.tsx'),
        `export const A = () => <button type="submit">Excluir</button>\n`,
      )
    }
    const { saida, codigo } = rodar(raiz)
    expect(codigo).toBe(1)
    for (const esperado of ['app/portal', 'components/eventos', 'components/financeiro']) {
      expect(saida).toContain(esperado)
    }
  })
})
