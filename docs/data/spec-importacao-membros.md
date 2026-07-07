# Spec — Importação de membros (Fase 1, item 1) — mock-first

> **Para revisão antes de codar.** Depois de aprovado, o agente `implementation`
> (Fable) codifica em branch. Convenções: `.claude/agents/data-model.md`,
> `.claude/agents/rbac.md`, `CLAUDE.md`. Projeto usa `db push` (sem migrations).

## Contexto e objetivo

Ainda **não há base real** de associados para consultar. Então o objetivo aqui é
**modelar e preparar a estrutura para receber os dados**, e **mockar** os dados para
validar a estrutura visual e a apresentação do projeto (lista de membros, contadores,
histórico de importação). A ingestão real (bot/CSV) fica pronta na estrutura e é
ativada quando os dados existirem.

Restrição de segurança: como o produto está em produção, dados mock precisam ser
**rastreáveis e reversíveis** — origem `MOCK` + vínculo `importacaoId` no membro, para
permitir desfazer/purgar sem tocar em dados reais.

## 1. Schema (`packages/db/prisma/schema.prisma`)

Enums novos:
```prisma
enum OrigemImportacao { CSV BOT DISCORD MOCK }
enum StatusImportacao { PENDENTE PROCESSANDO CONCLUIDA ERRO }
```

Model novo:
```prisma
model ImportacaoMembros {
  id          String            @id @default(uuid())
  tenantId    String
  origem      OrigemImportacao
  status      StatusImportacao  @default(PENDENTE)
  totalLinhas Int               @default(0)
  importados  Int               @default(0)
  duplicados  Int               @default(0)
  erros       Json?             // [{ linha, motivo }]
  criadoPorId String?
  criadoEm    DateTime          @default(now())
  tenant      Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  membros     SaasMembro[]
  @@index([tenantId, criadoEm])
  @@map("saas_importacoes_membros")
}
```

Mudanças em entidades existentes:
- `Tenant`: back-ref `importacoesMembros ImportacaoMembros[]`.
- `SaasMembro`: `importacaoId String?` + relação para `ImportacaoMembros`
  (onDelete: SetNull) — traço de origem; habilita "desfazer importação".

Aplicar via `pnpm --filter @torcida/db db:push`.

## 2. Contrato de entrada (source-agnostic) — `packages/types`

Zod schema único, para o pipeline não depender da fonte:
```
MembroImportInput = {
  discordId?: string
  nome: string
  tipo: 'SOCIO' | 'TORCEDOR'
  numeroAssociado?: string
  cidade?: string
  telefone?: string
  idade?: number
  email?: string
}
```

Adapters de origem produzem `MembroImportInput[]`:
- `mockSource(n)` — gera N membros fake plausíveis. **Ativo agora** (origem `MOCK`).
- `botSource()` — lê `BotMembro` (tabela `membros`) e mapeia. **Estrutura pronta**,
  ativada quando houver dados reais (origem `BOT`).
- `csvSource(file)` — futuro (origem `CSV`).

## 3. Pipeline (idempotente) — `apps/web/src/app/admin/membros/importar/`

`processarImportacao(tenantId, origem, inputs, atorId)`:
1. Cria `ImportacaoMembros` (status `PROCESSANDO`).
2. Para cada input, dedup por prioridade **`discordId > email > telefone`** (decisão #6):
   - *upsert* `User` (por `discordId`/`email`) — cria com `nome`, sem senha/email
     obrigatório (`User.email`/`senhaHash` são nullable; `discordId` é unique).
   - *upsert* `SaasMembro` por `(tenantId, userId)`: `status = APROVADO`, `tipo` mapeado,
     `importacaoId` setado, campos copiados. Já existe → conta **duplicado** (não
     sobrescreve).
3. Grava contadores, `status = CONCLUIDA` (ou `ERRO`), e `AuditLog`
   (`acao: 'MEMBROS_IMPORTADOS'`, detalhes com contadores).
4. Retorna `{ importados, duplicados, erros }`.

Idempotente: rodar 2x com o mesmo lote não duplica membros.

Ação de reversão: `desfazerImportacao(importacaoId)` — remove os `SaasMembro` daquela
importação (e opcionalmente os `User` órfãos criados por ela). Só para origem `MOCK`
no MVP; auditado.

## 4. Acesso (`packages/types/src/permissions.js`)

- Nova permissão `MEMBERS_IMPORT: 'members:import'`, no grupo **Membros** (base
  `MEMBERS_VIEW`). `owner`/`admin` já a recebem via `ALL_PERMISSIONS`.
- Server actions (`processarImportacao`, `desfazerImportacao`) chamam
  `assertPermission(PERMISSIONS.MEMBERS_IMPORT)`.

## 5. UI (`apps/web/src/app/admin/membros/importar/page.tsx`)

- Seletor de origem (só **Mock** habilitado agora; Bot/CSV visíveis como "em breve").
- Campo de quantidade (para mock) + botão **Importar**.
- Card de resultado: importados / duplicados / erros.
- Histórico: últimas importações (lê `ImportacaoMembros`, com botão "desfazer" para MOCK).
- Estados **vazio, erro e loading** cobertos.
- Efeito: `/admin/membros` passa a exibir membros reais-looking → valida a apresentação
  e os contadores do dashboard.

## 6. Testes (Vitest) — funções puras, sem banco

- `dedupKey(input)` respeita prioridade `discordId > email > telefone`.
- `mapTipo('socio') === 'SOCIO'`, `mapTipo('torcedor') === 'TORCEDOR'`.
- `mockSource(n).length === n` e todos passam no `MembroImportInput` (Zod).

## 7. Fora de escopo agora

- Importação real do bot/CSV (só a estrutura fica pronta).
- Criação automática de carteirinha (`SaasSocio`).
- Merge/atualização de membro existente (duplicado é ignorado, não atualizado).

## 8. Sub-decisões (recomendações — confirmar antes de codar)

| Sub-decisão | Recomendação |
|---|---|
| Origem do demo | `MOCK` no enum (auditoria honesta + reversível) |
| Status do membro importado | `APROVADO` (associados já vetados) |
| Duplicado | Não sobrescreve; apenas conta |
| `User` criado | Só `discordId` + `nome`, sem email/senha |
| Reversão | `desfazerImportacao` habilitado só para `MOCK` no MVP |

## 8b. Passo de deploy (descoberto na verificação e2e)

Os cargos de sistema no banco guardam a **lista expandida** de permissões (não o
coringa) — cargo `owner`/`admin` seedado antes desta mudança **não** contém
`members:import`. Depois de aplicar o schema em produção, rodar:

```bash
pnpm --filter @torcida/db db:repair-system-roles
```

(re-sincroniza os cargos de sistema de todos os tenants com
`SYSTEM_ROLE_PERMISSIONS`; já executado no banco atual em 2026-07-07).
Regra geral: **toda nova permissão exige esse repair após o deploy.**

## 9. Arquivos que o Fable vai tocar

- `packages/db/prisma/schema.prisma` (model + 2 enums + back-refs) → `db push`.
- `packages/types/src/permissions.js` (`MEMBERS_IMPORT`) e um schema Zod
  `MembroImportInput` em `packages/types`.
- `apps/web/src/app/admin/membros/importar/` (page + actions + sources).
- Teste Vitest em `apps/web/src/lib/__tests__/` (funções puras do import).
