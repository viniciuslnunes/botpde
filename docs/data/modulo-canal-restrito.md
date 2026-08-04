# Módulo — Canal Restrito (R5)

> Status: **implementado** (2026-08-01, branch `feat/canal-restrito`).
> Complementa `proposta-governanca-hierarquica.md` (R1–R4) e
> `ARCHITECTURE.md` §5 (hierarquia / visibilidade cross-tenant).

## 1. O que é

A liderança de uma **unidade com portal próprio** (Caso B — tenant filho na
árvore de `Sede`) pode **fechar o canal**: a unidade sai da malha de
**interação** da plataforma, mantendo intactas a administração e a comunidade
**internas**.

Não é secessão, não é desativação e não apaga nada. É um corte de
**visibilidade derivado em tempo de leitura** — desligar o toggle reestabelece
todos os vínculos automaticamente.

## 2. Regras travadas

- **R5.1 — A praça social é cortada nos dois sentidos** (revisado 2026-08-01).
  A unidade some para fora **e** deixa de ver o feed da Sede, das coirmãs e da
  comunidade nacional. Fechar o canal é sair da praça social, não só se
  esconder nela.
- **R5.1b — O comunicado oficial da Sede é a ÚNICA publicação externa que a
  unidade isolada enxerga.** Comunicado (`Announcement`) e evento da Sede
  seguem chegando; nenhum post de membro, de coirmã ou da CN passa. É o que
  separa isolamento de secessão.
  Implementado em duas frentes, porque o comunicado vive em dois lugares:
  - **lista de comunicados** (`fetchComunicadosBase`) → recurso
    `comunicados` em `RECURSOS_CASCATA_INSTITUCIONAL`;
  - **card no feed** → o comunicado também é um `Post` INSTITUCIONAL **único,
    no tenant de quem publicou** (não há fan-out por unidade — ver
    `criarComunicado`). Como o ancestral saiu do conjunto do feed, ele volta
    por uma cláusula própria: `orSomenteComunicadoOficial` +
    `resolveTenantIdsSomenteComunicado` (`lib/feed.ts`), aplicada em
    `getDescobrirPostsBaseCached`, `getFeedComunidade` e `getPostPorId`
    (permalink) — os três precisam concordar, senão o card aparece e o link
    dá 404.
- **R5.2 — Só unidade.** A Sede raiz não tem toggle: ela não tem de quem se
  isolar, e fechá-la esconderia a torcida inteira.
- **R5.3 — A Sede nunca perde a estrutura.** A unidade continua listada em
  `/admin/sedes` e `/admin/torcida`, com badge "Canal restrito".
- **R5.4 — Reativação por silêncio.** A Sede pode **solicitar** a reabertura;
  a liderança tem **5 dias** para responder. Sem resposta, o canal reabre
  **automaticamente**.
- **R5.5 — Recusa não é final.** O **owner** da Sede pode **impor** a
  reabertura, com justificativa obrigatória registrada nos dois tenants.
  Sem essa saída a regra teria um furo: como o silêncio reabre em 5 dias,
  recusar seria a jogada dominante para isolar para sempre.
- **R5.6 — Monitoramento é read-only e explícito.** Presidente/Vice leem a
  comunidade da unidade em `/admin/torcida/unidade/[tenantId]?modulo=comunidade`,
  sob `assertPresidentePodeLerUnidade`. A unidade **nunca** é injetada no feed
  pessoal do Presidente — isso vazaria pelo cache compartilhado da Sede.
- **R5.7 — Admissão continua subindo.** Pedidos de sócio e aprovações seguem
  gerando o espelho `SaasMembro.espelhado` na Sede, canal restrito ou não.
- **R5.8 — Entrada por convite.** Unidade restrita sai do onboarding público;
  quem entra vem por `/convite/<slug>`.

## 3. Arquitetura

### 3.1 Duas camadas, uma fonte de verdade

| Camada | Arquivo | Papel |
|---|---|---|
| Primitiva pura | `packages/types/src/visibility.js` → `aplicarIsolamento` | rebaixa a `TenantRelation` conforme o estado dos dois lados |
| Estado | `apps/web/src/lib/isolamento.ts` | `getTenantsRestritos()`, `isTenantRestrito`, `filtrarTenantsRestritos`, `estadoIsolamentoDoPar` |
| Apresentação | `apps/web/src/lib/canal-restrito.ts` | estado para UI (desde, pendência, prazo, última decisão) |
| Transições | `apps/web/src/lib/canal-restrito-mutacoes.ts` | `reabrirCanal`, notificações, invalidação |

```js
aplicarIsolamento(relation, { atorRestrito, alvoRestrito })
// self                    → self       (comunidade interna intacta)
// alvo restrito           → unrelated  (ninguém de fora enxerga a unidade)
// ator restrito, ancestor → ancestor   (a unidade continua vendo as PRÓPRIAS
//                                       sub-unidades — para baixo não é "externo")
// ator restrito, resto    → unrelated  (inclusive 'descendant': a unidade
//                                       deixa de ver o feed da Sede)
```

O `alvoRestrito` é avaliado **antes** do `atorRestrito`: é ele que protege a
unidade isolada, inclusive contra o próprio ancestral no fluxo social.

**A cascata institucional NÃO passa por aqui.** Ela é resolvida por recurso em
`getVisibleTenantIdsImpl`: com ator restrito, os ancestrais só entram no
conjunto quando `recursoCascateiaParaIsolado(recurso)` — hoje `comunicados` e
`eventos`. Foi preciso separar `comunicados` de `comunidade` na matriz
`RECURSO_SENSIBILIDADE` justamente porque `fetchComunicadosBase` e o feed de
posts liam o mesmo conjunto: sem a separação, cortar o feed da Sede derrubaria
junto o comunicado oficial dela.

### 3.2 Expiração derivada na leitura — decisão-chave

`getTenantsRestritos()` **exclui** do conjunto qualquer tenant com solicitação
`PENDENTE` cujo `prazoEm` já passou. Consequência: a reativação automática dos
5 dias **não depende do cron**. Se o scheduler estiver fora do ar, o canal volta
do mesmo jeito na próxima leitura.

O `unstable_cache` guarda as **linhas cruas** (prazo em ISO) e o corte por tempo
acontece **fora** dele — a janela de 60s do cache não atrasa a reativação nem um
segundo.

> **Nunca ler `Tenant.canalRestrito` direto.** A coluna pode dizer `true`
> enquanto o estado efetivo já é `false`. Toda UI e todo loader passam por
> `getTenantsRestritos` / `isTenantRestrito` / `getEstadoCanalRestrito`.

### 3.3 Estrutural × interação (a linha que não pode ser cruzada)

**NÃO gatear** — sustentam governança, espelho de membro, console R1 e
`/admin/sedes`:
`getAncestorTenantIds`, `getDescendantTenantIds`, `getTorcidaLineageTenantIds`,
`getTorcidaWorktree`, `getTenantHierarquia`.

**Gatear** — malha de interação:
`getTenantRelation`, `getVisibleTenantIds`, `getAlliedTenantIds`,
`tenantsAreAllied`, e os conjuntos por `afiliacaoId` (§3.4).

### 3.4 Pontos de corte por módulo

`getTenantRelation`/`getVisibleTenantIds` cobrem a maioria por herança. Os que
consultam o clube inteiro por `afiliacaoId` não passam por lá:

| Superfície | Arquivo | Corte |
|---|---|---|
| Feed / canais / stories / busca | `lib/hierarquia.ts` `getVisibleTenantIdsImpl` | com ator restrito, ancestrais saem do conjunto (recurso `comunidade`) |
| Comunicados oficiais | `lib/comunidade.ts` `fetchComunicadosBase` | usa o recurso `comunicados` — ancestrais **permanecem** |
| Comunidade Nacional (base) | `lib/comunidade-contexto.ts` `getTenantIdsPorAfiliacao` | filtra restritos — corta feed nacional, grupos nacionais e derivados |
| Feed do sócio | `lib/feed.ts` `resolveVisibleTenantIdsForFeed` | unidade restrita não recebe o sintético da CN nem as coirmãs; coirmã restrita não entra no feed de ninguém |
| Salas nacionais | `lib/salas.ts` `listSalasNacionais` | filtra restritos + tag `ISOLAMENTO_CACHE_TAG` |
| Onboarding — torcidas | `lib/onboarding.ts` `getTorcidasPorAfiliacao` | remove restritos das raízes |
| Onboarding — unidades | `lib/onboarding.ts` `getSedesDaTorcidaOnboarding` | remove sedes de tenant restrito |
| Loja | `lib/loja-lojas.ts` `tenantsPermitidosLoja` | unidade restrita mantém a própria loja, perde a ponte com a raiz; fora do R5 a ponte depende de `lojaVisivelNasUnidades` na Sede |
| Agenda (portal) | `lib/eventos.ts` `getEscopoEventosVisiveis` | R5 mantém cascata institucional de eventos; fora do R5 a Sede só entra se `agendaVisivelNasUnidades` |
| Vitrine de canais da CN | `lib/canais.ts` `listCanaisPublicosPorAfiliacao` | não passa por `podeVerCanal` → corte explícito |
| DM | `lib/mensageria.ts` `isParSeparadoPorCanalRestrito` | bloqueia quando um lado vive só em unidades restritas e não compartilham nenhuma |
| Alianças | `app/admin/aliancas/actions.ts` `assertCanalNaoRestrito` | bloqueia propor/aceitar; as ATIVAS ficam gravadas e inertes |
| Engajamento (reagir/comentar/denunciar/salvar) | `app/portal/comunidade/actions.ts` `podeEngajarPostVisivel` | trava de isolamento **antes** do fast-path "mesmo clube + PÚBLICO"; **exceção self**: vínculo `APROVADO` no tenant do post (torcedor do convite) engaja no mural interno. Compartilhar/repost continua só sócio |
| Permalink de post | `lib/feed.ts` `getPostPorId` | mesma cláusula do feed — card e link precisam concordar |

Busca de canais/unidades (`listUnidadesVisiveis`, `buscarCanaisEUnidades`) e
grupos herdam de `getVisibleTenantIds` — sem código novo.

## 4. Máquina de estados da reativação

`SolicitacaoReativacaoCanal` — um PENDENTE por tenant (checado na action).

```
                 solicitarReativacaoCanal (Presidente/Vice)
                              │
                          PENDENTE ──(5 dias sem resposta)──► EXPIRADA  → canal aberto
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
    APROVADA              RECUSADA              IMPOSTA
 (liderança aprova     (liderança recusa    (owner da Sede passa
  ou desativa o        com justificativa;    por cima, com motivo)
  toggle)              canal segue restrito)
        │                                           │
   canal aberto                                canal aberto
```

| Ação | Onde | Gate |
|---|---|---|
| `ativarCanalRestrito` | `/admin/configuracoes` | `SETTINGS_MANAGE` + `assertOwnerOuSuportePlataforma` |
| `desativarCanalRestrito` | `/admin/configuracoes` | idem |
| `responderReativacaoCanal` | `/admin/configuracoes` | idem |
| `solicitarReativacaoCanal` | `/admin/sedes` | `assertPresidenteGlobal` + alvo ∈ descendentes |
| `imporReativacaoCanal` | `/admin/sedes` | `assertPresidenteGlobal` + `assertTenantOwner` + motivo |

`assertOwnerOuSuportePlataforma` = owner da unidade, ou super-admin quando a
unidade liberou o suporte da plataforma (ou ainda não tem liderança). Ver
`ARCHITECTURE.md` §5.18 e `docs/data/modulo-super-admin.md`.

Cron: `/api/cron/canal-restrito-expiracao` (`CRON_SECRET`, idempotente) —
**materializa** a expiração (flag, status, `AuditLog`, notificações). Não é o que
garante a regra (§3.2).

Notificações: `CANAL_RESTRITO_ATIVADO`, `CANAL_REATIVACAO_SOLICITADA`,
`CANAL_REATIVACAO_RECUSADA`, `CANAL_REATIVADO` — declaradas em
`POLITICA_POR_TIPO` **e** `ROTA_POR_TIPO` (invariante testada).

## 5. Convite direto

`Tenant.conviteSlug` + `conviteAtivo`, gerados com `generateInviteSlug()`
(`lib/invite-slug.ts`). Vale para **qualquer** tenant; para unidade restrita é a
única porta de entrada.

Fluxo (`app/convite/[slug]/page.tsx` — só lê e redireciona, nunca escreve em GET):

```
/convite/<slug>
  ├─ sem sessão          → /entrar?callbackUrl=/convite/<slug>
  ├─ sem apelido/e-mail  → /definir-apelido?callbackUrl=/convite/<slug>
  └─ pronto              → /onboarding?convite=<slug>  → wizard abre em "Vínculo"
```

O convite **não** pula identidade: e-mail + apelido (`@`) continuam obrigatórios,
inclusive no login social. `/definir-apelido` ganhou suporte a `callbackUrl`
(validado como caminho interno relativo — nada de open redirect).

**O `callbackUrl` tem que sobreviver à cadeia inteira (2026-08-01).** Basta um
elo perder o parâmetro para o convidado cair em `/onboarding?passo=clube` — o
sintoma é o wizard começar do zero mesmo com link válido. Elos que carregam o
destino hoje:

```
/entrar (link "Criar conta")  → /entrar/criar-conta?callbackUrl=…
/entrar/criar-conta (page)    → hidden input no form + "Voltar" preserva o destino
criarContaComSenha            → entra com `callbackUrl` (fallback /onboarding)
proxy.ts, já logado em /entrar → honra `callbackUrl` em vez de /auth/contexto
```

**Cinto de segurança (2026-08-01):** ao visitar `/convite/<slug>`, o `proxy.ts`
grava o cookie httpOnly curto `torcida_convite`. Login, cadastro, apelido,
`/auth/contexto` e `/onboarding` leem esse cookie se o `callbackUrl`/`?convite=`
sumir. O wizard mantém `?convite=` em todo `replaceState`/`pushState` (antes
apagava e um refresh caía no passo Clube). Ao mexer em login/cadastro, refaça o
teste em aba anônima com **conta nova por e-mail**.

`lib/convite.ts` `resolverConvite(slug)` monta clube + torcida + unidade **sem**
passar pelos filtros de isolamento: quem tem o link foi convidado. Se a unidade
Caso B estiver sem `afiliacaoId`, herda o clube do ancestral
(`resolverAfiliacaoIdEfetiva`) — sem isso o link “válido” caía no passo Clube.

Torcedor da unidade: o caminho `tipo: 'TORCEDOR'` de `solicitarVinculo` já cria
`SaasMembro` APROVADO no tenant da unidade. Com o tenant restrito, o gate de §3.4
faz o feed dele ser só o da unidade, sem CN — **zero regra nova de feed**.

## 6. Reativação: por que tudo volta sozinho

Nenhuma escrita destrutiva acontece no isolamento — aliança não é apagada,
`MembroConversa` não é removido, post não é despublicado. Ao reabrir:

1. `invalidateIsolamentoCache()` + `invalidateHierarchyCache(tenantId)` +
   `invalidarCachesComunidadeFeed(tenantId)`;
2. `getTenantRelation` volta a devolver `ancestor`/`descendant`/`allied` e a
   malha inteira reaparece;
3. posts novos voltam a propagar para a rede do clube — o fan-out sempre gravou
   normal, só a leitura estava filtrada;
4. torcedores criados sob o convite passam a enxergar a CN automaticamente.

## 7. Testes

- `lib/__tests__/canal-restrito.test.ts` — `aplicarIsolamento` (assimetria,
  `self` intocado, alvo restrito vence).
- `lib/__tests__/isolamento.test.ts` — expiração derivada, `filtrarTenantsRestritos`
  com `manter`, `estadoIsolamentoDoPar`, prazo de 5 dias.

Testes que mockam `@/lib/hierarquia` ou `next/cache` precisam mockar também
`@/lib/isolamento` (aliancas, onboarding, onboarding-torcidas,
mensageria-solicitacao já o fazem).

### 7.1 Auditoria contra o banco real (2026-08-01)

`pnpm --filter @torcida/web audit:canal-restrito`
(`lib/__audit__/canal-restrito.audit.ts`) — **24 conformes, 0 erros**.

Existe porque `audit:regras` alerta que nenhuma torcida semeada tem par
ancestor/descendant: as Subsedes/PDEs são `Sede` filhas **sem tenant próprio**.
Como o canal restrito só existe em unidade Caso B, o módulo inteiro não tinha
como ser exercitado com dado real. A auditoria **semeia** a forma (tenant
fixture `[AUDIT-R5]` + `Sede` com `sedeId` na Sede mãe, igual ao que
`promoverSedeAction` produz), mede e reverte.

Cobre: corte simétrico da praça social (R5.1), cascata institucional viva
(R5.1b — `comunidade` cortado × `comunicados`/`eventos` mantidos), estrutural
nunca gateado (R5.3), conjuntos por `afiliacaoId` (CN + onboarding), expiração
derivada na leitura com a flag ainda `true` no banco (§3.2), reabertura sem
escrita de reparo (§6) e o critério do gate de R5.2.

⚠️ **Muta o banco** (cria/apaga Tenant e Sede). Como as demais `*.audit.ts`,
fica fora do CI — o `DATABASE_URL` é o do Railway.

> Convenção que a primeira versão desta auditoria errou: `getTenantRelation`
> descreve o que o **ator** é em relação ao alvo. Mãe→filha é `ancestor` (vê
> tudo), filha→mãe é `descendant` (só o público) — não o contrário.
