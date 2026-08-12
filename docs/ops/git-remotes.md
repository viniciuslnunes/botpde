# Remotes Git — GitHub canônico + Bitbucket auxiliar

## Fonte da verdade

| Remote | URL | Papel |
| --- | --- | --- |
| `origin` | `https://github.com/viniciuslnunes/botpde` | **Canônico** — CI, release, Railway |
| `bitbucket` | `https://bitbucket.org/setorize-torcidas/botpde.git` | Auxiliar — puxar commits feitos só no Bitbucket |

Push de feature/release e merge em `main` devem ir para **GitHub** (`origin`).
O Railway e os workflows em `.github/workflows/` só veem o GitHub.

## Por que o push do Bitbucket não deployou

O serviço no Railway está ligado ao repositório **GitHub**. Um `git push` só no
Bitbucket atualiza `bitbucket/main`, não `origin/main` — então:

1. Quem clona pelo GitHub **não vê** esses commits.
2. O Railway **não** dispara deploy.
3. O workflow de release em `main` também não roda.

## Configurar o remote Bitbucket

```bash
git remote add bitbucket https://bitbucket.org/setorize-torcidas/botpde.git
# se já existir:
git remote set-url bitbucket https://bitbucket.org/setorize-torcidas/botpde.git
```

Acesso: conta no workspace `setorize-torcidas` + **API token** Atlassian
(com scopes Bitbucket). App Passwords foram descontinuados — a URL antiga
`/account/settings/app-passwords/` retorna *Resource not found*.

### Auth Git (API token)

1. Abra [Create and manage API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. **Create API token with scopes** → app **Bitbucket** → marque pelo menos:
   - `read:repository:bitbucket` (fetch/pull)
   - `write:repository:bitbucket` (só se for push no Bitbucket)
3. Copie o token (aparece uma vez).
4. No próximo `git fetch bitbucket` / `pnpm sync:bitbucket`, quando o Git Credential
   Manager pedir senha:
   - **Username:** `x-bitbucket-api-token-auth` (recomendado) **ou** seu username
     Bitbucket (case-sensitive, em
     [Personal settings](https://bitbucket.org/account/settings/))
   - **Password:** o API token (não a senha da conta)
5. Depois: `pnpm sync:bitbucket -- --dry-run` e, se ok, `pnpm sync:bitbucket`.

Doc oficial: [Using API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/).

Alternativa sem Bitbucket: Samuel faz push da mesma `main` no **GitHub**
(`origin`) — Railway sobe a partir daí.

## Herdar commits do Bitbucket na main do GitHub

```bash
# 1) Comparar
pnpm sync:bitbucket -- --dry-run

# 2) Merge local + push origin (dispara Railway)
pnpm sync:bitbucket
```

Equivalente manual:

```bash
git fetch origin
git fetch bitbucket
git checkout main
git merge bitbucket/main   # resolve conflitos se houver divergência
git push origin main
```

Se `packages/db/prisma/schema.prisma` mudou no merge, seguir
[`schema-deploy.md`](schema-deploy.md).

## Orientação para quem usa Bitbucket

1. Preferir clone/push no **GitHub** (pedir acesso ao repo).
2. Se já commitou só no Bitbucket: rode `pnpm sync:bitbucket` (ou peça a quem
   tem acesso nos dois remotes).
3. Bitbucket pode ficar como mirror de leitura; não é o gatilho de deploy.

## Jira (KAN)

Issues e priorização: [`jira-kan.md`](jira-kan.md). Commits: `feat(scope): … (KAN-42)`.
ScriptRunner: [`jira-scriptrunner.md`](jira-scriptrunner.md).

## Ver remotes

```bash
git remote -v
```
