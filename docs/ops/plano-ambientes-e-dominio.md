# Plano — Ambientes (dev / homolog / prod) + domínio `torcidas.setorize.com`

> Status: **decisões fechadas — pronto para Fase 0/1** (ainda não executado).  
> Domínio comprado: `setorize.com` (HostGator). Produto: **Sertorize Torcidas**.  
> Complementa: `deploy-multi-tenant.md`, `cloudflare-cdn.md`, `dev-secrets.md`,
> `plano-investimento-infra.md` (Faixa A).  
> Decisões do fundador: **2026-08-07**.

## 0. Decisões fechadas (2026-08-07)

| # | Tema | Decisão |
|---|------|--------|
| 1 | Banco atual | **Opção B** — atual vira **homolog**; **prod nasce limpo** |
| 2 | URL homolog | `homolog.setorize.com` |
| 3 | Bot Discord HML | **Não** no dia 1 |
| 4 | Custo Railway | **2× Postgres no Railway** (simplicidade); Staging web sem bot/Redis/LiveKit |
| 5 | Cofre de senhas | **Sem Bitwarden pago** — ver §0.1 (KeePassXC + Railway Variables) |
| 6 | Acessos | Só o fundador hoje; time entrará depois com papéis mínimos |
| 7 | Cloudinary | Conta atual = **HML**; **nova conta Free** (outro e-mail) = **PROD** |
| 8 | OAuth | Apps **separados** Dev / HML / Prod |
| 9 | E-mail empresa | **Cloudflare Email Routing** → `ops@setorize.com` (antes do Cloudinary prod) |

### Cloudinary Free — como isolar sem pagar

- Plano Free = **1 product environment por conta**, **25 créditos/mês**, até 3 users.
- Vários environments na **mesma** conta = plano **Plus ($99/mês)** — não usar.
- Isolamento gratuito: **abrir outra conta Free com outro e-mail**
  (alias Gmail `+prod`, ou e-mail `@setorize.com` quando existir).
- **Decisão:** conta atual → **homolog**; conta nova → **prod** limpa.
- Dev: reusar credenciais HML no pacote do time (volume baixo) — não precisa
  de 3ª conta no dia 1.

### 0.1 Secrets sem assinatura paga

Bitwarden Free pessoal existe, mas se a experiência for trial/limitada, **não
depender disso**. Modelo barato e suficiente para time pequeno:

| Onde mora o secret | O quê |
|--------------------|--------|
| **Railway → Variables** (Environment Staging / Production) | Fonte da verdade de HML e Prod. Quem não tem acesso ao Environment não vê. |
| **`torcida-dev.secrets.env`** (gitignored, laptop) | Só Dev (+ no máximo DSN proxy da HML para sync). Já documentado em `dev-secrets.md`. |
| **KeePassXC** (opcional, 100% free/open source) | Backup local criptografado (`.kdbx`) das chaves importantes. Um arquivo, uma senha mestra. Sem mensalidade. |

**Regras:**

1. Prod **nunca** entra no pacote `*.secrets.env` do time nem em chat/PR.
2. Homolog: pode ir no vault KeePassXC do fundador; sync local só com
   `DATABASE_URL_RAILWAY` apontando para o Postgres **Staging**.
3. Quando adicionar pessoas: dar acesso no **Railway** (projeto/env) e
   **Cloudinary** (invite de user), em vez de mandar o arquivo de secrets.
4. Entrega pontual de Dev: arquivo `torcida-dev.secrets.env` por canal
   privado (e-mail/DM) — como já está em `dev-secrets.md`.

KeePassXC: [https://keepassxc.org/](https://keepassxc.org/) — instala, cria
base `setorize-secrets.kdbx`, pastas Dev / Homolog / Prod, senha mestra forte,
backup do `.kdbx` em pasta pessoal (não no git do monorepo).

## 1. Objetivo

## 1. Objetivo

1. Publicar o produto em **`torcidas.setorize.com`** (não `setorize-torcidas`).
2. Separar **três ambientes** com dados e mídia isolados:
   - **dev** — máquina local
   - **homolog** — staging estável para testar sem tocar prod
   - **prod** — usuários reais / demos oficiais
3. Parar de “testar em produção”.
4. Guardar secrets por ambiente, sem vazar para quem não precisa.

## 2. Mapa de URLs (decisão)

| Ambiente | `ROOT_DOMAIN` | Apex do produto | Torcidas (tenant) |
|----------|---------------|-----------------|-------------------|
| **prod** | `torcidas.setorize.com` | `https://torcidas.setorize.com` | `{slug}.torcidas.setorize.com` |
| **homolog** | `homolog.setorize.com` | `https://homolog.setorize.com` | `{slug}.homolog.setorize.com` |
| **dev** | `lvh.me` (opcional) ou off | `http://….lvh.me:3000` / `localhost` | `{slug}.lvh.me:3000` |

### Por que homolog **não** fica em `homolog.torcidas.setorize.com`?

Com `ROOT_DOMAIN=torcidas.setorize.com`, o primeiro label do host vira **slug de
torcida** (`tenant.ts`). `homolog.torcidas.setorize.com` seria interpretado como
tenant `homolog`. Árvore DNS separada evita colisão e permite OAuth/cookies
isolados.

Empresa (site institucional futuro): `setorize.com` / `www` — fora deste plano
do produto Torcidas.

## 3. Isolamento de dados (o que existe hoje)

**Hoje (as-is):**

| Recurso | Situação |
|---------|----------|
| Postgres | **Um** banco Railway compartilhado (web + bot). Demo e testes misturados |
| Cloudinary | Uma conta / um cloud; pastas por tipo (escudos, uploads), **não** por ambiente |
| Redis | Opcional (`REDIS_URL`); se ligado, provavelmente único |
| LiveKit | Opcional; tipicamente um projeto |
| OAuth | Apps Discord/Google (dev vs prod podem estar misturados) |
| Secrets locais | Pacote `torcida-dev.secrets.env` (`dev-secrets.md`) — **nunca** prod |
| Deploy | Push em `main` → Railway “produção” |

**Alvo (to-be):** cada ambiente tem o **próprio** Postgres, Cloudinary (cloud ou
conta), Redis, LiveKit (se usado), `AUTH_SECRET`, apps OAuth e variáveis no
Railway. Zero share de DSN/API secret entre prod e homolog.

```text
┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ DEV (local) │   │ HOMOLOG (Railway)│   │ PROD (Railway)   │
│ Postgres    │   │ Postgres HML     │   │ Postgres PROD    │
│ Cloudinary  │   │ Cloudinary HML   │   │ Cloudinary PROD  │
│ dev secrets │   │ env Staging      │   │ env Production   │
└─────────────┘   └──────────────────┘   └──────────────────┘
        ▲                    ▲                      ▲
        │                    │                      │
   laptop /setup      branch staging           branch main
```

## 4. Modelo Railway recomendado

Usar **um projeto Railway** com **dois Environments**:

| Environment Railway | Branch de deploy | Serviços |
|---------------------|------------------|----------|
| **Production** | `main` | `torcida-web` + Postgres + bot Discord |
| **Staging** | `staging` | `torcida-web` apenas (sem bot) |

Homolog **sem** bot, **sem** Redis pago, **sem** LiveKit (salvo teste pontual).

### 4.1 Custo

**Decisão:** 2× Postgres no Railway (Staging + Production) — mais simples.

Mitigações de custo (sem Neon):

- Staging **sem** bot, Redis, LiveKit
- Staging com limites de RAM/CPU menores e sleep agressivo se o Hobby permitir
- Não criar 3º ambiente “preview” por enquanto

### 4.2 Postgres por Environment

| Environment | Postgres |
|-------------|----------|
| Staging (homolog) | Banco Railway **atual** (opção B — já tem demo/teste) |
| Production | Postgres Railway **novo**, vazio → seed limpo |

## 5. Matriz de secrets (o que nunca misturar)

| Variável | Dev | Homolog | Prod | Notas |
|----------|-----|---------|------|-------|
| `DATABASE_URL` | localhost | Postgres Staging | Postgres Production | Interno `*.railway.internal` no deploy |
| `AUTH_SECRET` | gerado local / time | **único HML** | **único PROD** | Rotacionar se já vazou em chat |
| `ROOT_DOMAIN` | off ou `lvh.me` | `homolog.setorize.com` | `torcidas.setorize.com` | |
| `AUTH_URL` | omitir | `https://homolog.setorize.com` | `https://torcidas.setorize.com` | Nunca localhost no Railway |
| `TENANT_SLUG` | ok em local | **vazio** com ROOT_DOMAIN | **vazio** | |
| `CLOUDINARY_*` | sandbox time | conta/cloud HML | conta/cloud PROD | Preferir **clouds separados** |
| `DISCORD_*` / `GOOGLE_*` | app “Dev” | app “Homolog” | app “Prod” | Redirect URIs por apex |
| `LIVEKIT_*` | sandbox / off | projeto HML ou off | projeto PROD | |
| `REDIS_URL` | off / local | Upstash HML | Upstash PROD | |
| `SUPER_ADMIN_EMAILS` | seu e-mail | ops de teste | ops reais | |
| `DATABASE_URL_RAILWAY` (só sync local) | **só HML** após cutover | — | **nunca** no pacote de time | Ver `postgres-local-dev.md` |
| PIX / Mercado Pago | mock | sandbox | produção | Se/quando ligado |

### Regras de segurança (obrigatórias)

1. **Nunca** commit de `.env`, dumps, ou `*.secrets.env` (já no `.gitignore`).
2. Pacote do time (`dev-secrets.md`) = **somente** chaves de **dev** (+ no
   máximo DSN de sync da **homolog**, nunca prod).
3. Variáveis de prod só no Railway Environment Production (+ KeePassXC do
   fundador, acesso mínimo).
4. Homolog no KeePassXC (pasta Homolog) e/ou só no Environment Staging.
5. Não colar secrets no chat com agentes / Discord / PR.
6. Quem sair do time: revogar Railway, Cloudflare, Cloudinary, OAuth, cofre.
7. Após cutover: **rotacionar** qualquer secret que já tenha sido compartilhado
   amplamente (Cloudinary API secret, AUTH_SECRET antigo, etc.).

## 6. Cloudinary — isolamento

**Mínimo aceitável:** duas contas Cloudinary (ou dois clouds), uma HML e uma
PROD. Pastas (`escudos/`, uploads) **não** bastam se a mesma `API_SECRET`
serve os dois ambientes — um bug ou script de seed em HML poderia apagar mídia
de prod.

**Dev:** terceira pasta/cloud “dev” no pacote do time, ou reusar HML com cuidado
(preferível cloud/dev separado se o free tier permitir).

Seeds que sobem escudos (`seed:afiliacoes`, migrate-escudos, etc.) devem rodar
com as credenciais do **ambiente alvo**, nunca com prod por acidente.

## 7. Destino do banco atual

**Decisão: opção B** — banco Railway atual → **homolog (Staging)**; produção
recebe Postgres **novo** + seed limpo / demo oficial quando precisar apresentar.

Não rodar mais jornadas/seeds volumosos no que hoje se chama “prod” depois que
ele for renomeado mentalmente para HML — só no Environment Staging / Neon HML.

## 8. Fases de execução (ordem)

Não pular fases. Cada fase tem **critério de pronto** antes da próxima.

---

### Fase 0 — Decisões e preparação

- [x] URLs, banco B, Cloudinary, OAuth, Postgres Railway, secrets KeePassXC
- [ ] KeePassXC + base `setorize-secrets.kdbx` (opcional)
- [ ] Inventariar secrets atuais no Railway
- [ ] Criar branch `staging` quando for ligar deploy HML

**Pronto quando:** decisões §0 fechadas (já estão).

---

### Fase 0.5 — E-mail `@setorize.com` (antes do Cloudinary prod)

Objetivo: ter pelo menos um endereço que **recebe** e-mail no domínio da
empresa, para criar a conta Cloudinary de produção (e depois OAuth Google,
convites, etc.).

#### Endereços sugeridos (começar com 1–2)

| Endereço | Uso |
|----------|-----|
| `ops@setorize.com` | Contas de infra (Cloudinary prod, Railway alerts, etc.) |
| `dev@setorize.com` | Opcional — apps OAuth Dev / Cloudinary HML se quiser separar |

Não precisa de caixa cheia no dia 1: **receber** o link de verificação já basta.

#### Caminho escolhido: **A — Cloudflare Email Routing** (2026-08-07)

Caminho B (Titan/HostGator) fica de reserva só se no futuro precisar de
webmail/SMTP próprio.

##### Checklist prático (ordem)

1. Conta em [dash.cloudflare.com](https://dash.cloudflare.com) (Free).
2. **Add a site** → `setorize.com` → plano Free.
3. Cloudflare mostra 2 nameservers (ex.: `xxxx.ns.cloudflare.com`).
4. HostGator → Gerenciar Domínio `setorize.com` → alterar **Servidores DNS**
   para os dois NS da Cloudflare (substituir `dns3/dns4.hostgator.com.br`).
5. Voltar à Cloudflare → aguardar status **Active** (minutos a algumas horas).
6. Cloudflare → domínio → **Email** → **Email Routing** → Get started / Enable.
7. Adicionar e verificar o **destination address** (seu Gmail pessoal).
8. **Custom addresses** → Create: `ops` → `@setorize.com` → encaminha para o Gmail.
9. Deixar a Cloudflare criar/ajustar MX e TXT sozinha.
10. Teste: de outro e-mail, enviar para `ops@setorize.com` → deve chegar no Gmail
    (às vezes na aba Promoções/Spam na 1ª vez).
11. Com o recebimento ok → criar conta Cloudinary Free **prod** com
    `ops@setorize.com` (não reutilizar o e-mail da conta HML).

**Atenção:** depois que o Email Routing estiver ativo, **não** ative Titan /
e-mail HostGator no mesmo domínio sem trocar os MX — os dois brigam pelo
recebimento.

##### Bug encontrado (2026-08-07) — MX `rota*` vs `route*`

Durante o wizard (UI em PT-BR), a zona ficou com MX:

- `rota1.mx.cloudflare.net` / `rota2…` / `rota3…` (prioridades 7 / 84 / 83)

Esses hostnames **não têm registro A** (não existem). Os oficiais são
`route1.mx.cloudflare.net`, `route2…`, `route3…`. O Email Routing trata
`rota*` como “MX não-Cloudflare” e bloqueia com:

> Existing non-Cloudflare MX records conflict with Email Routing…

**Correção:**

1. DNS → Records → **apagar** os 3 MX `rota1` / `rota2` / `rota3`.
2. Se existirem TXT de SPF/DKIM pela metade do wizard, pode deixar; se o
   Enable falhar de novo, apagar também o TXT `v=spf1 include:_spf.mx…` e o
   DKIM `cf2024-1._domainkey` e deixar o Enable recriar.
3. Email Routing → **Enable** de novo (deve criar `route1/2/3` corretos).
4. Conferir no DNS que o target é **`route`**, não `rota` (inglês).
5. Destination `setorizetorcidas@gmail.com` → alias `ops@setorize.com` → teste.

Registros HostGator legados (`A` → `162.240.81.81`, `mail`/`ftp` CNAME) **não**
causam esse erro; podem ficar até apontar o app para o Railway.

---

### Fase 1 — DNS + Cloudflare (se ainda não feito na 0.5)

Se escolheu Email Routing, a maior parte desta fase já aconteceu. Completar:

1. Nameservers HostGator → Cloudflare (se pendente).
2. Preservar MX/TXT de e-mail (Routing ou Titan) — **nunca** apagar MX ao
   adicionar CNAME do app.
3. Ainda **não** é obrigatório apontar `torcidas`/`homolog` para Railway até
   as Fases 3–4.

**Pronto quando:** domínio Active na Cloudflare; e-mail §0.5 continua ok.

---

### Fase 2 — Railway Staging (homolog) + isolamento de dados

1. No projeto Railway: criar Environment **Staging**.
2. Provisionar **Postgres novo** só no Staging.
3. Duplicar serviço `torcida-web` no Staging (ou habilitar o serviço no env).
4. Configurar deploy: branch `staging` → Environment Staging.
5. Variáveis Staging (mínimo):
   - `DATABASE_URL` (Postgres Staging, interno)
   - `AUTH_SECRET` novo
   - `ROOT_DOMAIN=homolog.setorize.com` (pode esperar DNS; até lá usar domínio
     Railway + sem ROOT_DOMAIN temporariamente)
   - `CLOUDINARY_*` da conta HML
   - OAuth app Homolog (redirects do apex HML)
   - `SUPER_ADMIN_EMAILS`
   - `TENANT_SLUG` vazio quando ROOT_DOMAIN ativo
6. `db:push` + seeds necessários **só** no Staging.
7. Cloudinary: criar cloud/conta HML; apontar vars Staging.
8. Atualizar `DATABASE_URL_RAILWAY` do pacote de **dev** para o proxy do
   Postgres **Staging** (nunca Production). Documentar no vault Dev.
9. Regra de time: scripts destrutivos / volume / jornadas → **só** HML ou local.

**Pronto quando:** URL Railway do Staging sobe login + portal com dados de
teste; Production ainda intacta; local sync aponta para HML.

---

### Fase 3 — Domínio de homolog

1. DNS Cloudflare:

   | Tipo | Nome | Conteúdo | Proxy |
   |------|------|----------|-------|
   | CNAME | `homolog` | host Railway do serviço Staging | Proxied |
   | CNAME | `*.homolog` | mesmo host | Proxied |

2. Railway Staging → Custom Domains: `homolog.setorize.com` + `*.homolog.setorize.com`.
3. SSL Full (strict) no Cloudflare.
4. Env: `ROOT_DOMAIN=homolog.setorize.com`, `AUTH_URL=https://homolog.setorize.com`.
5. OAuth: callbacks  
   `https://homolog.setorize.com/api/auth/callback/discord` e `…/google`.
6. Checklist: login apex HML; `{slug}.homolog.setorize.com`; sessão entre hosts.

**Pronto quando:** checklist §10 de homolog verde.

---

### Fase 4 — Produção no domínio oficial

1. Decidir banco (A/B/C) e executar:
   - Se **B**: criar Postgres Production novo (ou promover env); atual = Staging
     já feito; Production recebe seed limpo / demo oficial.
   - Se **A**: manter Postgres atual em Production; Staging já é clone.
2. DNS Cloudflare:

   | Tipo | Nome | Conteúdo | Proxy |
   |------|------|----------|-------|
   | CNAME | `torcidas` | host Railway **Production** | Proxied |
   | CNAME | `*.torcidas` | mesmo host Production | Proxied |

3. Railway Production → Custom Domains: `torcidas.setorize.com` + `*.torcidas.setorize.com`.
4. Env Production:
   - `ROOT_DOMAIN=torcidas.setorize.com`
   - `AUTH_URL=https://torcidas.setorize.com`
   - `TENANT_SLUG` vazio
   - `CLOUDINARY_*` **prod** (cloud separado)
   - `AUTH_SECRET` **prod** (não reutilizar o de HML)
   - OAuth app Prod com callbacks do apex prod
5. Cache rule Cloudflare para `/_next/static` (`cloudflare-cdn.md`).
6. Redeploy Production.
7. Atualizar redirect URIs OAuth; webhooks PIX se houver.
8. (Opcional) bot Discord só em Production.

**Pronto quando:** checklist §10 de prod verde; HML continua independente.

---

### Fase 5 — Processo e blindagem contínua

- [ ] Fluxo Git: feature → PR → `staging` (homolog) → validar → merge `main` (prod)
- [ ] Proibir `db:push` / seeds volumosos contra Production (checklist humano;
      futuro: script que recusa se `ROOT_DOMAIN` contém `torcidas.setorize`
      sem flag `--i-know-prod`)
- [ ] Remover do pacote de time qualquer DSN de prod; rotacionar secrets velhos
- [ ] Atualizar `ARCHITECTURE.md` item 26 + status Faixa A em
      `plano-investimento-infra.md`
- [ ] Alinhar branding UI “Torcida” → “Sertorize Torcidas” (tarefa separada)
- [ ] Acesso Railway/Cloudflare: só quem opera; 2FA onde existir

**Pronto quando:** time só testa em local/HML; prod só recebe merge de `main`
após homolog ok.

## 9. Pendências operacionais (execução)

- [x] Postgres HML: 2º no Railway (simplicidade)
- [x] Cloudinary: atual = HML; nova conta Free = PROD
- [x] Secrets: KeePassXC + Railway Variables + `*.secrets.env` (sem Bitwarden)
- [x] **Fase 0.5 caminho:** Cloudflare Email Routing ($0)
- [ ] **Fase 0.5:** domínio Active na CF + `ops@setorize.com` recebendo
- [ ] Criar conta Cloudinary Free **prod** com `ops@setorize.com`
- [ ] KeePassXC + `setorize-secrets.kdbx` (opcional)
- [ ] Apps OAuth Discord/Google ×3 (Dev, Homolog, Prod)
- [ ] Environments Railway + domínios `homolog` / `torcidas`

## 10. Checklists de verificação

### Homolog

- [ ] `https://homolog.setorize.com/entrar` login OK
- [ ] Uma torcida em `https://{slug}.homolog.setorize.com/portal/comunidade`
- [ ] Sessão persiste entre apex e subdomínio
- [ ] Upload de imagem cai no Cloudinary **HML** (URL/cloud name diferente de prod)
- [ ] `DATABASE_URL` do Staging ≠ Production (confirmar no painel)
- [ ] Seed/jornada rodado em HML **não** aparece em prod

### Produção

- [ ] `https://torcidas.setorize.com/entrar` login OK
- [ ] `{slug}.torcidas.setorize.com` tema/tenant corretos
- [ ] OAuth só no apex prod
- [ ] Assets `/_next/static` com `cf-cache-status: HIT` (2ª carga)
- [ ] Nenhuma variável de HML colada em Production
- [ ] Pacote de time **sem** DSN/API de prod

### Segurança

- [ ] `.env*` e dumps fora do git (`git status` limpo desses arquivos)
- [ ] Secrets rotacionados pós-cutover se já foram expostos
- [ ] Super-admin emails corretos por ambiente
- [ ] Sync local (`DATABASE_URL_RAILWAY`) → só HML

## 11. Ordem resumida (uma página)

```text
0.   Decisões fechadas
0.5  E-mail @setorize.com (ops@) — Cloudflare Routing $0 OU Titan HostGator
1.   Cloudflare Active (se ainda não na 0.5); preservar MX
2.   Conta Cloudinary PROD com ops@setorize.com
3.   Railway Staging + Postgres HML (= atual) + Cloudinary HML
4.   DNS homolog + OAuth HML
5.   Postgres PROD novo + DNS torcidas.* + Cloudinary/OAuth prod
6.   Git staging→main + KeePassXC/secrets + docs
```

## 12. Fora de escopo deste plano

- Site institucional em `setorize.com` (landing da empresa)
- Renome UI completo Torcida → Sertorize
- Neon/Vercel, Faixa B+ de investimento
- Isolamento `Tenant.databaseUrl` por torcida (mecanismo existe, não é
  necessário para HML/prod)
- LGPD exclusão de conta (já pendente no super-admin)

## Referências

- `docs/ops/deploy-multi-tenant.md`
- `docs/ops/cloudflare-cdn.md`
- `docs/ops/dev-secrets.md`
- `docs/ops/postgres-local-dev.md`
- `docs/ops/plano-investimento-infra.md`
- `ARCHITECTURE.md` §2.5, item 26
