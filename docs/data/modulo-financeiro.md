# Módulo — Financeiro (livro-caixa)

> MVP operacional para torcidas: caixa manual de receitas/despesas.
> Não é ERP nem contabilidade societária. Prestação de contas simples.

## Escopo MVP

| Inclui | Fora (próximas fases) |
|--------|------------------------|
| Lançamentos RECEITA / DESPESA | Conciliação bancária |
| Categorias fixas (mensalidade, loja, evento…) | Mensalidade recorrente automática |
| Saldo derivado (receitas − despesas) | Soft-delete / estorno contábil genérico |
| CRUD com auditoria | |
| Filtros + paginação + export CSV | |
| Portal (`finance:view`) + Admin (`finance:manage`) + Balanço | |
| Cobrança / Bar / Loja → lançamento automático | |

## Modelo

`FinanceiroLancamento` (`saas_financeiro_lancamentos`):

- `tenantId`, `tipo`, `categoria`, `valor` (sempre > 0), `descricao`, `data`
- `observacao` opcional
- `criadoPorId`, `criadoEm`, `atualizadoEm`
- Índices: `(tenantId, data)`, `(tenantId, tipo, data)`, `(tenantId, categoria)`

Enums:

- `TipoFinanceiroLancamento`: `RECEITA` | `DESPESA`
- `CategoriaFinanceiroLancamento`: `MENSALIDADE` | `LOJA` | `EVENTO` | `CARAVANA` | `PATRIMONIO` | `DOACAO` | `OUTROS`

## Regras de negócio

1. **Valor** sempre positivo; sinal vem de `tipo`.
2. **Data de competência** = `YYYY-MM-DD` no calendário local (meio-dia), janela **2000-01-01 … hoje+1 ano**.
3. **Saldo** = Σ receitas − Σ despesas (respeita filtros ativos na tela).
4. **RBAC**
   - `finance:view` — ver portal `/portal/financeiro` e painel caixa do departamento
   - `finance:manage` — criar / editar / excluir; admin `/admin/financeiro`
5. **Departamento Financeiro** — ser membro do depto **não** basta para ver o caixa; exige `finance:view`.
6. **Exclusão** é permanente (hard delete) com confirmação na UI; snapshot vai no `AuditLog`.
7. **Multi-tenant** — toda query filtra `tenantId`; sensibilidade **RESTRITO**.

## Superfícies

- Portal: `/portal/financeiro` (+ filtros/paginação) e home `/portal/departamentos/financeiro`
- Balanço público: `/portal/balanco` (flags `balancoFinanceiroVisivel` +
  `balancoDetalheNivel` TOTAIS/CATEGORIAS/COMPLETO) — totais / categorias /
  lançamentos; filtro de período e unidade (bar); copiar resumo e impressão
- Backlog operacional: [`docs/product/backlog-caixa-operacional.md`](../product/backlog-caixa-operacional.md)
- Admin: `/admin/financeiro` (mesma operação, exige manage)
- Schemas Zod: `packages/types/src/financeiro.js`
- Lib: `apps/web/src/lib/financeiro.ts` (`React.cache`)

## Seed / sync

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/db db:push
```
