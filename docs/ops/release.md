# Release — versionamento por commits

Versão única do produto no monorepo (`package.json` da raiz, pacote
`torcida-saas`). Pacotes internos (`apps/*`, `packages/*`) **não** sincronizam
versão — não são publicados no npm.

Identidade de build exibida no Super Admin: **versão · publicação · commit**.
Detalhe: `docs/data/modulo-super-admin.md` § Build.

## Fórmula

```text
MAJOR.MINOR.PATCH = 1.<commits_em_main>.<commits_totais>
```

| Parte | Regra |
|---|---|
| **major** | Sempre `1` |
| **minor** | `git rev-list --count` de `origin/main` (ou `main`) — commits que já entraram na linha principal |
| **patch** | `git rev-list --count --all` — número total de commits no repositório (todas as refs) |

Exemplo atual típico na `main`: `1.768.779` (768 em main, 779 no total
incluindo tips de outras branches locais/remotas).

Fonte da verdade no app: contagem Git no build
([`apps/web/next.config.ts`](../../apps/web/next.config.ts)). Se não houver
`.git` (artefato sem histórico), cai no `package.json` da raiz.

Helper compartilhado: [`scripts/lib/version-from-git.mjs`](../../scripts/lib/version-from-git.mjs).

```bash
pnpm version:print   # imprime a versão atual derivada do Git
```

## Automação no push em `main`

O workflow [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Faz fetch das refs e calcula a versão a partir do Git.
2. Se a tag `vX.Y.Z` ainda não existe: sincroniza `package.json` + `CHANGELOG.md`,
   commit `chore(release): X.Y.Z [skip ci]`, cria a tag e um GitHub Release.
3. Commits `chore(release)` são ignorados pelo workflow (anti-loop).

O build do Next **não depende** desse commit: a UI lê a contagem Git (ou o
`package.json` como fallback).

## Escape hatch (manual)

```bash
pnpm release:sync              # grava package.json + CHANGELOG, commit e tag locais
pnpm release:sync -- --dry-run
pnpm release:sync -- --no-commit
git push --follow-tags         # só quando for publicar
```

## Checklist de release

1. Merge / push em `main` → Railway faz deploy; a versão no Super Admin reflete
   a contagem de commits.
2. Se `packages/db/prisma/schema.prisma` mudou: seguir
   [`docs/ops/schema-deploy.md`](schema-deploy.md) (HML → prod). Versão ≠ schema.
3. Conferir no Super Admin (`/super-admin`) o card **Build da plataforma**.
4. Discord (workflow de notify) inclui o campo Versão (Git ou `package.json`).

## Comandos úteis

```bash
pnpm version:print
pnpm release:sync -- --dry-run
```
