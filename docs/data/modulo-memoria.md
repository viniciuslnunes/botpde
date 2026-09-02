# Módulo — Memória (linha do tempo)

> O eixo é o **dia civil** (`America/Sao_Paulo`), não o feed. Não confundir com
> `FeedTimeline` (fan-out por viewer do mural).
>
> Planejamento **fechado** em 2026-08-30 (decisão #16). Fases 1–5 entregues
> neste contrato (`packages/types/src/memoria.js`). **Enriquecimento do acervo**
> (busca, marcos, capítulos, composer unificado, notificações) — 2026-09-02.
>
> Schema Prisma: `MemoriaFato`, `MemoriaMarco`, `MemoriaCapitulo`,
> `MemoriaCapituloDia`, `Tenant.memoriaAliados`,
> `PerfilMembro.memoriaPresencaVisivel`, `TipoNotificacao.MEMORIA_DIA_ABERTO` —
> exige `schema:deploy` em HML/prod após mudança de enum/tabela.

## Tese

A memória é o lugar onde a torcida (e, à parte, o torcedor do clube) reencontra
um dia: jogo, caravana, ensaio, foto, publicação. No futuro, um fato que não foi
postado na hora pode ser **ligado** àquele dia; e quem fez check-in no evento
pode, se quiser, aparecer para quem também estava. A finalidade é conexão — com
o recorte da torcida, nunca da praça inteira do futebol.

Três recortes, **um scroll cada**. Não misturar unidade e clube na mesma lista.

| Recorte | Query | Quem vê | O que entra |
|---|---|---|---|
| **Unidade** | tenant ativo | sócio / torcedor da unidade | posts visíveis do mural, eventos do escopo da Agenda, partida **só** se o dia já tem fato local |
| **Torcida** | linhagem Sede→unidades | quem `resolveVisibility` já permite | união do público (e, para ancestral, o que a hierarquia já libera). Unidade R5 **não** aparece |
| **Clube** | `Afiliacao` | torcedor global (CN) e quem tem o clube no perfil | `Partida` do time (o jogo **abre** o dia) + posts `alcanceNacional` `PUBLICO` + mural do tenant sintético. **Zero** `TENANT`/`PRIVADO` de qualquer torcida |

Entrada na top bar: **item de menu** "Memórias" (rótulo no plural; a rota e os
identificadores seguem `memoria`) com o ícone `History` do lucide,
ao lado de Loja em `navLinks` — não é ícone do cluster de chat/notificações
(2026-08-30). O `MemoriaMark` (escudo + espinha) segue como marca **dentro** do
módulo (header, vazios, aba do admin), não na topbar. Visível também na CN, onde
`hrefDoLink` leva `?escopo=clube`. Abaixo de `xl` entra no hambúrguer com os
demais módulos.

Rota: `/portal/memoria?escopo=unidade\|torcida\|clube&dia=YYYY-MM-DD&f=jogo\|evento\|publicacao&cap=slug-do-capitulo`.

Query `cap` filtra a espinha para os dias de um **capítulo temático** (vista
derivada — o eixo continua sendo o dia civil).

Escopo padrão (`resolverEscopoMemoriaPadrao`): segue o **canal da Comunidade**
(cookie `comunidade_escopo` / top bar), não o tenant ativo da sessão. Sócio da
Camisa 12 com a marca **Timão** está na CN → recorte `clube` (jogos + mural
nacional; **zero** evento/caravana/unidade). Canal `torcida` → linhagem.
Canal `unidade` → a unidade, com chip opcional Unidade | Torcida (a memória
ampla da organizada). Trocar para a CN é o chrome, não um chip.

A espinha lista **todos** os dias do mês visível (vazio continua clicável para
fato atrasado). Query `?dia=YYYY-MM-DD`; o loader busca só aquele mês. Busca
por data no aside + prev/next de mês. Teto: 5 anos atrás (`MEMORIA_FATO_ANOS_MAX`)
e 90 dias à frente.

## Fase 1 — unidade, leitura — ✅ 2026-08-30

- Item de menu na top bar + hambúrguer (era ícone no cluster da direita até 2026-08-30).
- Espinha à esquerda (desktop) / faixa (mobile); painel do dia à direita.
- Loader: `carregarMemoria` (canal da Comunidade, não o tenant ativo). Posts
  `conversaId` nulo + `filtrarPostsVisiveis`. Eventos = `getEscopoEventosVisiveis`
  **só** em unidade/torcida — clube não lista evento. Partida órfã não abre nó
  fora do clube.
- Janela **do mês aberto** (paginação + busca de data); tetos 400/300/80. Sem
  tabela nova. Espinha = todos os dias civis do mês.

Arquivos: `lib/memoria-dia.ts`, `app/portal/memoria/`, testes em `memoria-dia.test.ts`.

## Fase 2 — clube + linhagem — ✅ 2026-08-30

**DoD**

- Ícone visível na CN; `?escopo=clube` lista jogos da `Afiliacao` (todo jogo abre
  dia) + posts que passam em `itemEntraNoEscopoClube`.
- Chip Unidade | Torcida só **dentro da unidade** (memória ampla da
  organizada). Na CN não há chip — o recorte é só o clube. Trocar de canal é a
  top bar (`comunidade_escopo`), não um filtro da Memória.
- `?escopo=torcida`: posts `PUBLICO` da linhagem visível + eventos já visíveis.
  Descendente não vê `TENANT` da Sede. R5: unidade isolada some da memória social
  da Sede (recurso `memoria` **não** está em `RECURSOS_CASCATA_INSTITUCIONAL`).
- Filtros atuais bastam; não criar filtro “aliados” aqui.
- Performance: clube usa `Partida (afiliacaoId, dataHora)` + posts
  `alcanceNacional` na janela. **Sem** tabela de índice ainda. Se p95 da espinha
  clube passar de 300 ms em tenant de teste com Top-50, aí sim `MemoriaDiaIndice`
  (abaixo) — não antes.

Não entra: memória atrasada, aliados, presença.

## Fase 3 — memória atrasada — ✅ 2026-08-30

Fato que **não** foi publicado no dia, ligado à data. **Não** reescreve
`Post.criadoEm` — o mural continua cronológico.

### `MemoriaFato` (proposta de schema)

```
id
tenantId          — unidade (nunca o sintético da CN nesta fase)
autorId
dia               Date  — midnight SP persistido como date-only (gravar startOfZonedDayUtc)
conteudo          String
midiaUrls         String[]
visibilidade      PUBLICO | TENANT   — jamais PRIVADO
status            PENDENTE | APROVADA | REJEITADA
postId?           — “ligar um post já existente a este dia”
eventoId?
aprovadoPorId?
decididoEm?
motivoRejeicao?
criadoEm
```

Índices: `(tenantId, status, dia)`, `(tenantId, dia)`, `(autorId, criadoEm)`.
Unique opcional `(tenantId, autorId, dia, postId)` para não duplicar o mesmo
vínculo.

**Regras** (`diaValidoParaFatoAtrasado` / `diaValidoParaPublicarMemoria`)

- Publicar na data: qualquer dia do calendário (5 anos atrás → 90 dias à frente).
- Passado (`dia < hoje`) = fato **atrasado**: nasce `PENDENTE`, aprova
  `community:moderate`.
- Hoje e futuro do calendário entram **na hora** (`APROVADA`) — não mandar o
  usuário para o mural.
- Quem cria: `community:post` no tenant (sócio) **ou** torcedor `APROVADO` da
  unidade, só no escopo unidade/torcida. Escopo clube **não** aceita fato.
  `AuditLog`. Fato atrasado: notificação ao autor quando a moderação decide.
- Só `APROVADA` entra na espinha. Rejeitada some da linha; o autor vê o motivo.
- Ligar `postId`: o post já tem que ser visível ao autor; a data da memória é
  `dia`, não `post.criadoEm`.

UI: no painel do dia, “Publicar neste dia” (hoje/futuro, entra na hora) ou
“Ligar a este dia” (passado, fila). Aparece com o dia vazio **e** quando já
há jogo/evento/publicação. Fila em `/admin/comunidade` (tab Memória).

Exigirá `schema:deploy` (HML→prod).

## Fase 4 — aliados (opt-in bilateral) — ✅ 2026-08-30

`Tenant.memoriaAliados Boolean @default(false)` **só na Sede raiz** (igual
`brechoAliados`). Presidente liga com `settings:manage` em Transparência.
`AuditLog`. Default **off**.

Compartilha **somente** se:

1. `Alianca` `ATIVA`;
2. as **duas** raízes com `memoriaAliados = true` (`aliadoPodeVerMemoria`);
3. conteúdo `PUBLICO`;
4. relação já resolvida (R5 pode ter rebaixado para `unrelated`).

Rival = nada. `TENANT`/`PRIVADO` = nada. Fato atrasado `PENDENTE` = nada.
Lista de presença (fase 5) = **nunca** para aliado.

Herdado pelas unidades da worktree, como a aliança. Unidade R5 não exporta
nem importa memória de aliado.

Não criar permissão nova.

## Fase 5 — “quem estava” — ✅ 2026-08-30

Conexão no dia, sem fingir que houve conversa.

**Sinal único:** `EventoRsvp.checkedInAt` no evento daquele dia, no **mesmo
tenant**. RSVP `CONFIRMADO` sem check-in **não** conta (RSVP ≠ presença).
Reação/comentário **não** entram (fase 5; sinal fraco e fácil de stalkear).

**Opt-in:** `PerfilMembro.memoriaPresencaVisivel` default `false` (por tenant).
Torcedor da unidade: o mesmo campo no perfil da unidade, não no perfil global.
Quem não ligou não aparece. Quem ligou e fez check-in aparece para os demais
que podem ver o evento (`podeListarPresenca`).

Fora: escopo `clube`, aliados, rivais, outro tenant, lista crua para staff
sem ser o recorte do dia. Teto 24 avatares + “e mais N”, link para o perfil
público. CTA se o viewer fez check-in e ainda não optou-in: “Você estava.
Aparecer neste dia?” → aba Sobre.

LGPD: presença é dado de localização/associação. Sem opt-in não lista, não
exporta, não usa para recomendação de follow automática nesta fase (o follow
continua manual).

## Fase 6 — Acervo (enriquecimento UX) — ✅ 2026-09-02

Camada de **descoberta, curadoria e narrativa** sobre as fases 1–5. O eixo por
dia civil não muda.

### Explorador e timeline

- Sidebar: busca no acervo, estatísticas, capítulos, filtros em pílulas.
- Espinha estilo catálogo (preview, miniaturas, badges de tipo, mês com contagem).
- Painel do dia: marco institucional (leitura), “Neste dia” (paralelos 1/2/3/5 anos),
  convite contextual, presença em destaque em dia de evento.

Arquivos: `app/portal/memoria/_components/*`, `lib/memoria-acervo.ts`,
`_lib/memoria-busca.ts`.

### Busca no acervo

- Texto em posts, eventos, fatos aprovados e adversário de partida.
- Mesma visibilidade do loader (`filtrarPostsVisiveis`, recorte ativo).
- Resultados agrupados por dia → deep link `?dia=`.

### Marcos institucionais (`MemoriaMarco`)

- Um marco por dia por tenant (`@@unique([tenantId, dia])`).
- Sempre `PUBLICO` no tenant; **não** vaza para clube nem aliado.
- Gate: `settings:manage` (diretoria).
- Aparece na espinha (`kind: marco`) e no painel (card âmbar).

### Capítulos temáticos (`MemoriaCapitulo` + `MemoriaCapituloDia`)

- Coleção nomeada (slug, título, dias `YYYY-MM-DD`) — campanha, temporada, etc.
- Navegação na sidebar; `?cap=slug` filtra a espinha (`filtrarDiasPorCapitulo`).
- Admin: `/admin/comunidade/memoria` (bloco Capítulos do acervo).
- Capítulo **não** substitui o dia — é vista derivada.

### Composer unificado (“Ligar a este dia”)

Um único campo no rodapé do painel. A intenção é inferida no servidor
(`publicarNaMemoriaDoDia` → `resolverEntradaMemoria`):

| Entrada | Destino | Quem |
|---|---|---|
| Texto livre | `MemoriaFato` (relato) | sócio aprovado / `community:post` |
| Chip ou prefixo `marco:` | `MemoriaMarco` | `settings:manage` |
| Chip ou prefixo `aniversário:` | `MemoriaMarco` (título prefixado) | `settings:manage` |
| Menção a criar evento/caravana | Dica → Agenda (`/portal/eventos`) | — |

Opcional no relato: **ligar a evento** ou **publicação** do dia (`eventoId` /
`postId` no fato). A fila de moderação mostra o vínculo.

Chips na UI: Relato | Marco | Aniversário (diretoria vê os três).

### Surfacing

- Badge **Memória oficial** em fatos aprovados e posts ligados a fato.
- Badge **Coirmã** em publicações de torcida aliada (`deCoirma`) — só no
  recorte `torcida`, quando `memoriaAliados` bilateral está ativo.
- **Compartilhar** (link / Web Share) e **PDF** (impressão do navegador; sidebar
  e composer ocultos via `@media print`).
- **Open Graph**: `generateMetadata` com `tituloMemoriaDia` quando `?dia=` está
  presente (`lib/memoria-meta.ts`).

### Notificação “o dia abriu” (`MEMORIA_DIA_ABERTO`)

Fan-out **1×/dia (~08h America/Sao_Paulo)** para sócios **aprovados** do tenant:

| Gatilho | Link | Corpo (resumo) |
|---|---|---|
| `Partida` do clube hoje | `?escopo=clube&dia=` | Memória do jogo aberta |
| `Evento` da unidade hoje | `?escopo=unidade&dia=` | Memória do evento aberta |

- Implementação: `lib/memoria-dia-aberto.ts` → `dispatchMemoriaDiaAberto`.
- Deduplicação: `criarNotificacoesEmLoteSePendentes` (mesmo `link` + tipo).
- Escopo social na inbox (`notificacoes-routing.ts`).

#### Cron (Railway / scheduler)

```
GET /api/cron/memoria-dia-aberto
Authorization: Bearer <CRON_SECRET>
```

Cadência recomendada: **1×/dia às 08:00 BRT** (mesmo padrão de
`/api/cron/eventos-lembretes`). Fora da janela das 08h SP o handler retorna
`{ jogos: 0, eventos: 0 }` sem erro.

Teste local (com secret no `.env`):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/memoria-dia-aberto
```

**Deploy:** novo valor em `TipoNotificacao` exige `pnpm --filter @torcida/db
schema:deploy` (HML → prod) — ver `docs/ops/schema-deploy.md`.

## Índice `MemoriaDia` (quando, não agora)

Não bloquear fase 2. Introduzir **junto da fase 3** (passa a haver escrita
própria) ou antes se o p95 da espinha clube estourar:

```
(escopoTipo, escopoId, dia) unique
kinds[], totais Json
atualizadoEm
```

`escopoTipo`: `tenant` | `afiliacao`. Fan-in on write (post, evento, fato
aprovado, partida sync). Leitura da espinha = keyset nessa tabela; o dia
aberto hidrata o detalhe.

## Visibilidade / RBAC

| Ação | Gate |
|---|---|
| Ler unidade/torcida/clube | sessão + recorte acima; `filtrarPostsVisiveis` / `getEscopoEventosVisiveis` |
| Criar fato atrasado | `community:post` (ou torcedor APROVADO da unidade) |
| Aprovar/rejeitar | `community:moderate` |
| Marco / capítulo do acervo | `settings:manage` |
| Flag aliados | `settings:manage` na raiz |
| Opt-in presença | o próprio usuário no perfil |

Recurso `memoria` em `RECURSO_SENSIBILIDADE` = `publico`. **Não** cascateia em
R5. Query sempre com `tenantId` ou `afiliacaoId`; nunca filtrar só na UI.

## UX (já na fase 1, vale para o resto)

- Desktop: espinha esquerda, dia direita. Mobile: faixa de datas no topo.
- Motion: presets (`springGentle`, `fadeUp`); `prefers-reduced-motion` pelo shell.
- Empty: unidade sem fato; recorte de filtro vazio; CN sem clube no perfil.
- Deep link `?dia=` compartilháível **dentro** do recorte (quem não pode ver o
  conteúdo cai no empty, não vaza título).

## Fora de escopo (explícito)

- E2EE, story de 24h como eixo, reescrita de `criadoEm`, calendário paralelo à
  Agenda, “pessoas que viram a foto”, matchmaking automático, memória de
  aliado com presença, fato atrasado no escopo clube, índice antes de métrica
  ou da fase 3.

## Implementação (ordem)

| Fase | Entrega |
|---|---|
| 1–5 | 2026-08-30 — contrato base + `MemoriaFato` + aliados + presença |
| 6a | Busca, estatísticas, “neste dia”, convite contextual, timeline acervo |
| 6b | `MemoriaMarco`, `MemoriaCapitulo`, composer unificado, vínculo evento/post |
| 6c | OG/compartilhar/PDF, badge coirmã, `MEMORIA_DIA_ABERTO` + cron |

Índice `MemoriaDia` continua adiado até métrica de p95 da espinha clube.

### Arquivos-chave (fase 6)

| Área | Caminho |
|---|---|
| Loader | `app/portal/memoria/_lib/carregar-memoria.ts` |
| Marcos/capítulos | `_lib/memoria-capitulos.ts` |
| Busca | `_lib/memoria-busca.ts`, `actions.ts` → `buscarMemoriaAction` |
| Regras puras | `lib/memoria-acervo.ts`, `packages/types/src/memoria.js` |
| Composer | `_components/memoria-composer.tsx`, `publicarNaMemoriaDoDia` |
| Notificações | `lib/memoria-dia-aberto.ts`, `app/api/cron/memoria-dia-aberto/` |
| OG | `lib/memoria-meta.ts`, `page.tsx` → `generateMetadata` |
| Admin | `app/admin/comunidade/memoria/` (fila + capítulos) |

Testes: `memoria-regras.test.ts`, `memoria-acervo.test.ts`, `memoria-dia.test.ts`,
`memoria-dia-aberto.test.ts`.

## Seed de teste (local)

```
TORCIDA_ENV=local pnpm --filter @torcida/db seed:memoria-demo
```

Gaviões da Fiel + Camisa 12: eventos passados (caravana/ensaio/geral), posts
do mural (alguns `alcanceNacional`), fatos `APROVADA`/`PENDENTE`, check-in
com opt-in de presença, **marco institucional** no dia do churrasco e capítulo
**“Temporada demo”** (2 dias). IDs `memoria-demo-*`. `--reset` apaga o lote.
Não existe "Aviões da Fiel" no catálogo — Camisa 12 é a outra organizada
do mesmo clube para exercitar o recorte Clube.

Contrato puro: `packages/types/src/memoria.js`. Zod:
`packages/types/src/schemas/memoria.js`. Invariantes:
`apps/web/src/lib/__tests__/memoria-regras.test.ts`,
`memoria-acervo.test.ts`, `memoria-dia-aberto.test.ts`.
`ARCHITECTURE.md` §5.30. Decisão #16 em `docs/product/decisoes-abertas.md`.
