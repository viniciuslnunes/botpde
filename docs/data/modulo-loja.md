# Módulo Loja — catálogo, sacola e pedidos

> Referência factual do módulo para consulta rápida (agentes e humanos). Fonte da verdade dos
> dados é `packages/db/prisma/schema.prisma`; do RBAC, `packages/types/src/permissions.js`;
> regras de negócio testáveis em `packages/types/src/loja.js`.

## O que é

Loja operacional multi-tenant para torcidas: catálogo de produtos (com categorias, promoções e
estoque por tamanho), sacola persistente, checkout com cupom e modalidade retirada/envio.
**Sem gateway de pagamento** — pedido registrado → admin confirma/entrega manualmente.

Inspirado na operação da [Loja Gaviões](https://www.lojagavioes.com.br/), com UX moderna no
portal Torcida. Seed de demo: `pnpm --filter @torcida/db seed:loja-gavioes  # requer node --use-system-ca (já no script npm)
pnpm --filter @torcida/db seed:loja-gavioes -- --force-images  # reimportar imagens` (tenant
`pde-gavioes-fiel`).

Bot Discord legado (`BotProduto`/`BotPedido`) permanece separado — não compartilha tabelas SaaS.

## Entidades (`packages/db/prisma/schema.prisma`, bloco LOJA SaaS)

| Model | Tabela | Papel |
|---|---|---|
| `SaasCategoria` | `saas_categorias` | categorias por tenant; `@@unique([tenantId, slug])`; `parentId` opcional |
| `SaasCupom` | `saas_cupons` | cupons PERCENTUAL/FIXO; `primeiraCompra`, `validoAte` |
| `SaasProduto` | `saas_produtos` | catálogo; `precoOriginal` (promo), `marca`, `destaque`, estoque JSON por tamanho |
| `SaasCarrinhoItem` | `saas_carrinho_itens` | sacola por usuário; `@@unique([userId, produtoId, tamanho])`; tamanho `UN` = sem grade |
| `SaasPedido` | `saas_pedidos` | cabeçalho: `subtotal`, `desconto`, `cupomCodigo`, `modalidadeEntrega`, `grupoCheckoutId`, `financeiroLancamentoId?` |
| `SaasPedidoItem` | `saas_pedido_itens` | linhas do pedido; `produtoNome` é snapshot |

Enums: `TipoCupom`, `ModalidadeEntrega` (RETIRADA/ENVIO), `StatusPedido`.

## RBAC

| Permissão | Uso |
|---|---|
| `STORE_MANAGE` (`store:manage`) | CRUD produtos, categorias, cupons; alterar status de pedido |
| `STORE_VIEW_ORDERS` (`store:view_orders`) | **Somente leitura** de `/admin/loja/pedidos` (via `assertStoreView()`) |

Menu admin: item "Loja" exige `STORE_MANAGE`; item "Pedidos (Loja)" exige `STORE_VIEW_ORDERS`.

Portal: exige sessão logada; **não** usa permissão RBAC — qualquer associado autenticado compra.

## Visibilidade cross-tenant (portal): lojas por unidade (2026-07-27)

O portal **não usa mais** `getVisibleTenantIds('loja')`/`resolveVisibility` — critério
agora é membership real: `tenantsPermitidosLoja(userId)` em `apps/web/src/lib/loja-lojas.ts`
une os tenants onde o usuário é `SaasMembro` `APROVADO` (**sócio** ou **torcedor**
canônico do convite) com a torcida **raiz** de cada vínculo
(`getAncestorTenantIds`, último elemento da cadeia) — a loja da torcida principal está
sempre disponível (exceto canal restrito: só a própria unidade). A Sede controla
a ponte com `Tenant.lojaVisivelNasUnidades` (default `true`) em
`/admin/configuracoes/transparencia` — presidente/vice com `SETTINGS_MANAGE`.

- `/portal/loja` lista as lojas (`listLojasDoSocio`), uma por tenant permitido;
  card marcado `principal: true` quando é a torcida raiz.
- `/portal/loja/[tenantId]` é o catálogo de UM tenant — `tenantsPermitidosLoja` valida
  acesso, senão `notFound()`.
- Sacola/checkout: `assertProdutoVisivel(produtoId, userId)` em
  `apps/web/src/app/portal/loja/actions.ts` checa `tenantsPermitidosLoja`.
- Pedido gravado no **tenant DONO do produto** (quem tem estoque e cumpre)
- Checkout com itens de tenants diferentes → N pedidos com mesmo `grupoCheckoutId`

**Limitação conhecida — "loja por unidade" só existe quando a unidade é tenant
próprio** (Sede/Subsede/PDE com `Tenant` dedicado, Caso B). Unidades Caso A (Sede
filha sem tenant próprio, ex.: Subsede que roda dentro do tenant da Sede-mãe)
continuam compartilhando o catálogo/estoque do tenant-mãe — `SaasMembro` é único por
`(tenantId, userId)`, não há campo de unidade dentro do tenant para segmentar produtos.

## Fluxo portal

```
/portal/loja → listagem de lojas do sócio (uma por tenant com membership)
/portal/loja/[tenantId] → catálogo de uma loja (filtros, carrossel destaques)
/portal/loja/[tenantId]/[produtoId] → detalhe + adicionar à sacola
/portal/loja/sacola → sacola global (todas as lojas do usuário)
/portal/loja/checkout → cupom + retirada/envio → finalizarPedido
/portal/loja/pedidos → histórico global (multi-item, multi-loja; exibe nome da loja)
```

Sacola, checkout e pedidos são **globais por `userId`**, sem filtro de tenant — o
usuário pode ter itens/pedidos de mais de uma loja simultaneamente.

Server actions: `apps/web/src/app/portal/loja/actions.ts`

## Fluxo admin

```
/admin/loja → produtos
/admin/loja/categorias → categorias
/admin/loja/cupons → cupons
/admin/loja/pedidos → pedidos (multi-item)
/admin/loja/[id] → editar produto
```

Server actions: `apps/web/src/app/admin/loja/actions.ts`

## Regras de negócio importantes

- Estoque: JSON `{ "P": 10, "M": 8 }` ou `{ "UN": 5 }` quando sem tamanhos
- Chave de tamanho normalizada: `chaveTamanho()` / `TAMANHO_UNICO = 'UN'` (`packages/types/src/loja.js`)
- Cupom: `validarCupom()` + `calcularDesconto()`; seed `EUSOUGAVIAO` = 10% primeira compra
- Cancelamento admin: `atualizarStatusPedido(CANCELADO)` **restaura estoque** dos itens
- **Livro-caixa:** ao passar pedido para `CONFIRMADO` ou `ENTREGUE`, cria
  `FinanceiroLancamento` RECEITA categoria `LOJA` (idempotente via
  `SaasPedido.financeiroLancamentoId`) — ver `apps/web/src/lib/loja-financeiro.ts`
- Auditoria: `PRODUTO_*`, `PEDIDO_*`, `CATEGORIA_*`, `CUPOM_*` em `AuditLog`
- **Cupom é tenant-scoped e reaplicado por tenant no checkout multi-tenant**:
  `finalizarPedido` busca e valida o mesmo código **em cada tenant dono** do
  grupo de checkout. Se o cupom existe no tenant A mas não no B, o checkout
  inteiro falha (`throw` dentro da `$transaction`) mesmo com o item de A
  válido. Se o cupom existe em ambos, desconta em ambos os pedidos.
- **`primeiraCompra` é por tenant, não global**: `userJaComprou` conta
  `SaasPedido` filtrado por `tenantId` do dono. O mesmo associado pode reusar
  cupom de primeira compra em cada torcida diferente.
- **Checkout multi-tenant é atômico "tudo ou nada"**: qualquer falha (estoque,
  produto inativo, cupom) aborta a `$transaction` inteira — não existe
  checkout parcial nem pedidos parcialmente confirmados.
- **Cap de 10 unidades por item** na sacola (`adicionarAoCarrinho`/`atualizarItemCarrinho`).
- **Sem lock otimista no estoque**: estoque é lido e reescrito como JSON
  (`{ ...estoque, [chave]: disponivel - qtd }`) dentro da transação, sem campo
  `version`. Sob concorrência real duas transações podem sobrescrever o mapa —
  risco conhecido, candidato a correção de fase 2 (ver `ARCHITECTURE.md §6`).
- **Sem stacking de cupons**: um único `cupomCodigo` por checkout.
- **Preview de desconto não é autoritativo**: `validarCupomAction` recebe o
  `subtotal` do formulário só para exibir o preview; `finalizarPedido`
  recompõe o valor no servidor — a autoridade do valor final é sempre o
  checkout, nunca o preview do cliente.
- **`total` nunca fica negativo**: `total = max(0, subtotal - desconto)`.
- **`fazerPedido` está `@deprecated`** — fluxo single-item antigo, delega a
  `adicionarAoCarrinho`; candidato a remoção quando não houver mais chamador.
- Auditoria `PEDIDO_CRIADO` grava **fora** da `$transaction` do pedido — se
  falhar, o pedido existe sem log (diverge da convenção de auditoria atômica).

## Schemas Zod compartilhados

`packages/types/src/schemas/loja.js` — produto, carrinho, cupom, checkout (`CheckoutSchema`).

## Testes

`apps/web/src/lib/__tests__/loja.test.ts` — cupom, desconto, tamanhos, promo.

## Fora de escopo (fase posterior)

- Gateway PIX/cartão
- Cálculo de frete por CEP (Correios)
- Preencher `discordId`/`canalTicketId` no fluxo web
- Bot SaaS unificado (tabelas `produtos`/`pedidos` legadas)

## Insights administrativos (2026-07-22)

Nova `lib/loja-insights.ts`: `resumirVendasLoja` (receita/ticket médio/por
status, comparativo de período), `listarMaisVendidosLoja` (top 5),
`resumirUsoCupons` (usos + desconto concedido). Receita = pedidos
`CONFIRMADO`/`ENTREGUE` (`PENDENTE` aguardando; `CANCELADO` fora). Superfícies:
`InsightSection` no hub `/admin/loja` e seção Loja em `/admin/relatorios`.
Padrões: `docs/frontend/admin-ui-kit.md`.

## Diagrama DBML

Espelho em `docs/data/schema.dbml` (seção LOJA + refs).
