# Importar commits → Jira KAN (histórico)

Script: `pnpm jira:import-commits` · [`scripts/jira/import-commits.mjs`](../../scripts/jira/import-commits.mjs)

## Custo — plano Free continua gratuito?

**Sim, criar ~700 Tarefas de texto não gera cobrança por issue** no [Jira Cloud Free](https://www.atlassian.com/software/jira/pricing), desde que:

| Condição | Limite Free | Import de commits |
|---|---|---|
| Usuários | **≤ 10** | Não adiciona usuários |
| Issues | Sem preço por issue (guardrail ~milhões/site) | ~700–800 Tarefas OK |
| Storage | **2 GB** de **arquivos** | Issues só texto ≈ KB |
| Automation nativa | 100 runs/mês | Import via ACLI **não** usa Automation |
| ScriptRunner | **Grátis até 10 users** ([pricing](https://www.scriptrunnerhq.com/atlassian-apps/jira/scriptrunner-for-jira)) | Igual ao Free do Jira |

### O que **geraria** custo (evitar)

1. **11º usuário** no site → Atlassian sobe para trial Standard e depois cobrança; ScriptRunner também deixa de ser free.
2. Anexos grandes (dumps, vídeos) até estourar **2 GB**.
3. Apps Marketplace **pagos** fora do tier free (SR acima de 10 users).

Com o time atual (poucos users, ≤10): **nenhum custo adicional** pelo volume de commits/tasks.

Antes do import em massa: desative temporariamente listeners ScriptRunner de **Issue Created** (se já colados), para não disparar ~700 automações de uma vez.

## Uso

```bash
# só lista (padrão sem --apply)
pnpm jira:import-commits -- --dry-run

# aplicar tudo desde o 1º commit (pula merge e chore(release))
pnpm jira:import-commits -- --apply

# lote de teste
pnpm jira:import-commits -- --apply --max=20

# recorte por data
pnpm jira:import-commits -- --apply --since=2026-07-01
```

Cada issue: summary `[git] <mensagem>`, labels `from-git` + `done-in-git`, description com SHA.

Idempotente: re-run pula SHAs já presentes em issues `from-git`.

## Board

Filtre o backlog de produto:

```jql
project = KAN AND (labels is EMPTY OR labels not in (from-git))
```

Histórico:

```jql
project = KAN AND labels = from-git ORDER BY created ASC
```

Se a transição para Done/Concluído não existir no workflow team-managed, as issues ficam em **A fazer** com `done-in-git` — mova em lote no UI ou ajuste colunas do board.
