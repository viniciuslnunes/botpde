# Auditoria funcional — 2026-07-29

Rodada de validação ponta a ponta sobre os dois lotes de teste em volume
(ver `plano-teste-volume-dados.md`), cobrindo **feed, canais/grupos,
permissões, departamentos, área admin e eventos**.

> **Estado (2026-07-30):** achados 2 e 4 corrigidos no código. O repair do
> roster foi validado apenas com `--dry-run`; a aplicação mutável segue
> pendente de execução operacional.

## Como a auditoria roda

Duas ferramentas, com propósitos distintos:

| Comando | O que faz |
| --- | --- |
| `pnpm --filter @torcida/db audit:regras` | Invariantes de domínio em SQL/Prisma + matriz de relações entre torcidas. Não carrega o app. |
| `pnpm --filter @torcida/web audit:dados` | **Exercita o código de produção** (`getUserPermissionsInTenant`, `getPostPorId`, `listCanaisVisiveis`, `getEscopoEventosVisiveis`, `getPostsFeedNacional`…) contra o banco real, e faz análise estática dos gates do `/admin`. Só leitura. |
| `pnpm --filter @torcida/web audit:fluxos` | **Executa as Server Actions reais** com sessão simulada, percorrendo fluxos ponta a ponta (aprovar membro, comprar, publicar, moderar, propor aliança). **Muta o banco** e reverte no fim. |

Os dois últimos moram em `apps/web/src/lib/__audit__/*.audit.ts` com config
própria (`vitest.audit.config.ts`). A extensão `.audit.ts` é deliberada: o
`include` do `vitest.config.ts` é `src/**/*.test.ts`, então **o CI não pega**
esses arquivos — eles exigem `DATABASE_URL` e dados semeados. Relatórios em
`apps/web/auditoria-dados-reais.txt` e `auditoria-fluxos.txt` (gitignorados).

Mocks usados: `next/cache` (`unstable_cache` → passthrough, `revalidateTag`
→ no-op) e `next/headers`, que só existem no request scope do Next. Muda o
cache, não a lógica auditada. Em `audit:fluxos`, também `@/lib/auth` —
`auth()` devolve uma sessão sintética, o que faz `assertPermission` resolver
o tenant pelo vínculo do usuário e rodar o RBAC de verdade.

**Reversibilidade do `audit:fluxos`**: toda mutação registra sua reversão
*antes* de acontecer, e o `afterAll` desfaz na ordem inversa (6 reversões na
última rodada). Se abortar no meio, confira o resíduo com
`pnpm --filter @torcida/db reset:corinthians-teste -- --dry-run`.

---

## Achado 1 — Cargos de sistema desatualizados em quase toda a plataforma

**Severidade: alta. Afeta produção, não é dado de teste.**

Cargo de sistema resolve permissão pelo **array gravado no `Role`**
(`permissionsOfRole` lê `role.permissions` / `role.permissionsExtras`), não
pela constante `SYSTEM_ROLE_PERMISSIONS` do código. Toda permissão nova
precisa de `db:repair-system-roles` para chegar às torcidas **já
existentes**. Isso não aconteceu:

| Cargo | Torcidas com `Role` desatualizado | Permissões que faltam |
| --- | --- | --- |
| `owner` (Presidente) | **562 / 565** | `affiliation:manage`, `members:dismiss`, `members:export_lge`, `bar:operate`, `bar:manage` |
| `vice` | **561 / 561** | as mesmas 5 |
| `admin` | **461 / 565** | `members:dismiss`, `members:export_lge`, `bar:operate`, `bar:manage` |
| `member` | 0 / 565 | — (em dia) |

Consequência concreta, verificada nos gates:

- **O módulo Bar está inacessível.** `/admin/bar/page.tsx` faz
  `assertAnyPermission([BAR_OPERATE, BAR_MANAGE])`. Presidente e vice de 562
  torcidas não abrem a página — o PDV inteiro, catálogo, estoque, turnos de
  caixa e fiado ficam fora de alcance.
- **Não é possível desligar membro** (`members:dismiss`, gate de
  `admin/membros/actions.ts:996`).
- **Não é possível exportar dados LGPD** (`members:export_lge`) — soma-se à
  pendência já registrada em `docs/data/modulo-super-admin.md`.
- **Afiliação não é gerenciável** (`affiliation:manage`): o item de
  navegação em `admin/layout.tsx` nem aparece.

As 3 torcidas com `owner` em dia são as criadas depois da última mudança de
permissões — `bootstrapAcessoTenant` cria o `Role` já completo. Ou seja: o
bug só atinge tenant **pré-existente**, e passa despercebido em ambiente
novo.

**Confirmado em fluxo real** (`audit:fluxos`), não só por análise de dados: o
Presidente de `torcida-fiel-macabra-sp` chama `abrirTurnoBar()` e recebe
`"Sem permissão"`. A auditoria escolhe o tenant **pelo defeito** (busca um
`Role` de owner sem `bar:operate` nem `bar:manage` gravados) — testar no
Gaviões daria falso "tudo certo", porque ele é um dos poucos atualizados.

Correção: quando **só** os arrays persistidos estão defasados (caso deste
achado — Roles `isSystem` já existem, memberships ok), rodar o modo rápido:

```bash
pnpm --filter @torcida/db db:repair-system-roles -- --permissions-only --dry-run
pnpm --filter @torcida/db db:repair-system-roles -- --permissions-only
```

Isso atualiza em lote `permissionsExtras` (owner/admin/vice) ou
`permissions` (member) para `SYSTEM_ROLE_PERMISSIONS[nome]`, sem
`syncMembership` por usuário nem bootstrap de departamentos. O default
sem `--permissions-only` continua sendo o repair completo (mais lento).

Prevenção a decidir — o candidato natural é o repair virar parte do
deploy, ou o cargo de sistema deixar de depender do array gravado e
resolver pela constante em runtime (o segundo elimina a classe de bug
inteira).

## Achado 2 — Gate de comentário não respeita rivalidade

**Severidade: média. Corrigido em 2026-07-30.**

`listarComentariosPost` (`portal/comunidade/actions.ts`) libera os
comentários de qualquer post `PUBLICO` para **qualquer autenticado**, sem
escopo de tenant:

```ts
let podeVer = viewerId === post.autorId || post.visibilidade === 'PUBLICO'
```

O comentário no código diz que é deliberado ("comentário de post PUBLICO é
legível por qualquer autenticado, mesmo torcedor global"). Só que isso
contradiz `resolveVisibility('rival', PUBLICO) === false` —
"**Rival nunca vê NADA — nem o público**", que `visibility.js` marca como
caso explícito justamente para a segregação anti-infiltração sobreviver a
mudanças.

Verificado na auditoria: `mancha-alviverde` está fora do escopo visível de
`pde-gavioes-fiel` (são rivais), mas quem souber o id de um post público da
Mancha lê os comentários dele. O post em si está protegido — `getPostPorId`
filtra por `resolveVisibleTenantIdsForFeed` antes de tudo. É só a leitura de
comentário que escapa.

Decisão fechada: a segregação vale também para comentários.
`listarComentariosPost` agora resolve o tenant do portal (inclusive CN
sintética), aplica `resolveVisibleTenantIdsForFeed` antes da escada
`PUBLICO`/`TENANT`/`PRIVADO`, preserva o autor e não reintroduz privacidade de
perfil.

## Achado 3 — `podeVerPost` não é gate suficiente

**Severidade: baixa hoje, armadilha para amanhã.**

`podeVerPost(viewerId, post)` decide por privacidade de perfil e seguimento
(`podeVerConteudoSocial`) — **nunca** consulta hierarquia ou rivalidade. Hoje
não é problema porque o único chamador (`getPostPorId`) aplica
`resolveVisibleTenantIdsForFeed` **antes**. Mas a função tem nome de gate
completo e não é: usada isolada num caminho novo, libera post público de
torcida rival.

Correção sugerida: renomear para algo como `podeVerPostPorPerfil`, ou fazer
a função receber o escopo de tenants e checá-lo.

## Achado 4 — `MembroConversa` órfão (1 caso real)

**Corrigido no código; dado Remista permanece erro até executar o repair.**

Canal `Remista` (`torcida-organizada-remista-pa`, tipo `CANAL`, privado) tem
1 membro sem `SaasMembro` no tenant do canal. Dado real, não do seed —
resíduo provável de um fluxo antigo. Há scripts de repair vizinhos
(`repair-canal-membro-pendente-aprovado`, `repair-lideranca-canal-membro`);
nenhum cobre este caso.

O gate central `assertElegibilidadeMembroCanal` agora separa descoberta de
participação: em canal real, `PENDENTE` exige vínculo local e `ATIVO` exige
vínculo aprovado/ativo. O repair
`db:repair-canal-membro-pendente-aprovado` foi estendido de forma idempotente:
rejeita pendente órfão, encerra ativo inválido (`REJEITADO` + `saiuEm`) e
grava `AuditLog` com ator nulo, preservando a linha histórica.

```bash
pnpm --filter @torcida/db db:repair-canal-membro-pendente-aprovado -- --dry-run
pnpm --filter @torcida/db db:repair-canal-membro-pendente-aprovado
```

Nota metodológica: a checagem precisa excluir o tenant `sintetico` da
Comunidade Nacional e conversas `DIRETA` — lá a participação é de torcedor
global (`PerfilTorcedor`), sem `SaasMembro` por definição. Sem esses filtros
a checagem acusa 15 falsos positivos.

## Achado 5 — `alcanceNacional` em post INSTITUCIONAL é inerte

`getPostsFeedNacional` filtra `tipo: 'MEMBRO'` + `visibilidade: 'PUBLICO'`.
Post `INSTITUCIONAL` com `alcanceNacional = true` **nunca** aparece no feed
nacional. O seed marcava 40% dos institucionais como nacionais, o que não
tem efeito nenhum.

A decidir: se comunicado oficial deve ou não alcançar a Comunidade Nacional.
Se não deve, o campo deveria ser bloqueado no composer para
`tipo = INSTITUCIONAL` em vez de aceitar silenciosamente.

---

## O que passou (36 conformes)

Vale registrar o que a auditoria **confirmou funcionando**, porque é a parte
que não precisa ser re-testada a cada mudança:

- **Segregação de rivais no feed**: 4 pares clássicos auditados
  (Gaviões×Mancha, Dragões×Mancha, Fla×Flu, Grenal) — rival fora do escopo
  em todos.
- **Aliança**: 3 alianças `ATIVA` resolvem como `allied`, entram no escopo
  **público** e ficam fora do **restrito** (financeiro). Precedência
  `allied > rival` funcionando.
- **Permalink**: post `TENANT` e `PUBLICO` de torcida rival bloqueados.
- **Feed do tenant**: 20 posts, todos de tenant visível. **Feed nacional**: 4
  posts, todos nacionais + públicos + do mesmo clube.
- **Canais**: 19/5/7 canais visíveis em três torcidas, todos de tenant
  permitido; canal de rival invisível; nenhum membro não aprovado ativo em
  canal oficial; toda unidade ativa tem canal oficial.
- **Overrides individuais**: 20 revogações (`granted=false`) e 19 concessões
  (`granted=true`) todas respeitadas — `calculateEffectivePermissions` vence
  o pacote do cargo nas duas direções.
- **Departamentos**: 6 gestores com herança `permissions ∪ permissionsGestor`
  completa; 8 membros de área sem escalada para permissão de gestor; 10
  membros com **só preferência** de área sem herdar nada (a regra
  "preferência ≠ membership" vale na prática).
- **Membro não aprovado**: 10 auditados, nenhuma permissão.
- **Área admin**: 43 páginas, todas com gate próprio ou de layout ancestral.
- **Eventos**: escopo respeita hierarquia (Gaviões vê 5 tenants / 23 eventos,
  incluindo os PDEs promovidos; Dragões vê só o próprio); 40 eventos com
  capacidade sem estouro nem fila indevida; 6 séries de ensaio com 1 torcida
  cada e datas distintas.

## Fluxos ponta a ponta — 16 conformes, 1 erro

Executados com Server Action real e sessão simulada (`audit:fluxos`). O que
cada fluxo provou:

**Aprovação de membro** (`aprovarMembro`) — a sequência inteira funciona:
status vira `APROVADO` com `aprovadoEm`; o aprovado é vinculado a 1 canal;
recebe 2 cargos; `AuditLog` é gravado; 1 notificação é gerada; e a
**preferência de área vira membership de equipe** exatamente na aprovação,
como a documentação promete. É a confirmação prática de "preferência ≠
membership".

**Negação de privilégio** — membro comum (só cargo `member`) tentando
aprovar recebe `"Sem permissão"`. Admin de `camisa-12-corinthians` tentando
aprovar membro de `pavilhao-nove` recebe `"Membro não encontrado."` — o
escopo de tenant é aplicado na query, não só no gate, que é a defesa certa.

**Compra na loja** — sacola → cupom → checkout funciona fim a fim:
subtotal R$ 259,80, cupom `TESTE10` aplicando R$ 25,98, total R$ 233,82;
estoque do tamanho P decrementado de 6 → 4; sacola esvaziada. Membro de uma
torcida tentando comprar produto de outra recebe `"Produto não encontrado ou
inativo."`.

**Aliança co-irmã** — `proporAlianca` entre duas organizadas do mesmo clube
é rejeitada com a mensagem certa: *"Organizadas do mesmo time são co-irmãs,
não aliadas"*. A regra do `docs/knowledge/aliancas.md` está enforced no
servidor, não só no vocabulário.

**Publicar e moderar** — post `TENANT` criado no tenant do autor; denúncia
persistida com status `PENDENTE` na fila do admin.

## Rodada 3 — fluxos avançados (2026-07-30)

`apps/web/src/lib/__audit__/fluxos-avancados.audit.ts`, rodado por
`pnpm --filter @torcida/web audit:fluxos-avancados`. Mesmo método da rodada 2
(sessão simulada, Server Actions reais, reversão registrada antes de cada
mutação); o que muda é o recorte: **só regra de negócio que nenhuma rodada
anterior havia exercitado**. Resultado: **27 conformes, 1 alerta, 1 erro**.

As peças comuns (coletor de achados, `tentativa`, `atorComPermissao`,
reversão) saíram para `_harness.ts`. Os `vi.mock` continuam em cada arquivo —
o Vitest iça `vi.mock` por arquivo, mover para o harness faria o mock não valer.
Fixtures criadas pela auditoria levam o prefixo `[AUDIT-FLUXO]` no título /
nome / conteúdo, para serem reconhecíveis se a limpeza não completar.

### Achado 6 (novo) — escalada de privilégio por cargo customizado

`criarRole` (`admin/configuracoes/actions.ts`) é gateado só por
`roles:manage` e **não limita as permissões concedidas ao conjunto efetivo de
quem cria**. Provado em fluxo: um ator com `roles:manage` e sem
`settings:manage` criou um cargo carregando `settings:manage`, vestiu o cargo,
e passou a ter a permissão. Vale para qualquer permissão do catálogo —
`roles:manage` é, na prática, equivalente a owner.

Pode ser intencional (quem administra cargos administra o RBAC inteiro), mas
não está escrito em lugar nenhum, e a consequência é que delegar "gestão de
acessos" a um diretor delega tudo junto. **Decisão em aberto**: (a) documentar
como intencional em `permissions.js`; (b) restringir a concessão ao conjunto
efetivo do ator; ou (c) criar uma permissão separada para conceder permissões
sensíveis. Mesma pergunta se aplica a `salvarAcessoUsuario`
(`admin/acessos/actions.ts`), que grava overrides sem checar se o ator os tem.

### Eventos — capacidade, espera e presença (conformes)

A lotação segura por inteiro: com capacidade 1, o primeiro fica `CONFIRMADO` e
o segundo cai em `LISTA_ESPERA` em vez de furar o teto; quando o confirmado
sai, `promoverProximoDaEspera` puxa **automaticamente** o mais antigo da fila.
A promoção manual do admin não fura a capacidade ("Lotação esgotada") e
distingue quem está na espera de quem recusou ("Membro não está na lista de
espera").

Escopo: RSVP em evento com data passada é recusado ("Evento já encerrado") e
evento de outra torcida é invisível ("Evento não encontrado") — de novo, o
escopo está na query, não só no gate.

`registrarCheckIn` confirma a regra documentada de que **check-in ≠
confirmação de presença**: registra presença de quem nunca respondeu ao RSVP,
via upsert, com carimbo de quem registrou e `AuditLog`.

> **Armadilha de método**: `promoverDaListaEspera` checa lotação **antes** do
> estado do RSVP. Testar "promover quem recusou" com o evento cheio mede a
> checagem errada e devolve "Lotação esgotada" — é preciso abrir vaga antes.

### Bar — o dinheiro que volta (conformes)

Estorno de venda `PAGA`: status vira `ESTORNADA`, as 3 linhas voltam ao
estoque, e o livro-caixa recebe a `DESPESA/BAR` espelho ligada à venda.
Chamado de novo, é **idempotente** — não duplica lançamento nem devolve
estoque outra vez.

A regra do fiado está enforced nos dois sentidos: venda no fiado **em aberto**
não pode ser estornada ("Fiado em aberto: cancele em Bar → Fiado. Estorno só
após quitação"), porque geraria `DESPESA` sem `RECEITA`; e a quitação lança
`RECEITA/BAR` e **liga a venda ao lançamento**, de modo que um estorno
posterior tenha espelho.

Fechamento de caixa com R$ 0 contado contra R$ 24 esperados marcou
`divergenciaAlta` e disparou o fan-out de notificação para quem tem
`bar:manage`.

**Como o Bar foi destravado**: o Achado 1 deixa o Presidente sem `bar:manage`
na maioria das torcidas. A auditoria concede um `UserPermission` override
(revertido no fim) — o que de quebra prova que **override concede o que o
cargo de sistema não dá**, ou seja, que o repair não é o único caminho.

### RBAC e grupos (conformes)

Cargos de sistema são imutáveis pelo fluxo real: edição e exclusão recusadas,
e o cargo segue intacto depois das tentativas.

Override **negado** vence o cargo: sai do conjunto efetivo e barra a
publicação interna ("Enquanto seu vínculo não for aprovado, publique apenas
posts públicos no feed de torcedor").

Convite de grupo tem ciclo de vida completo: admin gera o código; o convidado
entra como `MEMBRO` (nunca `ADMIN`); membro comum **não** gera convite; e o
código revogado deixa de admitir ("Convite inválido ou expirado"). Rebaixar o
**último administrador** é recusado — grupo não fica órfão.

### Alerta — o override não é a última palavra no feed público

Com `community:post` negado, `assertAutorPublicacaoPost` cai no **caminho de
torcedor** (`podePublicarComoTorcedorFeed`). No usuário testado quem barrou
foi o onboarding incompleto, não a permissão — então o caminho público ficou
**inconclusivo**. Se o usuário tivesse `PerfilTorcedor` completo, o override
negado provavelmente não impediria a publicação `PUBLICO`. Confirmar se é
intencional (o override rege o feed da torcida, não o nacional) e documentar.

## Rodada 4 — hierarquia (2026-07-30)

`apps/web/src/lib/__audit__/hierarquia.audit.ts`, rodado por
`pnpm --filter @torcida/web audit:hierarquia`. Camada estrutural: promover
unidade a tenant próprio, excluir unidade remanejando dependências, corrigir a
unidade territorial do membro. Resultado: **20 conformes, 1 alerta, 2 erros** —
e os dois erros são achados novos, um deles latente.

### Achado 8 (novo) — `promoverSedeParaTenant` estoura a transação

A promoção **não completa**. `promoverSedeParaTenant`
(`apps/web/src/lib/promover-sede.ts:122`) envolve tudo numa interactive
transaction **sem `timeout` configurado** — default do Prisma é 5 s — e faz
~40 round-trips sequenciais lá dentro: criar tenant, mover sedes, 3 upserts de
cargo, `upsertDepartamentosCanonicos` (10 departamentos em série),
`upsertPerfisDepartamentoCanonicos` (22 perfis em série), owner, membro,
canal, `AuditLog`.

Medido contra o banco remoto: só o seed canônico custa **5,86 s**
(2,26 s departamentos + 3,59 s perfis). A transação expira e faz rollback
inteiro; o erro que chega é `Transaction API error: Transaction already
closed` / `Transaction not found`.

**Ressalva honesta**: a margem aqui é o RTT. Com a app co-localizada ao banco
(Railway), os mesmos ~40 round-trips custam uma fração disso e provavelmente
passam. O defeito não é "está quebrado em produção", é **o orçamento ser a
latência de rede e não a lógica**: qualquer degradação, crescimento do
catálogo de departamentos, ou execução de rede distante derruba a promoção
inteira. É a mesma classe do bug já corrigido em `03d62a8` (timeout de
transação em decisão de membro). Fix barato: `{ timeout: 30_000 }` no
`$transaction`, ou tirar o seed canônico de dentro dele (`runTasks` já aceita
modo concorrente fora de transação).

### Achado 9 (novo, latente) — relação de tenant parte de um nó arbitrário

`getTenantRelationImpl` (`lib/hierarquia.ts:305`) escolhe a sede do ator com:

```ts
db.sede.findFirst({ where: { tenantId: actorTenantId }, ... })
```

Sem preferir `tipo: 'SEDE'` e **sem `orderBy`** — ao contrário de
`getAncestorTenantIdsImpl`, `getDescendantTenantIdsImpl` e
`getTenantHierarquia`, que todos fazem `findFirst({tipo:'SEDE'}) ?? findFirst({})`.

Em torcida com mais de uma unidade, a varredura de descendentes começa **no
meio da árvore** e não alcança as unidades penduradas em outros ramos.
Provado com contraste, sobre a mesma forma de dado:

| torcida | nó de partida | mãe enxerga o restrito da filha? |
|---|---|---|
| 3 unidades | raiz `SEDE` | ✅ sim |
| 4 unidades (`camisa-12-corinthians`) | `subsede-camisa12-grande-sp` (SUBSEDE) | ❌ **não** |

Consequência: a Sede mãe perde a relação de ancestral sobre a própria unidade
— deixa de ver financeiro, membros, sócios, pedidos e patrimônio da filha, que
passa a ser tratada como `unrelated`. E como não há `orderBy`, **qual linha o
Postgres devolve não é estável**: o mesmo tenant pode funcionar numa execução e
falhar na seguinte. Foi assim que o achado apareceu — passou numa rodada e
falhou na outra, até o contraste isolar a causa.

Fix: alinhar a escolha com as funções irmãs (preferir a raiz `SEDE`, com
`orderBy` determinístico).

### Conformes

**Recusas de promoção** — Sede principal ("Apenas Subsede ou Ponto de encontro
podem ser promovidos"), unidade inativa, e unidade de outra torcida
("Unidade não encontrada neste tenant").

**Exclusão de unidade** — as quatro guardas seguram: origem = destino; destino
que não é Sede (remanejar para um PDE quebraria a agregação do número de
sócios); Presidente tentando excluir PDE (exclusivo do super-admin); unidade
com filha ("Reatribua-as antes de excluir"). E a exclusão real de Sede
duplicada **remaneja em vez de apagar em cascata**: membro e evento vinculados
foram para a Sede de destino, com `AuditLog`.

**Reatribuição de unidade do membro** — recusa unidade inativa e unidade de
outra torcida; a reatribuição válida move o membro e grava o **diff campo a
campo** no `AuditLog`, que é o que alimenta a aba de histórico do cadastro.

**Invariante de visibilidade** (na torcida onde a derivação parte da raiz):
mãe enxerga o restrito da filha; filha não enxerga o restrito da mãe, mas
enxerga o público. A hierarquia atravessa a fronteira de tenant pelo elo
`Sede.sedeId`, como projetado.

### O que ficou sem cobertura

O invariante acima foi verificado sobre a **forma** que a promoção produz,
montada à mão (tenant novo + sede com `sedeId` apontando para a raiz mãe),
porque a action não completa (Achado 8). Falta provar que **a
`promoverSedeAction` monta essa forma** — as asserções já estão escritas no
teste e passam a rodar assim que o timeout for corrigido. Também sem exercício:
migração de membros e de unidades filhas na promoção, que só acontece no
caminho feliz.

## Rodada 5 — notificações (2026-07-30)

`apps/web/src/lib/__audit__/notificacoes.audit.ts`, rodado por
`pnpm --filter @torcida/web audit:notificacoes`. **11 conformes, 1 alerta,
3 erros.**

Esta rodada teve dois trabalhos. O primeiro foi **reverificar** a auditoria de
notificações de 2026-07-22, que foi feita por análise e não por execução — e
que em 8 dias envelheceu. Repetir uma lista desatualizada como se fosse estado
atual é pior do que não auditar.

### Alegações de 2026-07-22, reverificadas

| Alegação | Veredito hoje |
|---|---|
| "Badge preso: a `Notificacao` nunca é marcada lida ao decidir pela fila" | **parcialmente derrubada** — os 3 arquivos citados passaram a reconciliar. Sobrou o alcance (ver Achado 10) |
| "`NOVA_MENSAGEM` nunca é criado, tipo morto" | **derrubada** — 26 notificações desse tipo no banco |
| "Não existe `SEGUIMENTO_REJEITADO`" | **derrubada** — o tipo existe e `rejeitarSeguimento` o cria |

Fora do alcance de auditoria de fluxo, e portanto **não** reverificados:
`TIPOS_QUE_EXIGEM_REFRESH` (constante de client), a dessincronia entre os dois
caches singleton, o volume de `revalidatePath` por clique, e se `REDIS_URL`
está setado no Railway. Esses continuam valendo como pendências de leitura de
código e de operação.

### Achado 10 (novo) — reconciliação cobre 1 de N destinatários

O "badge preso" foi corrigido **só para quem clica**. O fan-out cria N
notificações; a reconciliação marca uma. Provado nos dois caminhos:

- **Pedido de grupo**: `pedirEntradaGrupo` notificou os 2 administradores; o
  pedido foi aprovado; **1 admin ficou com a notificação não lida** apontando
  para um pedido que já não existe.
- **Moderação**: denúncia resolvida e **6 moderadores** seguem com
  `DENUNCIA_NOVA` não lida.

A causa é a mesma nos dois: o `updateMany` de reconciliação é escopado em
`userId: session.user.id`. Vale igual para `decidirPedidoCanal`, para as 4
funções de moderação e para `marcarSolicitacoesLidas`
(`admin/membros/actions.ts`). Quanto mais gente na equipe, pior — numa torcida
com 6 moderadores, 5 badges ficam presos por denúncia resolvida.

Fix: reconciliar por **critério do evento** (tipo + ator + entidade) em vez de
por destinatário, isto é, tirar o `userId` do `where` e emitir o ping para cada
destinatário afetado.

### Achado 11 (novo) — ex-membro continua recebendo comunicado

`desligarMembro` grava `desligadoEm` mas **não muda o `status`**, que segue
`APROVADO`. `listarUserIdsMembrosAprovados` filtra só por `status`. Resultado:
quem foi desligado continua no fan-out de `notificarMembrosAprovados` — o
canal de comunicado urgente da torcida. Verificado desligando um membro e
consultando a lista de destinatários: o desligado estava lá.

Fix: adicionar `desligadoEm: null` ao filtro (e conferir os outros consumidores
de "membro aprovado" que possam ter a mesma omissão).

### Conformes

Roteamento por permissão respeita **override negado** (8 pares
usuário×permissão conferidos) — quem foi explicitamente excluído não entra no
fan-out administrativo. `excetoUserId` funciona: num comunicado de 127
destinatários, quem disparou não recebeu a própria notificação. O fan-out fica
contido no tenant de origem, e a contagem do sino é por tenant — a mesma
pessoa em duas torcidas não vê a notificação de uma no sino da outra.
Reconciliação do próprio decisor funciona nos dois caminhos, e o solicitante é
avisado da aprovação.

## Rodada 6 — mensageria / DM (2026-07-30)

`apps/web/src/lib/__audit__/mensageria.audit.ts`, rodado por
`pnpm --filter @torcida/web audit:mensageria`. **16 conformes, 0 alertas,
0 erros** — a primeira rodada sem achado, e vale dizer por quê: é a camada
onde a regra mais delicada do produto está, e ela segura.

**Método diferente**: DM não é Server Action, é route handler
(`app/api/conversas/**`, `app/api/usuarios/[id]/bloqueio`). Os handlers são
chamados como funções, com `Request` sintético e `params` como Promise — o
mesmo contrato do Next. Como `assertUsuarioMensageria` resolve o tenant pelo
**host** (não pelo vínculo), foi preciso simular `getTenantFromHost`; sem
isso todo handler recusa com "Não autenticado." e a auditoria contaria isso
como recusa de regra.

### Segregação por rivalidade — segura, e o Achado 9 não se propaga

Sócio de `camisa-12-corinthians` e sócio de `mancha-alviverde` (Corinthians ×
Palmeiras) não abrem DM em nenhum sentido, e `criarDmComSolicitacao` recusa a
escrita, não só a leitura. A anti-infiltração do `spec-onboarding` §3.2 está
enforced no servidor.

Isso foi testado **de propósito** nesse par: `isParRivalSocio` depende de
`getTenantRelation`, que é o Achado 9, e os dois lados têm 4 unidades cada —
a forma que expõe o bug. A relação saiu `rival/rival` nos dois sentidos, ou
seja, **o defeito de hierarquia não chegou até aqui**. Não é garantia: como o
Achado 9 é sensível à ordem que o Postgres devolve, o resultado pode mudar. A
checagem fica no arquivo justamente para pegar isso se acontecer, e a mensagem
de erro já distingue "a relação não saiu rival" (propagação do Achado 9) de
"saiu rival e o gate não bloqueou" (defeito local).

### Bloqueio e recusa

Bloquear em **uma** direção fecha a DM nas **duas** — quem foi bloqueado
também não alcança quem bloqueou. E não dá para contornar pelo grupo:
`podeConvidarParaGrupoChat` também recusa. Desbloquear devolve exatamente o
acesso anterior. Autobloqueio é recusado. Tudo com `AuditLog`.

Regra forte que o nome da função não entrega: **recusar uma solicitação de DM
grava `BloqueioUsuario`** — `rejeitarSolicitacaoMensagem` faz upsert de
bloqueio junto com o status `REJEITADO`. Recusar não é "não agora", é
bloquear. Quem foi recusado não consegue reabrir nem insistir.

Falar com sócio de **outra torcida do mesmo clube** (co-irmã) passa por
solicitação: a conversa nasce com destinatário `PENDENTE` e remetente `ATIVO`.

### Escopo

Quem não é membro da conversa é barrado tanto na leitura quanto no envio, com
"Conversa não encontrada" — o escopo está na query, não numa checagem
posterior.

### Erro meu, que vale como lição de método

A primeira execução **vazou estado no banco**: a reversão localizava a DM por
`findDmEntreUsuarios`, que filtra por status `ATIVO`/`PENDENTE` — depois da
recusa os dois lados ficam `REJEITADO`, a busca devolveu `null` e a limpeza
não apagou nada. Sobrou uma conversa e um `BloqueioUsuario`, que fizeram a
execução seguinte reportar o par como "bloqueado" e perder o teste inteiro.
Localizado, limpo à mão, e a reversão passou a localizar por participantes e
a remover o bloqueio da recusa.

É a **segunda** vez na série que a reversão falha (a primeira foi o turno de
caixa, rodada 3). O padrão é o mesmo: a reversão assume a forma do estado
feliz e não a do estado que a própria mutação produz.

## Rodada 7 — loja e rede social (2026-07-30)

`apps/web/src/lib/__audit__/loja.audit.ts`, rodado por
`pnpm --filter @torcida/web audit:loja`. **14 conformes, 0 alertas, 0 erros**,
com o resultado **estável em execuções repetidas** (ver "determinismo" abaixo).

A rodada 2 tinha coberto o caminho feliz da compra. Aqui entraram as bordas.

### Concorrência na última unidade — o teste que motivou a rodada

O decremento de estoque é um **read-modify-write sobre coluna JSON**
(`{ ...estoque, [chave]: disponivel - qtd }`) dentro de uma interactive
transaction. Sob READ COMMITTED, a leitura clássica seria: duas transações
leem `1`, ambas gravam `0`, e a torcida vende duas vezes a mesma peça.

Testado com dois sócios disparando `finalizarPedido` em `Promise.all` sobre um
produto com **1 unidade**: um concluiu, o outro recebeu *"Estoque insuficiente"*,
1 unidade vendida, estoque final 0. **Sem oversell.**

> A primeira versão deste teste deu o mesmo "1 checkout concluído" **pelo motivo
> errado**: o comprador A era `TORCEDOR`, e `tenantsPermitidosLoja` só considera
> vínculo `SOCIO` — ele nem chegava à disputa, falhava com "produto não está mais
> disponível". O teste agora **captura a mensagem do perdedor** e separa
> "perdeu a disputa" de "não era elegível"; sem isso a conformidade era sorte.

### Cupom

Vencido é recusado (*"Cupom expirado."*); o de primeira compra é recusado para
quem já tem pedido; e cupom de outra torcida não vale nesta loja
(*"Cupom inválido."*) — o desconto não atravessa a fronteira de tenant.

**Não auditado porque não existe**: limite de uso por cupom e valor mínimo de
pedido **não estão no modelo** (`SaasCupom` só tem `ativo`, `validoAte`,
`primeiraCompra`). Estavam no plano da rodada 5 como itens a auditar; são
lacuna de produto, não defeito — se a intenção é ter cupom com tiragem
limitada, isso é feature nova.

### Estoque e pedido

Checkout com um item sem estoque recusa **o carrinho inteiro** e desfaz o
decremento do item que tinha estoque — transação íntegra, nenhum pedido
gravado, e a sacola do comprador é preservada. Gestor não muda status de pedido
de outra torcida. Cancelar o pedido **devolve as unidades ao estoque** (4 → 2 na
compra, 2 → 4 no cancelamento).

### Rede social

Sócios de torcidas rivais **não podem se seguir** em nenhum sentido — a
segregação da rodada 6 (mensageria) vale também aqui, o que importa porque
seguir dá acesso a conteúdo. Seguir perfil **privado** cria solicitação
`PENDENTE` em vez de aprovar direto.

### Determinismo

Duas execuções seguidas deram contagens diferentes (14 e 12 conformes) antes de
uma correção: `contextoLoja` escolhia "o primeiro produto ativo" por `orderBy`,
e as **fixtures da própria auditoria** — que vivem até o `afterAll` — podiam
ganhar essa ordenação e trocar o tenant no meio da execução. Corrigido
excluindo o prefixo `[AUDIT-LOJA]` da seleção; duas execuções seguidas passaram
a dar 14/0/0. É a terceira manifestação da mesma armadilha: **auditoria que não
isola as próprias fixtures do dado que audita mede a si mesma.**

## Próximas camadas a auditar (planejado, não feito)

Ordem por risco × esforço:

1. **Notificações** — o fluxo de aprovação gerou 1 notificação, mas os gaps
   já conhecidos (badge preso, `NOVA_MENSAGEM` morto, refresh incompleto)
   não foram exercitados. Auditar: fan-out de reação/comentário, leitura e
   zeragem do badge, roteamento por tipo.
2. **Mensageria / DM** — solicitação, aceite, bloqueio de usuário, denúncia
   de mensagem. É onde a segregação entre sócios de torcidas rivais foi
   especificada (`spec-onboarding` §3.2) e nunca foi testada com dado.
3. **Associação e cobrança** — `PlanoAssociacao`, `CobrancaAssociacao`,
   adimplência. Nenhum dado semeado ainda; o livro-caixa hoje tem
   mensalidade como lançamento avulso, não vinculada a cobrança.
4. **Timeline / fan-out do feed** (`feed-timeline.ts`,
   `garantirTimelineDaRedeDoViewer`) — custo e corretude do fan-out sob
   volume; é o ponto que `modulo-comunidade-performance.md` mais otimizou.
5. **Busca da Comunidade** — `modo=rapida` no typeahead e o SQL de membros
   com `GROUP BY`; validar que não voltou o `DISTINCT` + `similarity`.
6. **Salas / LiveKit** — degradação graciosa quando `isLiveKitConfigured()`
   é falso, e o gate de entrada em sala por relação de tenant.
7. **Super Admin** — allowlist de e-mail, ações cross-tenant, e a pendência
   de exclusão de conta (LGPD) registrada em `modulo-super-admin.md`.
8. **Onboarding completo** — hub → clube → região → torcida/torcedor, com
   rivalidade barrando escolha, e criação de `PerfilTorcedor`.
9. ~~**Estorno e fechamento de caixa do Bar**~~ — **feito na rodada 3**. O
   Achado 1 foi contornado com override de `bar:manage`, sem esperar o repair.

Reordenada após a rodada 3 (que cobriu eventos, bar, RBAC e grupos). O que
sobrou, ainda por risco × esforço:

1. ~~**Notificações**~~ — **feito na rodada 5** (Achados 10 e 11, e reverificação das alegações de 2026-07-22).
   `NOVA_MENSAGEM` morto, refresh incompleto) continuam sem exercício. A
   rodada 3 gerou notificação em três pontos (promoção da espera, divergência
   de caixa, entrada em grupo) mas não auditou leitura nem zeragem do badge.
2. ~~**Mensageria / DM**~~ — **feito na rodada 6**, sem achados: a segregação
   entre sócios de torcidas rivais está enforced. Resta a **denúncia de
   mensagem** (`DenunciaMensagem`) e o envio em si (rate limit,
   `MAX_CONTEUDO_MENSAGEM`, edição/exclusão de mensagem).
3. **Associação e cobrança** — `PlanoAssociacao` e `CobrancaAssociacao` estão
   **zerados** no banco de teste (confirmado por contagem). Precisa de seed
   antes de qualquer auditoria; hoje mensalidade é lançamento avulso.
4. ~~**Sedes e hierarquia**~~ — **feito na rodada 4** (Achados 8 e 9). Resta
   o caminho feliz da promoção, bloqueado pelo Achado 8.
5. ~~**Loja, o resto**~~ — **feito na rodada 7**, sem achados. Limite de uso de
   cupom não foi auditado porque **não existe no modelo** (feature nova, não
   defeito).
6. ~~**Seguir e perfil privado**~~ — **feito na rodada 7** (rivalidade e perfil
   privado). Resta o par `aprovarSeguimento`/`rejeitarSeguimento` visto do lado
   de quem decide.
7. **Timeline / fan-out do feed** — custo e corretude sob volume.
8. **Busca da Comunidade** — `modo=rapida`, e garantir que o `DISTINCT` +
   `similarity` não voltou.
9. **Salas / LiveKit** — degradação com `isLiveKitConfigured()` falso e o gate
   de entrada por relação de tenant. 17 salas semeadas.
10. **Super Admin** — allowlist, ações cross-tenant, exclusão de conta (LGPD).
11. **Onboarding completo** — hub → clube → região → torcida/torcedor, com
    rivalidade barrando escolha. 4 `SolicitacaoUnidade` semeadas.
12. **Importação de membros** — `importarMock` → `desfazerImportacao`. Zero
    `ImportacaoMembros` no banco; precisa de dado.

## Lacunas de cobertura (não são bugs)

- **`owner` e `vice` não são isoláveis** no Gaviões: o mesmo usuário acumula
  `owner + admin + member`. Auditar pacote de cargo exige alguém com um
  único cargo de sistema — o dado real não oferece.
- **Sem post `PRIVADO`** em `mancha-alviverde` para testar o caminho de
  visibilidade privada cross-tenant.
- **`resolvePartidaIdFromForm`** (`admin/partidas/actions.ts`) muta recebendo
  `tenantId` por parâmetro, sem gate próprio nem `AuditLog` — o gate está no
  chamador. Análise estática não alcança; precisa de verificação manual.
- **Visibilidade hierárquica cross-tenant** continua sem dado de teste
  próprio (ver `plano-teste-volume-dados.md`), embora o escopo de eventos do
  Gaviões já exercite os 3 PDEs promovidos.

## Armadilhas de método (para quem escrever checagem nova)

Três falsos positivos custaram tempo nesta rodada e vão se repetir:

1. **`LEFT JOIN … IS NULL` em relação 1:N** conta linhas que não casaram, não
   entidades órfãs. Use `NOT EXISTS`. (Acusou 530 órfãos de departamento que
   eram 0.)
2. **Usuário acumula cargos.** Testar "o cargo X concede Y" pegando o
   primeiro `UserRole` do cargo X mede a soma dos cargos daquela pessoa.
   Isole quem tem exatamente um cargo de sistema.
3. **Confira a assinatura antes de chamar.** `getPostsFeedNacional` recebe
   **`afiliacaoId`**, não `tenantId`; `getEscopoEventosVisiveis` devolve um
   fragmento `where` do Prisma (`{ OR: [...] }`), não lista de ids;
   `getUserPermissionsInTenant` devolve `{ rolePermissions, overrides }` — o
   conjunto efetivo sai de `calculateEffectivePermissions`. Cada um desses
   gerou um "erro" que era só harness errado.
4c. **Isole as próprias fixtures do dado que você audita.** Rodada 7: a
   auditoria escolhia o tenant pelo "primeiro produto ativo", e as fixtures
   `[AUDIT-LOJA]` — vivas até o `afterAll` — ganhavam essa ordenação e trocavam
   o contexto no meio da execução; duas rodadas seguidas davam contagens
   diferentes. Toda seleção de contexto deve excluir o prefixo da auditoria.
4b. **A reversão precisa localizar o estado que a mutação DEIXA, não o que ela
   parte.** Rodada 6: a limpeza buscava a DM por `findDmEntreUsuarios`, que só
   enxerga `ATIVO`/`PENDENTE` — depois da recusa os membros viram `REJEITADO`
   e a busca devolveu null, vazando conversa e bloqueio para a execução
   seguinte. Localize por chave estável (participantes, id capturado na
   criação), nunca por um helper de domínio que filtra por status. E confira
   os **efeitos colaterais** da action: `rejeitarSolicitacaoMensagem` cria um
   `BloqueioUsuario` que a reversão ingênua não removeria.
4. **A reversão também erra.** Na rodada 3 a limpeza do turno de caixa falhou
   e deixou um turno **fechado** no banco: `fechadoPorId: null` é argumento
   desconhecido para o Prisma quando o campo tem relação declarada (é
   `fechadoPor: { disconnect: true }`), e `sangria` é não-nulável. Reversão
   não testada é reversão que não existe — confira o resultado do `afterAll`,
   não só o dos testes, e prefira restaurar valores capturados a chutar
   `null`.
5. **Ordem das checagens dentro da action decide o que você mede.**
   `promoverDaListaEspera` valida lotação antes do estado do RSVP: com o
   evento cheio, testar "promover quem recusou" devolve "Lotação esgotada" e
   mede a regra errada. Monte o fixture para isolar a checagem que interessa.
6. **Conformidade pelo motivo errado é falso positivo.** A primeira versão do
   teste de override negado conformou porque a publicação foi barrada — só
   que por onboarding incompleto, não pela permissão. Sempre case a
   **mensagem** com a regra que você diz estar validando.
7. **Um owner não escala privilégio** — tem tudo. Testar escalada exige um
   ator com `roles:manage` e uma lacuna real no conjunto efetivo; varra os
   candidatos em vez de pegar o primeiro.
8. **`findMany`/`findFirst` sem `orderBy` não tem ordem estável.** Na rodada 4
   o `contextoSede` caía num tenant diferente a cada execução, e o Achado 9
   aparecia em metade das rodadas. Foi também a causa raiz do próprio achado
   no código de produção. Em auditoria, `orderBy` não é cosmético: sem ele o
   resultado não é reprodutível e você não distingue bug de sorte.
9. **Quando um achado some entre execuções, procure o contraste, não o
   culpado.** O Achado 9 só ficou claro rodando a mesma verificação sobre duas
   formas de dado (torcida com 1 unidade × com 4) e comparando. Uma execução
   isolada dava "às vezes falha", que não é diagnóstico.
10. **Separe "a regra recusou" de "a action não conseguiu rodar".** Um estouro
    de transação chega como erro da action e passa por recusa de negócio se o
    relatório não distinguir. Case a mensagem: `Transaction API error` /
    `Transaction not found` / `expired transaction` são falha de execução, e
    merecem achado próprio.
8. **Gate raramente se chama `assertPermission` na action.** O padrão do repo
   é um wrapper de domínio (`assertAliancasManage`,
   `assertPodeGerirDepartamento`) ou `isSuperAdminEmail`. Regex estreita
   acusou 12 actions "sem gate" que estavam todas gateadas.
