# Schema deploy — HML / produção

> O push em `main` **não** sincroniza o Postgres no Railway. Localmente use
> os comandos abaixo; em CI use o workflow **Schema deploy**.

## Por que existe

Build Railway (`apps/web/nixpacks.toml`):

1. `pnpm install`
2. `db:generate` (client Prisma)
3. `build` / `start`

**Não** há `prisma db push`. Coluna nova no `schema.prisma` sobe no código e
falha em runtime até o schema ser aplicado em cada banco.

Ambientes: `docs/ops/plano-ambientes-e-dominio.md`
(`setorize-torcidas-hom` / `setorize-torcidas-prod`).

## GitHub Actions (automático)

Arquivo: `.github/workflows/schema-deploy.yml`

| Gatilho | Comportamento |
|--------|----------------|
| `push` em `main` que altera `schema.prisma` | Detecta → `db:push` **HML** → `db:push` **prod** (nessa ordem) |
| `workflow_dispatch` | Manual; opções `force` e `skip_prod` |

> **TEMP (fase de testes, 2026-08-11):** produção também é automática — o
> environment `production` existe só para isolar `DATABASE_URL_PROD`, **sem**
> required reviewers. Quando sair de testes, reative o gate (§ Reverter gate
> de prod).

### Setup (uma vez no GitHub)

1. **Secret do repositório**  
   Settings → Secrets and variables → Actions:
   - `DATABASE_URL_HML` = `DATABASE_PUBLIC_URL` do Postgres homolog (`*.proxy.rlwy.net`)

2. **Environment `production`**  
   Settings → Environments → nome **`production`**:
   - Environment secrets → `DATABASE_URL_PROD` = `DATABASE_PUBLIC_URL` de produção
   - Protection rules: **desligadas** enquanto estivermos em testes (auto-deploy)

3. Confirme que o Actions tem permissão de rodar workflows (padrão ok).

Ordem no pipeline: HML primeiro; se HML falhar, prod **não** roda.
`workflow_dispatch` com `skip_prod=true` aplica só HML.

### Reverter gate de prod (quando sair de testes)

1. Settings → Environments → **production** → Deployment protection rules →
   **Required reviewers** (você / lead).
2. No workflow, renomear o job de volta para
   `db:push Produção (aprovação manual)` e restaurar o comentário de approve
   (histórico em git).
3. Atualizar a tabela acima: prod volta a ficar *Waiting for review*.

Via CLI (reviewer = seu user id do GitHub):

```bash
gh api --method PUT repos/OWNER/REPO/environments/production --input - <<'EOF'
{ "prevent_self_review": false, "reviewers": [{ "type": "User", "id": SEU_USER_ID }] }
EOF
```

## Comandos locais

```bash
# Detectar se o schema mudou desde origin/main (exit 1 = precisa push remoto)
pnpm --filter @torcida/db schema:check

# Homolog
TORCIDA_ENV=homolog DATABASE_URL='…DATABASE_PUBLIC_URL HML…' \
  pnpm --filter @torcida/db schema:deploy -- --apply --force

# Produção (só depois de validar HML)
TORCIDA_ENV=production DATABASE_URL='…DATABASE_PUBLIC_URL prod…' \
  pnpm --filter @torcida/db schema:deploy -- --apply --i-know-prod --force

# Os dois, nessa ordem (laptop — no CI são jobs separados)
DATABASE_URL_HML='…HML…' DATABASE_URL='…prod…' \
  pnpm --filter @torcida/db schema:deploy -- --apply-hml-prod --i-know-prod --force
```

`--dry-run` imprime o plano sem executar. `--since=<ref>` troca a base do diff
(em CI no push pra main usa-se `github.event.before`).

### `--accept-data-loss` (constraint nova)

Constraint nova — `@@unique`, `NOT NULL`, tipo mais estreito — faz o
`prisma db push` **parar** com um aviso, mesmo quando não há conflito nenhum:

```
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering the columns [...] will be added.
    If there are existing duplicate values, this will fail.
Error: Use the --accept-data-loss flag to ignore the data loss warnings
```

Repare no **If**: é precaução, não constatação. Como aqui não há migrations
(o modelo é `db:push`), todo schema com constraint nova bate nisso — por isso
os dois jobs do workflow passam `--accept-data-loss` por padrão.

A flag remove o **aviso**, não a proteção: se houver duplicata de verdade, o
Postgres rejeita a criação do índice e o push falha do mesmo jeito, agora com o
erro real. O que ela não cobre é o outro caso de "data loss" — coluna ou tabela
**removida** do schema, que é apagada de fato. Aí a proteção continua sendo o
diff de `schema.prisma` no PR (checklist abaixo).

Aconteceu em 2026-08-12 com `@@unique([afiliacaoId, fonteExternalId])` em
`Partida` (sync API-Football): HML travou nesse aviso e prod nem chegou a rodar.

## Agente

`.claude/agents/ops-schema.md` — invocar se o workflow falhar, se o secret
estiver ausente, ou para runbook fora do CI.

## Checklist de release (schema)

- [ ] Diff de `schema.prisma` no PR
- [ ] `db:push` em **local** (dev) já feito
- [ ] Após merge em `main`: workflow **Schema deploy** verde em HML
- [ ] Feature validada em homolog
- [ ] Approve do environment **production** no GitHub (ou `schema:deploy` manual com `--i-know-prod`)
- [ ] Seeds/repairs do módulo (se o doc pedir) — workflow **Repair deploy** (§ abaixo)

## Repair deploy (seeds/backfills em HML e prod)

Arquivo: `.github/workflows/repair-deploy.yml` — `workflow_dispatch`.

Schema é só a forma da tabela; coluna nova nasce vazia e o dado legado precisa
de backfill. O DSN de produção **não** fica no laptop (§ Anti-padrões e
[`dev-secrets.md`](dev-secrets.md)), então o canal para rodar repair em prod é
este workflow, que reusa `DATABASE_URL_HML` / `DATABASE_URL_PROD` do
**Schema deploy**.

| Input | Valores |
|-------|---------|
| `script` | allowlist — só repair idempotente e com `--dry-run` |
| `alvo` | `homolog` · `producao` · `homolog-e-producao` (HML primeiro) |
| `dry_run` | **true por padrão**; simula sem gravar |

```bash
gh workflow run "Repair deploy" \
  -f script=db:repair-evento-dono-operacional \
  -f alvo=homolog-e-producao \
  -f dry_run=false
```

Rode sempre com `dry_run=true` antes: o resumo diz quantos registros seriam
tocados. Script **sem** `--dry-run` fica fora da allowlist de propósito — o
disparo é manual, mas o alvo é banco de produção.

## Anti-padrões

- Achar que “main atualiza homolog e prod” inclui o banco sem este workflow
- `db:push --force-reset` em remoto
- Prod antes de HML / approve sem validar HML
- Usar `*.railway.internal` no laptop ou no secret do Actions
- Colocar DSN de **prod** no pacote `*.secrets.env` do time
