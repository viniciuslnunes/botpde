# Plano de teste de volume de dados

Objetivo: navegar o produto (Agenda, Loja, painel admin, Comunidade) sob
volume realista de uso antes de alimentar a plataforma com dados reais,
usando dados sintéticos fáceis de identificar e apagar por completo.

## Convenção de marcação (reutilizável)

Não existe hoje um campo formal `isTest`/`isSeed` no schema. A marcação é
por convenção, aplicada em todo seed de volume:

- **`User` sintético**: e-mail com domínio reservado dedicado ao lote
  (ex.: `@teste.corinthians.torcida.app`) + `nickname` com prefixo `teste_`.
- **`Conversa`/`Evento`/`SalaReuniao`/`Post` institucional criados pelo
  seed**: título/nome com um marcador **específico do lote**, não o
  genérico `[TESTE]` já usado por `seed-dados-teste.js` — use algo como
  `[TESTE-<LOTE>]` (ex.: `[TESTE-CORINTHIANS]`) para não colidir com dados
  de teste de outros scripts que já rodaram no mesmo ambiente. Isso
  importa: `seed-dados-teste.js` já cria um `Evento` com título começando
  em `[TESTE] `, e um reset que filtrasse por esse prefixo genérico
  apagaria dados de teste de origem diferente.
- Posts institucionais (autor = owner/admin **real** da torcida) só podem
  ser identificados pelo prefixo do título — não pelo autor.
- **Entidades sem título e sem autor sintético** (`PatrimonioItem`,
  `FinanceiroLancamento`, `BarVenda`, `BarCaixaTurno`): marcador no campo
  `observacao` (`observacao startsWith '[TESTE-<LOTE>]'`). É o único campo
  livre que o reset pode filtrar sem poluir a UI com prefixo no nome do
  item/lançamento.
- **Catálogo** (`SaasProduto`/`SaasCategoria`, `BarProduto` via
  `BarCategoria`): marcador no `slug` (prefixo `teste-corinthians-`), que
  não aparece em lista nem em card. Cupom: código com prefixo `TESTE`.

Cada seed de volume deve vir com um script de reset irmão, com `--dry-run`
por padrão de segurança de operação (nunca apagar sem confirmação
explícita), que apaga **só** o que aquele seed criou, respeitando a ordem
de FKs (ver `seed-corinthians-teste.js` / `reset-corinthians-teste.js`
como referência).

## Fase 1 (concluída) — Corinthians

Escopo: as 6 torcidas reais do Corinthians já cadastradas em dev
(`pde-gavioes-fiel`, `camisa-12-corinthians`, `pavilhao-nove`,
`estopim-da-fiel-sp`, `torcida-fiel-macabra-sp`,
`torcida-organizada-coringao-chopp-sp`) — 32 unidades territoriais
(Sede/Subsede/PDE) reais na varredura em 2026-07-27, 50 pessoas por
unidade (1.600 pessoas) + 150 torcedores 100% globais para a Comunidade
Nacional. Ambiente: banco de dev compartilhado (Railway), não produção.

Scripts: `packages/db/scripts/seed-corinthians-teste.js` /
`reset-corinthians-teste.js` — comandos `pnpm --filter @torcida/db
seed:corinthians-teste` / `reset:corinthians-teste -- --dry-run`.

Cobertura da rodada 1: hierarquia territorial, fila de aprovação
(PENDENTE/REPROVADO propositais), RBAC básico (member/admin), Comunidade
(posts institucionais e de membro, reações, comentários, visibilidade,
alcance nacional), canais/grupos públicos, Agenda genérica com RSVPs,
Salas de vídeo e pedidos de loja (só Gaviões, a única com catálogo real).

**Sócios / carteirinha / pendências (2026-08-03):** a Fase 2c de
`seed-corinthians-teste.js` emite `SaasSocio` e completa (ou fura) a ficha
LGE em cenários ponderados — adimplente vigente, vencendo (≤30d), vencido,
pendente de atualização de cadastro (modal no portal), inadimplente por
dispensa («não mostrar de novo» → `adimplente=false`) e uma fatia ainda em
Aguardando emissão. No lote já existente: `pnpm --filter @torcida/db
seed:corinthians-teste -- --so-socios`.

## Fase 1b (concluída) — módulos operacionais do mesmo lote

Script: `packages/db/scripts/seed-corinthians-teste-modulos.js` — comando
`pnpm --filter @torcida/db seed:corinthians-teste-modulos`. Mesmo lote e
mesma marcação da Fase 1 (reverte no **mesmo** `reset:corinthians-teste`).
Roda por fase via env: `FASES=A,C pnpm ... seed:corinthians-teste-modulos`
— útil porque a fase F (bar) é a mais longa, com muitas escritas
sequenciais.

Fases e o que cada uma passa a exercitar:

| Fase | Cobre |
| --- | --- |
| A | Departamentos no fluxo real: `SaasMembro.departamentoId` (preferência, inclusive para PENDENTE/REPROVADO) e equipe de fato só para APROVADO — perfil de área (`UserRole`) + projeção `UserDepartamento`/`DepartamentoGestor` |
| B | Cenários de permissão: vice-presidentes até `MAX_VICE_PRESIDENTES`, overrides individuais (`UserPermission` granted **e** denied), membros sem cargo |
| C | Patrimônio (`PatrimonioItem`) com categorias/status variados e responsável |
| D | Financeiro: livro-caixa com 6 meses de receitas/despesas em todas as categorias |
| E | Loja nas 5 torcidas sem catálogo real (categorias, produtos, cupom `TESTE10`, pedidos multi-item) + receita `LOJA` no livro-caixa (inclusive backfill dos pedidos já existentes do Gaviões) |
| F | Bar/PDV por unidade: catálogo + carga de estoque, turnos de caixa (fechados com sangria/divergência e um aberto), vendas PIX/dinheiro/cartão/fiado, cancelamento e estorno, movimentação de estoque e integração `BAR` no livro-caixa |
| G | Caravanas (vaga paga, capacidade, excedente em `LISTA_ESPERA`) e Bateria (série de `ENSAIO` semanal com check-in só em parte dos confirmados) |
| H | Moderação: fila de denúncias (pendentes, resolvidas e descartadas) |

Ainda **não** coberto por seed (por decisão): notificações (só a aplicação
em uso real gera), cobranças Pix/`PlanoAssociacao`/`CobrancaAssociacao` e
importação de membros. Vigência operacional e pendências de cadastro
passam pela Fase 2c (`SaasSocio` + ficha LGE + `adimplente`).

Limite estrutural deste lote: **um clube só**. Tudo fica sob uma única
`Afiliacao`, então nada que dependa de vários clubes ao mesmo tempo é
exercitado — daí o lote da Fase 2.

## Fase 2 (concluída) — lote NACIONAL, multi-clube raso

Scripts: `packages/db/scripts/seed-nacional-teste.js` /
`reset-nacional-teste.js`, com as listas do lote em
`scripts/lib/lote-nacional.js` — comandos `pnpm --filter @torcida/db
seed:nacional-teste` / `reset:nacional-teste -- --dry-run`. Lote
**independente** (domínio `@teste.nacional.torcida.app`, marcador
`[TESTE-NACIONAL]`): rodar um reset não afeta o outro lote.

Recorte inverso ao da Fase 1 — **raso por torcida, largo por clube**: 10
clubes (as maiores torcidas do país por IBOPE fora o Corinthians) × 1
torcida real de cada, 2 unidades por torcida, 30 pessoas por unidade, 25
torcedores globais por clube. Profundidade operacional (bar, financeiro,
patrimônio) **não** é multiplicada por clube: já está testada na Fase 1 e
multiplicar só inflaria o banco.

O que só este lote permite testar: Comunidade Nacional comparativa (13
clubes com torcedor global), rivalidade entre clubes e entre torcidas
(`RivalidadeClube`/`RivalidadeTorcida`, que estavam **zeradas** — ver
ressalva abaixo), alianças cross-clube em todos os status, e carga de feed
com muitos tenants publicando em paralelo (peso alto de `alcanceNacional`).

Resultado: 650 users, 400 `SaasMembro`, 250 `PerfilTorcedor` em 10
afiliações, 243 posts (73 com alcance nacional), 12 rivalidades de clube +
12 de torcida, 6 alianças, 30 eventos, 306 RSVPs.

Duas decisões que valem registro:

- **Presidente sintético.** Estas torcidas existem no banco com
  departamentos e cargos de sistema, mas com **zero `UserRole`** — ninguém
  as assumiu ainda. Sem um owner não há autoria institucional nem quem
  proponha aliança, então o seed cria um presidente de teste por torcida
  (marcado no domínio do lote). O reset devolve as torcidas ao estado
  original, sem nenhum cargo.
- **Rivalidade é dado de domínio, não de teste.** `RivalidadeClube` estava
  vazia em toda a plataforma: Corinthians × Palmeiras é um fato do mundo,
  não dado sintético, e hoje só existe porque este seed criou. Como as
  tabelas não têm campo livre para marcador, o reset apaga os pares pelo
  par de ids — ou seja, **reverter o lote zera as rivalidades de novo**. Se
  a rivalidade for para produção, ela precisa de um `seed:rivalidades`
  próprio, permanente e fora de lote de teste. Não feito.

## Auditoria funcional (código real × banco)

`pnpm --filter @torcida/web audit:dados` — exercita o **código de produção**
(permissões efetivas, feed, canais, eventos, gates do `/admin`) contra o
banco semeado. Achados da rodada de 2026-07-29, incluindo um bug de produção
sério (cargos de sistema desatualizados em 562 torcidas, deixando o módulo
Bar inacessível): **`docs/ops/auditoria-funcional-2026-07.md`**.

## Auditoria de regras de negócio

`packages/db/scripts/audit-regras-negocio.js` — `pnpm --filter @torcida/db
audit:regras`. Roda sobre o banco (não só sobre lote de teste) e faz duas
coisas: imprime a **matriz de relações** entre as torcidas semeadas
(replicando `hierarquia.ts`: lineage → allied → rival, nessa precedência) e
confere ~35 invariantes contra o que as Server Actions garantem.
ERRO = contradiz regra do produto; ALERTA = permitido mas suspeito, ou
lacuna de cobertura.

Ao escrever checagem nova: use `NOT EXISTS`, nunca `LEFT JOIN … IS NULL`,
quando a relação for 1:N — com LEFT JOIN você conta **linhas** que não
casaram, não entidades órfãs, e o falso positivo é garantido (foi
exatamente o que aconteceu na 1ª rodada: 530 "órfãos" de departamento que
na verdade eram 0).

### Desvios encontrados na 1ª rodada (2026-07-29) e corrigidos

Todos eram defeito do **seed**, não do produto — o app valida os três casos
nas Server Actions; o seed escrevia direto no banco e passava por cima:

| Desvio | Regra violada | Correção |
| --- | --- | --- |
| 5 `BarProduto` com estoque **negativo** (3 do catálogo real do Gaviões) | `registrarVenda` recusa com "Estoque insuficiente" quando `produto.estoque < quantidade` | Seed passou a espelhar o estoque em memória e nunca vender além dele; dado existente corrigido com movimentação `AJUSTE` |
| 55 vendas `FIADO` gravadas como `PENDENTE` | No PDV, `pago = metodo !== 'PIX'` — **FIADO nasce `PAGA`** (baixa estoque, entra no turno); só PIX fica `PENDENTE` esperando o gateway. A receita é que espera a quitação | Seed corrigido; vendas existentes migradas para `PAGA` + `pagoEm` |
| 19 fiados quitados sem receita ligada à venda | `quitarFiado` liga o **mesmo** lançamento ao `BarFiado` e à `BarVenda` | Seed corrigido; vendas existentes ligadas ao lançamento |
| 2 turnos de caixa **abertos** na mesma unidade | No máximo 1 turno aberto por unidade (regra de aplicação, não do schema) | Seed não abre turno se a unidade já tem um aberto; o turno sintético extra foi fechado, preservando o real |

Depois das correções o caixa do bar **concilia por torcida**: vendas `PAGA`
− fiado em aberto = receitas `BAR` no livro-caixa (a checagem virou
invariante permanente da auditoria).

### Lacunas de cobertura que permanecem (não são bugs)

- **Visibilidade hierárquica cross-tenant não é exercitada.** A matriz dá 0
  pares `ancestor`/`descendant` entre as 16 torcidas semeadas: as
  Subsedes/PDEs dos dois lotes são `Sede` filhas **sem tenant próprio**, e
  relação hierárquica só existe entre *tenants*. Existem 3 pares reais no
  banco (PDEs do Gaviões promovidos via `db:promover-subsede-tenant`), mas
  com 1–4 membros reais e nenhum conteúdo — ou seja, a regra "descendente
  só vê o PÚBLICO do ancestral" (`ARCHITECTURE.md` §3.2) não tem dado que a
  prove. Para cobrir: promover uma subsede semeada a tenant e semear
  recurso RESTRITO (membros/financeiro/patrimônio) nos dois níveis.
- 20 `PerfilTorcedor` **reais** (pré-existentes, não dos lotes) sem
  `onboardingConcluidoEm` — não publicam no feed nacional. Dado real a
  investigar, fora do escopo de seed.
- 20 `CARAVANA` sem `valorVaga`: permitido pelo schema (null = caravana sem
  cobrança), só não exercita o fluxo de vaga paga nessas.

## Fase 3 (futura) — nacional completo, todos os clubes

Ideia: repetir o padrão da Fase 1 em loop por `Afiliacao`, para todo clube
com torcidas cadastradas na plataforma (318 afiliações cadastradas, 292 com
torcida vinculada, 563 tenants fora do lote Corinthians na varredura de
2026-07-29). Pontos a decidir antes de rodar:

- **Volume por unidade, não por clube**: manter o padrão "N pessoas por
  Sede/Subsede/PDE", capado por unidade — nunca dimensionado pelo
  `torcedoresEstimados` real do IBOPE (que é ordens de grandeza maior e
  não deve virar volume de linhas no banco).
- **Estimativa de tamanho de banco**: extrapolar a partir da Fase 1 (32
  unidades → ~1.750 users, ~1.600 SaasMembro, ~840 posts, ~4.500
  reações+comentários, ~20 eventos, ~1.100 RSVPs, 9 salas, 610
  MembroConversa, 57 pedidos — em ~90s de execução). Multiplicar pelo
  número de unidades territoriais de todos os clubes cadastrados antes de
  rodar, e orçar espaço em disco/índices de acordo.
- **Ambiente**: rodar em ambiente separado de produção (nunca no banco
  usado por usuários reais) — mesmo o dev/staging compartilhado deve ser
  avisado com antecedência, dado o volume de escrita.
- **Performance**: consultar o agente `performance` antes de rodar em
  escala nacional — risco real de carga em índices/queries de feed e
  busca da Comunidade (ver
  `docs/data/modulo-comunidade-performance.md`), especialmente com muitos
  tenants gerando posts/reações simultaneamente.
- Reaproveitar a convenção de marcação acima (domínio de e-mail reservado
  por lote + prefixo `[TESTE-<LOTE>]`), com um domínio/lote por rodada
  para permitir resets parciais (por clube) sem afetar os demais. A Fase 2
  já provou o isolamento entre lotes: com os dois lotes no banco, cada
  `--dry-run` conta só o próprio.
- **Presidente sintético é obrigatório em escala**: praticamente nenhuma
  torcida real fora do lote Corinthians tem `UserRole`, então qualquer seed
  nacional precisa criá-lo (ver Fase 2) — o fallback de autoria
  institucional da Fase 1 não encontra ninguém e o script quebra.

## Fase 3 (concluída) — lote de jornadas: caminho, não volume

Ver `docs/ops/lote-jornadas.md`. Este lote responde a uma limitação
estrutural das Fases 1 e 2, não a uma falta de volume: seed por
`createMany` grava o **resultado** de um vínculo, nunca o caminho dele.
Inscrição em canal oficial, cargo `member` da aprovação, espelho na Sede
raiz (Caso B), `PerfilTorcedor` concluído, `AuditLog` e notificação só
existem porque uma Server Action passou por ali — foi o que obrigou o
`repair-aprovado-canal-membro` na Fase 1.

O lote de jornadas roda pelo runner do Vitest (`vitest.seed.config.ts`),
porque é o jeito mais barato de ter alias `@/`, `server-only` e
`next/cache` disponíveis para chamar as actions de `apps/web` de fora do
Next. Ao contrário das auditorias, ele **persiste**.

Convenções próprias: domínio `@jornada.torcida.app`, marcador `[JORNADA]`,
reset em `reset:jornadas` — que de propósito **não** reverte os links de
convite (`seed:convites-teste`), por serem configuração da torcida.

### Senha única em todos os lotes

Todo `User` de seed nasce com `senhaHash` de `m1k43l3n`
(`packages/db/scripts/lib/senha-teste.js`) e `db:senha-teste` faz o
backfill nos lotes anteriores. Sem senha, o provider de credenciais recusa
o login e nenhum cenário semeado podia ser conferido de dentro do produto —
só pela leitura do banco.
