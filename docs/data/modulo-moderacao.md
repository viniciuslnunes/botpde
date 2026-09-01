# Módulo — Moderação de conteúdo (Trust & Safety)

> Spec do módulo. Política normativa: `docs/data/politica-de-conteudo.md`.
> Pesquisa e benchmark: `docs/knowledge/moderacao-plataformas.md`.
> Decisão de arquitetura: `ARCHITECTURE.md` §5.33.
> Substitui a moderação reativa atual descrita em
> `docs/data/plano-criptografia-e-moderacao.md` (Fase A) — não a contradiz:
> continua sem E2EE, e agora com o processo que a Fase A prometia.

---

## 1. As-is — o que existe hoje (2026-09-01)

| Peça | Estado |
|---|---|
| Denúncia de post | `Denuncia` — `motivo` **String livre**, sem categoria |
| Denúncia de mensagem | `DenunciaMensagem` — idem |
| Denúncia no brechó | `DenunciaBrecho` — idem, com atendente |
| Fila do tenant | `/admin/comunidade/moderacao` (`community:moderate` / `messages:moderate`) |
| Fila da plataforma | `/super-admin/moderacao` (allowlist) |
| Ações possíveis | **Duas**: resolver (`Post.oculto = true` / `MensagemDireta.removidaEm`) ou descartar |
| Auditoria | `AuditLog` nas 4 ações; `viaSuperAdmin` na fila SA |
| Notificação | Denunciante avisado do desfecho |
| Classificação automática | **Nenhuma** |
| Sanção ao autor | **Nenhuma** — o autor nem é notificado |
| Recurso | **Nenhum** |
| Preservação de prova | **Nenhuma** — resolver só oculta |
| Transparência | **Nenhuma** |

### 1.1 Lacunas medidas

1. **Zero classificação no write path.** Nenhum grep encontra blocklist,
   classificador ou filtro em `apps/web/src` — conteúdo entra cru. Isso é
   incompatível com o **dever de cuidado** do STF (Tema 987), que exige atuação
   proativa em discriminação/discurso de ódio, sem esperar denúncia.
2. **Motivo é texto livre.** Impossível priorizar por gravidade, rotear CSAM
   para a plataforma, medir prevalência ou produzir relatório.
3. **Superfícies sem caminho de denúncia** — as três com denúncia são Post, DM e
   brechó. Ficam descobertas: `Comentario`, `ForumTopico`, `ForumResposta`,
   `PracaComentario`, `MomentoStory`, `MemoriaFato`, `Announcement`, `Evento`,
   nome/bio de `User`/`PerfilTorcedor`/`PerfilMembro`, nomes de grupo/canal/sala.
   **O fórum da praça é o mais grave**: é a única superfície *cross-tenant*,
   onde torcidas rivais se encontram — exatamente o vetor de conflito — e não
   tem botão de denúncia.
4. **Autor nunca é notificado.** Viola o pilar *Notice* (Santa Clara) e o devido
   processo exigido pela tese do STF.
5. **Sem recurso.** Pilar *Appeal*.
6. **Resolver = ocultar, sempre.** Sem "reduzir alcance", sem "informar", sem
   reter para revisão. Moderador escolhe entre censurar e ignorar.
7. **Sem preservação de prova.** Ocultar não guarda snapshot. Em caso S4, o
   ECA Digital exige preservar conteúdo e metadados — hoje perderíamos a prova.
8. **Sem reincidência.** Quem posta racismo 10 vezes tem 10 posts ocultos e
   nenhuma consequência.

---

## 2. Arquitetura alvo

### 2.1 Princípio estrutural: rotular ≠ decidir

Emprestado do modelo componível do Bluesky. O pipeline nunca "remove"; ele
**produz sinal**. Uma camada de política — configurável por tenant, dentro do
piso da plataforma — decide o que fazer com o sinal.

```
                      ┌──────────────────────────────────────┐
  publicação  ──────▶ │ 1. Gate barato (síncrono, <5ms)      │
  (Server Action)     │    rate-limit · listas · normalização│
                      │    Confiança (nível do autor)        │
                      └───────────────┬──────────────────────┘
                                      │  suspeito ou autor novo?
                        não ──────────┼────────── sim
                         │            ▼
                         │   ┌──────────────────────────────┐
                         │   │ 2. Classificador (Haiku)     │
                         │   │    política no prompt        │
                         │   │    saída estruturada         │
                         │   └───────────┬──────────────────┘
                         │               ▼
                         │      ConteudoSinal (rótulo + score + categoria)
                         │               │
                         ▼               ▼
                      ┌──────────────────────────────────────┐
                      │ 3. Política do tenant                │
                      │    S4→bloqueia+preserva+escala       │
                      │    S3→bloqueia+fila+strike           │
                      │    S2→retém OU reduz alcance         │
                      │    S1→publica com aviso              │
                      └───────────────┬──────────────────────┘
                                      ▼
                      ┌──────────────────────────────────────┐
                      │ 4. Fila + decisão humana + recurso   │
                      │    notificação ao autor · AuditLog   │
                      └──────────────────────────────────────┘
                                      ▼
                      ┌──────────────────────────────────────┐
                      │ 5. Retaguarda (assíncrona, Batch)    │
                      │    varredura de autor · agregação    │
                      │    métricas · transparência          │
                      └──────────────────────────────────────┘
```

### 2.2 Camada 1 — gate barato (síncrono)

Nada de LLM aqui: é o caminho quente de publicação. Custo alvo < 5 ms.

- **Normalização anti-evasão** — minúsculas, remoção de diacríticos,
  desfazer leet (`4→a`, `3→e`, `1→i`, `0→o`, `$→s`), colapsar repetição
  (`maaacaco`), remover separadores internos (`m.a.c.a.c.o`, `m a c a c o`).
  Função pura em `packages/types/src/moderacao.js` — testável sem banco.
  **Nunca** decidir só por esta camada em categoria S3+ (falso positivo do tipo
  *Scunthorpe* é certo); ela **encaminha ao classificador**, não pune.
- **Listas de termos** — duas: a da plataforma (piso, versionada no repo,
  só termos inequívocos de S3/S4) e a do tenant (aditiva, gerida em
  `/admin/moderacao/regras`, limite de 1.000 termos — teto do Discord AutoMod).
- **Rate-limit e anti-flood** — reusar `lib/rate-limit.ts` e
  `engagement-rate-limit.ts`; limitar menções únicas por conteúdo (anti-brigada).
- **Nível de Confiança do autor** — o gate do Reddit. Autor nível 0/1 no tenant
  tem conteúdo **encaminhado ao classificador sempre**; nível 2+ só quando
  alguma lista/heurística acender. Isso corta o custo de LLM ao volume de
  gente nova, que é onde o risco mora.

### 2.3 Camada 2 — classificador

`claude-haiku-4-5`, chamado de `apps/web/src/lib/moderacao/classificador.ts`.

- **System prompt** = §2 da `politica-de-conteudo.md` renderizada, com
  `cache_control: { type: 'ephemeral' }`. Prefixo estável → leitura cacheada a
  ~0,1× do preço. **A política vem antes do conteúdo**, sempre, senão o cache
  não pega.
- **Saída estruturada** via `output_config.format` — nunca parsear texto livre:
  `{ categoria, gravidade, confianca, trecho, justificativa }`.
- `max_tokens: 256`. Sem thinking (é classificação).
- **Degradação graciosa obrigatória**: se a API falhar ou estourar timeout
  (500 ms), o conteúdo segue o caminho configurado em
  `PoliticaModeracaoTenant.aoFalhar` — `PUBLICAR` (padrão) ou `RETER`. Nunca
  derrubar a publicação por erro de fornecedor. Gate `isModeracaoIAConfigurada()`
  no mesmo padrão de `lib/livekit.ts`.
- **Batch API** (metade do preço) para a varredura de retaguarda (camada 5) e
  para o backfill do acervo existente.

Estimativa de custo com a política cacheada: **≈ US$ 0,65 / 1.000 conteúdos**
no caminho síncrono; ≈ US$ 0,33 / 1.000 em batch. Detalhe em
`docs/knowledge/moderacao-plataformas.md` §3.

**Mídia** não passa pelo classificador de texto: entra pelos add-ons do
Cloudinary (AWS Rekognition ou Google SafeSearch) no próprio upload, que já é
nosso pipeline. `moderation_status` do Cloudinary vira `ConteudoSinal` do mesmo
jeito que o rótulo de texto.

### 2.4 Camada 3 — política por tenant

`PoliticaModeracaoTenant` guarda sensibilidade por categoria (0–4, calibração
tipo Twitch AutoMod) e a ação padrão por classe. Duas invariantes duras,
validadas no servidor:

1. **S4 e S3 são piso da plataforma** — o tenant só pode endurecer. Tentativa de
   afrouxar é rejeitada, não silenciosamente ignorada.
2. **A decisão de S4 nunca é do tenant.** Escalonamento é automático.

### 2.5 Camada 4 — fila, decisão, recurso

- Fila do tenant em `/admin/moderacao` (módulo próprio com tabs, conforme o kit
  de `docs/frontend/admin-ui-kit.md`): **Pendentes · Retidos · Denúncias ·
  Sanções · Recursos · Transparência**.
- Ordenação por gravidade e SLA, não por data. Item vencendo SLA sobe.
- Ações: **Remover · Reduzir alcance · Informar (rótulo) · Liberar** — a tríade
  da Meta mais a liberação.
- Toda decisão: `AuditLog` + notificação ao autor com categoria, trecho e link
  de recurso + notificação ao denunciante.
- **Recurso** (`RecursoModeracao`): prazo de 30 dias, **revisor ≠ decisor**
  (validado no servidor), 2ª instância na plataforma.

### 2.6 Camada 5 — retaguarda

- Varredura assíncrona por **janela de autor** (padrão Roblox Sentinel): agrega
  os sinais recentes do mesmo autor no mesmo tenant e detecta padrão que a
  mensagem isolada não mostra — assédio distribuído, aliciamento, brigada.
- Recalcula strikes e vencimentos.
- Alimenta as métricas e o relatório de transparência.

---

## 3. Modelo de dados (proposta)

Sete modelos novos + dois enums. Nenhuma alteração destrutiva nos existentes;
`Denuncia`/`DenunciaMensagem`/`DenunciaBrecho` **ganham** `categoria` e passam a
apontar para `ModeracaoCaso` (migração em §6).

```prisma
/// Rótulo produzido por classificador, lista ou denúncia. Append-only.
/// NÃO decide nada — é insumo da política. (Bluesky: label != action.)
model ConteudoSinal {
  id           String   @id @default(uuid())
  tenantId     String?  @map("tenant_id")   // null = superfície global (praça/fórum)
  alvoTipo     AlvoModeracao
  alvoId       String   @map("alvo_id")
  autorId      String?  @map("autor_id")
  categoria    CategoriaViolacao
  gravidade    GravidadeViolacao
  confianca    Float                        // 0..1
  origem       OrigemSinal                  // CLASSIFICADOR | LISTA | DENUNCIA | HUMANO | MIDIA
  trecho       String?                      // evidência mínima; nunca o conteúdo inteiro
  detalhes     Json?
  criadoEm     DateTime @default(now()) @map("criado_em")

  @@index([tenantId, gravidade, criadoEm])
  @@index([alvoTipo, alvoId])
  @@index([autorId, criadoEm])
  @@map("saas_moderacao_sinais")
}

/// Unidade de trabalho da fila. Agrega N sinais sobre o mesmo alvo.
model ModeracaoCaso {
  id            String   @id @default(uuid())
  tenantId      String?  @map("tenant_id")
  alvoTipo      AlvoModeracao
  alvoId        String   @map("alvo_id")
  autorId       String?  @map("autor_id")
  categoria     CategoriaViolacao
  gravidade     GravidadeViolacao
  status        StatusCaso @default(PENDENTE)  // PENDENTE|RETIDO|DECIDIDO|ESCALADO
  acao          AcaoModeracao?                  // REMOVER|REDUZIR|INFORMAR|LIBERAR
  decisorId     String?  @map("decisor_id")
  decididoEm    DateTime? @map("decidido_em")
  justificativa String?
  prazoSla      DateTime @map("prazo_sla")
  escalado      Boolean  @default(false)
  criadoEm      DateTime @default(now()) @map("criado_em")

  @@index([tenantId, status, gravidade, prazoSla])
  @@index([alvoTipo, alvoId])
  @@map("saas_moderacao_casos")
}

/// Snapshot imutável para prova. Gravado ANTES de qualquer remoção (ECA Digital).
model ConteudoPreservado {
  id          String   @id @default(uuid())
  casoId      String   @map("caso_id")
  conteudo    String                       // texto no momento da ação
  midiaUrls   String[] @default([]) @map("midia_urls")
  metadados   Json                         // autor, destinatários, timestamps, userAgent
  hash        String                       // sha256 do conteúdo canônico
  expiraEm    DateTime @map("expira_em")   // 180 dias por padrão
  criadoEm    DateTime @default(now()) @map("criado_em")

  @@index([casoId])
  @@map("saas_moderacao_preservados")
}

/// Leitura de material preservado é auditada (o AuditLog atual só grava mutação).
model AcessoPreservadoLog {
  id           String   @id @default(uuid())
  preservadoId String   @map("preservado_id")
  atorId       String   @map("ator_id")
  motivo       String
  criadoEm     DateTime @default(now()) @map("criado_em")

  @@index([preservadoId, criadoEm])
  @@map("saas_moderacao_acessos")
}

/// Strike/sanção por pessoa e tenant. Expira (TikTok: 90 dias).
model SancaoUsuario {
  id         String   @id @default(uuid())
  tenantId   String   @map("tenant_id")
  userId     String   @map("user_id")
  casoId     String?  @map("caso_id")
  tipo       TipoSancao          // AVISO|STRIKE|RESTRICAO_PUBLICACAO|SUSPENSAO|BANIMENTO
  categoria  CategoriaViolacao
  pontos     Int      @default(0)
  inicioEm   DateTime @default(now()) @map("inicio_em")
  expiraEm   DateTime? @map("expira_em")
  revogadaEm DateTime? @map("revogada_em")   // recurso provido revoga, não apaga

  @@index([tenantId, userId, expiraEm])
  @@map("saas_moderacao_sancoes")
}

/// Devido processo: recurso do autor. Revisor != decisor (validado no servidor).
model RecursoModeracao {
  id          String   @id @default(uuid())
  casoId      String   @map("caso_id")
  autorId     String   @map("autor_id")
  texto       String
  status      StatusRecurso @default(PENDENTE)  // PENDENTE|PROVIDO|NEGADO
  instancia   Int      @default(1)              // 1=tenant, 2=plataforma
  revisorId   String?  @map("revisor_id")
  revisadoEm  DateTime? @map("revisado_em")
  resposta    String?
  criadoEm    DateTime @default(now()) @map("criado_em")

  @@index([casoId])
  @@index([status, criadoEm])
  @@map("saas_moderacao_recursos")
}

/// Calibração por tenant. Só endurece o piso da plataforma.
model PoliticaModeracaoTenant {
  id             String   @id @default(uuid())
  tenantId       String   @unique @map("tenant_id")
  sensibilidade  Json                            // { CATEGORIA: 0..4 }
  termosProprios String[] @default([]) @map("termos_proprios")
  aoFalhar       String   @default("PUBLICAR")   // PUBLICAR | RETER
  atualizadoEm   DateTime @updatedAt @map("atualizado_em")

  @@map("saas_moderacao_politica")
}
```

`AlvoModeracao` cobre **todas** as superfícies: `POST`, `COMENTARIO`,
`MENSAGEM`, `FORUM_TOPICO`, `FORUM_RESPOSTA`, `PRACA_COMENTARIO`, `STORY`,
`MEMORIA_FATO`, `BRECHO_ANUNCIO`, `BRECHO_LOJA`, `COMUNICADO`, `EVENTO`,
`PERFIL`, `GRUPO`, `CANAL`, `SALA`.

Regra de projeto: **um alvo novo no produto exige uma entrada no enum** — é o
que impede a superfície nova nascer sem denúncia, como aconteceu com o fórum.

---

## 4. Permissões (novas)

```js
MODERATION_VIEW:    'moderation:view',     // ver fila e casos, sem decidir
MODERATION_ACT:     'moderation:act',      // decidir S1–S3
MODERATION_APPEAL:  'moderation:appeal',   // julgar recurso (1ª instância)
MODERATION_POLICY:  'moderation:policy',   // calibrar sensibilidade e termos
```

`community:moderate` e `messages:moderate` **continuam existindo** e passam a
implicar `moderation:view` + `moderation:act` no escopo delas (via
`PERMISSOES_QUE_HERDAM_VIEW`, como já se faz na Comunidade). Sem quebra de
compatibilidade para quem já modera.

`moderation:appeal` é separada de propósito: é ela que permite validar
**revisor ≠ decisor** sem depender de cargo.

S4 não tem permissão de tenant — é allowlist de super-admin.

---

## 5. Fases de entrega

Ordem escolhida por **exposição jurídica**, não por facilidade.

### Fase 1 — Fundação e devido processo (sem IA ainda)

Fecha as lacunas 2, 3, 4, 5, 6, 7 — as que não dependem de fornecedor nenhum.

1. Enums + `ConteudoSinal`, `ModeracaoCaso`, `ConteudoPreservado`,
   `AcessoPreservadoLog`, `SancaoUsuario`, `RecursoModeracao`.
2. **Categoria estruturada na denúncia** (substitui `motivo` livre; mantém campo
   de texto como complemento) + roteamento por gravidade: S4 escala sozinho.
3. **Botão de denúncia em todas as superfícies** do enum — prioridade absoluta
   para **fórum/praça**, hoje sem caminho nenhum e cross-tenant.
4. Fila `/admin/moderacao` com as 4 ações (remover/reduzir/informar/liberar),
   ordenada por SLA.
5. **Notificação ao autor** (`MODERACAO_ACAO`) + **recurso**
   (`MODERACAO_RECURSO_*`) com revisor ≠ decisor.
6. **Preservação antes de remover** em S3/S4.
7. Strikes com expiração.
8. Publicar `politica-de-conteudo.md` como Termos/Diretrizes no produto.

### Fase 2 — Classificação automática

9. `lib/moderacao/classificador.ts` com Haiku + política cacheada + saída
   estruturada + degradação graciosa.
10. Gate barato: normalização anti-evasão, listas, AND com **Confiança**.
11. `PoliticaModeracaoTenant` + `/admin/moderacao/regras`.
12. Mídia via add-on do Cloudinary.
13. Atrito no compositor para borderline (com teto de frequência).

### Fase 3 — Inteligência e prestação de contas

14. Varredura por janela de autor (agregação estilo Sentinel).
15. Detecção de fuga de sanção e de brigada coordenada.
16. Painel de métricas: prevalência, tempo de ação, **taxa de reforma**,
    falso-positivo por categoria.
17. Relatório de transparência semestral em `/admin/moderacao/transparencia`.
18. Backfill do acervo existente via Batch API.

### Fase 4 — Menores (ECA Digital) 🔴

19. Aferição de idade proporcional ao porte; conta de menor de 16 vinculada a
    responsável; padrões protetivos por default; supervisão parental.
    **Depende de assessoria jurídica** — ver §7.

---

## 6. Compatibilidade e migração

- `Denuncia`, `DenunciaMensagem`, `DenunciaBrecho` **permanecem**; ganham
  `categoria` (nullable no início) e `casoId`. Denúncias antigas entram como
  `categoria: null`, gravidade `S2`, sem strike retroativo — **sanção nunca é
  retroativa**, mesmo princípio já adotado em Confiança (rebaixamento não revoga
  grupo existente).
- `Post.oculto` e `MensagemDireta.removidaEm` continuam sendo o efeito de
  `AcaoModeracao.REMOVER`. Nada no feed precisa mudar de contrato.
- `REDUZIR` é campo novo (`Post.alcanceReduzido`) lido por `lib/feed.ts` no
  ranking — não altera visibilidade, só ordenação/alcance nacional.
- **R5 / canal restrito**: sinal e caso ficam no tenant onde ocorreram; unidade
  isolada não vaza para fila de outro tenant. Superfície global (praça/fórum)
  usa `tenantId: null` e vai para a fila da plataforma. Mesmo princípio de
  `docs/data/modulo-canal-restrito.md`.
- **Comunidade Nacional** (tenant sintético) segue a política da plataforma, não
  a de um tenant.

---

## 7. Decisões em aberto

| # | Questão | Precisa de |
|---|---|---|
| 1 | Destinatário formal e prazo da comunicação de CSAM (Centro Nacional / SaferNet / polícia) | 🔴 assessoria jurídica |
| 2 | Somos "provedor" na acepção do ECA Digital? Qual aferição de idade é proporcional? | 🔴 assessoria jurídica |
| 3 | Prazo de retenção do material preservado (180 d é chute conservador) | 🔴 assessoria jurídica |
| 4 | Moderação de conteúdo em **sala de vídeo ao vivo** (LiveKit) — gravação? só denúncia + encerramento? | produto + jurídico |
| 5 | Relatório de transparência é público ou só para o tenant no início? | produto |
| 6 | Confiança vira insumo de moderação — o inverso também? (sanção reduz score) | produto; risco de dupla punição |

---

## 8. Testes e auditorias

Duas camadas com papéis distintos, e a divisão importa: **`tsc` não valida
payload de escrita do Prisma neste repo** (`ARCHITECTURE.md` §5.2, complemento
de 2026-09-01). Campo inexistente num `create` compila limpo. Portanto o teste
puro não substitui a auditoria — só a auditoria, que roda contra banco real,
prova que a gravação funciona.

### 8.1 Testes puros (Vitest, sem banco)

| Alvo | Como |
|---|---|
| Taxonomia e SLA | `gravidadeDaCategoria` (inclusive código inválido), `prazoSlaDe`, `escalaParaPlataforma`, `ordenarPorPrioridade` |
| Subconjunto da UI | Todo código em `CATEGORIAS_DENUNCIA_UI` existe em `CATEGORIAS_VIOLACAO` |
| Normalização anti-evasão | Leet, diacrítico, separador, repetição — e casos **anti-Scunthorpe** (Fase 2) |
| Piso da plataforma | Tenant não consegue afrouxar S3/S4 (Fase 2) |
| Revisor ≠ decisor | Invariante da regra pura (Fase 1, quando houver recurso) |

### 8.2 `pnpm --filter @torcida/web audit:moderacao`

Roda contra banco real, muta e reverte, fixtures marcadas `[AUDIT-MOD]`, no
padrão de `apps/web/src/lib/__audit__/notificacoes.audit.ts` (`criarAjudantes`,
`criarColetor`, `tentativa`). **Exige o schema aplicado no Postgres local** —
o snapshot de dev não tem as tabelas novas até rodar `db:push` local.

Invariantes que a auditoria precisa provar — cada uma existe porque descreve um
jeito real de o fluxo falhar em silêncio:

| # | Invariante | Falha que ela pega |
|---|---|---|
| A1 | **Gravação funciona para todos os 16 alvos.** Criar uma `ModeracaoDenuncia` para **cada** valor de `AlvoModeracao` contra o banco | Campo ou enum errado no `create` — que o `tsc` deixa passar. É a invariante mais importante do conjunto |
| A2 | **S4 escala sozinho.** Denúncia de categoria crítica nasce `escalado: true`, aparece na fila da plataforma e o moderador do tenant **recebe recusa** ao tentar resolver | Caso grave preso na fila local, sem ninguém com poder de decidir |
| A3 | **Ocultar oculta de verdade.** Para cada alvo com `acaoOcultar`, depois de resolver, o conteúdo **some das leituras públicas** — não basta o campo ter mudado | Campo `oculto` gravado e leitura que não filtra. É o risco direto de ter acabado de adicionar `oculto` a `Comentario` e `MomentoStory` |
| A4 | **Alvo sem ocultação não finge.** Onde `acaoOcultar` é `null`, resolver registra decisão e escala, sem mutar o alvo nem reportar sucesso falso | Botão inerte que diz "removido" sem remover |
| A5 | **Aviso ao denunciante sempre sai**, inclusive em escopo CLUBE (sem tenant), via tenant sintético da CN | A dívida D1 voltando sem ninguém perceber |
| A6 | **Isolamento por tenant.** Denúncia do tenant A não aparece na fila do tenant B; denúncia sem tenant só na plataforma | Vazamento cross-tenant na fila — o pior tipo de bug neste produto |
| A7 | **Auto-denúncia e limite.** Não dá para denunciar o próprio conteúdo; rate-limit segura enxurrada | Denúncia usada como assédio |
| A8 | **Ordenação da fila** respeita gravidade e depois SLA, com item vencido no topo | Caso grave soterrado por spam antigo |
| A9 | **Cobertura de superfície.** Todo valor de `AlvoModeracao` tem entrada no registro **e** ponto de entrada de denúncia declarado | Superfície nova nascendo sem denúncia — exatamente como o fórum ficou descoberto |

A9 tem duas metades: a do **registro** é garantida em tempo de compilação
(`Record<AlvoModeracao, AlvoSpec>` — entrada faltando é erro de `tsc`); a do
**ponto de entrada** não dá para provar por tipo e é checada na auditoria.

Fases seguintes acrescentam: preservação antes de remoção (nenhum caso S3+
resolvido como REMOVER sem `ConteudoPreservado`), isolamento R5 estendido em
`audit:canal-restrito`, e custo/latência do classificador com amostra real.

---

## 9. Entregue — recorte 1: denúncia no fórum da praça (2026-09-01)

Primeiro recorte da Fase 1, escolhido por ser o maior buraco: superfície
cross-tenant sem nenhum caminho de denúncia.

**No código (ainda não aplicado em banco):**

- `packages/types/src/moderacao.js` — taxonomia completa (28 categorias, S0–S4),
  `gravidadeDaCategoria`, `prazoSlaDe`, `escalaParaPlataforma`,
  `ordenarPorPrioridade`, `CATEGORIAS_DENUNCIA_UI` (8 opções para o usuário
  final, não as 28). 15 testes puros em
  `apps/web/src/lib/__tests__/moderacao.test.ts`.
- Schema: `GravidadeViolacao`, `CategoriaViolacao`, `AlvoDenunciaPraca`,
  `model DenunciaForum` (`tenantId` **nullable** — escopo CLUBE não tem tenant).
- `denunciarPracaAction` em `praca-actions.ts`; `notificarDenunciaForum` +
  `corpoDenunciaForum` em `notificacoes-routing.ts`; `lib/denuncias-forum.ts`
  resolve os 3 alvos em lote.
- UI: `_components/praca-denuncia-modal.tsx`; entrada no menu do tópico, da
  resposta e do comentário da praça.
- Filas: seção "Fórum e praça" em `/admin/comunidade/moderacao` e a fila
  cross-tenant em `/super-admin/moderacao`.

**Invariante verificada:** denúncia S4 nasce `escalado: true`, a fila do tenant
**recusa** resolvê-la, e a fila da plataforma a pega por
`escalado: true OR tenantId: null`.

**Fora deste recorte:** classificador, strikes, recurso, preservação de prova,
redução de alcance, permissões novas (reusa `community:moderate`).

### 9.1 Dívidas abertas por este recorte

| # | Dívida | Detalhe |
|---|---|---|
| D1 | ~~Denunciante de escopo CLUBE não recebe aviso de desfecho~~ | **Resolvido (2026-09-01) sem tocar no schema.** Avaliamos tornar `Notificacao.tenantId` nullable e **rejeitamos**: a coluna não tem FK, mas `emitNotificacaoPing(tenantId, userId)` chaveia o realtime por tenant, então nulo degradaria o ping e obrigaria a auditar todo filtro por tenant. A denúncia de escopo CLUBE tem `afiliacaoId` → o aviso vai para o **tenant sintético da Comunidade Nacional** (`getOrCreateComunidadeNacionalTenant`), que é o dono semântico do contexto onde a pessoa denunciou. Só o aviso ao *denunciante* muda; o fan-out a moderadores continua exigindo tenant real |
| D2 | **`tsc` não valida payload do Prisma** | Confirmado empiricamente: um campo inexistente em `db.denunciaForum.create` passa limpo no `tsc --noEmit`. A convenção de anotar retorno à mão (`ARCHITECTURE.md` §5.2) cobre a **leitura**; a **escrita** fica descoberta — só auditoria de fluxo pega. Documentado em §5.2 e no `CLAUDE.md`; reforça a necessidade de `audit:moderacao` (§8) antes de confiar no caminho |
| D3 | **Menu do tópico agora abre para não-autor** | `ForumTopicoMenu` só renderizava para o autor; passou a renderizar sempre, com `isAutor` gateando cada item. Mudança de UX além de "adicionar denúncia" — justificada, mas vale conferir na tela |
| D4 | **Schema não aplicado** | `db:push` está fora do escopo; o workflow **Schema deploy** aplica em HML e prod no merge. Até lá as duas filas usam `.catch(() => [])`, mesmo padrão já usado para `DenunciaMensagem` |

---

## 10. Entregue — recorte 2: núcleo generalizado (2026-09-01)

Feito **antes do primeiro deploy de propósito**: como `db:push` nunca rodou, as
tabelas não existiam em HML/prod e renomear saiu de graça. Depois teria sido
migração.

- `DenunciaForum` → **`ModeracaoDenuncia`** (`saas_moderacao_denuncias`);
  `AlvoDenunciaPraca` → **`AlvoModeracao`** com os **16 valores** da §3.
- `lib/denuncias-forum.ts` → **`lib/moderacao-alvos.ts`**: registro
  `Record<AlvoModeracao, AlvoSpec>` com `carregar` em lote (uma query por tipo,
  sem N+1), `operacaoOcultarAlvo`, `alvoSoEscala` e `ROTULO_ALVO_MODERACAO`.
- **`oculto`** adicionado a `Comentario` e `MomentoStory`, com filtro aplicado
  nas 4 leituras (`portal/comunidade/actions.ts`, `comunidade-insights.ts`,
  `perfil-social.ts`, `stories.ts`). `Announcement`, `Evento` e `PerfilTorcedor`
  **não** ganharam campo — ali o autor é admin com permissão e a resposta certa
  é escalonamento, não ocultar.
- **D1 fechado** via `lib/moderacao-aviso.ts` (`tenantParaAvisoDenuncia`), nas 4
  ações de encerramento.
- Filas do tenant e da plataforma passam a carregar alvos pelo registro.
- Identificadores internos renomeados: tipos e ações chamados `...DenunciaForum`
  passaram a `...DenunciaModeracao` — um tipo que carrega 16 superfícies não
  pode se chamar "Forum", ou o próximo leitor erra.

**A garantia de tipo está de pé:** o registro é `Record<AlvoModeracao, AlvoSpec>`,
então alvo novo no enum sem entrada no registro é **erro de compilação**.

### 10.1 Estado da verificação

| Comando | Resultado |
|---|---|
| `db:generate` | Client TypeScript gerado (1.937 refs a `ModeracaoDenuncia`); **rename da DLL do query engine falha com o `dev` do usuário rodando** — contornado com `gerar-prisma-exports.js`; `prisma-exports:check` em dia (207 nomes) |
| `lint` | 0 erros, 19 warnings (todos pré-existentes, nenhum em arquivo do módulo) |
| `lint:mobile` | OK |
| `test` | 1.541 passam; 3 falham — só `admin-modulos.test.ts`, **pré-existente em `main`** (tab `brecho` do commit `18ea0942`) |
| `tsc --noEmit` | **Nenhum erro em arquivo de moderação.** 11 erros, todos em arquivos de WIP não commitado do usuário (`torcida-console`, `acessos/page`, `design-form`, `design.test`, `praca-isolamento`) |

**Pendente de atribuição:** a rodada anterior via 2 erros de `tsc`; agora são 11.
Os 9 novos estão em arquivos de WIP do usuário que este trabalho não tocou. Não
gastei orçamento para bissectar se o `prisma generate` (schema maior) trouxe à
tona erro latente nesse WIP — hipótese plausível pelo mecanismo de §5.2, **não
confirmada**.

## 11. Plano — o que falta e em que ordem

> **R3 executado em 2026-09-01 — ver §12.** A premissa de §11.0 abaixo era
> verdadeira quando o plano foi escrito e **deixou de ser**: o schema está
> aplicado no Postgres local e a auditoria passou. Mantido como registro do
> raciocínio que ordenou os recortes.

### 11.0 O fato que ordena tudo: nada nunca tocou um banco

`db:push` jamais rodou. As tabelas `saas_moderacao_denuncias`,
`Comentario.oculto` e `MomentoStory.oculto` **não existem em nenhum banco** —
nem local, nem HML, nem prod. Somado ao achado de §5.2 (o `tsc` não valida
payload de escrita do Prisma), a consequência é desconfortável e precisa estar
escrita: **as 16 entradas do registro nunca foram executadas contra um banco.**
Um `carregar` com nome de campo errado ou um `create` com enum inválido
compila, passa no lint e falha só em runtime.

Por isso o próximo recorte **não** é UI nova. É provar que o que existe
funciona.

### 11.1 Bloqueio operacional — o lote não commitado

| Medida | Valor |
|---|---|
| Arquivos não commitados na árvore | **366** |
| Do módulo de moderação | ~26 |
| WIP alheio ao módulo | **340** |
| Arquivos que misturam os dois | **2** (`lib/praca.ts`, `packages/types/src/portal-noticias-forum.js`) |

`praca.ts` tem 147 linhas alteradas — parte nossa (`autorId` em
`PracaComentarioItem`), parte WIP de listagem do fórum
(`whereTopicosNaListagem`, `rankTopicosHot`). `portal-noticias-forum.js` tem 177
linhas na mesma situação. **Não dá para isolar o módulo por arquivo.**

Isso importa porque mudança em `schema.prisma` que entra em `main` dispara o
workflow **Schema deploy**, que aplica `db:push` em HML **e em prod**. Ou seja:
o momento em que este módulo é commitado é o momento em que o banco de produção
muda — junto com o que mais estiver no commit.

**Recomendação:** fechar ou commitar o lote de WIP primeiro (no mínimo os dois
arquivos entrelaçados), e só então commitar o módulo, para que o schema deploy
viaje com uma mudança coerente. Enquanto isso não acontece, 366 arquivos de
trabalho não versionado são o maior risco isolado deste esforço — maior que
qualquer item técnico abaixo.

### 11.2 Recortes, em ordem

| # | Recorte | Por que nesta posição | Depende de |
|---|---|---|---|
| **R3** | **Provar que funciona.** `db:push` no Postgres local + `audit:moderacao` com A1–A9 (§8.2) + corrigir o que a auditoria achar. Sem UI nova | O código nunca rodou contra banco e o `tsc` não cobre escrita. Tudo o que vier depois herda os erros que A1 revelar | Postgres local |
| **R4** | **Cobertura das 9 superfícies restantes.** UI de denúncia + gate por superfície. O registro já as declara | Só depois de A1 provar que a gravação funciona; senão multiplicamos um caminho quebrado por 9 | R3 |
| **R5** | **Prova e devido processo.** `ConteudoPreservado` + `AcessoPreservadoLog` (preservar antes de remover) e notificação ao autor + `RecursoModeracao` com revisor ≠ decisor | As duas obrigações legais mais duras: preservação vem do ECA Digital, notice/appeal vem da tese do STF. Hoje removemos sem guardar prova e sem avisar o autor | R3 |
| **R6** | **Ações completas.** `REDUZIR` (alcance) e `INFORMAR` (rótulo), fechando a tríade da Meta; strikes com expiração | Enquanto só existir remover/descartar, o moderador escolhe entre censurar e ignorar | R5 |
| **R7** | **Diretrizes no produto + transparência.** Publicar a política como página do produto; painel de métricas e relatório semestral | Fecha o pilar *Numbers* e o dever de relatório da tese do STF e do ECA Digital | R6 |
| **F2** | **Classificação automática** (§5, Fase 2) | É o que atende ao dever de cuidado **proativo**. Só faz sentido sobre um fluxo cujo devido processo já funciona | R5 |

### 11.3 Riscos conhecidos deste plano

- **A1 pode derrubar parte do registro.** É o objetivo dela. Orçar correção
  dentro do R3, não tratar como imprevisto.
- **`db:generate` falha com o dev server rodando** (lock da DLL do query
  engine no Windows). Contorno conhecido: `prisma validate` +
  `node scripts/gerar-prisma-exports.js`. Antes do R3, derrubar o dev e rodar
  o `db:generate` inteiro pelo menos uma vez.
- **`db:push` local altera o snapshot de dev**, que já está 5+ dias atrás do
  remoto (`docs/ops/postgres-local-dev.md`). Não confundir divergência de
  snapshot com bug do módulo.
- **11 erros de `tsc` pendentes de atribuição** (§10.1) — todos em WIP do
  usuário. Resolver o lote de WIP tende a limpá-los; se não limpar, bissectar
  contra o client regenerado antes de culpar o módulo.

---

## 12. Executado — R3: o caminho de dados está provado (2026-09-01)

**Schema aplicado no Postgres local** (`localhost:5432/torcida`, PG 18.4).
Conferido antes de rodar: o `DATABASE_URL` do repo aponta para localhost, não
para a Railway — `db:push` aqui não toca HML nem prod. Estado no banco:
`saas_moderacao_denuncias` criada, `oculto` presente em `saas_comentarios` e
`saas_momentos_story`, enum `AlvoModeracao` com os 16 valores.

**`pnpm --filter @torcida/web audit:moderacao`** criado
(`apps/web/src/lib/__audit__/moderacao.audit.ts`) — **6/6 passando**:

| Invariante | Resultado |
|---|---|
| A1 · grava para os **16** valores de `AlvoModeracao` | ✅ nenhum falhou |
| A1 · banco aceita as **28** categorias da taxonomia | ✅ enum do schema bate com `CATEGORIAS_VIOLACAO` |
| A1 · `carregar()` de cada alvo roda sem campo inválido | ✅ 16/16 |
| A1 · `carregarAlvosModeracao` agrupa em lote | ✅ |
| A2 · S4 nasce `escalado`, S1–S3 não | ✅ amostra CSAM, ALICIAMENTO_MENOR, RACISMO, SPAM, PALAVRAO_LEVE |
| A2 · S4 aparece no filtro da fila da plataforma | ✅ |

Reversão verificada: 0 denúncias e 0 fixtures `[AUDIT-MOD]` no banco depois da
rodada.

**Leitura do resultado.** O registro passou de primeira, o que é melhor do que
o esperado — mas o mérito é da auditoria existir, não da sorte: como o `tsc` não
valida escrita, sem A1 a informação "funciona" era indisponível, não boa. É
exatamente por isso que ela precisa rodar **antes** de multiplicar o caminho
por 9 superfícies (R4).

Aproveitou-se que `ModeracaoDenuncia.alvoId` **não tem FK**: dá para exercitar
o caminho de escrita dos 16 tipos sem fabricar fixture em 16 tabelas. É
deliberado — `alvoId` é polimórfico por desenho.

### 12.1 O que a auditoria ainda não cobre

A3–A9 da §8.2 continuam em aberto e dependem de fixture real por superfície:
ocultar-oculta-de-verdade (A3), alvo sem ocultação não finge (A4), aviso ao
denunciante em escopo CLUBE (A5), isolamento por tenant (A6), auto-denúncia e
limite (A7), ordenação da fila (A8), ponto de entrada por superfície (A9).
**A3 e A6 são as mais importantes das que faltam** — a primeira porque acabamos
de adicionar `oculto` a duas tabelas, a segunda porque vazamento cross-tenant é
a falha mais grave possível neste produto.

## Histórico

| Data | Evento |
|---|---|
| 2026-09-01 | Spec inicial — as-is medido, arquitetura em 5 camadas, modelo de dados, 4 fases |
| 2026-09-01 | Recorte 1 implementado (fórum da praça) — §9. Taxonomia e enums plantados para as fases seguintes |
| 2026-09-01 | Recorte 2 — núcleo generalizado para 16 superfícies, D1 fechado, registro exaustivo por tipo — §10 |
| 2026-09-01 | R3 — schema aplicado no banco local, `audit:moderacao` criado, A1 e A2 provadas (6/6) — §12 |
