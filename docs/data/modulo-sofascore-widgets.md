# Módulo Sofascore Widgets — embeds oficiais contextualizados pelo clube

> Referência factual do módulo para consulta rápida (agentes e humanos). Cadastro e regras
> puras em `packages/types/src/sofascore-widgets.js`; helpers web em
> `apps/web/src/lib/sofascore.ts`; componentes em `apps/web/src/components/sofascore/`.

## O que é

Widgets **oficiais** da Sofascore (iframe embeds gerados em
[widgets.sofascore.com](https://widgets.sofascore.com)) exibidos na Comunidade, sempre
contextualizados pelo clube que o torcedor escolheu no onboarding
(`PerfilTorcedor.afiliacaoId` → `Afiliacao.slug`) ou pelo clube da torcida
(`Tenant.afiliacaoId`). **Só aparece conteúdo do clube do usuário** — se não há widget
cadastrado/ativo para aquele `afiliacaoSlug` (nem tabela nacional da divisão, na
Classificação), a seção retorna `null` (nunca placeholder vazio nem widget genérico
solto).

Only official Sofascore iframe embeds — nunca scraping nem endpoint não documentado, e
nunca construir URL de embed manualmente a partir de IDs.

**Não confundir com sync de `Partida`:** widgets são **só visualização** na Comunidade.
Não populam calendário/placar no banco. Ingestão de jogos = modelo `Partida` +
cadastro manual ou API de futebol futura — ver `docs/data/modulo-eventos.md` e
`docs/knowledge/futebol-dados-publicos.md` (Google Sports ≠ API gratuita).

## Onde cadastrar embeds

Arquivo: `packages/types/src/sofascore-widgets.js`.

- **Por clube:** array `SOFASCORE_WIDGETS` (fixtures, top players, standings específicos…).
- **Por divisão nacional:** array `SOFASCORE_COMPETICOES` (tabelas A/B/C/D da Classificação).

Passo a passo (widget de clube):

1. Acesse https://widgets.sofascore.com (painel oficial da Sofascore).
2. Escolha o widget desejado (fixtures, standings, top players, power rankings, player,
   cup tree) para o time/competição/jogador.
3. Se o gerador oferecer opção de tema/appearance (ex. dark), selecione-a **antes** de
   copiar o snippet — o tema fica embutido na URL gerada.
4. Copie a URL do iframe que a Sofascore gera e cole em `embedSrc`.
5. Preencha `afiliacaoSlug` com o `Afiliacao.slug` do clube dono do widget.
6. Marque `ativo: true` e escolha `contextos` + `prioridade`.

## Classificação nacional por divisão

A página `/portal/comunidade/classificacao` resolve a tabela pela **divisão** do clube
(`Afiliacao.serie`), não por slug. O embed Sofascore de standings é por torneio — a
mesma URL serve todos os clubes da Série A (idem B/C/D).

| Série | Catálogo | Observação |
|---|---|---|
| A, B, C | `SOFASCORE_COMPETICOES` | Tabela única de 20 times |
| D | `SOFASCORE_COMPETICOES` | Sofascore só oferece fase de grupos; embed = Grupo A1 |
| ESTADUAL / OUTRA / `null` | — | Empty state (“não disputa competição nacional…”) |

### Resolução do clube (`resolverClubeClassificacao`)

Em `apps/web/src/lib/sofascore-server.ts`:

1. `resolveAfiliacaoComunidadeDoUsuario` — perfil do torcedor ou tenant ativo com membro `APROVADO`.
2. Fallback: sobe ancestrais do tenant (`getAncestorTenantIds`) e pega o primeiro com
   `afiliacaoId` — PDE/Subsede sem clube herda o da Sede.
3. Query em `Afiliacao` → `{ slug, serie, nome }`.

### Resolução dos widgets (`resolverWidgetsClassificacao`)

1. Widgets `classificacao` do clube via `getWidgetsForContexto` (prioridade).
2. Se vazio → `getStandingsPorSerie(serie)` do catálogo nacional.
3. Sem `afiliacaoSlug` → `[]` (nunca widget genérico).

### Manter `Afiliacao.serie` atualizado

Dataset offline: `packages/db/src/data/series-brasileirao-2026.js` (156 clubes).

```bash
pnpm --filter @torcida/db test:series-brasileirao
pnpm --filter @torcida/db db:repair-series-afiliacoes -- --dry-run
pnpm --filter @torcida/db db:repair-series-afiliacoes
```

A cada temporada: atualizar o dataset (ou criar `series-brasileirao-YYYY.js`), trocar
os embeds/season IDs em `SOFASCORE_COMPETICOES` e rodar o repair.

## Tema / dark mode

O iframe Sofascore é **cross-origin**: CSS da app (`--surface`, `next-themes`) **não**
pinta o interior do widget. Não injetar estilos no documento do embed.

- Tema claro/escuro do widget vem **só** da URL oficial gerada em widgets.sofascore.com.
- Não inventar query params (`theme=dark` etc.) nem sincronizar automaticamente com o
  toggle de tema da app.
- O card wrapper (`SofascoreWidgetFrame`) usa tokens da app; só o iframe interno pode
  permanecer light se a `embedSrc` for light.

## Lógica de filtragem (`getWidgetsForContexto`)

Chave de tudo é o **`afiliacaoSlug`** — sem clube resolvido, retorna `[]`.

| Campo | Regra |
|---|---|
| `ativo` | só `true` aparece |
| `contextos` | widget precisa listar o contexto solicitado (`home`, `clube`, `campeonato`, `jogador`, `artigo`, `classificacao`) |
| `afiliacaoSlug` | igualdade estrita com o slug do clube do usuário |
| `competicaoSlug` | filtra **só** se o chamador informou E o widget define; widget sem o campo é "do clube em geral" e passa |
| `jogadorId` | mesma lógica de `competicaoSlug` |
| `prioridade` | ordenação ascendente (menor = mais relevante) |
| `limit` | corte final via `slice` |

A função nunca lança exceção e aceita `widgets` injetável (default `SOFASCORE_WIDGETS`)
para testes.

## Exemplo de config

```js
// ⚠️ Placeholders ilustrativos — ativo: false; troque slug/embedSrc pelos reais.
export const SOFASCORE_WIDGETS = [
  {
    id: 'corinthians-fixtures',
    tipo: 'fixtures',
    titulo: 'Próximos jogos',
    afiliacaoSlug: 'corinthians',
    contextos: ['home', 'clube'],
    prioridade: 1,
    ativo: false,
    embedSrc: 'https://widgets.sofascore.com/embed/COLE_AQUI_A_URL_OFICIAL',
  },
]

// Tabelas nacionais — uma por divisão (ver SOFASCORE_COMPETICOES no código).
export const SOFASCORE_COMPETICOES = [
  {
    id: 'brasileirao-serie-a-2026',
    serie: 'A',
    competicaoSlug: 'brasileirao-serie-a-2026',
    titulo: 'Brasileirão Série A 2026',
    ativo: true,
    embedSrc: 'https://widgets.sofascore.com/pt-BR/embed/tournament/…/standings/…',
    alturaPx: 1123,
    creditoUrl: 'https://www.sofascore.com/pt/football/tournament/brazil/brasileirao-serie-a/325#id:…',
    creditoTexto: 'Classificação fornecida por',
  },
]
```

## Uso do `<WidgetSection>` por contexto

Componente server: `apps/web/src/components/sofascore/widget-section.tsx`. Renderiza cards
no padrão visual da comunidade (via `SofascoreWidgetFrame` + `MotionReveal`).

```tsx
// classificacao — página dedicada (torcida e nacional)
// apps/web/src/app/portal/comunidade/classificacao/page.tsx
// Menu: ComunidadeFeedNav + chips mobile em comunidade-feed-shell
<WidgetSection
  contexto="classificacao"
  afiliacaoSlug={afiliacaoSlug}
  serie={serie}
/>

// artigo — detalhe de post (já integrado em post/[id]/page.tsx)
<WidgetSection contexto="artigo" afiliacaoSlug={afiliacaoSlug} limit={1} />

// home / clube — reservados para widgets futuros no aside/feed
// campeonato — EXEMPLO ILUSTRATIVO (ainda não há rota de campeonato na comunidade)
<WidgetSection contexto="campeonato" afiliacaoSlug={slug} competicaoSlug="brasileirao-serie-a" />

// jogador — EXEMPLO ILUSTRATIVO (ainda não há rota de jogador na comunidade)
<WidgetSection contexto="jogador" afiliacaoSlug={slug} jogadorId="12345" limit={1} />
```

Resolução do clube na Classificação: `resolverClubeClassificacao(userId, email)` em
`apps/web/src/lib/sofascore-server.ts`. Gate de acesso à comunidade continua em
`resolverContextoComunidade`.

Na comunidade nacional, o feed mostra só um CTA “Classificação” apontando para
`/portal/comunidade/classificacao` (sem iframe inline).

## Testes

`apps/web/src/lib/__tests__/sofascore-widgets.test.ts` — filtragem por clube/contexto
(incl. `classificacao`), ativo, prioridade, limit, competição/jogador, `[]` sem slug,
`getStandingsPorSerie` e `resolverWidgetsClassificacao`.

`packages/db/scripts/test-series-brasileirao.js` — invariantes do dataset A/B/C/D.

## Checklist de validação

- [ ] iframe carrega o widget oficial (URL gerada em widgets.sofascore.com).
- [ ] Card **some por completo** quando não há widget/competição para o clube (sem placeholder).
- [ ] Contraste/cores do **card wrapper** batem com a comunidade (CSS vars `--border`/`--surface`).
- [ ] Tema do iframe: se dark for necessário, regenerar `embedSrc` no painel Sofascore.
- [ ] Responsivo mobile (iframe `w-full`, altura do cadastro).
- [ ] Sem CLS visível (altura mínima reservada + `loading="lazy"`).
- [ ] `pnpm --filter @torcida/web test` passa.
- [ ] `pnpm --filter @torcida/web lint` e `tsc --noEmit` passam.
- [ ] `pnpm --filter @torcida/db db:repair-series-afiliacoes -- --dry-run` cobre os clubes esperados.
