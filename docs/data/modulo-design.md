# Módulo Design — personalização visual do tenant

Menu admin **Design** (`/admin/design`), permissão `settings:manage`.

Inteligência de domínio (rivalidade cromática, P&B, prioridade torcida→clube):
[`docs/knowledge/identidade-visual-cores.md`](../knowledge/identidade-visual-cores.md).

## O que personaliza

| Área | Tokens / campos |
|------|-----------------|
| Marca | `brand.primary` (sincroniza `Tenant.corPrimaria`), `brand.secondary` opcional |
| Texto da marca | `brandFg.primary` / `brandFg.secondary` — menus, tabs, badges soft (`*-fg`) e botão sólido (`*-on`); null = automático. Secundária também pinta links (`.text-secondary` / “Criar conta”). |
| Ações / status | `actions.success`, `danger`, `warning`, `info` — botões e badges de fluxo |
| Grade | `grid.enabled`, `sizePx` (24–96), `lineOpacity`, `lineColor`, `baseColor` |
| Superfícies (claro/escuro) | `background`, `backgroundSubtle`, `foreground`, `foregroundMuted`, `border`, `borderStrong`, `surface`, `surfaceRaised` |
| Vitrine da loja | `loja.bannerUrl`, `loja.usarDestaqueComoCapa` — editados em `/admin/loja/vitrine` (não no estúdio Design); o save do Design **preserva** essa fatia |

Defaults = valores de `:root` / `.dark` em `apps/web/src/app/globals.css`.

## Persistência

- Coluna `Tenant.design` (`Json?`) — schema Zod `TenantDesignSchema` em `packages/types/src/design.js`.
- `Tenant.corPrimaria` continua a fonte legada da marca (navbar, seeds, alianças) e é **sempre sincronizada** ao salvar o design.

```ts
{
  version: 1,
  brand: { primary: '#RRGGBB', secondary: '#RRGGBB' | null },
  brandFg: {
    // opcional — null = automático (legível em menus/tabs; contraste no botão)
    primary: '#ffffff' | null,
    secondary: null,
  },
  actions: {
    success: '#1d4ed8',
    danger: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
  },
  actionsFg: {
    // opcional — null = automático (contraste no botão / legível no badge)
    success: '#ffffff' | null,
    danger: null,
    warning: null,
    info: null,
  },
  customPalettes: [
    // até 20 — listadas em “Paletas sugeridas” no estúdio
    {
      id: 'uuid',
      nome: 'Clássico P&B',
      primary: '#1a1a1a',
      secondary: '#ffffff',
      actions: { /* … */ },
      swatches: ['#1a1a1a', '#ffffff', '#8b0000'],
    },
  ],
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
   O Tailwind `dark:` **não** usa `prefers-color-scheme`: `@custom-variant dark`
   em `globals.css` só dispara com class `.dark` no `<html>`. Sem isso, Windows
   no escuro + app no claro pinta `dark:text-yellow-300` no papel branco.
4. CSS crítico (`tenantDesignCriticalCss`) emite **os dois temas**:
   `:root` = claro, `.dark` = escuro. Não despejar o escuro em `:root`
   (o `*-fg` do âmbar/rosa no escuro some no claro).
5. Vars de texto legível: `--color-primary-fg` (alias `--primary-fg`),
   `--color-secondary-fg`, `--color-success-fg` / `--color-success-on`, …  
   Soft/badge/menu/tab/link/ícone/kpi → `*-fg` (também `.text-primary` /
   `.text-warning` / `.text-danger` / `.text-success` / `.text-info` /
   `.bg-primary-soft` / `.btn-primary` em `globals.css`); botão sólido → `*-on`.  
   **Proibido** `text-[rgb(var(--primary))]` ou fill crua em texto/ícone —
   com marca preta some no escuro; âmbar/amarelo some no claro
   (ex.: resumo de sócios, “Ver todas”, “Diretoria”).

## Sugestões de cor

1. **Paletas sugeridas** (`gerarPaletasSugeridas` + `resolverMarcaTorcida`) —
   **exatamente 3 cards**, na ordem da regra de negócio: **marca da torcida** →
   **escudo/logo** → **paleta do clube**. Sem mono, alto contraste nem
   harmônicas genéricas.  
   Se `corPrimaria` ainda for o roxo da plataforma (`#7c3aed`), a marca usa
   `TORCIDA_CORES_PRIMARIAS[slug]` (ex. `pde-gavioes-fiel` → `#1a1a1a`) ou a
   paleta do clube — **nunca** tratar o default do produto como identidade da
   torcida. Cada card: **3 cores** (primária · secundária · `actions.danger`)
   — o 3º swatch é o accent da identidade quando existir, e **é o que Aplicar
   grava** (não há cor “fantasma” só no card). Escudo sem extrato e clube sem
   afiliação usam fallback estável na marca. Paletas salvas pela torcida
   (`customPalettes`) ficam numa lista à parte.  
2. **Rivalidade / identidade** — ver knowledge acima. Sucesso segue a **marca**
   (não azul genérico nem verde forçado); verde só se identidade já for verde;
   neutros sem saturação artificial; sem análoga/complementar.
3. **Paleta do clube** — `CLUBE_PALETAS` / `paletaDoClube` / `CLUBE_PALETA_ALIASES`.
   Matching: chave exata → alias de nome oficial → hífen → **palavra inteira
   mais longa** (nunca `sport` dentro de “Sport Club Corinthians”).
4. **Escudo/logo** — `extrairPaletaDeImagem`; verdes fora de contexto
   filtrados.
5. **Superfícies derivadas** — `derivarSuperficiesDaMarca` + `completarSuperficies`
   preenchem **todos** os tokens (fundo, texto, borda) nos dois temas.
   Claro: papel alto-L (pastel do hue; **branco puro se P&B** — não misturar o
   hex escuro no cinza, que sujava o muted). Escuro: zinc + sombra cromática.
   Texto principal e secundário fecham WCAG AA (4.5:1) contra todas as
   superfícies. `aplicarPaletaAoDesign` / `aplicarMarcaAoDesign` reaplicam
   ações + superfícies + texto automático.
6. **Fill vs tema** — a identidade gravada (`brand.primary` / `secondary`) não
   muda; `resolverFillDaMarca` empurra L quando branco some no claro ou preto
   some no escuro, e o CSS desenha um anel (`--color-*-ring`) se ainda faltar
   3:1 (WCAG 1.4.11). `textoSobreFill` escolhe branco/preto pelo ratio real
   (âmbar pede preto). `resolveActionTextColors` fecha 4.5:1 no botão e no
   link, 3:1 no badge soft, **por tema**.
7. **Antes/depois** na prévia.

## UX do estúdio (`/admin/design`)

- Layout **full-bleed**: sem `app-container` / `max-w-6xl`; padding lateral
  **16px** (`px-4`) — inspector + prévia precisam de largura.
- Desktop (`xl+`): página trava na altura do viewport (`100dvh` − topbar);
  colunas em flex com scroll interno — sem scroll longo da página nem sticky
  que deixa “vazio” abaixo da prévia.
- Inspector: scroll com `px-1`/`pr-2`; tabs sticky no topo da coluna; cards de
  ação com `p-3` (swatches não colados na barra de rolagem).
- Aba **Identidade**: cor primária/secundária + **texto da marca** (menus/tabs;
  vazio = automático — clareia P&B no escuro). **Mudar a primária recalcula
  superfícies e ações** dos dois temas. Paletas sugeridas mostram selo
  “Claro+escuro” quando o card já fecha AA.
- Aba **Ações**: cor de fundo/marca + **cor do texto** (vazio = automático).
  Informativo aparece na prévia (badge Aviso / faixa no evento / badge Admin).
  Texto manual só vale onde o contraste fecha (botão sólido vs badge soft);
  no outro contexto volta ao automático — recalcula por tema claro/escuro.
- Seletor de cor: swatch abre o **color picker nativo** direto (sem popover
  intermediário).
- Prévia **sem** overlay de hotspot/label ao focar token — estado não salvo
  fica só no rodapé (`StickyPersistBar`). A prévia usa o mesmo `resolverFillDaMarca`
  / `resolverSuperficies` do runtime.
- Contraste WCAG no rodapé avalia **claro e escuro juntos** (marca, ações,
  superfícies e grade) com o fill efetivo de cada tema. Falhas oferecem
  **Corrigir contraste nos dois temas** (`sanearContrasteDoDesign`: mantém
  fundos, saneia texto/borda, zera overrides de fg). Identidade/Ações: amostras
  soft+botão nos dois temas. **Superfícies**: campos **Claro** e **Escuro**
  lado a lado + amostra visual dual. **Fundo**: linha/base automáticas herdam
  por tema; amostra da grade nos dois modos. Alertas usam token info (não emerald).
- **Agenda / Eventos** — badges e CTAs de marca usam `--color-primary-fg` /
  `--color-primary-on` (nunca `--primary` cru como texto). Com identidade P&B,
  `EventoTipoBadge` GERAL e “Próximo compromisso” permanecem legíveis no escuro.
- **Status no papel** (resumo de sócios, kpi, erro de formulário) usa
  `.text-warning` / `.text-danger` (`*-fg`), nunca `dark:text-yellow-300` nem
  a fill crua `--color-warning`.

## Actions

- `salvarDesignTenant(design)` — Zod + audit `TENANT_DESIGN_ATUALIZADO`
- `restaurarDesignPadrao()` — volta ao violeta padrão Torcida

## Código-chave

| Peça | Onde |
|------|------|
| Schema + paletas + contraste | `packages/types/src/design.js` |
| Testes de contraste / clube | `apps/web/src/lib/__tests__/design.test.ts` |
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
