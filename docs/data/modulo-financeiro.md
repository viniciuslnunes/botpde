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
- `departamentoId?`, `projetoId?` — rateio opcional por área/projeto
  (nullable; histórico legado fica sem vínculo). A Server Action valida que
  o departamento é do tenant e que o projeto pertence a ele
  (`resolverRateio` em `admin/financeiro/actions.ts`). Gasto realizado de
  um `Projeto` = soma das `DESPESA` com esse `projetoId` — ver
  `docs/data/modulo-departamentos.md` § projetos.
- `criadoPorId`, `criadoEm`, `atualizadoEm`
- Índices: `(tenantId, data)`, `(tenantId, tipo, data)`, `(tenantId, categoria)`,
  `(tenantId, departamentoId, data)`, `(projetoId)`

Enums:

- `TipoFinanceiroLancamento`: `RECEITA` | `DESPESA`
- Categorias: `MENSALIDADE` | `LOJA` | `EVENTO` | `CARAVANA` | `PATRIMONIO` | `BAR` | `DOACAO` | `OUTROS`

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
- Admin: `/admin/financeiro` — **Direção** (inbox: inadimplência, caixa 7/30d,
  projetos estourados, despesas sem rateio). Lançamentos em
  `/admin/financeiro/lancamentos`. Gate: manage OU (view + audit).
- Schemas Zod: `packages/types/src/financeiro.js`
- Lib: `apps/web/src/lib/financeiro.ts`, `financeiro-direcao.ts` (`React.cache`)
- Programa de comando: [`programa-cockpit-admin-departamentos.md`](./programa-cockpit-admin-departamentos.md)

## Seed / sync

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/db db:push
```

## Insights administrativos (2026-07-22)

`lib/financeiro.ts` ganhou `resumirFinanceiroMensal` (série receitas×despesas
por mês, bucketing JS fuso SP) e `compararFinanceiroPeriodo` (atual vs
anterior). Superfícies: tab **Evolução** em `/admin/financeiro/evolucao`
(barras 12m + donut por categoria + saldo com delta) e seção Financeiro em
`/admin/relatorios` (gate `reports:view`). Home **Direção** em
`/admin/financeiro` (inbox). Padrões e regras:
`docs/frontend/admin-ui-kit.md`.
