# Atlassian CLI (acli) — Jira no terminal

Tooling de **desenvolvedor** (não CI, não app). Binário em `tools/` (gitignored).

Docs oficiais: [Install Windows](https://developer.atlassian.com/cloud/acli/guides/install-windows/),
[How to get started](https://developer.atlassian.com/cloud/acli/guides/how-to-get-started/).

Projeto vivo: **KAN** — [`jira-kan.md`](jira-kan.md) · ScriptRunner: [`jira-scriptrunner.md`](jira-scriptrunner.md).
VIN-* é histórico de commits antigos.

## Setup rápido

```bash
pnpm acli:install          # baixa tools/acli.exe (ou tools/acli)
cp docs/ops/jira.env.example .env.jira   # edite JIRA_SITE / JIRA_PROJECT / JIRA_EMAIL
pnpm jira:auth             # OAuth no browser
pnpm jira:status           # confere binário + sessão
pnpm jira:seed-kan         # epics + decisões + achados seed (idempotente)
```

Auth por API token (alternativa):

```bash
# Token em https://id.atlassian.com/manage-profile/security/api-tokens
echo "$ATLASSIAN_API_TOKEN" | pnpm jira:auth -- --token
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm acli:install` | Baixa/atualiza o binário (`--force` / `ACLI_FORCE=1`) |
| `pnpm jira:auth` | Login OAuth (`--web`) |
| `pnpm jira:auth -- --token` | Login com token + `JIRA_SITE` / `JIRA_EMAIL` |
| `pnpm jira:status` | Binário, env e `acli jira auth status` |
| `pnpm jira:view -- KEY` | Ver issue (`--web`, `--json`, …) |
| `pnpm jira:create -- --summary "..."` | Criar issue (`JIRA_PROJECT` ou `--project`) |
| `pnpm jira:edit -- --key KEY --summary "..."` | Atualizar campos |
| `pnpm jira:transition -- --key KEY --status "..."` | Mudar status |
| `pnpm jira:seed-kan` | Seed epics / decisões / achados §7 |

Types no site (PT): `Epic`, `Tarefa`, `História`, `Bug`, `Função`, `Subtarefa`.

Flags extras do `acli` passam depois de `--`.

## Variáveis

| Variável | Uso |
| --- | --- |
| `JIRA_SITE` | Host, ex. `setorize-torcidas.atlassian.net` |
| `JIRA_PROJECT` | Projeto padrão — `KAN` |
| `JIRA_EMAIL` | E-mail da conta (auth `--token`) |
| `ATLASSIAN_API_TOKEN` | Só na máquina — **não** no `torcida-dev.secrets.env` |

Template: [`jira.env.example`](jira.env.example) → `.env.jira` na raiz (gitignored).
Os wrappers carregam `.env.jira` automaticamente.

Token Jira é **pessoal** — ver [`dev-secrets.md`](dev-secrets.md).

## Exemplos

```bash
pnpm jira:view -- KAN-42
pnpm jira:view -- KAN-42 --web

pnpm jira:create -- --summary "Corrigir deploy Railway" --type Tarefa
pnpm jira:edit -- --key KAN-42 --assignee @me --yes
pnpm jira:transition -- --key KAN-42 --status "In Progress" --yes
```

## Conta pessoal vs conta da org

A sessão operacional costuma ser `ops@setorize.com` no site
`setorize-torcidas.atlassian.net`.

Se o **seu** usuário Atlassian falha no `pnpm jira:auth` com erro de permissão
mesmo “com todas as permissões” no projeto:

1. **Product access ≠ permissão de projeto.** Precisa de acesso ao produto
   **Jira** no site (Admin → Directory → Product access).
2. No fluxo `--web`, escolha o **mesmo site** no browser e no terminal.
3. Confirme que o e-mail do login é o convidado no site.
4. Depois: `./tools/acli.exe jira auth logout` e `pnpm jira:auth` de novo.

## Install manual (Windows)

```powershell
New-Item -ItemType Directory -Force -Path tools | Out-Null
Invoke-WebRequest -Uri https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe -OutFile tools/acli.exe
.\tools\acli.exe -v
```
