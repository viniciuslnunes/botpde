# Módulo — Bar (PDV da sede/subsede/PDE)

> PDV simples para o bar da torcida: catálogo com estoque, venda rápida com PIX real
> ou Dinheiro/Cartão manual, e integração automática com o livro-caixa (categoria `BAR`).

## Escopo MVP

| Inclui | Fora (próximas fases) |
|--------|------------------------|
| Catálogo (categorias, preço, custo, estoque) | Comanda / mesa |
| PDV venda rápida (multi-item) | Autoatendimento via QR |
| PIX real (gateway Mercado Pago reusado) | Maquininha física (MP Point) |
| Dinheiro / Cartão registrados manualmente | Impressão fiscal / NFC-e |
| Baixa de estoque na venda | Fornecedores / contas a pagar |
| Compra de insumo → DESPESA `BAR` | Fidelidade / fiado |
| Venda paga → RECEITA `BAR` | |
| Turno de caixa (abrir/fechar) + estorno de venda paga | |
| Margem estimada (receita − CMV) no hub admin | |
| Histórico de vendas + Balanço detalhado | |
| Isolamento por torcida + unidade (SEDE/SUBSEDE/PDE) | |

## Modelo

- `BarCategoria` (`saas_bar_categorias`): `tenantId`, `sedeId`, `nome`, `slug`
  (único por tenant+unidade), `ordem`, `ativo`.
- `BarProduto` (`saas_bar_produtos`): `tenantId`, `sedeId`, `categoriaId?`, `nome`, `preco`,
  `custoMedio` (média ponderada), `estoque`, `estoqueMinimo?`, `imagemUrl?`, `ativo`,
  `destaque`, `ordem`, `criadoPorId?`.
- `BarVenda` (`saas_bar_vendas`): `tenantId`, `sedeId`, `turnoId?`, `operadorId`, `subtotal`/`desconto`/`total`,
  `metodoPagamento`, `status`, campos de gateway (`gatewayProvider`, `gatewayExternalId`,
  `pixCopiaCola`, `pagoEm`), `financeiroLancamentoId?`, `financeiroEstornoLancamentoId?`, `observacao?`.
- `BarVendaItem` (`saas_bar_venda_itens`): snapshots `produtoNome`, `precoUnit`,
  `custoUnit`, `quantidade`, `total`; `produtoId?` (SetNull).
- `BarMovimentacaoEstoque` (`saas_bar_estoque_mov`): `tenantId`, `sedeId`, `produtoId`, `tipo`,
  `quantidade` (sempre positiva), `custoTotal?`, `motivo?`, `vendaId?`,
  `financeiroLancamentoId?`, `operadorId?`.
- `BarCaixaTurno` (`saas_bar_caixa_turnos`): `tenantId`, `sedeId`, `abertoEm`/`fechadoEm`,
  `abertoPorId`/`fechadoPorId`, `sangria`, `dinheiroContado?`, `observacao?`.

Enums:

- `MetodoPagamentoBar`: `PIX` | `DINHEIRO` | `CARTAO_DEBITO` | `CARTAO_CREDITO`
- `StatusVendaBar`: `PENDENTE` | `PAGA` | `CANCELADA` | `ESTORNADA`
- `TipoMovEstoqueBar`: `ENTRADA` | `SAIDA` | `AJUSTE`

## Regras de negócio

1. **Venda rápida** é transacional: revalida estoque no servidor, grava snapshots
   (`produtoNome`, `precoUnit`, `custoUnit`) e baixa estoque (movimentação `SAIDA`).
2. **Métodos**: PIX → venda `PENDENTE` + cobrança no gateway; webhook confirma
   (idempotente por `gatewayExternalId`). Dinheiro/Cartão → `PAGA` na hora.
3. **Venda paga** cria `FinanceiroLancamento` RECEITA categoria `BAR`
   (`financeiroLancamentoId` na venda).
4. **Compra de insumo** cria movimentação `ENTRADA` + DESPESA `BAR` e recalcula
   `custoMedio` por média ponderada.
5. **Cancelamento** só de venda `PENDENTE` (restaura estoque). Venda `PAGA` usa
   **estorno** (`ESTORNADA` + DESPESA espelho no livro-caixa + restaura estoque).
6. **Turno de caixa** — PDV exige `BarCaixaTurno` aberto na unidade (`bar:manage`
   abre/fecha). Fechamento registra dinheiro contado, sangria e resumo no `AuditLog`.
7. **RBAC**
   - `bar:operate` — operar PDV / registrar vendas; ver histórico
   - `bar:manage` — catálogo, estoque, cancelar/estornar, abrir/fechar turno; inclui operate (cascata)
8. **Multi-tenant + unidade** — toda query filtra `tenantId` **e** `sedeId`.
   Cada torcida tem seu bar; dentro dela, cada SEDE / SUBSEDE / PDE tem
   catálogo e estoque próprios. Unidade resolvida por `SaasMembro.sedeId`
   (fallback: SEDE principal do tenant). Unidade promovida a tenant próprio
   isola via `tenantId`.
9. **Balanço** — flag `Tenant.balancoFinanceiroVisivel` expõe totais, categorias e
   lançamentos detalhados (itens do bar, unidade, departamento, responsável) a
   membros logados em `/portal/balanco` (período, print/copiar — ver
   [`backlog-caixa-operacional.md`](../product/backlog-caixa-operacional.md)).

## Superfícies

- Portal: `/portal/bar` (cardápio da unidade do membro) e `/portal/balanco` (se flag ativa)
- Admin: `/admin/bar` (hub), `/admin/bar/pdv`, `/admin/bar/produtos`,
  `/admin/bar/estoque`, `/admin/bar/vendas`
- Schemas Zod: `packages/types/src/bar.js`
- Lib: `apps/web/src/lib/bar.ts` (`resolveUnidadeBar`)
- Gateway PIX reusado: `apps/web/src/lib/pix-gateway.ts` + webhook `/api/webhooks/pix`

## Seed / sync

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/db db:push
pnpm --filter @torcida/db seed:bar-gavioes
```
