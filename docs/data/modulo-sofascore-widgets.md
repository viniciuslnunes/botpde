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
cadastrado/ativo para aquele `afiliacaoSlug`, a seção retorna `null` (nunca placeholder
vazio nem widget genérico).

Only official Sofascore iframe embeds — nunca scraping nem endpoint não documentado, e
nunca construir URL de embed manualmente a partir de IDs.

## Onde cadastrar embeds

Arquivo: `packages/types/src/sofascore-widgets.js`, array `SOFASCORE_WIDGETS`.

Passo a passo:

1. Acesse https://widgets.sofascore.com (painel oficial da Sofascore).
2. Escolha o widget desejado (fixtures, standings, top players, power rankings, player,
   cup tree) para o time/competição/jogador.
3. Se o gerador oferecer opção de tema/appearance (ex. dark), selecione-a **antes** de
   copiar o snippet — o tema fica embutido na URL gerada.
4. Copie a URL do iframe que a Sofascore gera e cole em `embedSrc`.
5. Preencha `afiliacaoSlug` com o `Afiliacao.slug` do clube dono do widget.
6. Marque `ativo: true` e escolha `contextos` + `prioridade`.

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
  {
    id: 'corinthians-standings-brasileirao',
    tipo: 'standings',
    titulo: 'Classificação — Brasileirão',
    afiliacaoSlug: 'corinthians',
    competicaoSlug: 'brasileirao-serie-a',
    contextos: ['classificacao'],
    prioridade: 2,
    ativo: false,
    embedSrc: 'https://widgets.sofascore.com/embed/COLE_AQUI_A_URL_OFICIAL',
  },
  {
    id: 'corinthians-player-destaque',
    tipo: 'player',
    titulo: 'Destaque do elenco',
    afiliacaoSlug: 'corinthians',
    jogadorId: '12345',
    contextos: ['jogador', 'artigo'],
    prioridade: 3,
    ativo: false,
    embedSrc: 'https://widgets.sofascore.com/embed/COLE_AQUI_A_URL_OFICIAL',
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
<WidgetSection contexto="classificacao" afiliacaoSlug={afiliacaoSlug} />

// artigo — detalhe de post (já integrado em post/[id]/page.tsx)
<WidgetSection contexto="artigo" afiliacaoSlug={afiliacaoSlug} limit={1} />

// home / clube — reservados para widgets futuros no aside/feed (não usados pelo standings piloto)
// campeonato — EXEMPLO ILUSTRATIVO (ainda não há rota de campeonato na comunidade)
<WidgetSection contexto="campeonato" afiliacaoSlug={slug} competicaoSlug="brasileirao-serie-a" />

// jogador — EXEMPLO ILUSTRATIVO (ainda não há rota de jogador na comunidade)
<WidgetSection contexto="jogador" afiliacaoSlug={slug} jogadorId="12345" limit={1} />
```

Resolução do slug: `resolverAfiliacaoSlugContexto(afiliacaoId)` em
`apps/web/src/lib/sofascore-server.ts` (React `cache`, `id → slug`); quem decide qual
`afiliacaoId` usar (tenant vs torcedor nacional) é a página, via
`resolverContextoComunidade` (`comunidade-contexto.ts`, que já expõe `afiliacao.slug`).

Na comunidade nacional, o feed mostra só um CTA “Classificação” apontando para
`/portal/comunidade/classificacao` (sem iframe inline).

## Testes

`apps/web/src/lib/__tests__/sofascore-widgets.test.ts` — filtragem por clube/contexto
(incl. `classificacao`), ativo, prioridade, limit, competição/jogador, e `[]` sem slug.

## Checklist de validação

- [ ] iframe carrega o widget oficial (URL gerada em widgets.sofascore.com).
- [ ] Card **some por completo** quando não há widget configurado para o clube (sem placeholder).
- [ ] Contraste/cores do **card wrapper** batem com a comunidade (CSS vars `--border`/`--surface`).
- [ ] Tema do iframe: se dark for necessário, regenerar `embedSrc` no painel Sofascore.
- [ ] Responsivo mobile (iframe `w-full`, altura do cadastro).
- [ ] Sem CLS visível (altura mínima reservada + `loading="lazy"`).
- [ ] `pnpm --filter @torcida/web test` passa.
- [ ] `pnpm --filter @torcida/web lint` e `tsc --noEmit` passam.
