# Aplicar ScriptRunner no UI (KAN)

Receitas em esta pasta. Passo a passo também em
[`docs/ops/jira-scriptrunner.md`](../../../docs/ops/jira-scriptrunner.md).

Issue de tracking: **KAN-25** (`[seed][smoke-sr] Aplicar Behaviours/Listeners ScriptRunner`).

## Checklist (ops@setorize.com)

1. Abrir [ScriptRunner](https://setorize-torcidas.atlassian.net) → Apps → ScriptRunner
2. Instalar companion **Behaviours** se pedido
3. **Behaviours → Create**
   - Space: KAN
   - Types: História, Bug, Tarefa
   - View: Create · On load
   - Affected: `description`
   - Script: conteúdo de `behaviour-dod-create.js`
4. **Behaviours → Create** (segundo)
   - View: Transition · On load + On change (`labels`)
   - Affected: `description`
   - Script: `behaviour-schema-transition.js`
5. **Script Listeners → Create**
   - Events: Issue Updated
   - Script: `listener-label-audit.groovy`
6. **Script Listeners → Create**
   - Events: Issue Created, Issue Updated
   - Script: `listener-critical-notify.groovy`
7. Filters → criar os 4 JQL de `jql-filters.md`
8. Smoke:
   - Create História vazia em KAN → DoD deve aparecer
   - Em KAN-25: add label `audit-finding` → comentário do listener
   - Add label `schema` → na transição, description required + help text
9. Marcar KAN-25 como Done e apagar labels `smoke-sr` de lixo

> ACLI não configura ScriptRunner na Cloud; a aplicação é **manual no UI**
> com receitas versionadas no git.
