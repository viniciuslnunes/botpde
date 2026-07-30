# Módulo — Bar (PDV da sede/subsede/PDE)

> PDV simples para o bar da torcida: catálogo com estoque, venda rápida com PIX real,
> Dinheiro/Cartão manual ou Fiado, e integração automática com o livro-caixa (categoria `BAR`).

> **Fiado → Comanda (spec 2026-07-30):** o fluxo de Fiado descrito aqui será
> substituído por **Comanda** (conta aberta, N lançamentos, fechamento com N
> pagamentos; sair devendo vira desfecho do fechamento). Regras fechadas em
> [`modulo-bar-comanda.md`](./modulo-bar-comanda.md) — ainda **não implementado**.
> Este documento descreve o comportamento em produção hoje.

## Escopo MVP

| Inclui | Fora (próximas fases) |
|--------|------------------------|
| Catálogo (categorias, preço, custo, estoque) | Comanda / mesa |
| PDV venda rápida (multi-item) | Autoatendimento via QR |
| PIX real (gateway Mercado Pago reusado) | Maquininha física (MP Point) |
| Dinheiro / Cartão registrados manualmente | Impressão fiscal / NFC-e |
| Fiado vinculado a membro (concessão/quitação/cancelamento) | |
| Fornecedores de insumo (cadastro + rastreabilidade na compra) | |
| Baixa de estoque na venda | |
| Compra de insumo → DESPESA `BAR` (com fornecedor opcional) | |
| Venda paga → RECEITA `BAR` | |
| Turno de caixa (abrir/fechar) + alerta de variância de caixa | |
| Estorno de venda paga + auditoria de estornos anômalos por operador | |
| Alerta proativo de estoque baixo (cron) | |
| Margem estimada (receita − CMV) no hub admin | |
| Histórico de vendas + Balanço detalhado | |
| Isolamento por torcida + unidade (SEDE/SUBSEDE/PDE) | |

## Modelo

- `BarCategoria` (`saas_bar_categorias`): `tenantId`, `sedeId`, `nome`, `slug`
  (único por tenant+unidade), `ordem`, `ativo`.
- `BarProduto` (`saas_bar_produtos`): `tenantId`, `sedeId`, `categoriaId?`, `nome`, `preco`,
  `custoMedio` (média ponderada), `estoque`, `estoqueMinimo?`, `imagemUrl?`, `ativo`,
  `destaque`, `ordem`, `criadoPorId?`.
- `BarFornecedor` (`saas_bar_fornecedores`): `tenantId`, `nome`, `contato?`, `documento?`,
  `observacao?`, `ativo` (default `true`). Sem `sedeId` — fornecedor é do tenant
  inteiro, reusável entre unidades.
- `BarVenda` (`saas_bar_vendas`): `tenantId`, `sedeId`, `turnoId?`, `operadorId`, `subtotal`/`desconto`/`total`,
  `metodoPagamento`, `status`, campos de gateway (`gatewayProvider`, `gatewayExternalId`,
  `pixCopiaCola`, `pagoEm`), `financeiroLancamentoId?`, `financeiroEstornoLancamentoId?`,
  `estornadoPorId?`, `estornadoEm?`, `motivoEstorno?`, `observacao?`.
- `BarVendaItem` (`saas_bar_venda_itens`): snapshots `produtoNome`, `precoUnit`,
  `custoUnit`, `quantidade`, `total`; `produtoId?` (SetNull).
- `BarMovimentacaoEstoque` (`saas_bar_estoque_mov`): `tenantId`, `sedeId`, `produtoId`, `tipo`,
  `quantidade` (sempre positiva), `custoTotal?`, `motivo?`, `vendaId?`, `fornecedorId?`,
  `financeiroLancamentoId?`, `operadorId?`.
- `BarCaixaTurno` (`saas_bar_caixa_turnos`): `tenantId`, `sedeId`, `abertoEm`/`fechadoEm`,
  `abertoPorId`/`fechadoPorId`, `sangria`, `dinheiroContado?`, `dinheiroEsperado?`,
  `diferenca?`, `divergenciaAlta` (default `false`), `observacao?`.
- `BarFiado` (`saas_bar_fiados`): `tenantId`, `sedeId`, `vendaId` (único, FK `BarVenda`),
  `userId` (devedor), `membroId?` (FK `SaasMembro`, `SetNull`), `valor`, `vencimento`,
  `status` (`StatusFiadoBar`), `pagoEm?`, `metodoPagamentoQuitacao?`,
  `financeiroLancamentoId?` (único, criado só na quitação), `criadoPorId?`.

Enums:

- `MetodoPagamentoBar`: `PIX` | `DINHEIRO` | `CARTAO_DEBITO` | `CARTAO_CREDITO` | `FIADO`
- `StatusVendaBar`: `PENDENTE` | `PAGA` | `CANCELADA` | `ESTORNADA`
- `TipoMovEstoqueBar`: `ENTRADA` | `SAIDA` | `AJUSTE`
- `StatusFiadoBar`: `PENDENTE` | `PAGA` | `CANCELADA` | `VENCIDA`

## Regras de negócio

1. **Venda rápida** é transacional: revalida estoque no servidor, grava snapshots
   (`produtoNome`, `precoUnit`, `custoUnit`) e baixa estoque (movimentação `SAIDA`).
2. **Métodos**: PIX → venda `PENDENTE` + cobrança no gateway; webhook confirma
   (idempotente por `gatewayExternalId`). Dinheiro/Cartão → `PAGA` na hora. Fiado →
   `PAGA` para fins de estoque/relatório, mas sem `FinanceiroLancamento` até a
   quitação (ver item 10).
3. **Venda paga (não fiado)** cria `FinanceiroLancamento` RECEITA categoria `BAR`
   (`financeiroLancamentoId` na venda).
4. **Compra de insumo** cria movimentação `ENTRADA` + DESPESA `BAR`, recalcula
   `custoMedio` por média ponderada e aceita `fornecedorId` opcional (rastreabilidade
   — só fornecedores ativos do tenant aparecem no formulário; um fornecedor
   cadastrado permanece vinculado ao histórico mesmo se desativado depois).
5. **Cancelamento** só de venda `PENDENTE` (restaura estoque). Venda `PAGA` usa
   **estorno** (`ESTORNADA` + DESPESA espelho no livro-caixa **somente se** houver
   `financeiroLancamentoId` + restaura estoque). Fiado em aberto usa
   `cancelarFiadoBar`, não estorno.6. **Turno de caixa** — PDV exige `BarCaixaTurno` aberto na unidade (`bar:manage`
   abre/fecha). Fechamento registra dinheiro contado, sangria e resumo no `AuditLog`,
   e calcula `diferenca = dinheiroContado - dinheiroEsperado + sangria`. Se
   `abs(diferenca)` ultrapassar `max(LIMIAR_DIVERGENCIA_ABS, dinheiroEsperado * LIMIAR_DIVERGENCIA_PCT)`
   (constantes em `lib/bar.ts`, hoje R$ 20 ou 5%), marca `divergenciaAlta = true` e
   notifica `bar:manage` (exceto quem fechou o turno) com `BAR_TURNO_DIVERGENCIA`. O
   campo de dinheiro contado no painel não vem pré-preenchido com o valor esperado
   — o operador digita a contagem real, e a diferença aparece ao vivo (neutra/âmbar/
   vermelha) antes de confirmar o fechamento.
7. **Fiado** — venda a crédito vinculada a um `SaasMembro APROVADO` da unidade.
   Conceder fiado (mesmo no PDV comum) exige `bar:manage` — é decisão de gestor, não
   do operador de caixa (`bar:operate`). Baixa estoque normalmente na criação; cria
   `BarFiado PENDENTE` com `vencimento` (sugestão padrão +7 dias no PDV). Quitação
   (`quitarFiadoBar`, `bar:manage`) cria o `FinanceiroLancamento` RECEITA só nesse
   momento e vincula na venda original. Cancelamento (`cancelarFiadoBar`, `bar:manage`,
   `PENDENTE` ou `VENCIDA`) estorna o estoque e marca `CANCELADA`. Estorno de venda
   (`estornarVendaBar`) **não** se aplica a fiado em aberto — use cancelamento; após
   quitação, o estorno espelha DESPESA só se existir RECEITA (`financeiroLancamentoId`).
   Cron diário promove `PENDENTE` → `VENCIDA` quando `vencimento` passa e notifica
   `bar:manage` com `BAR_FIADO_VENCIDO` (só na transição, não repete a cada execução).8. **Auditoria de estornos anômalos** — ao estornar uma venda, grava
   `estornadoPorId`/`estornadoEm`/`motivoEstorno` na própria `BarVenda` (além do
   `AuditLog`) e conta estornos do operador original da venda na mesma unidade
   nos últimos `JANELA_ESTORNOS_ANOMALO_DIAS` dias (hoje 30). Ao atingir
   `LIMIAR_ESTORNOS_ANOMALO` (hoje 3), notifica `bar:manage` (exceto quem acabou de
   estornar) com `BAR_ESTORNO_ANOMALO`.
9. **Alerta de estoque baixo** — cron (`dispatchAlertasEstoqueBaixoBar`) varre produtos
   ativos com `estoqueMinimo` definido e estoque no limite ou abaixo, notificando
   `bar:manage`; idempotente por 24h via `link` estável (não duplica alerta do mesmo
   produto).
10. **Caveat de margem/relatórios (fiado)** — `resumirVendasBar`, `resumirMargemBar`,
   `resumirTurnoBar` (`totalPago`), `listarMaisVendidosBar` e `compararVendasBarPeriodo`
   contam toda `BarVenda` com `status: PAGA`, incluindo vendas fiado ainda não
   quitadas (fiado nasce `PAGA` para fins de estoque/relatório de vendas). Ou seja,
   "vendido"/"receita" nesses relatórios pode divergir do que efetivamente entrou no
   livro-caixa (`FinanceiroLancamento`, que só existe para fiado após a quitação). O
   cálculo de `dinheiroEsperado` no fechamento de turno não sofre esse problema —
   filtra explicitamente `metodoPagamento: DINHEIRO`, então fiado nunca infla a
   conferência de caixa físico. Não há correção prevista nesta rodada; é um
   comportamento aceito e documentado — telas que exibem "Vendido (pago)" devem ser
   lidas como "concluído para estoque", não "dinheiro em caixa".
11. **RBAC**
   - `bar:operate` — operar PDV / registrar vendas (exceto fiado); ver histórico
   - `bar:manage` — catálogo, estoque, fornecedores, fiado (conceder/quitar/cancelar),
     cancelar/estornar, abrir/fechar turno; inclui operate (cascata). Nenhuma
     permissão nova foi criada — decisão de design deste conjunto de features.
12. **Multi-tenant + unidade** — toda query filtra `tenantId` e `sedeId` (exceto
   `BarFornecedor`, que é por tenant, sem `sedeId` — reusável entre unidades).
   Cada torcida tem seu bar; dentro dela, cada SEDE / SUBSEDE / PDE tem
   catálogo e estoque próprios. Unidade resolvida por `SaasMembro.sedeId`
   (fallback: SEDE principal do tenant). Unidade promovida a tenant próprio
   isola via `tenantId`.
13. **Balanço** — flag `Tenant.balancoFinanceiroVisivel` expõe totais, categorias e
   lançamentos detalhados (itens do bar, unidade, departamento, responsável) a
   membros logados em `/portal/balanco` (período, print/copiar — ver
   [`backlog-caixa-operacional.md`](../product/backlog-caixa-operacional.md)).

## Superfícies

- Portal: `/portal/bar` (cardápio da unidade do membro) e `/portal/balanco` (se flag ativa)
- Admin: `/admin/bar` (hub, com atalhos e contador de fiados pendentes), `/admin/bar/pdv`,
  `/admin/bar/produtos`, `/admin/bar/estoque`, `/admin/bar/vendas`,
  `/admin/bar/fornecedores` (CRUD, `bar:manage`), `/admin/bar/fiado` (lista +
  quitação/cancelamento, `bar:manage`), `/admin/bar/estornos` (tabela + agregações por
  operador/produto com sinalização de padrão anômalo, `bar:manage`)
- Cron: `/api/cron/bar-alertas` (`GET`, guard `CRON_SECRET` Bearer — mesmo padrão de
  `/api/cron/eventos-lembretes`) dispara `dispatchAlertasEstoqueBaixoBar` e
  `dispatchAlertasFiadoVencidoBar` na mesma chamada
- Schemas Zod: `packages/types/src/bar.js`
- Lib: `apps/web/src/lib/bar.ts` (`resolveUnidadeBar`), `apps/web/src/lib/bar-alertas.ts`
  (disparo dos crons de tempo)
- Gateway PIX reusado: `apps/web/src/lib/pix-gateway.ts` + webhook `/api/webhooks/pix`

## Seed / sync

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/db db:push
pnpm --filter @torcida/db seed:bar-gavioes
```

## Insights administrativos (2026-07-22)

`lib/bar.ts` ganhou `resumirVendasBarPorDia` (vendas `PAGA` por dia, fuso SP),
`listarMaisVendidosBar` (top 5 por quantidade via groupBy de `BarVendaItem`) e
`compararVendasBarPeriodo`; `resumirMargemBar` aceita `sedeId: undefined` =
torcida inteira (uso nos relatórios). Superfícies: seção "Últimos 30 dias" no
hub `/admin/bar` (sparkline + top produtos, respeitando a unidade ativa) e
seção Bar em `/admin/relatorios`. Receita = só vendas `PAGA`. Padrões:
`docs/frontend/admin-ui-kit.md`.

## Reforço de controle e processos (2026-07-27)

Cinco lacunas de controle fechadas nesta rodada: fornecedor (rastreabilidade de
compra de insumo), alerta proativo de estoque baixo (cron), alerta de variância de
caixa no fechamento de turno (com preview ao vivo antes de confirmar), fiado
vinculado a membro (concessão exige `bar:manage`; receita só entra no livro-caixa
na quitação) e auditoria de estornos anômalos por operador (limiar 3 estornos em 30
dias, configurável em `lib/bar.ts`). Nenhuma permissão nova foi criada — todas as
novas mutações usam `bar:manage` existente. Ver caveat de margem/relatórios (regra
10 acima): "vendido" pode divergir de "recebido" enquanto houver fiado pendente.

**Relatório de estornos** (`/admin/bar/estornos` → `listarEstornosBar`): o período
"últimos 30 dias" filtra por `estornadoEm` (não por `criadoEm` da venda), alinhado
à detecção de padrão anômalo em `estornarVendaBar`. Assim, venda antiga estornada
hoje aparece no relatório do período corrente.

## Layout do PDV — frame por container query (2026-07-30)

O PDV é um **frame imersivo** (fora do shell admin: sem topbar/sidebar) com três
zonas: trilha de turno, cardápio e comanda. Decisão fechada: **quem dita o layout
interno é a largura real do frame, não a da viewport**. A raiz é
`@container/pdv` e todos os cortes internos usam `@[Nrem]/pdv:` — nunca `lg:`/`xl:`.
Motivo: as duas colunas laterais comem 40–43rem, então a viewport "dizia" que
cabiam 3 colunas de produto quando cabia 1; e `lg:` (media query, `rem` sobre a
fonte inicial do browser) divergia de `w-[19rem]` (`rem` sobre a fonte raiz)
sempre que havia zoom ou fonte padrão custom — a comanda empilhava embaixo do
cardápio em vez de virar coluna.

Cortes: comanda vira coluna em ≥60rem (21rem → 23rem em 76rem → 25rem em 100rem);
trilha de turno entra em ≥82rem (16rem, 18rem em 100rem). **A comanda tem
prioridade sobre a trilha** — abaixo de 82rem o turno vira drawer pelo chip do
topbar, e o topbar passa a mostrar `turnoResumo` (vendido + nº de vendas) para o
caixa não ficar invisível. Abaixo de 60rem a comanda vira bottom sheet.

Cardápio: **linha compacta** de ~4rem (thumb 44px + nome + preço·estoque + zona de
ação de 4.25rem fixa) em `repeat(auto-fill, minmax(min(15.5rem,100%),1fr))` — o
card alto com foto grande cabia ~3 itens na tela, a linha cabe ~8 por coluna.
A zona de ação tem largura fixa de propósito: a linha não reflui ao lançar item.
Toque na linha lança +1; com item na comanda a linha mostra `−` + badge, e o
stepper completo vive na comanda (fonte única de edição de quantidade). A linha é
`div` com `role=button` + Enter/Espaço — `<button>` aninhado fecha o externo cedo
e estilhaça a grade. Faixa de PIX pendente é chip de uma linha (h-9), não card.

Sheet e drawer usam `absolute` dentro da raiz: `container-type: inline-size`
implica `contain: layout`, então `fixed` passaria a se posicionar pela raiz —
melhor assumir isso explicitamente do que depender do efeito colateral.
