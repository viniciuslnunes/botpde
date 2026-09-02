/**
 * Lint estatico do padrao de botao — roda no CI, sem servidor nem banco.
 *
 * Regra do produto: botao de ACAO tem rotulo em UPPERCASE e um icone a
 * esquerda que descreve a acao. A caixa alta e resolvida por CSS (`.app-btn`)
 * e a cor por token do modulo Design; o icone e a unica metade que nao da
 * para centralizar, porque depende do significado da acao. Entao ele e
 * cobrado aqui.
 *
 * O lint NAO varre o produto inteiro de uma vez: `AREAS_COBERTAS` lista o
 * que ja foi migrado. Area nova entra na lista quando termina de migrar —
 * assim o CI trava regressao no que ja esta pronto sem falhar por causa do
 * passivo que ainda nao foi tocado. E o mesmo espirito do `lint-mobile.mjs`.
 *
 *   node scripts/lint-botoes.mjs          # relatorio
 *   node scripts/lint-botoes.mjs --ci     # exit 1 se houver violacao
 */
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = process.env.LINT_BOTOES_RAIZ ?? path.join(import.meta.dirname, '..', 'src')
const CI = process.argv.includes('--ci')

/**
 * Areas ja migradas para `AppButton`. So estas sao cobradas.
 * Ao migrar uma area nova, acrescente o prefixo aqui.
 */
const AREAS_COBERTAS = ['components/admin', 'app/admin']

/**
 * Icone canonico por acao — mantem "Excluir" com o mesmo simbolo nas 40
 * telas em que ela aparece. Serve de sugestao na mensagem de erro e e a
 * fonte da tabela em docs/frontend/botoes.md.
 */
const ICONE_POR_ACAO = [
  [/^(salvar|salvar altera|gravar)/i, 'Save'],
  [/^(criar|nov[ao]|adicionar|incluir|cadastrar)/i, 'Plus'],
  [/^(excluir|remover|apagar|deletar)/i, 'Trash2'],
  [/^(editar|alterar|renomear)/i, 'Pencil'],
  [/^(cancelar|descartar|fechar|dispensar)/i, 'X'],
  [/^(voltar|anterior)/i, 'ArrowLeft'],
  [/^(avancar|continuar|proximo|seguir)/i, 'ArrowRight'],
  [/^(confirmar|aprovar|aceitar|concluir|finalizar)/i, 'Check'],
  [/^(rejeitar|recusar|reprovar|negar)/i, 'XCircle'],
  [/^(buscar|pesquisar|procurar)/i, 'Search'],
  [/^(filtrar|aplicar filtro)/i, 'Filter'],
  [/^(limpar|resetar|restaurar)/i, 'RotateCcw'],
  [/^(enviar|publicar|postar)/i, 'Send'],
  [/^(baixar|exportar|download)/i, 'Download'],
  [/^(importar|carregar|enviar arquivo|upload)/i, 'Upload'],
  [/^(atualizar|sincronizar|recarregar)/i, 'RefreshCw'],
  [/^(copiar|duplicar)/i, 'Copy'],
  [/^(compartilhar)/i, 'Share2'],
  [/^(entrar|acessar|login)/i, 'LogIn'],
  [/^(sair|logout|desconectar)/i, 'LogOut'],
  [/^(bloquear|banir|suspender)/i, 'Ban'],
  [/^(desbloquear|liberar)/i, 'Unlock'],
  [/^(denunciar|reportar)/i, 'Flag'],
  [/^(pagar|quitar|cobrar)/i, 'Wallet'],
  [/^(imprimir)/i, 'Printer'],
  [/^(ver|visualizar|detalhes|abrir)/i, 'Eye'],
  [/^(convidar)/i, 'UserPlus'],
  [/^(comentar|responder)/i, 'MessageCircle'],
  [/^(curtir|reagir)/i, 'Heart'],
  [/^(aplicar)/i, 'Check'],
  // Vocabulario do dominio — torcida, bar, financeiro, aliancas.
  [/^(nomear|designar)/i, 'UserCheck'],
  [/^(registrar quita|quitar)/i, 'BadgeCheck'],
  [/^(registrar compra)/i, 'ShoppingCart'],
  [/^(registrar|lancar)/i, 'ClipboardCheck'],
  [/^(estornar|desfazer|reverter)/i, 'Undo2'],
  [/^(retomar|reabrir)/i, 'Play'],
  [/^(atender)/i, 'Headset'],
  [/^(procedente)/i, 'ShieldCheck'],
  [/^(encerrar|romper)/i, 'CircleSlash'],
  [/^(embarcar|check-?in)/i, 'TicketCheck'],
  [/^(propor)/i, 'Handshake'],
  [/^(corrigir|reequilibrar|ajust)/i, 'Wand2'],
  [/^(documentos?)/i, 'FileText'],
  [/^(associa)/i, 'IdCard'],
  [/^(agora n[aã]o|depois|mais tarde)/i, 'Clock'],
  // Rotulo que ja usa '+' como icone textual — vira Plus de verdade.
  [/^\+\s/, 'Plus'],
]

function sugerirIcone(rotulo) {
  for (const [re, icone] of ICONE_POR_ACAO) if (re.test(rotulo)) return icone
  return null
}

/**
 * Chip de selecao, toggle e segmented control ficam FORA da regra — sao
 * estado, nao acao ("Membro | Gestor", "Antes / depois", a comanda ativa do
 * PDV). Marcar caixa alta e icone neles polui a leitura e nao era o pedido.
 *
 * O sinal mais confiavel no codigo deste repo e a className condicional que
 * alterna aparencia por estado: `ativo ? 'bg-primary' : 'bg-subtle'`. Um
 * botao de acao nao muda de cor conforme selecao — no maximo por `disabled`,
 * que nao entra no padrao abaixo porque nao troca `bg-`/`border-`.
 */
function ehSelecao(bloco) {
  if (/aria-pressed|role="(tab|radio|switch|option)"/.test(bloco)) return true
  // Disclosure/accordion: o rotulo e o titulo da secao ("Ver permissoes",
  // "Desconto e observacao"), nao uma acao — e o chevron da direita ja diz o
  // que o clique faz. Caixa alta ali competiria com o titulo real do bloco.
  if (/aria-expanded/.test(bloco)) return true
  const className = bloco.match(/className=\{\[([\s\S]*?)\]\.join/)
  if (!className) return false
  return /\?[\s\S]*?['"][^'"]*\b(bg-|border-)[^'"]*['"][\s\S]*?:/.test(className[1])
}

function arquivos(dir) {
  const saida = []
  if (!fs.existsSync(dir)) return saida
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '__tests__') continue
      saida.push(...arquivos(p))
    } else if (item.name.endsWith('.tsx')) {
      saida.push(p)
    }
  }
  return saida
}

const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/')

const BARRA_INVERTIDA = 92

/**
 * Indice do `>` que fecha a tag de abertura.
 *
 * NAO da para usar `[^>]*>`: o primeiro `>` de `onClick={() => salvar()}` e a
 * seta da arrow function, entao o corte caia no meio do atributo e o handler
 * inteiro era lido como rotulo do botao ("onChange(next.id)} className=..." no
 * relatorio). Percorre caractere a caractere ignorando string e contando
 * chaves, que e o minimo para nao se enganar com JSX real.
 */
function fimDaAbertura(texto, ini) {
  let chaves = 0
  let aspas = null
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === aspas && texto.charCodeAt(i - 1) !== BARRA_INVERTIDA) aspas = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      aspas = c
      continue
    }
    if (c === '{') chaves++
    else if (c === '}') chaves--
    else if (c === '>' && chaves === 0) return i
  }
  return -1
}

/**
 * Extrai `<button ...>...</button>` respeitando aninhamento. Regex sozinha
 * casa o `</button>` errado quando ha botao dentro de botao (acontece em
 * card com acao secundaria), entao o corte e feito contando abertura.
 */
function botoesDe(texto) {
  const achados = []
  const abre = /<button\b/g
  let m
  while ((m = abre.exec(texto))) {
    const ini = m.index
    const i = fimDaAbertura(texto, ini)
    if (i === -1) continue
    // Auto-fechado nao tem rotulo — nao interessa.
    if (texto[i - 1] === '/') continue
    let nivel = 1
    let cursor = i + 1
    while (nivel > 0 && cursor < texto.length) {
      const prox = texto.slice(cursor).search(/<\/?button\b/)
      if (prox === -1) break
      const at = cursor + prox
      if (texto.startsWith('</button', at)) nivel--
      else nivel++
      cursor = at + 8
    }
    achados.push({ ini, corpoIni: i + 1 - ini, bloco: texto.slice(ini, cursor + 1) })
  }
  return achados
}

/** Remove atributos JSX e expressoes para sobrar o texto que o usuario le. */
function rotuloVisivel(bloco, corpoIni) {
  const corpo = bloco.slice(corpoIni).replace(/<\/button>$/, '')
  let semExpr = corpo
  // Tira `{...}` de dentro para fora (ternario, template string, map).
  for (let i = 0; i < 8; i++) semExpr = semExpr.replace(/\{[^{}]*\}/g, ' ')
  return semExpr
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const violacoes = { semIcone: [], botaoCru: [] }

for (const arquivo of arquivos(RAIZ)) {
  const r = rel(arquivo)
  if (!AREAS_COBERTAS.some((a) => r.startsWith(a))) continue
  const texto = fs.readFileSync(arquivo, 'utf-8')

  for (const { ini, corpoIni, bloco } of botoesDe(texto)) {
    // Escape explicito, para o que a heuristica nao tem como saber: card
    // clicavel com titulo e descricao, trilho vertical, celula de grade. Fica
    // no codigo com o motivo escrito, entao aparece na revisao — diferente de
    // uma excecao silenciosa dentro do lint.
    // Aceita nos dois lugares: como comentario JSX antes do elemento, e como
    // `//` dentro da lista de atributos — dentro de `{cond && (...)}` ou do
    // ramo de um ternario so a segunda forma compila.
    const antes = texto.slice(Math.max(0, ini - 260), ini)
    if (/lint-botoes:\s*nao-e-acao/.test(antes + bloco)) continue

    const rotulo = rotuloVisivel(bloco, corpoIni)
    // Sem rotulo literal: botao de icone puro ou de dado dinamico. Fora
    // da regra por decisao de escopo — caixa alta em nome de socio le
    // como grito, e icone puro nao tem rotulo para transformar.
    if (!/[A-Za-zÀ-ú]{3,}/.test(rotulo)) continue
    // Aba, chip de filtro, toggle e segmented control tambem estao fora.
    if (ehSelecao(bloco)) continue
    const linha = texto.slice(0, ini).split('\n').length
    const temIcone = /<[A-Z][A-Za-z0-9]*\b[^>]*\/>|<[A-Z][A-Za-z0-9]*\b[^>]*aria-hidden/.test(bloco)
    const registro = {
      arquivo: r,
      linha,
      rotulo: rotulo.slice(0, 48),
      sugestao: sugerirIcone(rotulo),
    }
    if (!temIcone) violacoes.semIcone.push(registro)
    else violacoes.botaoCru.push(registro)
  }
}

const total = violacoes.semIcone.length + violacoes.botaoCru.length

if (violacoes.semIcone.length) {
  console.log(`\n[sem-icone] ${violacoes.semIcone.length} botao(oes) de acao sem icone a esquerda:`)
  for (const v of violacoes.semIcone) {
    const dica = v.sugestao ? `  → use icon={${v.sugestao}}` : '  → escolha o icone da acao'
    console.log(`  ${v.arquivo}:${v.linha}  "${v.rotulo}"${dica}`)
  }
}

if (violacoes.botaoCru.length) {
  console.log(
    `\n[botao-cru] ${violacoes.botaoCru.length} botao(oes) com icone mas ainda em <button> cru:`,
  )
  for (const v of violacoes.botaoCru) console.log(`  ${v.arquivo}:${v.linha}  "${v.rotulo}"`)
  console.log('  → troque por <AppButton icon={...}> (@/components/ui/button)')
}

if (!total) {
  console.log('lint-botoes: OK — todo botao de acao nas areas cobertas usa AppButton com icone.')
  process.exit(0)
}

console.log(`\nlint-botoes: ${total} violacao(oes) em ${AREAS_COBERTAS.join(', ')}.`)
console.log('Escopo da regra e as excecoes: docs/frontend/botoes.md')
process.exit(CI ? 1 : 0)
