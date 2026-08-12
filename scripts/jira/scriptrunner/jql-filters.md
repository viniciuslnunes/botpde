# JQL filters — KAN (salvar no Jira)

Site: `setorize-torcidas.atlassian.net`

## Open audit findings

```jql
project = KAN AND labels = "audit-finding" AND statusCategory != Done ORDER BY priority DESC, updated DESC
```

## Needs schema

```jql
project = KAN AND labels = schema AND statusCategory != Done ORDER BY updated DESC
```

## Decisions open

```jql
project = KAN AND labels = "needs-decision" AND statusCategory != Done ORDER BY created ASC
```

## In progress with me

```jql
project = KAN AND assignee = currentUser() AND statusCategory = "In Progress" ORDER BY priority DESC
```

## Smoke ScriptRunner (apagar depois)

```jql
project = KAN AND labels = "smoke-sr" ORDER BY created DESC
```
