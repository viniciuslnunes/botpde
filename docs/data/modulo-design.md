# Módulo Design — personalização visual do tenant

Menu admin **Design** (`/admin/design`), permissão `settings:manage`.

Inteligência de domínio (rivalidade cromática, P&B, prioridade torcida→clube):
[`docs/knowledge/identidade-visual-cores.md`](../knowledge/identidade-visual-cores.md).

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

Consumidores: `Badge` (`primary`/`secondary`/`success`/…), diálogos de confirmação
(`variante: success|destructive`), classes `.btn-success`, `.btn-danger`,
`.btn-*-soft`, etc. em `globals.css`.

## Runtime

1. `TenantDesignBridge` nos layouts portal/admin aplica CSS vars via `applyTenantDesign`.
2. Grade `.app-shell-bg` usa `--grid-size`, `--grid-line`, `--grid-opacity`, `--grid-base`; `html[data-grid=off]` desliga o padrão.
3. Toggle claro/escuro do usuário (`next-themes`) escolhe qual conjunto `light`/`dark` aplicar.
4. Vars de texto legível: `--color-primary-fg`, `--color-secondary-fg`,
   `--color-success-fg`, … (`corMarcaLegivel` contra a superfície ativa).
   Nav portal (`navbar.tsx`) e menu admin (`sidebar.tsx`) usam `*-fg` no
   estado ativo + ring — **proibido** `text-[rgb(var(--primary))]` com marca
   preta (some no dark).

## Sugestões de cor

1. **Paletas sugeridas** (`gerarPaletasSugeridas`) — ordem: **marca da
   torcida** → **escudo/logo** → **paleta do clube** → **torcida + clube** →
   monocromática → alto contraste. Cada card: **3 cores** + hex
   (`limitarSwatches`). Clique → `aplicarPaletaAoDesign` (marca + ações +
   tint de superfícies). A UI do estúdio gera a lista a partir do **design
   salvo (baseline)**, não do rascunho — senão aplicar “Do escudo” regenerava
   todas as cards com a nova primária.
2. **Rivalidade / identidade** — ver knowledge acima. Sucesso default azul;
   verde só se identidade já for verde; neutros sem saturação artificial;
   sem análoga/complementar.
3. **Paleta do clube** — `CLUBE_PALETAS` / `paletaDoClube`.
4. **Escudo/logo** — `extrairPaletaDeImagem`; verdes fora de contexto
   filtrados.
5. **Superfícies derivadas** — `derivarSuperficiesDaMarca` preenche
   `background`, `backgroundSubtle`, `surface` e `surfaceRaised` (light/dark)
   com tint leve; não deixar fundo/elevada “vazios” no padrão do sistema.
6. **Antes/depois** na prévia.

## UX do estúdio (`/admin/design`)

- Layout **full-bleed**: sem `app-container` / `max-w-6xl`; padding lateral
  **16px** (`px-4`) — inspector + prévia precisam de largura.
- Seletor de cor: swatch abre o **color picker nativo** direto (sem popover
  intermediário).
- Prévia multi-cena (Portal / Admin / Login) com hotspots; contraste WCAG
  no rodapé usa token info (não emerald).

## Actions

- `salvarDesignTenant(design)` — Zod + audit `TENANT_DESIGN_ATUALIZADO`
- `restaurarDesignPadrao()` — volta ao violeta padrão Torcida

## Código-chave

| Peça | Onde |
|------|------|
| Schema + paletas + contraste | `packages/types/src/design.js` |
| CSS vars / `applyTenantDesign` | `packages/ui/src/services/theme.tsx` |
| Badge | `packages/ui/src/components/badge.tsx` |
| Form + paletas UI | `apps/web/src/components/admin/design-form.tsx` |
| Prévia | `apps/web/src/components/admin/design-studio-preview.tsx` |
| Página | `apps/web/src/app/admin/design/page.tsx` |

## Fora de escopo (por enquanto)

- Upload de logo na UI
- Tipografia customizada
- Refatoração de todos os `style={{ backgroundColor: corPrimaria }}` inline
  (migrar gradualmente para `*-fg` onde for texto sobre fundo escuro)
