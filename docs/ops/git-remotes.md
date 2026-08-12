# Remotes Git — pair sync GitHub ↔ Bitbucket

## Fonte da verdade operacional

| Remote | URL | Papel |
| --- | --- | --- |
| `origin` | `https://github.com/viniciuslnunes/botpde` | **Deploy** — CI, release, Railway |
| `bitbucket` | `https://bitbucket.org/setorize-torcidas/botpde.git` | **Pair** — mesmo tip de `main` que o GitHub |

Os dois devem ficar **no mesmo commit** em `main`. Quem publica só num dos
lados deixa o pair desalinhado até rodar o sync.

O Railway e `.github/workflows/` **só** veem o GitHub. Push só no Bitbucket
não deploya — o sync empurra o tip unificado para `origin` quando falta lá.

## Fluxo único (pair programming)

```bash
# Antes de começar / ao trocar de máquina / depois de push do par
pnpm sync:bitbucket -- --dry-run   # ver o plano
pnpm sync:bitbucket                # unir tips + push nos dois remotes
```

O script:

1. `fetch` origin + bitbucket  
2. Une o que estiver só de um lado (merge sem force-push)  
3. Faz push de `main` nos **dois** remotes até os tips coincidirem  

Prioridade = **o tip mais completo** (união dos commits), não “quem gritou
mais alto”. Divergência real vira merge commit; conflitos pedem resolução
manual e novo `pnpm sync:bitbucket`.

### Hábitos do pair

1. Preferir `git push origin main` no dia a dia (dispara Railway).  
2. Se alguém commitou só no Bitbucket: rode o sync (ou peça a quem tem token).  
3. No fim da sessão: `pnpm sync:bitbucket` — garante espelho.  
4. Feature branches: ok em qualquer remote; `main` é o que o sync alinha.

## Configurar o remote Bitbucket

```bash
git remote add bitbucket https://bitbucket.org/setorize-torcidas/botpde.git
# se já existir:
git remote set-url bitbucket https://bitbucket.org/setorize-torcidas/botpde.git
```

### Auth Git (API token)

1. Abra [Create and manage API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. **Create API token with scopes** → app **Bitbucket** → marque:
   - `read:repository:bitbucket` (fetch)
   - `write:repository:bitbucket` (**obrigatório** para o push do espelho)
3. Copie o token (aparece uma vez).
4. No `.env.jira` (gitignored):

   ```bash
   BITBUCKET_API_TOKEN=...seu_token...
   ```

   O `pnpm sync:bitbucket` usa username fixo `x-bitbucket-api-token-auth`.

5. Alternativa GCM no `git fetch/push bitbucket`:
   - **Username:** `x-bitbucket-api-token-auth`
   - **Password:** o API token

App Passwords foram descontinuados. Doc:
[Using API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/).

## Por que push só no Bitbucket “não subiu”

1. Quem clona pelo GitHub não vê esses commits.  
2. O Railway não dispara.  
3. O release em `main` no GitHub não roda.  

Mitigação: `pnpm sync:bitbucket` (não “esperar o deploy do Bitbucket”).

## Schema

Se o merge unificar mudança em `packages/db/prisma/schema.prisma`, seguir
[`schema-deploy.md`](schema-deploy.md).

## Jira (KAN)

Issues: [`jira-kan.md`](jira-kan.md). Commits: `feat(scope): … (KAN-42)`.
ScriptRunner: [`jira-scriptrunner.md`](jira-scriptrunner.md).

## Ver remotes

```bash
git remote -v
```
