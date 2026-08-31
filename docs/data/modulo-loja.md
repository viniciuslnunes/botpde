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

**Brechó** (2026-08-30): praça P2P entre sócios da **torcida do portal ativo**.
No hub `/portal/loja`: listagem de lojas, depois listagem idêntica de brechós
(acima dos destaques). Isolado do catálogo `SaasProduto` e de outras torcidas.
Ver `docs/data/modulo-brecho.md`.

## Entidades (`packages/db/prisma/schema.prisma`, bloco LOJA SaaS)

| Model | Tabela | Papel |
|---|---|---|
| `SaasCategoria` | `saas_categorias` | categorias por tenant; `@@unique([tenantId, slug])`; `parentId` opcional |
| `SaasCupom` | `saas_cupons` | cupons PERCENTUAL/FIXO; `primeiraCompra`, `validoAte` |
| `SaasProduto` | `saas_produtos` | catálogo; `precoOriginal` (promo), `marca`, `destaque`, estoque JSON por tamanho |
| `SaasCarrinhoItem` | `saas_carrinho_itens` | sacola por usuário; `@@unique([userId, produtoId, tamanho])`; tamanho `UN` = sem grade |
| `SaasPedido` | `saas_pedidos` | cabeçalho: `subtotal`, `desconto`, `cupomCodigo`, `modalidadeEntrega`, `grupoCheckoutId`, `financeiroLancamentoId?` |
| `SaasPedidoItem` | `saas_pedido_itens` | linhas do pedido; `produtoNome` é snapshot |
| `SaasPedidoTicket` | `saas_pedido_tickets` | ticket 1:1 com pedido; liga a `Conversa` GRUPO; fila ABERTO→ATENDENDO→FECHADO |

Enums: `TipoCupom`, `ModalidadeEntrega` (RETIRADA/ENVIO), `StatusPedido`, `PedidoTicketStatus`, `PedidoTicketMotivoFecho`.

## RBAC

| Permissão | Uso |
|---|---|
| `STORE_MANAGE` (`store:manage`) | CRUD produtos, categorias, cupons; alterar status de pedido; **fechar ticket** manualmente |
| `STORE_VIEW_ORDERS` (`store:view_orders`) | Leitura de `/admin/loja/pedidos`; **atender** ticket na fila (claim) |

Menu admin: item "Loja" exige `STORE_MANAGE`; item "Pedidos (Loja)" exige `STORE_VIEW_ORDERS`.

Portal: exige sessão logada; **não** usa permissão RBAC — qualquer associado autenticado compra.

## Tickets pós-compra (2026-08-03)

Cada `finalizarPedido` abre um `SaasPedidoTicket` + `Conversa` tipo `GRUPO` (só o comprador como membro). Staff da **unidade dona do pedido** (tenant sede/PDE) com `store:view_orders` ou `store:manage` vê a **fila**; o primeiro que **Atender** faz claim atômico (`ABERTO`→`ATENDENDO`) e entra na conversa.

**Quem acessa:** gestores do depto Materiais/Loja (pacote com `STORE_*`), cargos de sistema owner/admin/vice (e quem tiver `store:view_orders` / `store:manage` por override). Colaborador do depto loja **sem** `store:view_orders` não vê o arquivo.

Fechamento (mensagens **permanecem** no banco; só trava envio):
- Automático ao marcar pedido `ENTREGUE` (`motivoFecho: ENTREGUE`) ou `CANCELADO`
- Manual pelo gestor (`store:manage`) sem exigir mudança de status do pedido (`MANUAL`)

**Arquivo de conversas** (`/admin/loja/tickets`):
- Listagem só com metadados (cliente, status, datas) — **não** carrega mensagens
- Mensagens sob demanda em `/admin/loja/tickets/[id]` (até 500)
- Filtros: fechados (padrão) / na fila / todos + busca
- Gestão no detalhe: atender, fechar ticket, abrir no portal de mensagens
- Auditoria: `PEDIDO_TICKET_ABERTO`, `PEDIDO_TICKET_ATENDIDO`, `PEDIDO_TICKET_FECHADO`, `PEDIDO_TICKET_HISTORICO_VISUALIZADO`

Diferença vs bot Discord: o bot apaga o canal e arquiva HTML em log; no SaaS o histórico é `MensagemDireta` + ticket. `canalTicketId`/`discordId` no pedido **não** são preenchidos (bridge fora de escopo).

Regras puras: `packages/types/src/loja-ticket.js`. Lib: `apps/web/src/lib/loja-ticket.ts`. UI: coluna Ticket em `/admin/loja/pedidos`; arquivo em `/admin/loja/tickets`; link no portal `/portal/loja/pedidos` → `/portal/mensagens?c=…`.

## Visibilidade cross-tenant (portal): lojas por unidade (2026-07-27, recorte 2026-08-27)

O portal **não mistura catálogos de torcidas diferentes**. Fonte única = **tenant
ativo** (cookie/`getActiveTenant`, o mesmo da navbar) — Super Admin troca de
canal, mas a listagem **não** é a união de todos os `SaasMembro` do usuário.
Presidente dos Gaviões que entra no portal da Mancha vê a worktree da Mancha
(sede + unidades Caso B) e **nunca** a loja nem o destaque da rival.

Critério em `escoparLojaAoPortalAtivo` (`apps/web/src/lib/loja-escopo.ts`),
aplicado por `tenantsVisiveisLoja` / `tenantsPermitidosLoja` em
`apps/web/src/lib/loja-lojas.ts`:

- **Vitrine** (`tenantsVisiveisLoja`): `getVisibleTenantIds(ativo, 'loja')` —
  worktree do portal (self + descendentes + ancestrais públicos) com R5.
  Lojas **aliadas** só entram se o usuário é `SOCIO` APROVADO na worktree ativa.
  Super-admin sem vínculo (modo operador) lê essa vitrine; não compra.
- **Compra** (`tenantsPermitidosLoja`): vínculo APROVADO (sócio ou torcedor
  canônico) **intersectado** com a vitrine do portal. Ponte da Sede continua
  em `Tenant.lojaVisivelNasUnidades` (default `true`) em
  `/admin/configuracoes/transparencia` — presidente/vice com `SETTINGS_MANAGE`.
- Sem portal ativo (torcedor na Comunidade Nacional): cai só nos vínculos,
  como antes — Super Admin não infla o conjunto.

- `/portal/loja` lista as lojas (`listLojasDoSocio`), uma por tenant **visível
  no portal ativo**; ordem: torcida principal → unidades da worktree (subsede,
  depois PDE) → aliados. Card marcado `principal: true` na raiz **desse** portal.
  **Com uma única loja, redireciona** para `/portal/loja/[tenantId]`.
- `/portal/loja/[tenantId]` é o catálogo de UM tenant — `podeVerLojaTenant`
  (vitrine do portal ativo) valida acesso, senão `notFound()`. Chrome sticky
  com **store switcher** (quando ≥2 lojas do mesmo portal) e tema visual da
  **loja visitada** (scoped em `LojaTenantThemeScope` — não altera
  a navbar do contexto ativo). Identidade vem de `Tenant.design` +
  `corPrimaria` da unidade dona do catálogo (`/admin/design`).
- Sacola/checkout: `assertProdutoVisivel` checa `tenantsPermitidosLoja` (compra
  no portal ativo). Itens de outra torcida ficam no carrinho no banco, mas não
  aparecem nem fecham pedido enquanto o canal for o da rival.
- Pedido gravado no **tenant DONO do produto** (quem tem estoque e cumpre)
- Checkout com itens de tenants diferentes → N pedidos com mesmo `grupoCheckoutId`
- Sacola global **agrupa por loja** na UI; badge pode mostrar `itens·lojas` quando
  há mais de um tenant na sacola.
- **Vitrine** (`/admin/loja/vitrine` e hover no portal, `store:manage`): capa do
  hero em `Tenant.design.loja` (`bannerUrl`, `usarDestaqueComoCapa`). Upload
  Cloudinary usa `purpose: loja` — gate = `podeGerirLoja` / `store:manage`, **não**
  vínculo de associado. Super Admin opera a vitrine no portal ativo (torcida
  sem presidente inclusive); `perfil-banner` exigiria `assertMembroAtivo` e
  bloqueava o operador. No portal, gestor de Materiais/Loja, owner/admin/vice
  e quem tiver a permissão vê Alterar/Excluir ao passar o mouse (no toque os
  botões ficam visíveis). O estúdio `/admin/design` **preserva** `design.loja`
  ao salvar/restaurar identidade.

**Limitação conhecida — "loja por unidade" só existe quando a unidade é tenant
próprio** (Sede/Subsede/PDE com `Tenant` dedicado, Caso B). Unidades Caso A (Sede
filha sem tenant próprio, ex.: Subsede que roda dentro do tenant da Sede-mãe)
continuam compartilhando o catálogo/estoque do tenant-mãe — `SaasMembro` é único por
`(tenantId, userId)`, não há campo de unidade dentro do tenant para segmentar produtos.

## Fluxo portal

```
/portal/loja → listagem de lojas do portal ativo (worktree + aliadas se sócio)
/portal/loja/[tenantId] → catálogo de uma loja (filtros, carrossel destaques)
/portal/loja/[tenantId]/[produtoId] → detalhe + adicionar à sacola
/portal/loja/sacola → sacola do portal ativo (itens de outra torcida ficam no banco, ocultos)
/portal/loja/checkout → cupom + retirada/envio → finalizarPedido
/portal/loja/pedidos → histórico global (multi-item, multi-loja; exibe nome da loja)
```

Sacola, checkout e pedidos são **globais por `userId` no banco** — o usuário
pode ter itens/pedidos de mais de uma loja. A **UI do portal** recorta sacola e
checkout pelo tenant ativo; pedido histórico continua listando todas as compras.

Server actions: `apps/web/src/app/portal/loja/actions.ts`

## Fluxo admin

```
/admin/loja → produtos
/admin/loja/categorias → categorias
/admin/loja/cupons → cupons
/admin/loja/pedidos → pedidos (multi-item) + fila de tickets
/admin/loja/tickets → arquivo de conversas (metadados; detalhe sob demanda)
/admin/loja/tickets/[id] → conversa completa + gestão do ticket
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
- Auditoria: `PRODUTO_*`, `PEDIDO_*`, `PEDIDO_TICKET_ABERTO` / `_ATENDIDO` / `_FECHADO` / `_HISTORICO_VISUALIZADO`, `CATEGORIA_*`, `CUPOM_*` em `AuditLog`
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
`apps/web/src/lib/__tests__/loja-escopo.test.ts` — recorte pelo portal ativo (rival, Super Admin, sócio, aliada).
`apps/web/src/lib/__tests__/loja-ticket.test.ts` — transições de ticket, claim, fecho, envio.

## Fora de escopo (fase posterior)

- Gateway PIX/cartão
- Cálculo de frete por CEP (Correios)
- Preencher `discordId`/`canalTicketId` no fluxo web (bridge Discord)
- Reabrir ticket / transferir atendente
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
