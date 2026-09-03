# Módulo — Bar (PDV da sede/subsede/PDE)

> PDV simples para o bar da torcida: catálogo com estoque, venda rápida com PIX real,
> Dinheiro/Cartão manual ou Fiado, e integração automática com o livro-caixa (categoria `BAR`).

> **Fiado → Comanda (spec 2026-07-30):** o fluxo de Fiado descrito aqui foi
> substituído por **Comanda** (conta aberta, N lançamentos, fechamento com N
> pagamentos; sair devendo vira desfecho do fechamento). Regras em
> [`modulo-bar-comanda.md`](./modulo-bar-comanda.md) — **fases 1–5 implementadas**
> (núcleo, PDV, `/admin/bar/comandas`, portal `/portal/bar`, métricas
> Recebido × Consumo em aberto). A rota `/admin/bar/fiado` redireciona
> permanentemente para `/admin/bar/comandas`. `BarFiado` permanece no schema até
> dropar pós-migração em produção.

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
10. **Recebido × Consumo em aberto (comanda, fase 5)** — relatórios e desempenho
   separam as métricas: **Recebido** = vendas rápidas `PAGA` sem `comandaId` +
   `BarComandaPagamento` `CONFIRMADO` (`recebidoEm`); **Consumo em aberto** =
   soma de `total − desconto` das comandas `ABERTA` (snapshot). **Margem/CMV**
   conta lançamentos `PAGA` **e** `EM_COMANDA` (produto saiu) — o campo
   `receita` da margem é consumo, não Recebido. Helpers: `resumirRecebidoBar`,
   `resumirConsumoEmAbertoBar`, `resumirMargemBar`. Corrige o caveat antigo do
   fiado ("vendido" ≠ dinheiro em caixa). Ver `modulo-bar-comanda.md` §5.8.33.
11. **RBAC**
   - `bar:operate` — operar PDV / registrar vendas (exceto fiado); ver histórico
   - `bar:manage` — catálogo, estoque, fornecedores, fiado (conceder/quitar/cancelar),
     cancelar/estornar, abrir/fechar turno; inclui operate (cascata). Nenhuma
     permissão nova foi criada — decisão de design deste conjunto de features.
   - Pacote canônico: sob o departamento **Financeiro** (`bar:operate` no
     colaborador, `bar:manage` no gestor). Sem departamento “Bar” próprio.
     Presidência/admin já têm via cargo de sistema.
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

- Portal: `/portal/bar` (cardápio + **Minha comanda** / débitos em leitura; unidade do membro) e `/portal/balanco` (se flag ativa)
- Admin: `/admin/bar` (hub, com atalhos), `/admin/bar/pdv`,
  `/admin/bar/produtos`, `/admin/bar/estoque`, `/admin/bar/vendas`,
  `/admin/bar/fornecedores` (CRUD, `bar:manage`), `/admin/bar/comandas`
  (substitui fiado: abertas / débito / histórico; quit/cancel débito com
  `bar:manage`), `/admin/bar/fiado` → permanentRedirect para comandas,
  `/admin/bar/estornos` (tabela + agregações por
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
novas mutações usam `bar:manage` existente. Comanda (fase 5) separa Recebido ×
Consumo em aberto na UI/métricas (regra 10 acima).

**Relatório de estornos** (`/admin/bar/estornos` → `listarEstornosBar`): o período
"últimos 30 dias" filtra por `estornadoEm` (não por `criadoEm` da venda), alinhado
à detecção de padrão anômalo em `estornarVendaBar`. Assim, venda antiga estornada
hoje aparece no relatório do período corrente.

## Layout do PDV — frame por container query (2026-07-30)

O PDV é um **frame imersivo** (fora do shell admin: sem topbar/sidebar) com três
zonas: trilha de turno, cardápio e **Pedido** (coluna do carrinho da venda atual).
A **comanda** (`BarComanda`) é o contexto de conta aberta — seletor/chip no topbar,
não a coluna lateral. Decisão fechada: **quem dita o layout
interno é a largura real do frame, não a da viewport**. A raiz é
`@container/pdv` e todos os cortes internos usam `@[Nrem]/pdv:` — nunca `lg:`/`xl:`.
Motivo: as duas colunas laterais comem 40–43rem, então a viewport "dizia" que
cabiam 3 colunas de produto quando cabia 1; e `lg:` (media query, `rem` sobre a
fonte inicial do browser) divergia de `w-[19rem]` (`rem` sobre a fonte raiz)
sempre que havia zoom ou fonte padrão custom — o Pedido empilhava embaixo do
cardápio em vez de virar coluna.

Cortes: Pedido vira coluna em ≥60rem (21rem → 23rem em 76rem → 25rem em 100rem);
trilha de turno entra em ≥82rem (16rem, 18rem em 100rem). **O Pedido tem
prioridade sobre a trilha** — abaixo de 82rem o turno vira drawer pelo chip do
topbar, e o topbar passa a mostrar `turnoResumo` (vendido + nº de vendas) para o
caixa não ficar invisível. Abaixo de 60rem o Pedido vira bottom sheet.

Cardápio: **linha compacta** de ~4rem (thumb 44px + nome + preço·estoque + zona de
ação de 4.25rem fixa) em `repeat(auto-fill, minmax(min(15.5rem,100%),1fr))` — o
card alto com foto grande cabia ~3 itens na tela, a linha cabe ~8 por coluna.
A zona de ação tem largura fixa de propósito: a linha não reflui ao lançar item.
Toque na linha lança +1; com item no Pedido a linha mostra `−` + badge, e o
stepper completo vive no Pedido (fonte única de edição de quantidade). A linha é
`div` com `role=button` + Enter/Espaço — `<button>` aninhado fecha o externo cedo
e estilhaça a grade. Faixa de PIX pendente é chip de uma linha (h-9), não card.

Sheet e drawer usam `absolute` dentro da raiz: `container-type: inline-size`
implica `contain: layout`, então `fixed` passaria a se posicionar pela raiz —
melhor assumir isso explicitamente do que depender do efeito colateral.

## Compra antecipada pelo portal (2026-09-02)

Mata a fila do intervalo: o sócio escolhe em `/portal/bar`, paga por PIX e retira
mostrando o QR no balcão. Quinze minutos de intervalo com fila única significam
perder o segundo tempo.

**Só existe com turno de caixa aberto**, e isso não é detalhe de UI — foi a
resposta para a pergunta que travava a feature: *em qual turno entra uma venda
feita fora do turno?* (compra às 14h, retira às 21h). Nos dois caminhos a
conferência de caixa quebrava: no turno do pagamento pode não haver turno aberto;
no da retirada, o dinheiro aparece num turno diferente do que o recebeu.
Restringindo a compra ao caixa aberto, **o caso deixa de existir**. Por isso o
item "Bar" na top bar do portal é **contextual** — ele aparecer já é o sinal de
que o bar está funcionando agora.

- Modelo: reusa `BarVenda` com quatro campos novos — `origem` (`PDV | PORTAL`),
  `compradorUserId`, `retiradoEm`, `retiradoPorId`. **`PAGA` diz que o dinheiro
  entrou, não que a bebida saiu** — mesma distinção de RSVP × embarque e de
  pedido × retirada.
- **Operador da venda é quem abriu o turno**, não o comprador: é ele quem
  responde pela entrega e em cujo caixa o dinheiro entra. O comprador fica em
  campo próprio para não poluir o relatório por operador.
- **Estoque baixa na compra** (decisão de produto), como o PDV já faz com PIX
  pendente — a venda reserva a mercadoria, senão o bar vende o que não tem.
  Falha ao gerar a cobrança cancela a venda e devolve o estoque.
- `CompraBarPortalSchema` é **deliberadamente mais pobre** que `VendaBarSchema`:
  sem método de pagamento (é sempre PIX), sem desconto e sem fiado. Cada campo
  ausente é uma decisão de gestão que não pode escapar para o cliente.
- Gate: sessão + `assertMembroAtivo`, **nunca** `BAR_OPERATE` — reusar a action
  do PDV daria a qualquer sócio o poder de registrar venda, conceder desconto e
  lançar fiado. Retirada no balcão: `BAR_OPERATE | BAR_MANAGE`.
- QR: propósito `bar-venda`, estático, **verificado no servidor** (libera
  mercadoria). Não confundir com o QR da comanda, lido no cliente porque só
  escolhe entre o que já está na tela do operador. O vale só nasce depois do PIX
  confirmado — mostrar código de compra pendente faria o sócio esticar o celular
  para ouvir "não caiu".
- Superfícies: `BarCompraAntecipada` + `BarValesRetirada` em `/portal/bar`;
  `BarRetiradaScan` no PDV. Actions: `app/portal/bar/actions.ts` e
  `app/admin/bar/retirada-actions.ts`.

**Retirada parcial (2026-09-03):** `BarVendaItem.retiradoQtd` é o ledger por item;
`BarVenda.retiradoEm` só é carimbado quando **todos** fecham. Quem compra quatro
cervejas leva duas agora e volta no intervalo — um booleano obrigaria o operador
a mentir (dar tudo por entregue) ou a recusar. O balcão lê o vale primeiro e
confirma depois, com a quantidade preenchida no que falta: entregar direto na
leitura seria mais rápido e erraria mais, e a mercadoria sai da mão para nunca
mais voltar. O portal mostra **o que falta**, não o que foi comprado.
