# Checklist `/setup` (gates)

Ordem fixa. Cada fase é um gate: falhou → instruir → parar → retomar.

## 1. Detect

| Check | Como | Se falhar |
| --- | --- | --- |
| Node ≥ 20 | `node -v` | Instalar Node 20 LTS; reabrir terminal |
| pnpm ≥ 9 | `pnpm -v` | `corepack enable && corepack prepare pnpm@9.15.9 --activate` |
| Docker CLI | `docker version` (client) | Instalar Docker Desktop; reiniciar terminal |
| Docker engine | `docker info` | Abrir Docker Desktop; esperar engine verde |
| Windows: WSL2 | `wsl --status` (versão padrão 2) | Admin: `wsl --install --no-distribution` → reboot |
| Windows: virt | se Docker não sobe | BIOS: SVM Mode Enabled (AMD) / VT-x (Intel) |

Mensagem WSL1 no `wsl --status` é irrelevante se a versão padrão é 2.

## 2. Deps

```bash
pnpm install
```

## 3. Env

1. Se não existir `apps/web/.env.local` → copiar de `apps/web/.env.example`.
2. Se não existir `packages/db/.env` → criar com `DATABASE_URL=` (preenchido depois).
3. Se `-SecretsFile` / pacote do time (`torcida-dev.secrets.env`, `.env.team`):
   merge **sem clobber** (só preenche chave vazia ou ausente).
4. Validar presença (não inventar):
   - Obrigatórias para app útil: `AUTH_SECRET`, `TENANT_SLUG`, `SUPER_ADMIN_EMAILS`
   - Login OAuth: pares Discord e/ou Google; senão avisar Credentials/`E2E_*`
   - Sync: `DATABASE_URL_RAILWAY` (ou `DATABASE_URL` ainda remota)
5. Listar faltantes e pedir cola / pacote. Ver `docs/ops/dev-secrets.md`.

## 4. DB (Docker)

```bash
docker compose -f docker-compose.dev.yml up -d
```

Esperar `healthy` em `torcida-postgres-dev`. Se reinício em loop com erro de
volume `postgres:18`, o mount deve ser `/var/lib/postgresql` (não `.../data`) —
já no compose do repo; `down -v` + `up -d` só com confirmação (apaga dados locais).

## 5. Sync

Se houver URL remota (`DATABASE_URL_RAILWAY` ou `DATABASE_URL` não-localhost):

- Windows: `powershell -File scripts/db-local-sync.ps1`
- macOS/Linux: o `dev-setup.sh` faz o dump/restore equivalente

Sem URL remota: avisar banco vazio; oferecer `db:push` + seeds **só com confirmação**.

## 6. Point local

Nos dois arquivos (`apps/web/.env.local`, `packages/db/.env`):

```env
DATABASE_URL=postgresql://torcida:torcida@localhost:5432/torcida
DATABASE_URL_RAILWAY=<url remota preservada>
```

## 7. Prisma

```bash
pnpm --filter @torcida/db db:generate
```

## 8. Smoke

- `docker exec torcida-postgres-dev psql -U torcida -d torcida -c 'SELECT 1'`
- Contar tabelas em `public` (após sync: ~90)
- Opcional: `pnpm --filter @torcida/web dev` e abrir `http://localhost:3000`

## 9. Report

- Checklist por fase
- Senha seed: `m1k43l3n` (`packages/db/scripts/lib/senha-teste.js`)
- Docs: `docs/ops/postgres-local-dev.md`, `docs/ops/dev-secrets.md`
- Compilação a frio do `next dev` (~5s) é normal; lentidão crônica = banco remoto
- Opcional Jira CLI: `pnpm acli:install` → `cp docs/ops/jira.env.example .env.jira` → `pnpm jira:auth` — ver `docs/ops/acli-jira.md` / `docs/ops/jira-kan.md` (token pessoal, fora do pacote do time)
- Remotes (pair): espelho auto Bitbucket↔GitHub — secrets em `docs/ops/git-remotes.md`; fallback `pnpm sync:bitbucket`
