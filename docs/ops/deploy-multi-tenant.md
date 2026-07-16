# Runbook — Deploy multi-tenant (ROOT_DOMAIN)

> Operacional. Decisões arquiteturais em `ARCHITECTURE.md` §6 (item 26).
> Painel super-admin: `/super-admin/torcidas`.

## Objetivo

Cada torcida organizada acessível em `{slug}.seudominio.com`, com login
compartilhado entre subdomínios e isolamento de dados por tenant.

## Pré-requisitos

- Domínio próprio (ex.: `torcida.app`)
- Acesso ao DNS do registrador
- Serviço `torcida-web` no Railway
- Seeds aplicados:
  ```bash
  pnpm --filter @torcida/db seed:afiliacoes
  pnpm --filter @torcida/db seed:torcidas-nacional
  ```

## 1. Variáveis de ambiente (Railway → torcida-web)

| Variável | Valor | Notas |
|---|---|---|
| `ROOT_DOMAIN` | `torcida.app` | **Obrigatória** para multi-tenant |
| `TENANT_SLUG` | *(remover ou deixar vazio)* | Só fallback de dev local |
| `SUPER_ADMIN_EMAILS` | `ops@exemplo.com` | E-mails do operador SaaS |
| `AUTH_SECRET` | *(manter)* | Mín. 32 caracteres |
| `AUTH_URL` / `NEXTAUTH_URL` | *(omitir ou domínio público)* | **Nunca** `http://localhost:3000` em produção — quebra login/OAuth |
| `AUTH_TRUST_HOST` | `true` | Opcional; o código já define `trustHost: true` no NextAuth |
| `ROOT_DOMAIN` + Railway | ver nota abaixo | Com `*.up.railway.app`, cookies de sessão ficam host-only automaticamente |
| OAuth Discord/Google | *(manter)* | Ver seção 4 |

Após alterar env vars, redeploy do serviço.

## 2. DNS

No registrador do domínio **ou via Cloudflare Free** (recomendado — CDN +
Brotli a $0; runbook completo em [`docs/ops/cloudflare-cdn.md`](cloudflare-cdn.md)):

| Tipo | Nome | Destino |
|---|---|---|
| CNAME | `@` | host fornecido pelo Railway (apex) |
| CNAME | `*` | mesmo host (wildcard) |

Se usar Cloudflare: nameservers do CF + registros **Proxied** (nuvem laranja);
SSL **Full (strict)**.

No Railway → serviço `torcida-web` → **Settings → Networking → Custom Domain**:

1. Adicionar domínio apex: `torcida.app`
2. Adicionar wildcard: `*.torcida.app`
3. Aguardar provisionamento SSL (automático na maioria dos casos)

## 3. Resolução de tenant

O slug vem do subdomínio:

```
pavilhao-nove.torcida.app  →  tenant slug "pavilhao-nove"
pde-gavioes-fiel.torcida.app  →  tenant slug "pde-gavioes-fiel"
```

Implementação: `apps/web/src/lib/tenant.ts` (`extractSlugFromHost`).

Cookie de sessão: `Domain=.torcida.app` quando `ROOT_DOMAIN` está definido
(`apps/web/src/lib/auth.ts`) — login no apex vale para todos os subdomínios.

## 4. OAuth (Discord + Google)

Redirect URIs **não aceitam wildcard**. Estratégia recomendada:

- Login centralizado no apex: `https://torcida.app/entrar`
- Callbacks cadastrados apenas no apex:
  - `https://torcida.app/api/auth/callback/discord`
  - `https://torcida.app/api/auth/callback/google`
- Após login, redirecionar para o subdomínio desejado (cookie já compartilhado)

## 5. Provisionamento de torcidas

### Seed nacional (recomendado)

Cria ~40 torcidas com cargos de sistema, **sem owner**:

```bash
pnpm --filter @torcida/db seed:torcidas-nacional
```

Fonte: `packages/db/src/data/torcidas-brasil.js`.

### Handoff para presidente

1. Presidente cria conta (Discord/Google/e-mail) no apex
2. Super-admin acessa `/super-admin/torcidas`
3. Informa e-mail do presidente → **Transferir**
4. Action grava `AuditLog` (`OWNER_TRANSFERIDO`) e revoga owners anteriores

Alternativa temporária: botão "Tornar-me owner" em `/super-admin/setup` (para
configuração inicial pelo operador).

## 6. Teste local (sem DNS)

```bash
# apps/web/.env.local
ROOT_DOMAIN=lvh.me
# TENANT_SLUG comentado
```

Acessar:

- `http://pavilhao-nove.lvh.me:3000/portal/comunidade`
- `http://pde-gavioes-fiel.lvh.me:3000/admin`

`*.lvh.me` resolve para `127.0.0.1` automaticamente.

**Atenção:** `ROOT_DOMAIN=lvh.me` + teste em `localhost:3000` quebra sessão
(cookie `Domain=.lvh.me` é descartado em localhost). Use sempre `*.lvh.me`.

## 7. Modo legado (single-tenant) — cookie de contexto

Enquanto não houver domínio:

```bash
TENANT_SLUG=pde-gavioes-fiel  # fallback quando ninguém selecionou torcida
# ROOT_DOMAIN ausente
```

**Comportamento atual (2026-07):** mesmo host serve todas as torcidas provisionadas.
O cookie `torcida_ctx` guarda a torcida ativa:

- **Usuário comum:** definido no login (`/auth/contexto`) a partir do vínculo
  `SaasMembro` aprovado → cai na comunidade da *sua* torcida, não nos Gaviões.
- **Super-admin:** seletor em `/super-admin/torcidas` ou sidebar do `/admin` →
  troca o contexto e gerencia membros/eventos da torcida escolhida.

Provisionar torcidas:

```bash
pnpm --filter @torcida/db seed:afiliacoes
pnpm --filter @torcida/db seed:torcidas-nacional
```

## 8. Isolamento de dados (checklist de segurança)

- [ ] Toda Server Action admin usa `assertPermission` (escopo do host atual)
- [ ] Queries SaaS filtram por `tenantId`
- [ ] Cross-tenant só via `resolveVisibility` / `canViewRecurso`
- [ ] Rivalidade bloqueia até conteúdo público
- [ ] Feed `TENANT` gated por `SaasMembro.status === APROVADO`
- [ ] Super-admin **não** exibe listas de membros/sócios no painel global

## 9. Rollback

1. Remover `ROOT_DOMAIN` do Railway
2. Definir `TENANT_SLUG=pde-gavioes-fiel`
3. Redeploy

Volta ao comportamento single-tenant sem perda de dados.

## 10. Verificação pós-deploy

- [ ] `https://torcida.app/entrar` — login OK
- [ ] `https://pavilhao-nove.torcida.app/portal/comunidade` — tema/nome corretos
- [ ] `https://pde-gavioes-fiel.torcida.app/admin` — admin isolado
- [ ] Sessão persiste ao navegar entre subdomínios
- [ ] Onboarding: solicitar vínculo Pavilhão Nove → redirect `/onboarding/solicitado`
- [ ] Super-admin: `/super-admin/torcidas` lista torcidas e transferência de owner
