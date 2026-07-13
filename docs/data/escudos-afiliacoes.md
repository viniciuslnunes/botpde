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
| Afiliações totais | 325 |
| Com escudo | 139 |
| Sem escudo | 186 |
| Escudos via Soccer Wiki (Fases A+B+D parcial) | 120 |
| Clubes raspados no Soccer Wiki | 246 (listagem completa até offset 300) |

Relatório versionado: `packages/db/src/data/escudos-soccerwiki-report.json`
(gerado por `seed:escudos-soccerwiki -- --report-only`).

### Fontes em uso

1. **TheSportsDB** — seed original `seed:afiliacoes` (Série A–D curada).
2. **Cloudinary** — migração de assets locais (`seed:migrate-escudos-cloudinary`).
3. **Soccer Wiki** — scrape paginado Brasil (`seed:escudos-soccerwiki.js`).
4. **TheSportsDB** — índice Séries A–D + busca (`seed:escudos-thesportsdb.js`);
   requer `THESPORTSDB_KEY` patrono para cobertura ampla.

### Lógica de casamento (estrita)

Implementada em `packages/db/src/data/escudos-wiki-match.js` +
`packages/db/src/data/afiliacoes-normalize.js` (`ALIASES`):

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
pnpm --filter @torcida/db seed:escudos-thesportsdb -- --report-only
pnpm --filter @torcida/db seed:escudos-thesportsdb -- --sem-busca
pnpm --filter @torcida/db seed:escudos-thesportsdb
pnpm --filter @torcida/db db:repair-afiliacoes-torcidas   # funde duplicatas de clube
pnpm --filter @torcida/db test:afiliacoes
```

## Plano de progresso (inteligência)

### Fase A — Concluída ✅

- [x] Script `seed:escudos-soccerwiki` (scrape + Cloudinary + update `escudoUrl`).
- [x] `inferirUfDoNome` e matching estrito com homônimos.
- [x] Relatório `escudos-soccerwiki-report.json` (pares + `semMatchLista`).
- [x] 87 escudos seguros publicados em produção.

### Fase B — Aliases e nomes longos ✅ (2026-07-13)

Implementado em `packages/db/src/data/escudos-wiki-match.js` (`WIKI_UF_POR_NOME`,
`WIKI_ALIASES`, `scoreWikiAfiliacao`) + expansão de `ALIASES` em
`afiliacoes-normalize.js`. **31 escudos** novos (todos score 100).

- [x] `WIKI_UF_POR_NOME` implementado e testado.
- [x] Tier 1 com par validado no relatório.
- [x] Testes de homônimos em `test-afiliacoes.js`.
- [x] `inferirUfDoNome` não confunde `Ceará SC` com Santa Catarina.
- [x] Score 90 exige UF explícita nos dois lados; homônimos expandidos
  (`guarani`, `santa cruz`, `rio branco`, `central`).

Detalhamento original da fase (diagnóstico, tiers, riscos):

Três causas distintas (não misturar na implementação):

| Causa | Exemplo | Onde corrigir |
|---|---|---|
| **A. Wiki sem UF inferível + homônimo** | `Botafogo FR` (Wiki) × `Botafogo (RJ)` (banco) — `FR` não é sigla de estado; `botafogo` está em `CHAVES_HOMONIMAS` | `WIKI_UF_POR_NOME` no script Soccer Wiki |
| **B. Nome longo no banco** | `Fluminense Football Club (RJ)` — `ALIASES` já tem a chave, mas a afiliação duplicada ainda aparece em `semMatchLista` | `ALIASES` + **Fase C** (herdar escudo da canônica) |
| **C. Nome longo no banco + Wiki com sufixo EC/SC** | `Ceará (CE)` × `Ceará SC`; `Vitória (BA)` × `EC Vitória`; `Náutico (PE)` × `Náutico` (homônimo) | `ALIASES` + `WIKI_ALIASES` + `WIKI_UF_POR_NOME` quando aplicável |

**Importante:** vários itens da `semMatchLista` (ex.: `Grêmio (RS)`, `Internacional (RS)`,
`Fluminense Football Club`) são **duplicatas** — a variante curta (`Grêmio`, `Internacional`,
`Fluminense`) já recebeu escudo na Fase A. A Fase B sozinha não os remove da lista;
a **Fase C** herda `escudoUrl` ou funde afiliações. A Fase B ainda vale para a
variante longa se ela for a única sem escudo após repair.

#### B.2 Duas camadas de alias (não confundir)

```
Soccer Wiki (nome na página)     Afiliacao (nome no banco)
         │                                │
         ▼                                ▼
   WIKI_ALIASES                    ALIASES
   (chave normalizada)             (normalizeNome completo)
         │                                │
         └──────── chaveMatch / chaveGrupoClube ────────┘
                              +
                    WIKI_UF_POR_NOME (novo)
                    inferirUfDoNome (existente)
```

- **`ALIASES`** (`packages/db/src/data/afiliacoes-normalize.js`) — lado **banco**:
  nome completo do catálogo → nome curto canônico. Usado por `saoMesmoClube`,
  `chaveGrupoClube`, onboarding e `repair-afiliacoes-torcidas`.
- **`WIKI_ALIASES`** (`seed-escudos-soccerwiki.js`) — lado **Wiki**: nome como
  aparece no scrape → chave de casamento. Só afeta o seed de escudos.
- **`WIKI_UF_POR_NOME`** (a criar na Fase B) — mapa explícito `normalizeNome(wiki.nome)`
  → UF quando o Wiki não traz sufixo de estado e o clube é homônimo nacional.
  **Obrigatório** para homônimos; nunca inferir UF por heurística ampla.

#### B.3 Backlog priorizado

**Tier 1 — Série A/B, alto impacto no onboarding** (~15 clubes)

| Banco (`semMatchLista`) | Wiki (esperado) | Ação |
|---|---|---|
| `Botafogo (RJ)` | Botafogo FR | `WIKI_UF_POR_NOME`: `botafogo fr` → RJ |
| `Clube Atlético Paranaense (PR)` | Athletico Paranaense | `ALIASES`: `clube atletico paranaense` → `athletico paranaense` (já parcial em `athletico pr`) |
| `Ceará (CE)` | Ceará SC | `WIKI_ALIASES` já tem `ceara sc`; validar `ALIASES` `ceara` |
| `Vitória (BA)` | EC Vitória | `WIKI_ALIASES` já tem `ec vitoria`; `WIKI_UF_POR_NOME`: `ec vitoria` → BA |
| `Náutico (PE)` | Náutico | `WIKI_UF_POR_NOME`: `nautico` → PE (cuidado: Marcílio Dias é outro clube) |
| `Sport (PE)` / `Sport Club do Recife (PE)` | Sport Recife | `WIKI_ALIASES` `sport recife` → `sport`; `WIKI_UF_POR_NOME`: `sport recife` → PE |
| `Atlético-MG (MG)` | Atlético Mineiro | `ALIASES` já tem `atletico mg`; conferir duplicata com nome longo |
| `Atlético-GO (GO)` | Atlético Goianiense | idem `atletico go` |
| `Club de Regatas Vasco da Gama (RJ)` | Vasco da Gama | `ALIASES` `vasco` + nome longo |
| `Sociedade Esportiva Palmeiras (SP)` | Palmeiras | alias nome longo → `palmeiras` |
| `Clube de Regatas Brasil (AL)` | CR Brasil / Clube de Regatas Brasil | `WIKI_ALIASES` parcial; validar UF AL |
| `Centro Sportivo Alagoano (AL)` | CSA | alias `csa` ou nome Wiki |
| `Operário Ferroviário Esporte Clube (PR)` | Operário Ferroviário EC | `WIKI_ALIASES` parcial; `WIKI_UF_POR_NOME` → PR |
| `Operário-PR (PR)` | Operário FC (Ponta Grossa) | validar se Wiki lista o de PR vs VG/MT |
| `Paysandu (PA)` / `Paysandu Sport Club (PA)` | Paysandu SC | alias + herança duplicata |

**Tier 2 — Nomes longos / duplicatas de clubes já mapeados** (~20)

| Banco | Canônico com escudo (Fase A) | Ação principal |
|---|---|---|
| `Fluminense Football Club (RJ)` | `Fluminense` | Fase C: herdar escudo |
| `Sport Club Internacional (RS)` | — (Internacional sem escudo na duplicata) | `ALIASES` + match `SC Internacional` no Wiki |
| `Grêmio Foot-Ball Porto Alegrense (RS)` | `Grêmio (RS)` sem escudo | alias + Wiki `Grêmio` |
| `Grêmio (RS)` | — | Wiki nome `Grêmio` + `WIKI_UF_POR_NOME` → RS |
| `Internacional (RS)` | — | Wiki `SC Internacional` + UF RS |
| `Associação Portuguesa de Desportos (SP)` | Portuguesa | alias |
| `Associação Atlética Ponte Preta (SP)` | Ponte Preta | alias (já mapeado na curta) |
| `Bangu` / `Bangu Atlético Clube` | Bangu | dedup + alias |
| `Boavista` vs `Boavista Sport Clube` | Boavista já mapeado (RJ) | Fase C |

**Tier 3 — Estaduais com nome próximo no Wiki** (~15–25, validar um a um)

Exemplos onde o Wiki provavelmente tem o clube mas o nome diverge demais para score 90:

- `Agremiação Sportiva Arapiraquense` → ASA (já mapeado como `ASA` na Fase A — conferir se é a mesma afiliação)
- `Anapolina` / `Asociação Atlética Anapolina` → Anapolina no Wiki
- `Ferroviário (CE)` → Ferroviário CE
- `Confiança (SE)` → Confiança
- `CSA (AL)` → Centro Sportivo Alagoano no Wiki
- `Juventude (RS)` → EC Juventude
- `Avaí` — já na Fase A; variantes longas → Fase C

**Fora do escopo da Fase B** (ir para Fase D): clubes ausentes do scrape 0–300
(`4 de Julho`, `Ji-Paraná`, times de AP/RR/AC etc.).

#### B.4 Implementação (passos)

1. **Criar `WIKI_UF_POR_NOME`** em `seed-escudos-soccerwiki.js`:
   ```js
   const WIKI_UF_POR_NOME = {
     'botafogo fr': 'RJ',
     'ec vitoria': 'BA',
     'sport recife': 'PE',
     'nautico': 'PE',           // só se clubid único no scrape
     'gremio': 'RS',            // homônimo — só com entrada explícita
     'sc internacional': 'RS',
   }
   ```
   Usar em `scoreWikiAfiliacao` **antes** de `inferirUfDoNome`: `ufWiki = WIKI_UF_POR_NOME[nm] ?? inferirUfDoNome(wiki.nome)`.

2. **Expandir `ALIASES`** (banco) — só entradas `normalizeNome(nomeCompleto)` validadas:

   ```js
   'clube atletico paranaense': 'athletico paranaense',
   'grêmio foot-ball porto alegrense': 'gremio',
   'sociedade esportiva palmeiras': 'palmeiras',
   'sport club do recife': 'sport',
   'ceara sporting club': 'ceara',  // se existir variante longa
   ```

3. **Expandir `WIKI_ALIASES`** — nomes exatos do HTML do scrape (conferir em
   `--report-only` ou inspecionar página).

4. **Testes** em `scripts/test-afiliacoes.js`:
   - `Botafogo FR` + UF RJ casa com `Botafogo (RJ)`; **não** casa com `Botafogo-PB`.
   - `Sport Recife` + PE casa com `Sport (PE)`; **não** casa com `Sport Club São Paulo (RS)`.

5. **Workflow de validação** (obrigatório antes de upload):
   ```bash
   pnpm --filter @torcida/db seed:escudos-soccerwiki -- --report-only
   ```
   - Revisar **todos** os pares novos com `score: 90` (não só 100).
   - Rejeitar manualmente qualquer par cross-UF.
   - Rodar `--dry-run` e só então upload em produção.

6. **Ordem de execução com Fase C**: após aliases, rodar
   `db:repair-afiliacoes-torcidas` para fundir duplicatas e propagar `escudoUrl`
   da canônica — evita upload duplicado no Cloudinary.

#### B.5 Critérios de aceite

- [ ] `WIKI_UF_POR_NOME` implementado e documentado no script.
- [ ] Tier 1 (tabela acima) com par validado no relatório ou explicitamente marcado como Fase C/D.
- [ ] Zero novos casamentos cross-UF em amostra de homônimos (teste automatizado).
- [ ] `semMatch` reduz em ≥ 30 **ou** explicação documentada de quantos foram para Fase C.
- [ ] Nenhum escudo de clube grande (Série A/B) vazio no grid após dedup no onboarding.

#### B.6 Riscos específicos da Fase B

| Risco | Mitigação |
|---|---|
| `nautico` → PE pega clube errado | Mapear por `clubid` do Wiki, não só nome |
| `gremio` → RS bloqueia Grêmio Maringá | UF obrigatória nos dois lados; Maringá tem chave distinta |
| Alias no banco afeta repair/onboarding | Todo alias novo em `ALIASES` passa por `test:afiliacoes` |
| Upload duplicado Cloudinary | Herdar `escudoUrl` na Fase C antes de re-seed |

#### B.7 Estimativa

| Entrega | Escudos novos (estimativa) |
|---|---|
| Tier 1 (UF explícita + homônimos) | 10–15 |
| Tier 2 (aliases nome longo) | 5–10 (mais Fase C) |
| Tier 3 (estaduais) | 15–25 |
| **Total Fase B** | **30–50** (conservador) |

Relatório de referência: `escudos-soccerwiki-report.json` → `semMatchLista` (255 itens);
cruzamento manual com os 246 clubes do Wiki.

### Fase C — Afiliações duplicadas ✅ (2026-07-13)

- [x] **+26 aliases** em `ALIASES` para variantes longas (Paysandu Sport Club, Bangu
  Atlético, Central Sport Club, Confiança AD, Portuguesa AA, Cabofriense, Icasa,
  ASA, Caxias, Sergipe, Potiguar…).
- [x] `db:repair-afiliacoes-torcidas` — **26 duplicatas fundidas**, **14 escudos**
  propagados para a afiliação canônica (sem re-upload Cloudinary).
- [x] Afiliações totais: 351 → **325** (menos ruído no `semMatchLista`).
- [x] Testes `saoMesmoClube` para Paysandu, Bangu, Confiança.

### Fase D — Cobertura fora do Soccer Wiki (em andamento)

Soccer Wiki esgotado (246 clubes; offset 350 vazio). Restam **186** afiliações sem
escudo — majoritariamente estaduais/Série D **ausentes** da listagem Wiki.

**Entregue nesta rodada:**
- [x] Paginação até offset 350 com parada automática em página vazia.
- [x] +2 escudos Wiki (Portuguesa, Cabofriense via `AD Cabofriense`).
- [x] Script `seed:escudos-thesportsdb` — índice das 4 ligas + `searchteams.php`
  com casamento estrito (`escudos-thesportsdb-match.js`).
- [x] Relatório `escudos-thesportsdb-report.json`.

**Cobertura TheSportsDB:** a chave pública `3` retorna ~10 times/liga (~28 no índice).
Para cobertura útil, defina `THESPORTSDB_KEY` (patrono) antes de rodar o seed.
Com chave pública + busca: poucos matches adicionais (estaduais raramente na API).

**Próximo (Fase D continuação):**
1. Rodar `seed:escudos-thesportsdb` em produção com `THESPORTSDB_KEY` patrono.
2. Aliases Wiki/API pontuais conforme relatórios (`semMatchLista`).
3. Placeholder neutro no UI para clubes sem escudo (não inventar imagem).

### Fase E — Onboarding UI + qualidade contínua ✅ (2026-07-13)

- [x] Componente `EscudoClube` (`apps/web/src/components/onboarding/escudo-clube.tsx`):
  inicial + ícone neutro quando `escudoUrl` ausente ou com falha de carga.
- [x] Gate em `getAfiliacoesParaOnboarding`: herda `escudoUrl` de duplicata do grupo
  após dedup canônica; reordena com escudo primeiro.
- [x] Testes Vitest: `onboarding-afiliacoes.test.ts`.

**Qualidade contínua (pipeline de escudos):**

- Rodar `--report-only` antes de cada upload em produção; revisar pares com `score: 90`
  na lista manualmente.
- Teste de regressão: amostra de homônimos em `scripts/test-afiliacoes.js`.

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
