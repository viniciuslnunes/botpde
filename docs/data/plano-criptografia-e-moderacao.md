# Plano — Criptografia, restrição de conteúdo e moderação

> Decisão de produto/arquitetura (2026-08-07). **Não implementar** fases B/C
> neste documento — só o contrato para retomar o assunto com o mesmo contexto.
> Decisão fechada em `ARCHITECTURE.md` §5.23.

## Problema

Queremos restringir o conteúdo de conversas e canais a quem de fato é membro
(e a papéis de oversight da plataforma), **e** precisamos continuar moderando
conteúdo grave: racismo, abuso infantil (CSAM), pornografia e correlatos.

Esses dois objetivos **não cabem no mesmo desenho chamado “E2EE”**:

| Objetivo | Implicação |
|---|---|
| E2EE estrito (servidor cego) | Plataforma e super-admin **não** leem o texto; moderação automática/humana no server some |
| Moderação de conteúdo ilegal/nocivo | Alguém (app, SA, modelo futuro) precisa ver ou classificar o material |

**“E2EE + super-admin ainda lê” não é ponta a ponta** — é criptografia com
escrow / chave privilegiada. Documentamos os nomes certos para não vender nem
implementar a coisa errada.

## Estado atual (as-is)

- Posts, comentários, `MensagemDireta`, previews de notificação e mídia
  (URLs Cloudinary) ficam em **claro** no Postgres.
- Restrição real = **ACL**: `MembroConversa`, visibilidade de post/canal,
  isolamento R5, RBAC de moderação (`community:moderate` / `messages:moderate`),
  allowlist de super-admin.
- Filas: `/admin/comunidade/moderacao` (tenant) e `/super-admin/moderacao`
  (cross-tenant). Em DM, a fila SA já **minimiza** exposição do texto; posts
  denunciados ainda mostram `conteudo` em claro (necessário à deliberação).
- Busca (`pg_trgm`), hashtags, fan-out de feed, RSC e preview de inbox
  dependem de plaintext no servidor.
- Não há campos `ciphertext` / key management no schema; TLS + (eventual)
  encryption at rest do provedor não equivalem a E2EE.

## Decisão (2026-08-07)

**Seguir a Fase A agora.** Não implementar E2EE nem envelope encryption
enquanto o produto e a moderação humana ainda são a rede de segurança
principal. Não prometer “criptografia de ponta a ponta” em marketing ou
docs de usuário até existir uma fase que mereça esse nome.

Prioridade imediata de segurança de conteúdo:

1. ACL + denúncia + filas de moderação funcionando de ponta a ponta.
2. Categorias/graves tratadas com política clara (CSAM, abuso, pornografia,
   ódio/racismo).
3. Acesso de super-admin **auditado** e com least privilege operacional
   (já há `AuditLog` com `viaSuperAdmin` nas ações espelhadas).
4. Hardening de ops (segredos, ambientes, acesso ao banco) — ver
   `docs/ops/plano-ambientes-e-dominio.md` e `docs/ops/dev-secrets.md`.

Fases B e C ficam **explicitamente futuras**.

## Superfícies — o que cada uma pode ser

| Superfície | Fase A (agora) | Fase B (futuro) | Fase C (futuro, opcional) |
|---|---|---|---|
| Feed / posts / comentários / canais institucionais | Plaintext + ACL + moderação | Opcional: encryption **at rest** / envelope com chave da plataforma (moderação continua) | **Fora de escopo** de E2EE — busca, mural, institucional e moderação exigem servidor legível |
| Chat de canal / grupo com mural | Idem | Idem | Idem |
| DM (`MensagemDireta` tipo `DIRETA`) | Plaintext + ACL + denúncia | Envelope com chave da plataforma + escrow de safety | E2EE real **só se** moderação sem plaintext no server estiver resolvida (denúncia com anexo, scan no client, ação cega) |
| Mídia (Cloudinary) | URLs em claro | Avaliar blob cifrado + chave alinhada à fase da mensagem | No E2EE: cifrar no client antes do upload |

Canais da Comunidade **nunca** entram em E2EE no plano atual: o módulo
(feed, busca, `visibilidadeCanal`, moderação, bypass de leitura do SA) é
desenhado para o servidor ler e servir o conteúdo. Restrição = membership +
visibilidade + R5, não cegueira criptográfica.

## Fases

### Fase A — Privacidade operacional + oversight (atual / compromisso)

**Objetivo:** restringir por autorização; manter capacidade de deliberar
conteúdo grave; não fingir E2EE.

**Inclui (já em grande parte entregue; reforçar com política, não com crypto):**

- Gates de leitura/escrita existentes (`assertMembroConversa`,
  `podeVerCanal`, visibilidade de post, `avaliarAcessoDm`, R5).
- Denúncia de post/mensagem → filas tenant e plataforma.
- Soft-delete / ocultar sem exigir “servidor cego”.
- Export LGPD de posts ainda com `conteudo` no servidor (portabilidade).
- Documentação desta decisão (este arquivo + `ARCHITECTURE.md` §5.23).

**Não inclui:** cifrar `conteudo` no banco; key sync multi-device; mudar
preview de notificação para ciphertext.

**Critério para sair da Fase A:** completar o gate
[Pré-requisitos para abrir a Fase B](#pré-requisitos-para-abrir-a-fase-b)
abaixo — não “quando alguém pedir E2EE”.

### Fase B — Envelope / at-rest com chave da plataforma

**Objetivo:** dump bruto do Postgres e insider de ops com acesso só ao disco
não entregam texto legível; **app, moderação e SA de safety ainda desencriptam**.

Características (visão; detalhar só depois do gate):

- Envelope encryption (DEK por mensagem ou por conversa + KEK no KMS).
- Papel de safety / super-admin com acesso auditado à chave — **escrow
  explícito**, não “membro fantasma de todo canal”.
- Moderação humana e futuro classificador **continuam no server**.
- Busca full-text em plaintext no Postgres **quebra** ou exige índice
  separado / busca só em metadados — **decisão obrigatória no gate**
  (provável: DM sem busca server-side; feed/canais podem permanecer em claro).

Isto **não** deve ser chamado de E2EE em UI nem em docs externos.

### Fase C — E2EE real em DM (opcional, alto custo)

**Objetivo:** nem servidor nem SA leem o texto da DM em operação normal.

Só avançar se:

1. Fase A (e preferencialmente B) estiver madura.
2. Houver desenho de **moderação sem plaintext no server**:
   - denúncia envia trecho/anexo pelo cliente do denunciante; e/ou
   - matching de hashes conhecidos (CSAM) no client antes do envio; e/ou
   - ações cegas (ban, soft-delete por id) para SA.
3. Aceitar perda/degradação: preview server-side, busca no server, parse
   rico de embeds no server, multi-device com sync de chaves, complexidade
   no client (hoje Next RSC-first).

Canais/feed **permanecem fora** desta fase.

## Pré-requisitos para abrir a Fase B

Gate fechável. **Abrir a Fase B = engenharia de envelope/KMS** só depois
de todos os itens marcados `[x]` **ou** explicitamente adiados com dono +
data + risco aceito (não deixar checkbox vazio “porque depois a gente vê”).

Marque o status no próprio doc quando avançar (`[ ]` → `[x]`). Itens já
parcialmente cobertos pelo as-is estão anotados.

### 1. Produto / jurídico / safety (política escrita)

| # | Item | Status | Nota as-is |
|---|---|---|---|
| P1 | Documento interno de **política de conteúdo** (proibido: CSAM, abuso sexual de menor, pornografia não consentida / exploração, ódio/racismo, etc.) e o que acontece em cada classe (ocultar, ban, retenção, reportar autoridade) | [x] | **`docs/data/politica-de-conteudo.md` (2026-09-01)** — taxonomia com 30 categorias, escala S0–S4, matriz de resposta, strikes |
| P2 | Papel do **super-admin vs moderador de tenant**: o que cada um pode ver em claro, em que fila, e quando a plataforma assume o caso | [x] | Escrito em `politica-de-conteudo.md` §5 — S4 é sempre da plataforma, com exposição minimizada ao moderador local |
| P3 | **Retenção** de conteúdo denunciado / removido (quanto tempo o plaintext/ciphertext+chave fica disponível para safety e para LGPD) | [~] | Desenho pronto (`ConteudoPreservado.expiraEm`, padrão 180 d, leitura auditada); **prazo ainda precisa de aval jurídico** |
| P4 | Fluxo **CSAM**: quem é acionado, o que se preserva, o que se apaga, se há obrigação de report externo — validado com assessoria jurídica (não improvisar na eng) | [~] | Fluxo técnico escrito em `politica-de-conteudo.md` §4 (preservar → escalar → comunicar). 🔴 **Destinatário formal e prazo continuam pendentes de assessoria** — é o bloqueio real |
| P5 | Texto de produto/ToS/privacidade **não** promete E2EE; se mencionar criptografia, usa “proteção at-rest / da plataforma” alinhado à Fase B | [ ] | Evitar marketing mentiroso antes do ship |

### 2. Moderação no produto (funcional, ainda em plaintext)

| # | Item | Status | Nota as-is |
|---|---|---|---|
| M1 | Denúncia de **post** e de **mensagem** com caminho ponta a ponta testado (criar → fila tenant → resolver/descartar; caminho SA) | [ ] | Fluxo existe; falta checklist de aceite / audit de regressão explícito para o gate |
| M2 | **Categorias estruturadas** de denúncia (não só `motivo` String livre) cobrindo no mínimo: ódio/racismo, pornografia/sexual, abuso infantil/CSAM, assédio, outro — com prioridade/SLA na UI da fila | [~] | **Especificado** em `docs/data/modulo-moderacao.md` (Fase 1, item 2) com `CategoriaViolacao` + SLA por gravidade. Ainda não implementado |
| M3 | Triagem: denúncias da classe CSAM / abuso infantil **sobem** para fila plataforma (ou flag imediata) e não ficam só no moderador local sem alerta | [~] | **Especificado** — escalonamento automático de S4 (`ModeracaoCaso.escalado`), com auditoria `audit:moderacao`. Ainda não implementado |
| M4 | `AuditLog` de resolução SA revisado: dá para responder “quem viu/agiu em quê” nas ações de moderação (`viaSuperAdmin` já grava nas actions) | [~] | Lacuna confirmada: hoje só se registra **mutação**, não leitura. `AcessoPreservadoLog` cobre a leitura de material sensível (spec Fase 1) |
| M5 | Decisão explícita: na Fase B a moderação **continua desencriptando no server** (escrow). Sem isso, não é B — é C | [x] | Já decidido neste plano |

### 3. Ops / acesso ao dado em claro

| # | Item | Status | Nota as-is |
|---|---|---|---|
| O1 | Ambientes e segredos alinhados ao plano de ops (`docs/ops/plano-ambientes-e-dominio.md`, `docs/ops/dev-secrets.md`): quem tem `DATABASE_URL` de prod, rotação, sem credencial de prod em laptop sem necessidade | [ ] | Plano de ambientes em curso; fechar o que for pré-requisito de “dump não é o único risco” |
| O2 | Least privilege: acesso direto ao Postgres de produção restrito; preferir app + SA auditado para safety | [ ] | Depende do provedor (Railway) e do time |
| O3 | Backup/restore: saber se restore de snapshot **reexpõe** plaintext legado após B (plano de migração / re-encrypt) | [ ] | Só relevante ao desenhar B; listar agora evita surpresa |

### 4. Escopo da Fase B (decidir antes de codar)

| # | Decisão | Opções sugeridas | Status |
|---|---|---|---|
| S1 | **O que cifra na B?** | (a) só `MensagemDireta` tipo `DIRETA`; (b) DM + chat de grupo sem mural; (c) também posts — **desencorajado** | [ ] default recomendado: **(a)** |
| S2 | **Feed / canais / comentários** | Permanecem plaintext + ACL na B | [x] recomendado neste plano |
| S3 | **Busca em DM** | (a) sem busca server-side no corpo; (b) índice derivado; (c) só metadados | [ ] |
| S4 | **Preview inbox / `Notificacao.corpo`** | (a) preview cifrado só no client após decrypt no server da app; (b) preview genérico (“Nova mensagem”) sem trecho; (c) trecho só em memória após decrypt no request | [ ] |
| S5 | **Mídia (Cloudinary)** | (a) fora da B (URLs em claro); (b) blob cifrado na mesma onda que DM | [ ] default recomendado: **(a)** na primeira onda |
| S6 | **Dados legados** | (a) re-encrypt batch; (b) dual-read (claro até tocar); (c) só mensagens novas | [ ] |

### 5. Desenho técnico mínimo (spec de eng — ainda sem implementar)

Antes do primeiro PR de crypto, um doc curto (pode ser seção neste arquivo ou ADR) com:

| # | Item | Status |
|---|---|---|
| T1 | Escolha de **KMS / onde mora a KEK** (env, Vault, KMS cloud, Railway secret) e rotação | [ ] |
| T2 | Granularidade da **DEK** (por mensagem vs por conversa) e onde grava `keyId` / ciphertext no schema | [ ] |
| T3 | **Quem desencripta**: só layer da app (Server Actions / route handlers); jobs, scripts de seed e `audit:*` não leem corpo sem helper explícito | [ ] |
| T4 | **Escrow / safety**: como o SA desencripta na fila (mesmo KEK, role flag, audit de decrypt) — nunca “virar membro” da conversa | [ ] |
| T5 | Compat com **SSE/polling**: payload pode continuar id; corpo só após decrypt no server da sessão autorizada | [ ] |
| T6 | Plano de **teste**: unit do envelope; audit de que dump SQL sem KEK não revela texto; regressão de denúncia/moderação com ciphertext | [ ] |
| T7 | Capacidade do time / janela: B não começa no meio de outra onda crítica sem dono | [ ] |

### 6. Como declarar a Fase B aberta

1. Revisar as tabelas 1–5 neste arquivo (checkboxes).
2. Registrar no **Histórico** abaixo: data, escopo escolhido (S1–S6), link do ADR/spec T1–T6.
3. Atualizar `ARCHITECTURE.md` §5.23 com uma linha “Fase B aberta em AAAA-MM-DD — escopo: …”.
4. Só então abrir PRs de schema/helpers de envelope.

**Não abrir B** se P1/P4 (política + CSAM) ou M2/M3 (categoria + escalonamento) estiverem vazios sem aceite formal de risco — envelope sem rede de safety piora o cenário (dado ilegível no dump **e** processo de abuso frágil).

## Conteúdo grave — postura por fase

| Tipo | Fase A–B | Fase C (DM only) |
|---|---|---|
| Racismo / ódio / pornografia | Denúncia + leitura humana (e depois ML) no server | Denúncia com material anexado ou scan client; sem inspeção rotineira do ciphertext |
| CSAM / abuso infantil | Remoção + retenção mínima para reportar às autoridades conforme política jurídica; **não** adotar E2EE que impeça detecção sem plano substituto | Exigir mecanismo client-side / hash DB **antes** de cegar o server |

Moderação de conteúdo na Comunidade também tem lastro em risco jurídico da
torcida (incitação / discriminação) — ver `docs/knowledge/contexto-legal.md`
(banimento coletivo / LGE). Isso reforça **não** cegar feed/canais.

## O que E2EE quebraria no monorepo (lembrete)

- `pg_trgm` / busca em `Post.conteudo` e correlatos
- Preview inbox + `Notificacao.corpo`
- Moderação tenant e deliberação SA em posts
- Hashtags / menções extraídas no server
- Cards de feed montados em RSC a partir de plaintext
- Validação Zod / embeds que inspecionam texto e URLs
- Export LGPD “do servidor” do corpo das DMs

Fan-out (`FeedTimeline` só com ids) em si é compatível; o problema é a
**leitura** do card, não o índice de timeline.

## Vocabulário (usar nos PRs futuros)

| Termo | Significado neste repo |
|---|---|
| **ACL / restrição** | Só membros (e papéis autorizados) leem via autorização |
| **Encryption at rest / envelope** | Ciphertext no disco; plataforma ainda desencripta (Fase B) |
| **E2EE** | Só endpoints dos participantes desencriptam; servidor cego (Fase C) |
| **Escrow / safety key** | Exceção controlada de leitura — **não** é E2EE |

## Referências de código

- Schema: `Conversa`, `MembroConversa`, `MensagemDireta`, `Post`, `Comentario`,
  `Denuncia`, `DenunciaMensagem` em `packages/db/prisma/schema.prisma`
- Mensageria: `apps/web/src/lib/mensageria.ts`, `mensageria-api.ts`,
  `mensageria-bus.ts`
- Canais / feed: `lib/canais.ts`, `lib/feed.ts`, `lib/comunidade-busca.ts`
- Moderação: `apps/web/src/app/admin/comunidade/moderacao/`,
  `apps/web/src/app/super-admin/moderacao/`
- Specs: `docs/data/modulo-comunidade.md`, `docs/data/modulo-super-admin.md`,
  `docs/data/modulo-canal-restrito.md`

## Histórico

| Data | Evento |
|---|---|
| 2026-08-07 | Análise; decisão de permanecer na Fase A; fases B/C documentadas para retomada |
| 2026-08-07 | Gate “Pré-requisitos para abrir a Fase B” (checklists P/M/O/S/T) adicionado |
| 2026-09-01 | Pesquisa de moderação (STF Tema 987, ECA Digital, benchmark de plataformas) → **P1 e P2 fechados**; P3/P4/M2/M3/M4 saem de vazio para especificados. Docs novos: `docs/knowledge/moderacao-plataformas.md`, `docs/data/politica-de-conteudo.md`, `docs/data/modulo-moderacao.md`; decisão em `ARCHITECTURE.md` §5.33. **Fase A segue** — nada aqui abre a Fase B |
