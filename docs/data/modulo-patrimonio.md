# Módulo — Patrimônio (inventário)

> MVP operacional: cadastro de itens físicos da torcida (instrumentos, bandeirões, etc.).
> Não é ERP de ativos fixos com depreciação.

## Escopo MVP

| Inclui | Fora (próximas fases) |
|--------|------------------------|
| Itens com categoria + status | Fotos / anexos |
| Quantidade, localização, responsável (user) | Reserva/checkout formal |
| Baixa via status `BAIXADO` | Vínculo automático com Sedes |
| Portal (`patrimony:view`) + Admin (`patrimony:manage`) | Etiquetas / QR |

## Modelo

`PatrimonioItem` (`saas_patrimonio_itens`):

- `tenantId`, `nome`, `categoria`, `status`, `quantidade` (≥ 1)
- `localizacao`, `valorEstimado` (opcional), `observacao`
- `responsavelId` (opcional → User), `criadoPorId`, timestamps
- Índices: `(tenantId, status)`, `(tenantId, categoria)`, `(tenantId, nome)`

Enums:

- `CategoriaPatrimonioItem`: `INSTRUMENTO` | `BANDEIRA` | `UNIFORME` | `MOBILIARIO` | `ELETRONICO` | `ESPACO` | `OUTROS`
- `StatusPatrimonioItem`: `DISPONIVEL` | `EM_USO` | `MANUTENCAO` | `BAIXADO`

## Regras de negócio

1. **Baixa** = status `BAIXADO` (histórico preservado); exclusão hard só para correção com confirmação.
2. Listagem padrão **omite** itens baixados (filtro “incluir baixados” libera).
3. **RBAC**
   - `patrimony:view` — portal `/portal/patrimonio` e painel do departamento
   - `patrimony:manage` — CRUD; admin `/admin/patrimonio`
4. Membro do depto **sem** `patrimony:view` não vê o inventário no painel.
5. Multi-tenant + sensibilidade **RESTRITO**.

## Superfícies

- Portal: `/portal/patrimonio`
- Home: `/portal/departamentos/patrimonio`
- Admin: `/admin/patrimonio`
- Schemas: `packages/types/src/patrimonio.js`
- Lib: `apps/web/src/lib/patrimonio.ts`
