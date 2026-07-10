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
| `SaasPedido` | `saas_pedidos` | cabeçalho: `subtotal`, `desconto`, `cupomCodigo`, `modalidadeEntrega`, `grupoCheckoutId` |
| `SaasPedidoItem` | `saas_pedido_itens` | linhas do pedido; `produtoNome` é snapshot |

Enums: `TipoCupom`, `ModalidadeEntrega` (RETIRADA/ENVIO), `StatusPedido`.

## RBAC

| Permissão | Uso |
|---|---|
| `STORE_MANAGE` (`store:manage`) | CRUD produtos, categorias, cupons; alterar status de pedido |
| `STORE_VIEW_ORDERS` (`store:view_orders`) | **Somente leitura** de `/admin/loja/pedidos` (via `assertStoreView()`) |

Menu admin: item "Loja" exige `STORE_MANAGE`; item "Pedidos (Loja)" exige `STORE_VIEW_ORDERS`.

Portal: exige sessão logada; **não** usa permissão RBAC — qualquer associado autenticado compra.

## Visibilidade cross-tenant

Recurso **`loja: PUBLICO`** em `packages/types/src/visibility.js` — produtos de tenants
ancestrais cascadeiam para subsedes/PDEs (mesma direção de eventos/comunidade).

- Catálogo: `getVisibleTenantIds(tenant.id, 'loja')` em `/portal/loja/page.tsx`
- Sacola/checkout: `resolveVisibility` antes de adicionar/comprar produto de outro tenant
- Pedido gravado no **tenant DONO do produto** (quem tem estoque e cumpre)
- Checkout com itens de tenants diferentes → N pedidos com mesmo `grupoCheckoutId`

## Fluxo portal

```
/portal/loja → catálogo (filtros, carrossel destaques)
/portal/loja/[id] → detalhe + adicionar à sacola
/portal/loja/sacola → revisar itens
/portal/loja/checkout → cupom + retirada/envio → finalizarPedido
/portal/loja/pedidos → histórico (multi-item)
```

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
- Auditoria: `PRODUTO_*`, `PEDIDO_*`, `CATEGORIA_*`, `CUPOM_*` em `AuditLog`

## Schemas Zod compartilhados

`packages/types/src/schemas/loja.js` — produto, carrinho, cupom, checkout (`CheckoutSchema`).

## Testes

`apps/web/src/lib/__tests__/loja.test.ts` — cupom, desconto, tamanhos, promo.

## Fora de escopo (fase posterior)

- Gateway PIX/cartão
- Cálculo de frete por CEP (Correios)
- Preencher `discordId`/`canalTicketId` no fluxo web
- Bot SaaS unificado (tabelas `produtos`/`pedidos` legadas)

## Diagrama DBML

Espelho em `docs/data/schema.dbml` (seção LOJA + refs).
