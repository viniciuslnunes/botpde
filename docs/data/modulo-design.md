# Módulo Design — personalização visual do tenant

Menu admin **Design** (`/admin/design`), permissão `settings:manage`.

## O que personaliza

| Área | Tokens / campos |
|------|-----------------|
| Marca | `brand.primary` (sincroniza `Tenant.corPrimaria`), `brand.secondary` opcional |
| Ações / status | `actions.success`, `danger`, `warning`, `info` — botões e badges de fluxo |
| Grade | `grid.enabled`, `sizePx` (24–96), `lineOpacity`, `lineColor`, `baseColor` |
| Superfícies (claro/escuro) | `background`, `backgroundSubtle`, `foreground`, `foregroundMuted`, `border`, `borderStrong`, `surface`, `surfaceRaised` |

Defaults = valores de `:root` / `.dark` em `apps/web/src/app/globals.css`.

## Persistência

- Coluna `Tenant.design` (`Json?`) — schema Zod `TenantDesignSchema` em `packages/types/src/design.js`.
- `Tenant.corPrimaria` continua a fonte legada da marca (navbar, seeds, alianças) e é **sempre sincronizada** ao salvar o design.

```ts
{
  version: 1,
  brand: { primary: '#RRGGBB', secondary: '#RRGGBB' | null },
  actions: {
    success: '#1d4ed8',  // aprovar / positivo → --color-success (azul; verde só se for identidade)
    danger: '#dc2626',   // reprovar / excluir → --color-danger
    warning: '#d97706',  // pendente / alerta → --color-warning
    info: '#2563eb',     // informativo → --color-info
  },
  grid: { enabled, sizePx, lineOpacity, lineColor, baseColor },
  light: { /* overrides parciais */ },
  dark: { /* overrides parciais */ },
}
```

Consumidores: `Badge` (`success`/`danger`/`warning`/`info`), diálogos de confirmação
(`variante: success|destructive`), classes `.btn-success`, `.btn-danger`,
`.btn-danger-soft`, etc. em `globals.css`.

## Runtime

1. `TenantDesignBridge` nos layouts portal/admin aplica CSS vars via `applyTenantDesign`.
2. Grade `.app-shell-bg` usa `--grid-size`, `--grid-line`, `--grid-opacity`, `--grid-base`; `html[data-grid=off]` desliga o padrão.
3. Toggle claro/escuro do usuário (`next-themes`) escolhe qual conjunto `light`/`dark` aplicar.

## Sugestões de cor

1. **Paletas sugeridas** (`gerarPaletasSugeridas`) — no contexto da torcida e do
   clube afiliado, nesta ordem: **marca da torcida** → **escudo/logo** →
   **paleta do clube** → **torcida + clube** → monocromática → alto contraste.
   Cada card mostra **3 cores** (primária · secundária · destaque) via
   `limitarSwatches`. Um clique via `aplicarPaletaAoDesign` preenche marca +
   ações + tint de superfícies.
2. **Rivalidade / identidade** — sucesso **não** é verde por padrão. Verde só
   entra em ações/swatches se já fizer parte da identidade (clube/torcida).
   Preto/branco/cinza não recebem saturação artificial (evita “marrom” a partir
   do preto). Harmônicas genéricas (análoga/complementar) foram removidas.
3. **Paleta do clube** — mapa `CLUBE_PALETAS` / `paletaDoClube`.
4. **Escudo/logo** — `extrairPaletaDeImagem` (canvas) alimenta a sugestão “Do
   escudo”; verdes fora de contexto são filtrados.
5. **Antes/depois** na prévia — compara rascunho com o design já salvo.

Badges e soft-buttons usam `--color-*-fg` (`corMarcaLegivel`) para o texto não
sumir quando a marca é preto em fundo escuro (ou branco em fundo claro).

## Actions

- `salvarDesignTenant(design)` — Zod + audit `TENANT_DESIGN_ATUALIZADO`
- `restaurarDesignPadrao()` — volta ao violeta padrão Torcida

## Fora de escopo (por enquanto)

- Upload de logo na UI
- Tipografia customizada
- Refatoração de todos os `style={{ backgroundColor: corPrimaria }}` inline
