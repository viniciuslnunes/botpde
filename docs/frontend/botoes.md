# Botões — UPPERCASE + ícone à esquerda

Padrão do produto: **botão de ação tem rótulo em caixa alta e um ícone à
esquerda que descreve a ação**. Componente central:
`apps/web/src/components/ui/button.tsx`. Decisão: `ARCHITECTURE.md` §5.36.

```tsx
import { Plus } from 'lucide-react'
import { AppButton } from '@/components/ui/button'

<AppButton variant="primary" icon={Plus} onClick={criar}>
  Criar cupom
</AppButton>
// tela → [ + CRIAR CUPOM ]
```

## As duas metades moram em lugares diferentes

| Metade | Onde | Por quê |
|--------|------|---------|
| Caixa alta | CSS `.app-btn` (`globals.css`) | apresentação, não conteúdo |
| Ícone | prop `icon` no call-site | depende do significado da ação |
| Cor | `.btn-*` do módulo Design | o tenant edita em `/admin/design` |

**A caixa alta é CSS de propósito.** O JSX continua escrito `Salvar
alterações`, então:

- leitor de tela lê a frase, não uma sigla soletrada;
- `getByRole('button', { name: 'Salvar alterações' })` continua achando o botão;
- buscar `"Salvar alterações"` no repo continua funcionando;
- acento sobrevive — `text-transform` do CSS respeita locale e devolve `AÇÕES`;
- reverter o padrão é uma linha, não um diff de centenas de arquivos.

## O que entra e o que não entra

**Entra** — o que executa uma ação: Salvar, Criar, Excluir, Enviar, Aprovar,
Cancelar, Confirmar. Inclui link que age como botão (`AppButtonLink`).

**Não entra:**

| Caso | Por quê |
|------|---------|
| Aba (`role="tab"`) | navegação; já tem tratamento próprio (`AdminModuleTabs`) |
| Chip / segmented control | é estado, não ação — `Membro \| Gestor` |
| Disclosure (`aria-expanded`) | o rótulo é o título da seção, e o chevron já diz o que o clique faz |
| Botão de ícone puro | não há rótulo para transformar |
| Rótulo dinâmico | `MARIA SILVA`, `SÃO PAULO/SP` lê como grito |
| Card clicável | o texto é conteúdo do registro, não nome de ação |

Para rótulo que vem do banco dentro de um botão de ação, use
`textoOriginal` — mantém a caixa original sem sair do componente.

## API

```tsx
<AppButton
  variant="primary"   // primary | secondary | *-soft | success | danger
                      // warning | info | outline | ghost | none
  size="md"           // sm | md | lg
  icon={Save}         // obrigatório pelo TIPO quando há rótulo
  iconRight={ChevronRight}
  loading={pending}   // troca o ícone por spinner e desabilita
  block               // ocupa a linha
  textoOriginal       // mantém a caixa (rótulo vindo do banco)
>
  Salvar alterações
</AppButton>
```

O tipo cobra o padrão — não é convenção, é compilação:

```tsx
<AppButton>Salvar</AppButton>              // ✗ erro: falta `icon`
<AppButton icon={X} iconOnly />            // ✗ erro: falta `aria-label`
<AppButton icon={X} iconOnly aria-label="Fechar" />  // ✓
```

`AppButtonLink` tem a mesma aparência e continua sendo `<a>` — navegação é
link, não botão, e o teclado e o menu de contexto do navegador dependem disso.

### `variant="none"` é ponte de migração

Não pinta nada e não impõe tamanho: o visual continua vindo da `className` do
call-site. Serve para trazer um botão legado ao padrão sem repintar a tela no
mesmo commit. **Botão novo não usa** — escolha a variante de token, senão a cor
escapa do módulo Design.

## Dicionário de ícones

`ICONE_POR_ACAO` em `scripts/lint-botoes.mjs` é a fonte — mantém "Excluir" com
o mesmo símbolo nas dezenas de telas em que aparece. Os mais usados:

| Ação | Ícone | Ação | Ícone |
|------|-------|------|-------|
| Salvar | `Save` | Criar / Adicionar | `Plus` |
| Excluir | `Trash2` | Editar | `Pencil` |
| Cancelar / Fechar | `X` | Confirmar / Aprovar | `Check` |
| Rejeitar | `XCircle` | Buscar | `Search` |
| Enviar | `Send` | Voltar | `ArrowLeft` |
| Exportar | `Download` | Atualizar | `RefreshCw` |
| Nomear | `UserCheck` | Quitar | `BadgeCheck` |
| Estornar | `Undo2` | Propor aliança | `Handshake` |

Ação nova sem entrada: escolha o ícone e **acrescente ao dicionário**, senão a
próxima tela escolhe outro para a mesma coisa.

## Lint

```bash
pnpm --filter @torcida/web lint:botoes
```

Roda no CI. Cobre só as áreas de `AREAS_COBERTAS` (hoje `components/admin` e
`app/admin`) — assim trava regressão no que já está migrado sem falhar por
causa do passivo ainda não tocado. **Ao migrar uma área, acrescente o prefixo
lá.** Testes: `src/lib/__tests__/lint-botoes.test.ts`.

Falso positivo que a heurística não tem como resolver (card clicável, trilho
vertical) se suprime no código, com o motivo escrito:

```tsx
{/* lint-botoes: nao-e-acao — card de laudo, o rótulo é conteúdo */}
<button …>
```

Dentro de `{cond && (...)}` ou de um ramo de ternário o comentário JSX seria um
segundo filho e não compila; ali a forma válida é `//` na lista de atributos:

```tsx
<button
  // lint-botoes: nao-e-acao — trilho vertical da sidebar
  type="button"
```

## Armadilhas medidas

1. **`@layer components` não é detalhe.** `globals.css` é quase todo unlayered,
   e CSS fora de layer vence **qualquer** utilitário do Tailwind. Com `.app-btn`
   unlayered, o `border-radius` dela passava por cima de `rounded-full` do
   call-site e um botão pill virava retangular. Dentro de `components`, o
   call-site continua mandando.
2. **O ícone precisa de tamanho base.** Sem `width/height` em `.app-btn > svg`,
   o lucide cai no default de 24px e estoura a linha do botão — some com
   `variant="none"`, que não aplica classe de tamanho.
3. **Não desestruture a união pública dentro do componente.**
   `PropsComRotulo & PropsIconeOnly` colapsa `children` em `never` (um lado diz
   `ReactNode`, o outro `never`) e o rest deixa de ser object type. A união é o
   contrato de fora; dentro usa-se `PropsNormalizadas`.
4. **`[^>]*>` não acha o fim de uma tag JSX.** O primeiro `>` de
   `onClick={() => salvar()}` é a seta da arrow function. Qualquer script que
   leia JSX com regex precisa contar chaves e ignorar strings —
   `fimDaAbertura` no lint faz isso, e sem ela o handler inteiro era lido como
   rótulo do botão.
