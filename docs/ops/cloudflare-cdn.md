# Cloudflare Free — CDN na frente do Railway

> **Custo: $0.** Plano Free. Não exige código novo além dos headers de cache
> já definidos em `apps/web/next.config.ts`.
> Complementa `docs/data/modulo-comunidade-performance.md` (Fase F4) e
> `docs/ops/deploy-multi-tenant.md`.

## O que ganha

| Benefício | Detalhe |
|-----------|---------|
| Cache de `/_next/static/*` | JS/CSS/fonts com hash — hit na borda (Brasil) |
| Brotli / HTTP/2 | Compressão na edge sem esforço no Railway |
| DDoS / bot básico | Proteção do plano Free |
| LCP em 4G | Menos round-trip ao origin no dia de jogo |

**Não cacheia** HTML dinâmico do portal (RSC/auth) — só assets estáticos e
o que você marcar explicitamente. Login e Server Actions continuam no origin.

## Pré-requisitos

- Domínio próprio apontando (ou a apontar) para o Railway
- Conta em [dash.cloudflare.com](https://dash.cloudflare.com) (Free)

## 1. Adicionar o site no Cloudflare

1. **Add a site** → informe o domínio (ex.: `torcida.app`).
2. Escolha o plano **Free**.
3. Cloudflare mostra nameservers — troque no registrador e espere propagar
   (minutos a algumas horas).

## 2. DNS (proxy laranja)

Registros típicos (ajuste ao seu domínio):

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| CNAME | `@` ou root | `torcidaweb-production.up.railway.app` (ou domínio Railway) | **Proxied** (laranja) |
| CNAME | `*` | mesmo target | **Proxied** (laranja) |

Se o registrador não permitir CNAME no apex, use o registro **CNAME flattening**
do Cloudflare (já nativo) ou A/AAAA que o painel sugerir.

**Importante:** nuvem **laranja** (Proxied) = tráfego passa pelo CDN.
Cinza = só DNS, sem cache Cloudflare.

## 3. SSL/TLS

Em **SSL/TLS** → Overview:

- Modo: **Full (strict)**
- Railway já serve HTTPS no origin — Full (strict) evita erros de certificado

Em **Edge Certificates**:

- Always Use HTTPS: **On**
- Automatic HTTPS Rewrites: **On** (opcional)

## 4. Cache Rules (recomendado no Free)

**Caching** → **Cache Rules** → Create rule:

1. **Nome:** `Next static immutable`
2. **When:** URI Path starts with `/_next/static`
3. **Then:**
   - Eligible for cache: **Yes**
   - Edge TTL: **1 month** (ou “Respect origin”)
   - Browser TTL: **Respect origin**

O origin já envia `Cache-Control: public, max-age=31536000, immutable` para
`/_next/static` (ver `next.config.ts`).

Regra opcional para favicon/assets públicos sem hash:

- Path is `/favicon.ico` ou starts with `/stickers/`
- Edge TTL mais curto (ex.: 1 day) se quiser invalidar sem wait longo

**Não** crie regra “cache everything” em `/portal/*` — quebra sessão/RSC.

## 5. Variáveis / Auth

Nada muda no código se `ROOT_DOMAIN` e cookies já estão corretos
(`docs/ops/deploy-multi-tenant.md`).

Checklist Auth atrás do proxy:

- [ ] `AUTH_URL` / `NEXTAUTH_URL` = `https://seudominio.com` (não localhost)
- [ ] OAuth Discord/Google com redirect URIs no domínio público
- [ ] `AUTH_TRUST_HOST=true` se necessário (o app já usa `trustHost`)

## 6. Como validar

1. Abra o site → DevTools → Network → um arquivo `/_next/static/...js`
2. Recarregue (Ctrl+R)
3. Response headers devem incluir algo como:
   - `cf-cache-status: HIT` (ou `MISS` na 1ª, `HIT` na 2ª)
   - `cache-control: public, max-age=31536000, immutable`

Se `cf-cache-status` não aparecer, o proxy ainda está cinza ou o DNS não
passou pelo Cloudflare.

## 7. O que **não** fazer no Free

- Cache HTML autenticado (`/portal`, `/admin`)
- Page Rules agressivas “Cache Everything” no apex
- Workers pagos só por estética — sem métrica, sem custo

## Relação com o plano de performance

| Item | Status |
|------|--------|
| F4 CDN Cloudflare Free | **Este runbook** — ativação manual |
| Avatares Cloudinary | Já em CDN próprio (`res.cloudinary.com`) |
| Redis / SSE / feed | Independente — já no app |

Depois de ativar, registre a data no changelog interno / `ARCHITECTURE.md` §5.6
se quiser rastrear o go-live.
