# Secrets de desenvolvimento — Torcida SaaS

Canal oficial (v1) para o time entregar chaves ao novo dev **fora do git**.
O agente `/setup` e os scripts `scripts/dev-setup.*` fazem merge desse pacote
nos `.env` locais.

## O que é compartilhado vs pessoal

| Tipo | Exemplos | Vai no pacote? |
| --- | --- | --- |
| App OAuth de **dev** do time | `DISCORD_*`, `GOOGLE_*` (app localhost) | Sim |
| Cloudinary / LiveKit de **dev** | `CLOUDINARY_*`, `LIVEKIT_*` | Sim, se o time usa sandbox compartilhado |
| URL do Postgres Railway (só sync) | `DATABASE_URL_RAILWAY` | Sim (proxy público de leitura/dump) |
| `AUTH_SECRET` de dev compartilhado | um secret estável do time | Opcional — ou cada um gera com `openssl rand -base64 32` |
| Credenciais pessoais | senha do GitHub, tokens pessoais | **Não** |
| Produção | qualquer DSN/chave de prod | **Nunca** |

Template de chaves (sem valores): [`apps/web/.env.team.example`](../apps/web/.env.team.example).

## Nome do arquivo e entrega

Nome sugerido: **`torcida-dev.secrets.env`** (na raiz do clone, gitignored).

Alternativas que o setup também detecta:

- `apps/web/.env.team`
- `.env.team` (raiz)
- path explícito: `-SecretsFile` / `--secrets-file`

**Como o lead entrega:** chat seguro, e-mail cifrado, ou cofre (1Password /
Bitwarden) — **nunca** commit, PR ou issue. O receptor salva o arquivo no path
acima e roda `/setup` (ou `scripts/dev-setup.*`).

## Regras de merge

1. Se `apps/web/.env.local` não existe → copia de `.env.example`.
2. Pacote do time preenche só chave **ausente** ou ainda com placeholder
   (`your_*`, `xxxx`, etc.).
3. Chave já preenchida pelo dev **não** é sobrescrita sem confirmação.
4. `DATABASE_URL` local (`localhost`) é aplicado pelo setup depois do merge;
   a URL remota fica em `DATABASE_URL_RAILWAY`.
5. Nunca cole o conteúdo completo do pacote no chat com o agente — passe o path.

## Fluxo mínimo do novo dev

```text
1. Clone o repo + pnpm (ou deixe o /setup instalar)
2. Receba torcida-dev.secrets.env do lead → salve na raiz
3. No Cursor: /setup
   ou: powershell -File scripts/dev-setup.ps1
   ou: bash scripts/dev-setup.sh
4. pnpm --filter @torcida/web dev
5. Login seed: senha m1k43l3n
```

## Evolução (fora do v1)

Integração com **1Password CLI** (`op read`) para puxar o pacote sem arquivo
local. O contrato de chaves deste doc permanece; só muda a origem do merge.
