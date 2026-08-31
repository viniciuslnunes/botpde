# Módulo — Patrimônio (inventário + custódia)

> Inventário de itens físicos da torcida + empréstimo com evidência fotográfica.
> Não é ERP de ativos fixos com depreciação.

## Escopo

| Inclui | Fora (próximas fases) |
|--------|------------------------|
| Itens com categoria + status | Reserva futura / aprovação humana |
| Quantidade, localização, responsável | Vínculo automático com Sedes |
| Empréstimo com foto saída + foto guarda | Etiquetas / QR |
| Baixa via status `BAIXADO` | |
| Portal (`patrimony:view`) + Admin (`patrimony:manage`) | |
| `areaId` opcional → área do depto Patrimônio | UI completa de área no form (parcial) |

## Modelo

`PatrimonioItem` (`saas_patrimonio_itens`):

- `tenantId`, `nome`, `categoria`, `status`, `quantidade` (≥ 1)
- `localizacao`, `valorEstimado` (opcional), `observacao`
- `fotoUrl` (opcional) — foto de catálogo; distinta das evidências de empréstimo
- `areaId?` → `DepartamentoArea`
- `responsavelId` (opcional → User), `criadoPorId`, timestamps

`PatrimonioEmprestimo` (`saas_patrimonio_emprestimos`):

- `status`: `ABERTO` | `DEVOLVIDO` | `COM_DANO`
- `fotoSaidaUrl` (obrigatória na retirada), `fotoGuardaUrl` (obrigatória na devolução)
- Colaborador conclui sozinho (`patrimony:view`); gestor marca dano (`manage`)

Programa: [`programa-cockpit-admin-departamentos.md`](./programa-cockpit-admin-departamentos.md) §4.1.

## Regras de negócio

1. **Baixa** = status `BAIXADO` (histórico preservado); exclusão hard só para correção com confirmação.
2. Listagem padrão **omite** itens baixados (filtro “incluir baixados” libera).
3. **RBAC**
   - `patrimony:view` — portal `/portal/patrimonio` e painel do departamento
   - `patrimony:manage` — CRUD; admin `/admin/patrimonio`
   - `flags:view` / `flags:manage` — **recorte**: mesmas telas, mas só
     `categoria: BANDEIRA` (departamento de Bandeiras). `patrimony:manage`
     cobre bandeira; `flags:manage` não cobre o resto. A trava é da query
     (`resolverEscopoPatrimonio.categoriaTravada`), não da UI — ver
     [`modulo-bandeiras.md`](./modulo-bandeiras.md).
4. Membro do depto **sem** `patrimony:view` não vê o inventário no painel.
5. Multi-tenant + sensibilidade **RESTRITO**.
6. `meta` (`Json?`) guarda extensões por categoria — hoje só
   `meta.vistoria` das bandeiras. Não é campo livre para o form geral.

## Superfícies

- Portal: `/portal/patrimonio`
- Home: `/portal/departamentos/patrimonio`
- Admin: `/admin/patrimonio` — `AdminTabs` (`?tab=`): **Acervo** (default, cards
  com `fotoUrl`), Em uso agora, Precisa de você, **Histórico** (baixas e
  exclusões permanentes: quem / quando, via `AuditLog`); edição/exclusão no
  modal (unsaved-changes + confirmação). Baixa e exclusão gravam
  `PATRIMONIO_ITEM_BAIXADO` / `PATRIMONIO_ITEM_EXCLUIDO` na mesma transação.
- Schemas: `packages/types/src/patrimonio.js`
- Lib: `apps/web/src/lib/patrimonio.ts`

## Seed / sync

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/db db:push
pnpm --filter @torcida/db seed:departamentos
```

O Railway só roda `prisma generate` no build — `db:push` e o seed de departamentos
precisam ser manuais após mudar o schema ou o canônico de permissões.
