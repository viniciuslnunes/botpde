# JQL filters — KAN (salvar no Jira)

Site: `setorize-torcidas.atlassian.net`

- **JQL nativo** → Filters → Create filter → favoritar no board.
- **Enhanced Search** → Apps → **ScriptRunner Enhanced Search** (funções `issueFunction in …`).
  Keywords (`numberOfAttachments`, `commentedOn`, …) também funcionam no navigator
  **depois** do sync inicial de keywords (admin, uma vez).

Histórico importado de git usa label `from-git`. Filtros de produto vivo
excluem isso de propósito.

---

## JQL nativo

### Open audit findings

```jql
project = KAN AND labels = "audit-finding" AND statusCategory != Done ORDER BY priority DESC, updated DESC
```

### Needs schema

```jql
project = KAN AND labels = schema AND statusCategory != Done ORDER BY updated DESC
```

### Decisions open

```jql
project = KAN AND labels = "needs-decision" AND statusCategory != Done ORDER BY created ASC
```

### In progress with me

```jql
project = KAN AND assignee = currentUser() AND statusCategory = "In Progress" ORDER BY priority DESC
```

### Backlog vivo (sem histórico git)

```jql
project = KAN AND labels not in (from-git) AND statusCategory != Done ORDER BY priority DESC, updated DESC
```

### Feito — só produto (não from-git)

```jql
project = KAN AND labels not in (from-git) AND statusCategory = Done ORDER BY resolved DESC
```

### Smoke ScriptRunner (apagar depois)

```jql
project = KAN AND labels = "smoke-sr" ORDER BY created DESC
```

---

## ScriptRunner Enhanced Search

Rodar em **Apps → ScriptRunner Enhanced Search**. Salvar como filter se o UI
permitir export/favorito; senão, colar de novo daqui.

Doc: [Enhanced Search](https://docs.adaptavist.com/sr4jc/latest/features/scriptrunner-enhanced-search) ·
[JQL functions](https://docs.adaptavist.com/sr4jc/latest/features/scriptrunner-enhanced-search/scriptrunner-enhanced-search-jql-functions) ·
[JQL keywords](https://docs.adaptavist.com/sr4jc/latest/features/scriptrunner-enhanced-search/scriptrunner-enhanced-search-jql-keywords).

### Epics com filhos ainda abertos

```jql
issueFunction in epicsOf("project = KAN AND statusCategory != Done")
```

### Filhos de epics abertos (stories/tarefas sob epic não Done)

```jql
issueFunction in issuesInEpics("project = KAN AND statusCategory != Done") AND statusCategory != Done
```

### Bloqueados por issues ainda abertas

```jql
project = KAN AND issueFunction in linkedIssuesOf("project = KAN AND statusCategory != Done", "is blocked by")
```

### Que bloqueiam outros (dependência outbound)

```jql
project = KAN AND issueFunction in linkedIssuesOf("project = KAN AND statusCategory != Done", "blocks")
```

### Backlog vivo sem comentário há 14+ dias

```jql
project = KAN AND labels not in (from-git) AND statusCategory != Done AND commentedOn <= -14d ORDER BY updated ASC
```

### Audit finding sem anexo de evidência

```jql
project = KAN AND labels = "audit-finding" AND numberOfAttachments = 0 ORDER BY priority DESC, updated DESC
```

### Histórias/tarefas sem subtarefa (possível breakdown faltando)

```jql
project = KAN AND type in (História, Tarefa) AND labels not in (from-git) AND statusCategory != Done AND numberOfSubtasks = 0 ORDER BY priority DESC
```

---

## Ordem sugerida ao criar no UI

1. Sync keywords Enhanced Search (admin, uma vez).
2. Criar filtros nativos (audit / schema / decisions / me / vivo / smoke).
3. Testar as queries Enhanced na tela do app; favoritar as 3–4 que o time usar
   (epics abertos, bloqueados, sem comentário, audit sem anexo).
