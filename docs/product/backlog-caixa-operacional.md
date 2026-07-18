# Backlog — Caixa operacional (Balanço / Bar / Livro-caixa)

> Prestação de contas e operação de caixa da torcida.
> Escopo mínimo por item — sem ERP, sem conciliação bancária, sem comanda/fiado/NFC-e.

Relacionado: [`modulo-financeiro.md`](../data/modulo-financeiro.md),
[`modulo-bar.md`](../data/modulo-bar.md).

## Ordem

```
Iter1 (período + print) → Iter2 (turno + estorno) → Iter3 (margem + loja→caixa) → Iter4 (privacidade)
```

---

## Iteração 1 — Período + prestação de contas

**Status:** feito (2026-07-18)

| Peça | Escopo mínimo |
|------|----------------|
| Modelo | Nenhum (só query params) |
| Lib | `listarLancamentosBalanco` / `resumirFinanceiro*` com `dataDe`/`dataAte` |
| UI | Chips (hoje / 7d / mês / mês anterior) + datas em `/portal/balanco` |
| Print | HTML print-friendly (`window.print`) + “Copiar resumo” |
| Permissão | Membro logado + `balancoFinanceiroVisivel` |

**Aceite:** chip “mês atual” filtra cards e lista; copiar cola texto; imprimir abre diálogo do browser (Salvar PDF).

---

## Iteração 2 — Fechamento de turno + estorno

**Status:** feito (2026-07-18)

| Peça | Escopo mínimo |
|------|----------------|
| Modelo | `BarCaixaTurno` (`tenantId`, `sedeId`, aberto/fechado, sangria, dinheiroContado); `BarVenda.turnoId?`; status `ESTORNADA` |
| Estorno | Venda `PAGA` → `ESTORNADA`; DESPESA espelho categoria BAR; restaura estoque; `AuditLog` |
| Telas | Admin bar + PDV: abrir/fechar turno; PDV exige turno aberto; estorno na lista de vendas |
| Permissões | Abrir/fechar e estorno: `bar:manage` |

**Fora:** sangria parcial complexa, múltiplos caixas por unidade no mesmo horário.

---

## Iteração 3 — Margem bar + Loja → caixa

**Status:** feito (2026-07-18)

| Peça | Escopo mínimo |
|------|----------------|
| Margem | Sem schema: Σ `(total − custoUnit×qtd)` no hub admin bar (`bar:manage` ou `finance:view`) |
| Loja | Pedido `CONFIRMADO`/`ENTREGUE` → RECEITA `LOJA` + `SaasPedido.financeiroLancamentoId` |
| Permissões | Margem: `finance:view` ou `bar:manage`; loja no fluxo de status do pedido |

**Fora:** gateway Loja (já no plano de paridade B2); margem no balanço público (CMV fica no admin).

---

## Iteração 4 — Confiança / camadas

**Status:** feito (2026-07-18)

| Peça | Escopo mínimo |
|------|----------------|
| Flag | `Tenant.balancoDetalheNivel`: `TOTAIS` \| `CATEGORIAS` \| `COMPLETO` (default `COMPLETO`) |
| Unidade | Filtro `sedeId` no balanço (só movimentos BAR da unidade) |
| Depois (não nesta fatia) | Anexos em lançamento; `eventoId` opcional em `FinanceiroLancamento` |

---

## Explicitamente fora

Comanda/mesa, fiado, maquininha física, NFC-e, conciliação bancária, contas a pagar (C5).
