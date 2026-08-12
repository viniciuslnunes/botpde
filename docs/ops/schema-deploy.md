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

## Agente

`.claude/agents/ops-schema.md` — invocar se o workflow falhar, se o secret
estiver ausente, ou para runbook fora do CI.

## Checklist de release (schema)

- [ ] Diff de `schema.prisma` no PR
- [ ] `db:push` em **local** (dev) já feito
- [ ] Após merge em `main`: workflow **Schema deploy** verde em HML
- [ ] Feature validada em homolog
- [ ] Approve do environment **production** no GitHub (ou `schema:deploy` manual com `--i-know-prod`)
- [ ] Seeds/repairs do módulo (se o doc pedir)

## Anti-padrões

- Achar que “main atualiza homolog e prod” inclui o banco sem este workflow
- `db:push --force-reset` em remoto
- Prod antes de HML / approve sem validar HML
- Usar `*.railway.internal` no laptop ou no secret do Actions
- Colocar DSN de **prod** no pacote `*.secrets.env` do time
