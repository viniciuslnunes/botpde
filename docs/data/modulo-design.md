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
    success: '#059669',  // aprovar / positivo → --color-success
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

1. **Paleta do clube** — mapa `CLUBE_PALETAS` / `paletaDoClube(nome, apelido)` a partir da afiliação.
2. **Escudo/logo** — `extrairPaletaDeImagem` (canvas no client) em `logoUrl` → logo da torcida conhecida → `escudoUrl`.
3. **Aplicar sugestão** — preenche marca + deriva tint leve em `backgroundSubtle` / `surface` (`derivarSuperficiesDaMarca`).

## Actions

- `salvarDesignTenant(design)` — Zod + audit `TENANT_DESIGN_ATUALIZADO`
- `restaurarDesignPadrao()` — volta ao violeta padrão Torcida

## Fora de escopo (por enquanto)

- Upload de logo na UI
- Tipografia customizada
- Refatoração de todos os `style={{ backgroundColor: corPrimaria }}` inline
