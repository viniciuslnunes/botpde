# Escudos de `Afiliacao` — pipeline e plano de progresso

> **Inteligência de casamento clube ↔ imagem** para o onboarding (grid de escudos).
> Fonte editorial: `docs/knowledge/diretorio-nacional.md`; decisão arquitetural:
> `ARCHITECTURE.md` §5.9. Agentes: `data-model` (modelo/slug), `research-dominio`
> (fontes e homônimos), `implementation` (scripts).

## Objetivo

Preencher `Afiliacao.escudoUrl` com PNG de fundo **transparente** no Cloudinary
(`torcida/catalogo/escudos/<slug>`), sem depender de API externa em runtime.
Casamento errado de escudo **descredibiliza** o produto — preferimos deixar vazio
a exibir o escudo de outro clube.

## Estado atual (2026-07-13)

| Métrica | Valor |
|---|---|
| Afiliações totais | 367 |
| Com escudo | 112 |
| Sem escudo | 255 |
| Escudos via Soccer Wiki (rodada segura) | 87 |
| Clubes raspados no Soccer Wiki (offset 0–300) | 246 |

Relatório versionado: `packages/db/src/data/escudos-soccerwiki-report.json`
(gerado por `seed:escudos-soccerwiki -- --report-only`).

### Fontes em uso

1. **TheSportsDB** — seed original `seed:afiliacoes` (Série A–D curada).
2. **Cloudinary** — migração de assets locais (`seed:migrate-escudos-cloudinary`).
3. **Soccer Wiki** — scrape paginado Brasil
   (`scripts/seed-escudos-soccerwiki.js`, offsets 0–300, passo 50).

### Lógica de casamento (estrita)

Implementada em `packages/db/src/data/afiliacoes-normalize.js` +
`scripts/seed-escudos-soccerwiki.js`:

- `inferirUfDoNome` — extrai UF de sufixos (`América-MG`, `Operário-MT`, `América RJ`).
- `saoMesmoClube` / `chaveGrupoClube` — aliases e chave canônica nome+UF.
- **Bloqueio de homônimos** (`america`, `operario`, `botafogo`, `vitoria`…) sem UF
  explícita nos dois lados.
- **Score mínimo 90** — só match forte; atribuição 1:1 por melhor score (greedy).
- **Nunca** usar `includes` parcial de tokens curtos (ex.: `"sport"` casava ASA com
  Sport Recife na rodada permissiva — revertida).

### Incidente documentado

Primeira execução do Soccer Wiki (matching permissivo) gerou ~158 escudos errados
(América-AM → Mineiro, Operário-PR → Operário-MT, etc.). Revertidos no banco;
algoritmo endurecido antes da segunda rodada.

## Comandos

```bash
pnpm --filter @torcida/db seed:escudos-soccerwiki -- --report-only
pnpm --filter @torcida/db seed:escudos-soccerwiki -- --dry-run
pnpm --filter @torcida/db seed:escudos-soccerwiki
pnpm --filter @torcida/db db:repair-afiliacoes-torcidas   # funde duplicatas de clube
pnpm --filter @torcida/db test:afiliacoes
```

## Plano de progresso (inteligência)

### Fase A — Concluída ✅

- [x] Script `seed:escudos-soccerwiki` (scrape + Cloudinary + update `escudoUrl`).
- [x] `inferirUfDoNome` e matching estrito com homônimos.
- [x] Relatório `escudos-soccerwiki-report.json` (pares + `semMatchLista`).
- [x] 87 escudos seguros publicados em produção.

### Fase B — Aliases e nomes longos (próximo)

Expandir `WIKI_ALIASES` e `ALIASES` para clubes grandes ainda em `semMatchLista`:

- `Botafogo FR` → Botafogo (RJ) — Wiki não traz sufixo de UF.
- `Fluminense Football Club` ↔ `Fluminense`.
- `Sport Club Internacional` ↔ `Internacional` (RS).
- `Grêmio Foot-Ball Porto Alegrense` ↔ `Grêmio`.
- `Clube Atlético Paranaense` ↔ `Athletico Paranaense`.

Critério: cada alias exige par nome+UF validado manualmente no relatório antes de upload.

### Fase C — Afiliações duplicadas

Muitos itens em `semMatchLista` são **variantes de nome** do mesmo clube que já tem
escudo na afiliação canônica (ex.: `Sport Club Internacional` vs `Internacional`).
Rodar `db:repair-afiliacoes-torcidas` após novos aliases; considerar herdar
`escudoUrl` da canônica no repair.

### Fase D — Cobertura fora do Soccer Wiki

~255 clubes sem escudo incluem times de estaduais/Série D ausentes na listagem Wiki
(offset 0–300). Opções (avaliar custo/benefício):

1. Paginar além do offset 300 no Soccer Wiki.
2. Segunda fonte (Wikipedia Commons, TheSportsDB por nome+UF).
3. Placeholder neutro no UI até curadoria manual (não inventar escudo).

### Fase E — Qualidade contínua

- Rodar `--report-only` antes de cada upload em produção; revisar pares com `score: 90`
  na lista manualmente.
- Teste de regressão: amostra de homônimos em `scripts/test-afiliacoes.js`.
- Gate no onboarding: priorizar `escudoUrl` da afiliação canônica após dedup
  (`apps/web/src/lib/onboarding.ts`).

## Agentes e responsabilidades

| Agente | Papel neste épico |
|---|---|
| `data-model` | Slug único, dedup `Afiliacao`, integridade `escudoUrl` |
| `research-dominio` | Validar homônimos e nomes oficiais por estado |
| `implementation` | Scripts, aliases, upload Cloudinary |
| `qa-verification` | `test:afiliacoes` + amostra visual no onboarding |
| `ux-review` | Grid sem escudo — estado vazio vs placeholder |

## Riscos

- **Falso positivo** > escudo errado > escudo ausente.
- **Duplicata de Afiliacao** infla `semMatch` sem impacto real no onboarding
  (dedup por `saoMesmoClube` no cliente).
- Soccer Wiki é colaborativo — mesma ressalva de confiança do catálogo de torcidas.
