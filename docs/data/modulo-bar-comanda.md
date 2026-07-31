# Módulo Bar — Comanda (spec, 2026-07-30)

> Substitui o fluxo de **Fiado** do PDV por **Comanda**: conta aberta, identificada
> por um portador, que acumula lançamentos ao longo do tempo e é fechada com um ou
> mais pagamentos. Sair devendo deixa de ser um método de pagamento e passa a ser
> **um desfecho do fechamento**.
>
> Status: **fases 1–5 implementadas** (schema, núcleo server, PDV, listagem
> `/admin/bar/comandas`, redirect fiado, cron/notificações, ciência no turno,
> portal `/portal/bar` leitura, métricas Recebido × Consumo em aberto).
> Pendência residual: dropar `BarFiado` do schema após migração em produção (§9).
> Módulo em produção descrito em [`modulo-bar.md`](./modulo-bar.md).

## 1. Por que trocar

Fiado hoje é uma venda já fechada com pagamento adiado: a `BarVenda` nasce `PAGA`
(para estoque/relatório), cria `BarFiado PENDENTE` com vencimento, e a RECEITA no
livro-caixa só aparece na quitação. Isso resolve crédito, mas não resolve o uso real
do bar da sede: o cara chega, pede uma rodada, pede outra, e paga no fim. Hoje isso
vira N vendas soltas sem dono comum, ou uma venda registrada tarde demais.

Comanda é um ciclo de vida maior: abre → acumula → fecha. O crédito vira o caso em
que o fechamento não cobre o total.

Ganho colateral: corrige o **caveat da regra 10** de `modulo-bar.md` ("vendido" ≠
"dinheiro em caixa"). Com comanda, RECEITA entra no **pagamento**, e consumo em
comanda aberta vira métrica própria ("em aberto"), não receita.

## 2. Decisões fechadas

| Decisão | Escolha |
|---|---|
| Fiado | Deixa de ser método de pagamento. Sobrevive como `FECHADA_COM_DEBITO` |
| Modelo | Entidade própria `BarComanda` + N `BarVenda` (`comandaId`) + N pagamentos |
| Titular | Membro `APROVADO` **ou** avulso (nome livre / mesa) |
| Pagamento | Múltiplos pagamentos por comanda (parcial e divisão de conta) |

**Nomenclatura (obrigatório):** hoje o PDV chama de "Comanda" a coluna do carrinho
da venda atual (`bar-pdv.tsx`). Com esta mudança essa coluna passa a se chamar
**"Pedido"** — em tela, em estado React e em comentário. Manter os dois sentidos da
palavra é o caminho mais curto para bug de interpretação.

## 3. Modelo

### `BarComanda` (`saas_bar_comandas`)

- `tenantId`, `sedeId` — isolamento por torcida e unidade, como todo o Bar.
- `codigo` — nº da comanda física / mesa / apelido. **Único entre comandas `ABERTA`
  da mesma unidade** (índice parcial ou checagem transacional; ver §5.1).
- `titularUserId?` + `titularMembroId?` (`SetNull`) — comanda de membro.
- `titularNome` — snapshot do nome (membro ou avulso). Sempre preenchido.
- `tipo`: `MEMBRO` | `AVULSO`.
- `status`: `StatusComandaBar` (§4).
- `limite?` (`Decimal`) — teto de consumo; `null` = usa o padrão da unidade.
- `total`, `totalPago`, `desconto` — desnormalizados, recalculados em transação.
- `turnoAberturaId?`, `abertaEm`, `abertaPorId`.
- `turnoFechamentoId?`, `fechadaEm?`, `fechadaPorId?`.
- `vencimento?` — só quando fecha com débito.
- `pagoEm?`, `canceladaEm?`, `motivoCancelamento?`, `observacao?`.

### `BarComandaPagamento` (`saas_bar_comanda_pagamentos`)

`comandaId`, `metodoPagamento` (`MetodoPagamentoBar`), `valor`, `recebidoEm`,
`turnoId?`, `operadorId`, campos de gateway (`gatewayProvider`,
`gatewayExternalId`, `pixCopiaCola`, `pagoEm`), `status`
(`PENDENTE` | `CONFIRMADO` | `CANCELADO`), `financeiroLancamentoId?` (único).

Um pagamento confirmado = um `FinanceiroLancamento` RECEITA categoria `BAR`.

### `BarVenda` — alterações

- `comandaId?` (FK, `SetNull`) — quando presente, a venda é um **lançamento** de
  comanda, não uma venda avulsa.
- `StatusVendaBar` ganha `EM_COMANDA`: baixou estoque, ainda não gerou receita.
- `metodoPagamento` fica `null`/irrelevante no lançamento — quem paga é a comanda.
- `MetodoPagamentoBar.FIADO` é **removido do PDV** (mantido no enum apenas se houver
  linha histórica; ver §9).

### Enums

- `StatusComandaBar`: `ABERTA` | `FECHADA_PAGA` | `FECHADA_COM_DEBITO` | `QUITADA` |
  `VENCIDA` | `CANCELADA`
- `StatusPagamentoComandaBar`: `PENDENTE` | `CONFIRMADO` | `CANCELADO`

`BarFiado` e `StatusFiadoBar` são descontinuados após a migração (§9).

## 4. Ciclo de vida

```
ABERTA ──fecha, pago integral──────────────▶ FECHADA_PAGA
   │
   ├─fecha com saldo (bar:manage)──────────▶ FECHADA_COM_DEBITO ──quita──▶ QUITADA
   │                                              │
   │                                              └─cron, vencimento──────▶ VENCIDA ──quita──▶ QUITADA
   │
   └─cancela (bar:manage, motivo)──────────▶ CANCELADA
```

`FECHADA_COM_DEBITO` e `VENCIDA` também podem ir para `CANCELADA` (perdão de dívida
/ erro), com motivo obrigatório — mesma semântica do `cancelarFiadoBar` atual.

## 5. Regras de negócio

### 5.1 Abertura
1. Exige `BarCaixaTurno` aberto na unidade (mesma regra do PDV hoje).
2. `codigo` obrigatório e único entre comandas `ABERTA` da unidade. Colisão retorna
   erro de negócio, nunca cria a segunda.
3. Titular `MEMBRO` exige `SaasMembro` `APROVADO` **da unidade**. Titular `AVULSO`
   exige só `titularNome` (mín. 2 caracteres).
4. Um membro pode ter **no máximo uma** comanda `ABERTA` por unidade.
5. Grava `AuditLog` `BAR_COMANDA_ABERTA`.

### 5.2 Lançamento
6. Lançar itens numa comanda `ABERTA` cria uma `BarVenda` `EM_COMANDA` com
   `comandaId`, revalida estoque no servidor, grava snapshots (`produtoNome`,
   `precoUnit`, `custoUnit`) e baixa estoque (`SAIDA`) — igual à venda rápida.
7. **Preço é congelado no lançamento.** Reajuste posterior não reprecifica consumo.
8. `comanda.total` é recalculado na mesma transação.
9. Só comanda `ABERTA` aceita lançamento. Qualquer outro status → erro.

### 5.3 Limite de consumo
10. Teto por comanda: `comanda.limite` ou o padrão da unidade
    (`LIMITE_COMANDA_PADRAO` em `lib/bar.ts`, sugestão inicial R$ 150; `null`
    desliga o controle).
11. Ao atingir ≥ 80% do limite, o PDV avisa. Lançamento que **ultrapassa** o limite
    é bloqueado para `bar:operate` e só passa com `bar:manage` (liberação pontual
    ou elevação do `limite` da comanda, auditada com `BAR_COMANDA_LIMITE_LIBERADO`).
12. Comanda `AVULSO` não pode ter limite elevado acima do padrão sem `bar:manage`.

### 5.4 Correção
13. Remover um lançamento (venda `EM_COMANDA`) devolve estoque (`ENTRADA` com
    motivo), marca a venda `CANCELADA`, recalcula o total e exige **motivo**.
    Gate `bar:manage` — é a superfície mais fraude-sensível do fluxo.
14. Remoção entra no `AuditLog` (`BAR_COMANDA_ITEM_REMOVIDO`) e conta para a mesma
    detecção de padrão anômalo por operador já usada em estornos
    (`LIMIAR_ESTORNOS_ANOMALO` / `JANELA_ESTORNOS_ANOMALO_DIAS`).

### 5.5 Transferência e junção
15. Trocar titular de comanda `ABERTA`: `bar:manage`, auditado. Trocar de `AVULSO`
    para `MEMBRO` é permitido (viabiliza fechar com débito depois); o inverso não,
    se já houver débito planejado.
16. Mover um lançamento para outra comanda `ABERTA` da mesma unidade: `bar:manage`,
    recalcula os dois totais na mesma transação, auditado.
17. Juntar comandas = mover todos os lançamentos e fechar a origem como `CANCELADA`
    com motivo `Juntada na comanda <codigo>`. Nunca apaga histórico.

### 5.6 Fechamento
18. Fechar exige comanda `ABERTA` com ao menos um lançamento ativo. Comanda sem
    consumo é **cancelada**, não fechada.
19. Desconto no fechamento: `bar:manage`, valor ≤ total, motivo obrigatório.
20. Aceita **N pagamentos** (`BarComandaPagamento`). Soma dos confirmados +
    desconto define o saldo.
21. **PIX**: cria pagamento `PENDENTE` com cobrança no gateway (reuso de
    `lib/pix-gateway.ts`); o webhook confirma (idempotente por `gatewayExternalId`)
    e só então soma ao `totalPago`. A comanda **não fecha** com PIX pendente.
22. Dinheiro/Cartão: pagamento `CONFIRMADO` na hora.
23. Saldo zerado → `FECHADA_PAGA`, `fechadaEm`, `turnoFechamentoId`.
24. Saldo > 0 → **exige `bar:manage` + titular `MEMBRO` + `vencimento`** →
    `FECHADA_COM_DEBITO`. Titular `AVULSO` **nunca** fecha com débito.
25. Divisão de conta é N pagamentos no mesmo fechamento — não cria N comandas.

### 5.7 Débito, quitação e cobrança
26. `FECHADA_COM_DEBITO` aparece na lista de devedores (`/admin/bar/comandas`, filtro
    "Em aberto"), com saldo = `total − desconto − totalPago`.
27. Quitação (`bar:manage`) registra mais um `BarComandaPagamento` confirmado. Saldo
    zerado → `QUITADA` + `pagoEm`.
28. Quitação parcial é permitida: abate o saldo, status permanece.
29. Cron diário promove `FECHADA_COM_DEBITO` → `VENCIDA` quando `vencimento` passa,
    e notifica `bar:manage` com `BAR_COMANDA_VENCIDA` **só na transição** (não
    repete a cada execução) — mesmo contrato do `BAR_FIADO_VENCIDO` atual.
30. Cancelar débito (`bar:manage`, motivo obrigatório) → `CANCELADA`. **Não** estorna
    estoque: o produto foi consumido; é perdão de dívida, não devolução. (Diferença
    deliberada em relação ao `cancelarFiadoBar` de hoje, que estorna — lá a "venda"
    e a dívida eram a mesma linha.)

### 5.8 Financeiro
31. **RECEITA entra no pagamento confirmado**, nunca no lançamento. Cada
    `BarComandaPagamento` `CONFIRMADO` cria um `FinanceiroLancamento` RECEITA
    categoria `BAR` com `financeiroLancamentoId` no pagamento.
32. Estorno de pagamento confirmado espelha DESPESA `BAR`, como hoje.
33. Consumo em comanda `ABERTA` **não** é receita. Relatórios ganham a métrica
    "Consumo em aberto" (soma de `total` das comandas `ABERTA`), separada de
    "Recebido". Margem/CMV continua contando o lançamento (o produto saiu).

### 5.9 Turno de caixa
34. Comanda atravessa turno — é o comportamento esperado, não erro.
35. `dinheiroEsperado` conta pagamentos `DINHEIRO` **confirmados naquele turno**
    (`BarComandaPagamento.turnoId`), independente de quando a comanda abriu.
36. Fechamento de turno **lista as comandas abertas e exige ciência explícita**
    (checkbox/confirmação); não bloqueia. O resumo vai para o `AuditLog` do
    fechamento.

### 5.10 RBAC (nenhuma permissão nova)
| Ação | Gate |
|---|---|
| Abrir comanda, lançar item, registrar pagamento, fechar comanda paga | `bar:operate` |
| Remover lançamento, desconto, liberar/elevar limite, transferir/juntar | `bar:manage` |
| Fechar com débito, quitar, cancelar comanda ou débito | `bar:manage` |
| Ver lista de comandas e histórico | `bar:operate` |

Fechar **com débito** segue a mesma lógica do fiado hoje: conceder crédito é decisão
de gestor, não do operador de caixa.

### 5.11 Auditoria
Toda mutação grava `AuditLog`: `BAR_COMANDA_ABERTA`, `BAR_COMANDA_ITEM_LANCADO`,
`BAR_COMANDA_ITEM_REMOVIDO`, `BAR_COMANDA_LIMITE_LIBERADO`,
`BAR_COMANDA_TRANSFERIDA`, `BAR_COMANDA_DESCONTO`, `BAR_COMANDA_FECHADA`,
`BAR_COMANDA_PAGAMENTO`, `BAR_COMANDA_QUITADA`, `BAR_COMANDA_CANCELADA`.
Rótulos em `lib/audit-labels.ts`.

### 5.12 Multi-tenant e unidade
37. Toda query filtra `tenantId` + `sedeId`. Comanda pertence à unidade que a abriu;
    não há comanda cross-unidade (nem para transferência/junção).

## 6. Portal do membro
38. `/portal/bar` mostra a comanda `ABERTA` do próprio membro na unidade: itens,
    total, limite e quanto falta para o teto. Leitura apenas — não paga nem lança.
39. Débito em aberto (`FECHADA_COM_DEBITO` / `VENCIDA`) aparece com valor e
    vencimento. Sem pagamento pelo portal no MVP.

## 7. Superfícies
- `/admin/bar/pdv` — abrir comanda, lançar, fechar. A coluna do carrinho vira
  **"Pedido"**; a comanda ativa é um contexto do PDV (seletor/chip no topbar).
  Layout segue as regras de container query de `modulo-bar.md` §Layout do PDV.
- `/admin/bar/comandas` — **substitui `/admin/bar/fiado`**. Tabs internas por
  query param (`AdminTabs`): Abertas · Em aberto (débito) · Histórico.
- Tab do módulo em `ADMIN_MODULOS` (`packages/types/src/menu.js`): `fiado` →
  `comandas`, label "Comandas", gate `BAR_OPERATE | BAR_MANAGE` (lista §5.10 =
  operate; OR manage evita regressão do fiado). Quit/cancel débito = `BAR_MANAGE`.
- **`/admin/bar/fiado` exige `permanentRedirect` para `/admin/bar/comandas`** —
  há `Notificacao.link` já gravado apontando para a rota antiga (CLAUDE.md,
  §Tabs).
- `notificacoes-menu-badges.ts` e `notificacoes-routing.ts`: `BAR_FIADO_VENCIDO`
  → `BAR_COMANDA_VENCIDA`, rota `/admin/bar/comandas`.
- Cron `/api/cron/bar-alertas` passa a chamar `dispatchAlertasComandaVencidaBar`.
- Schemas Zod em `packages/types/src/bar.js`; lib em `apps/web/src/lib/bar.ts`
  (+ `bar-comanda.ts` se o arquivo crescer demais).

## 8. Estados de UI obrigatórios
Vazio (nenhuma comanda aberta), erro (código duplicado, limite estourado, PIX
pendente, sem turno), loading (lançamento e fechamento são transacionais).
Fechamento com múltiplos pagamentos usa `StickyPersistBar`? **Não** — é ação de
caixa, confirmação explícita em modal, não formulário longo.

## 9. Migração
40. `BarFiado` `PENDENTE`/`VENCIDA` → `BarComanda` `FECHADA_COM_DEBITO`/`VENCIDA`,
    titular = `userId`/`membroId` do fiado, `total` = `valor`, `codigo` gerado
    (`MIGR-<n>`), `comandaId` na `BarVenda` original (que passa a `EM_COMANDA`).
41. `BarFiado` `PAGA` → comanda `QUITADA` + um `BarComandaPagamento` `CONFIRMADO`
    herdando `financeiroLancamentoId` e `metodoPagamentoQuitacao`. **Não** criar
    lançamento financeiro novo — a receita já existe.
42. `BarFiado` `CANCELADA` → comanda `CANCELADA`.
43. Script `packages/db/scripts/migrate-fiado-para-comanda.js`, idempotente.
    `BarFiado` só é removido do schema depois da migração rodar em produção.
44. Sem permissão nova → **não** exige `db:repair-system-roles`.

## 10. Fases sugeridas
1. **Schema + migração** — `BarComanda`, `BarComandaPagamento`, `BarVenda.comandaId`,
   `EM_COMANDA`, script de migração, `db:push`.
2. **Núcleo server** — abrir / lançar / remover / fechar / pagar / quitar / cancelar,
   com RBAC, Zod, `AuditLog` e recálculo transacional. Testes Vitest de RBAC e das
   invariantes de saldo.
3. **PDV** — renomear carrinho para "Pedido", contexto de comanda ativa, limite,
   fechamento com N pagamentos.
4. **`/admin/bar/comandas`** + redirect da rota antiga + notificações + cron +
   ciência no fechamento de turno (§5.9) — **feito**.
5. **Portal** (§6) e ajuste dos relatórios (§5.8 item 33: "Recebido" × "Em aberto") — **feito**.

## 11. Invariantes para `audit:regras`
- Comanda `ABERTA` com `totalPago > 0` é válida (pagamento parcial antecipado).
- Comanda `FECHADA_PAGA` tem `total − desconto − totalPago == 0`.
- Comanda `FECHADA_COM_DEBITO`/`VENCIDA` tem saldo `> 0`, `vencimento` não nulo e
  titular `MEMBRO`.
- Nunca duas comandas `ABERTA` com o mesmo `codigo` na mesma unidade.
- Todo `BarComandaPagamento` `CONFIRMADO` tem `financeiroLancamentoId`.
- Toda `BarVenda` `EM_COMANDA` tem `comandaId` e nenhum `financeiroLancamentoId`.
