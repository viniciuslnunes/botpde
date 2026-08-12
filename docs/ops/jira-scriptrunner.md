# ScriptRunner for Jira — Torcida (KAN)

App: [ScriptRunner for Jira Cloud](https://docs.adaptavist.com/sr4jc/latest/features).
Receitas versionadas: [`scripts/jira/scriptrunner/`](../../scripts/jira/scriptrunner/).

Jira = priorização/fluxo. Git = schema, audits, ARCHITECTURE §5.
Estrutura do projeto: [`jira-kan.md`](jira-kan.md).

## Pré-requisitos

1. ScriptRunner instalado no site `setorize-torcidas.atlassian.net`
2. App companion **Behaviours - ScriptRunner for Jira Cloud** (Behaviours)
3. Escopo das receitas: espaço **KAN** apenas
4. Conta com permissão de admin do app (ops / org admin)

## Onde ScriptRunner vs Automation nativa

| Usar ScriptRunner | Usar Jira Automation (fase 2) |
|---|---|
| Behaviours (Create / Transition) | Transição por commit `KAN-N` |
| Listeners com lógica + HAPI | Comentário “CI failed” no issue |
| Enhanced Search / JQL avançada | Webhook GitHub simples |
| Escalation (SLA interno) | — |

## Receitas (KAN)

| Arquivo | Tipo | Efeito |
|---|---|---|
| [`behaviour-dod-create.js`](../../scripts/jira/scriptrunner/behaviour-dod-create.js) | Behaviour (Create) | Description com DoD qa-verification se vazia |
| [`behaviour-schema-transition.js`](../../scripts/jira/scriptrunner/behaviour-schema-transition.js) | Behaviour (Transition) | Label `schema` → aviso + description checklist schema-deploy |
| [`listener-label-audit.groovy`](../../scripts/jira/scriptrunner/listener-label-audit.groovy) | Listener | Label `audit-finding` → comentário com `audit:achados` |
| [`listener-critical-notify.groovy`](../../scripts/jira/scriptrunner/listener-critical-notify.groovy) | Listener | Priority Highest → comentário de alerta |
| [`jql-filters.md`](../../scripts/jira/scriptrunner/jql-filters.md) | Enhanced Search / Filters | Filtros salvos do board |

## Como aplicar no UI

### Behaviours

1. Apps → **ScriptRunner** → **Behaviours** (ou app Behaviours)
2. Create Behaviour → espaço **KAN** → tipos História + Bug (+ Tarefa)
3. View: **Create** → colar `behaviour-dod-create.js` no campo Description (affected field)
4. Segundo Behaviour → View: **Transition** → colar `behaviour-schema-transition.js`
5. Salvar e testar criando issue de teste

Doc: [Behaviours](https://docs.adaptavist.com/sr4jc/latest/features/behaviours).

### Listeners

1. ScriptRunner → **Script Listeners** → Create Listener
2. Eventos: `Issue Updated` (labels / priority)
3. Colar o `.groovy` correspondente
4. Restringir ao projeto KAN no script (`issue.key` começa com `KAN-`)
5. Salvar → smoke: editar label / prioridade num issue

### Filtros JQL

1. Filters → Create filter
2. Colar queries de `jql-filters.md`
3. Favoritar no board KAN

## Smoke test (após colar)

```bash
pnpm jira:create -- --summary "[SR] smoke DoD create" --type História --label "smoke-sr"
# Abrir no browser: description deve trazer DoD se Behaviour ativo

pnpm jira:edit -- --key KAN-N --label "smoke-sr,audit-finding" --yes
# Listener deve comentar com comando audit:achados

pnpm jira:edit -- --key KAN-N --label "smoke-sr,schema" --yes
# Na transição com schema: Behaviour mostra checklist
```

Apagar issues `smoke-sr` depois.

## Script Variables (opcional)

Em ScriptRunner → Script Variables, definir:

- `KAN_PROJECT_KEY` = `KAN`
- `AUDIT_ACHADOS_CMD` = `pnpm --filter @torcida/web audit:achados`

Usar nos Groovy em vez de hardcode quando o editor SR permitir.

## Mapa fluxo × automação

```text
Create História/Bug  → Behaviour DoD
Label audit-finding  → Listener comentário + orientação
Label schema         → Behaviour na transição + coluna Schema pending (manual/board)
Priority Highest     → Listener alerta
Done sem schema-deploy se label schema → (fase 2: validator / Automation)
```
