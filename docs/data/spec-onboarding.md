# Spec — Onboarding, Torcedor global e Rivalidade

> **Para revisão antes de codar.** Planejado em Opus; codificado pelo agente
> `implementation` (Fable) em branch. Convenções: `.claude/agents/data-model.md`,
> `.claude/agents/rbac.md`, `CLAUDE.md`. Projeto usa `db push` (sem migrations).
> Validação prévia: agentes `data-model` (schema) e `rbac` (segregação/feed).

## Contexto e objetivo

Ao logar, o usuário deve passar por um **onboarding** que garante direcionamento e
**segregação correta** — o mecanismo central contra infiltrados em torcidas. O fluxo:

1. Escolhe o **clube** que torce (seleção por escudo, 1 clique).
2. Informa a **região** (cidade/estado) que torce.
3. Escolhe a **torcida organizada** do clube (ou "só torcedor").
4. Se escolher torcida: **sócio** (com dados + prova + departamento) ou **torcedor da torcida**.
5. Sócio entra como `PENDENTE`; **até ser aprovado só vê o feed de torcedor**.

Regras de relacionamento (decisão do usuário, 2026-07-11):
- **Torcedor** se relaciona cross-torcida livremente — inclusive com torcedores de
  torcidas **rivais**.
- A **única** restrição é entre **sócios de torcidas rivais** (revisável no futuro).
- Aliança ATIVA neutraliza a rivalidade herdada do clube.

Decisões estruturais fechadas (2026-07-11):
- **Ponto de entrada: hub central** (domínio-mãe), fora do subdomínio de uma torcida.
- **Torcedor = perfil global** no `User` (`PerfilTorcedor`), independe de tenant.
- **Rivalidade: nível clube + override torcida×torcida**.
- **Base de clubes: seed curado nacional** a partir de `docs/knowledge/diretorio-nacional.md`
  + escudos versionados no projeto (API gratuita só para coleta, nunca em runtime).

## 1. Schema (`packages/db/prisma/schema.prisma`)

> Blocos abaixo são a proposta; parecer final do agente `data-model` prevalece
> em detalhes de índice/onDelete. Aplicar via `pnpm --filter @torcida/db db:push`.

### 1.1 Perfil global de torcedor
> Parecer `data-model` (2026-07-11): `afiliacaoId` **nullable + SetNull** (espelha
> `Tenant.afiliacao` L111; `Afiliacao` é global e pode ser deduplicada — `Restrict`
> travaria a limpeza). Torcedor pode nem ter time no onboarding. Não duplicar
> `regiao`/`bio` que já existam em `PerfilMembro`.
```prisma
model PerfilTorcedor {
  id                    String     @id @default(uuid())
  userId                String     @unique @map("user_id")
  afiliacaoId           String?    @map("afiliacao_id")   // clube que torce
  regiao                String?    // cidade/estado do torcedor
  bio                   String?
  onboardingConcluidoEm DateTime?  @map("onboarding_concluido_em")
  criadoEm              DateTime   @default(now()) @map("criado_em")
  atualizadoEm          DateTime   @updatedAt @map("atualizado_em")

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  afiliacao Afiliacao? @relation(fields: [afiliacaoId], references: [id], onDelete: SetNull)

  @@index([afiliacaoId])
  @@map("saas_perfis_torcedor")
}
```
Back-refs: `User.perfilTorcedor PerfilTorcedor?`, `Afiliacao.torcedores PerfilTorcedor[]`.
`SaasMembro` continua sendo **exclusivamente** o vínculo com uma torcida.

### 1.2 Afiliacao enriquecida
Adicionar: `slug String? @unique` (backfill com unicidade garantida na geração
**antes** do `db push` em base populada), `serie` como **enum**
`SerieCampeonato { A B C D ESTADUAL OUTRA }` (parecer `data-model`: string livre é
frágil para filtro). Back-refs: `torcedores`, `rivalClubeA/B`.

**Metadados no card de clube (2026-07-13, entregue):**
- `torcedoresEstimados`, `torcedoresEstimadosFonte`, `torcedoresEstimadosTipo`
  (`IBOPE_DIGITAL` | `LIMITE_ATE`) — seed offline IBOPE Repucom Top 50 + teto 10 mil
  fora do ranking. Ver `docs/data/torcedores-estimados.md`.
- Presença online da plataforma: `User.ultimoAcessoEm` + stats agregadas por clube
  (`onboarding-clube-stats.ts`); exibidas no mesmo card, separadas da estimativa web.

### 1.3 Rivalidade — DUAS tabelas (clube + torcida)
> Parecer `data-model`: **rejeitado** o modelo de tabela única com `origem` + 4 FKs
> nullable — `@@unique` **não funciona sobre colunas nullable no Postgres** (NULLs são
> distintos), gerando unicidade ilusória. Split em duas tabelas; `origem` some (o tipo
> é a tabela). **Invariante:** gravar sempre com `aId < bId` (comparação do UUID) num
> **único helper** + teste unitário — o banco não força simetria (lição que `Alianca`
> não seguiu, L812). Busca "rivais de Z" = `WHERE aId=Z OR bId=Z` → índice em ambas as
> colunas.
```prisma
model RivalidadeClube {
  id           String   @id @default(uuid())
  afiliacaoAId String   @map("afiliacao_a_id")
  afiliacaoBId String   @map("afiliacao_b_id")
  criadoEm     DateTime @default(now()) @map("criado_em")

  afiliacaoA Afiliacao @relation("RivalClubeA", fields: [afiliacaoAId], references: [id], onDelete: Cascade)
  afiliacaoB Afiliacao @relation("RivalClubeB", fields: [afiliacaoBId], references: [id], onDelete: Cascade)

  @@unique([afiliacaoAId, afiliacaoBId])
  @@index([afiliacaoBId])
  @@map("saas_rivalidades_clube")
}

model RivalidadeTorcida {
  id        String   @id @default(uuid())
  tenantAId String   @map("tenant_a_id")
  tenantBId String   @map("tenant_b_id")
  criadoEm  DateTime @default(now()) @map("criado_em")

  tenantA Tenant @relation("RivalTorcidaA", fields: [tenantAId], references: [id], onDelete: Cascade)
  tenantB Tenant @relation("RivalTorcidaB", fields: [tenantBId], references: [id], onDelete: Cascade)

  @@unique([tenantAId, tenantBId])
  @@index([tenantBId])
  @@map("saas_rivalidades_torcida")
}
```
Regra derivada `saoRivais(t1,t2)` = `rivalTorcida(t1,t2) OR rivalClube(afil(t1),afil(t2))`
`AND NOT aliancaAtiva(t1,t2)`. A aliança só neutraliza quando `StatusAlianca.ATIVA`, e
o par de `Alianca` **não** é canônico → checar as duas direções.
Fonte do seed: tabela "Rivalidades estruturais" de `docs/knowledge/aliancas.md`.

### 1.4 SaasMembro / StatusMembro
Decisão (parecer `data-model`): **NÃO** adicionar `ATIVO`. `APROVADO` já é o estado
ativo terminal; adicionar `ATIVO` criaria ambiguidade e exigiria migração de dados.
Ação: corrigir `feed.ts:537` para `=== 'APROVADO'` + **grep por outros `'ATIVO'`
órfãos** comparando `StatusMembro`.

**Gap em aberto (LGE 14.597/2023, `docs/knowledge/contexto-legal.md`):** falta estado
de **desligamento** com data/auditoria (soft-delete, nunca exclusão física). Sugestão
futura: `DESLIGADO` + `desligadoEm/desligadoPorId/motivoDesligamento`. Registrar como
decisão em aberto — **não** entra no MVP.

## 2. Regras puras (`packages/types`)

Novos módulos testáveis por Vitest (padrão de `visibility.js`/`permissions.js`):
- `rivalidade.js` — `saoRivais(relA, relB, temAliancaAtiva)`, normalização de par ordenado.
- `torcedor.js` — estados de onboarding e do vínculo (torcedor global / pendente / sócio ativo).

## 3. Acesso e segregação (parecer `rbac`)

### 3.0 ⚠️ Bug de segurança pré-existente a corrigir junto (alta severidade)
`getTenantRelation` (`hierarquia.ts:198`) cacheia com **chave simétrica**
(`[actor,target].sort().join(':')`), mas a função é **assimétrica** (`ancestor` ≠
`descendant`). A 1ª direção resolvida serve as duas → um descendente (PDE) pode
receber `'ancestor'` cacheado e **ver o RESTRITO do ancestral** (membros/sócios).
Furo de visibilidade cross-tenant (implicação LGPD). **Corrigir a chave para
direcional** (`` `${actor}:${target}` ``) antes de introduzir a relação `rival`.

### 3.1 Dois níveis de feed
- **Torcedor** (default até aprovação): posts `PUBLICO` da torcida + comunidade
  nacional do clube. Já é o que `getPostsParaFeed` entrega a não-membros.
- **Sócios** (gated): posts `TENANT`, liberados só com vínculo **APROVADO**.
- Helper central novo `podeVerFeedSocios(userId, tenantId)` (envolto em `React.cache`),
  semântica **APROVADO = ativo**; `PENDENTE`/`REPROVADO`/sem vínculo → só feed torcedor:
  ```ts
  export const podeVerFeedSocios = cache(
    async (userId: string | undefined, tenantId: string): Promise<boolean> => {
      if (!userId) return false
      const membro = await db.saasMembro.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { status: true },
      })
      return membro?.status === 'APROVADO'
    },
  )
  ```
- **Aplicar na cláusula `where`** de `getPostsDaRede`/`getPostsParaFeed` (não só no
  `podeVerPost` pós-query) — hoje `getPostsDaRede` traz `TENANT` sem gate de vínculo,
  vazando via paginação/contadores. Substituir `feed.ts:537` por
  `return podeVerFeedSocios(viewerId, post.tenantId)`.
- **NÃO** usar `assertMembroAtivo` (carteirinha válida) para leitura de feed — sócio
  vencido perderia a timeline. Feed = APROVADO; ações estatutárias = `assertMembroAtivo`.
- Server Actions de publicar/interagir em `TENANT`: **duplo gate ortogonal** —
  `assertPermission(COMMUNITY_POST)` **E** `podeVerFeedSocios` (cargo `member` herda a
  permissão, mas cargo ≠ vínculo aprovado).

### 3.2 Rivalidade no funil social — ponto único é `canFollowUser`
- **Ponto único = `canFollowUser` (`apps/web/src/lib/social.ts`)**; `canMessageUser`
  (`mensageria.ts`) já delega a ele → cobre seguir **e** DM num lugar só.
  `podeVerConteudoSocial`/`getAutoresSemAcesso` são sobre privacidade de perfil, **não**
  são o funil de rivalidade — não mexer neles.
- `getTenantRelation` passa a retornar `'rival'`. Precedência:
  `self > hierarquia > allied > rival > unrelated` (aliança explícita ATIVA vence
  rivalidade herdada de clube). Em `resolveVisibility` adicionar caso explícito
  `if (relation === 'rival') return false`.
- Regra: bloquear vínculo **apenas** quando **ambos são `tipo: SOCIO` + `APROVADO`** e a
  relação é `rival`. Adicionar `tipo` ao `select` de `canFollowUser`. Torcedores passam
  livres (até rivais).
- **Invalidação de cache da rivalidade:** rivalidade é global (clube×clube); as tags
  atuais (`hierarchyCacheTag(tenantId)`) não cobrem. Adicionar `revalidateTag` global no
  CRUD de rivalidade, senão `rival` fica obsoleto até 300s.
- Auditar criação de grupo (`GROUPS_CREATE`) para não adicionar participante rival
  fora do funil `canMessageUser`.

### 3.3 Casos de teste (Vitest)
- `resolveVisibility('rival', 'publico'|'restrito')` → `false`.
- `canFollowUser`: sócio×sócio rival→false; torcedor×sócio rival→true; sócio×sócio
  aliado→true; mesmo tenant→true.
- `podeVerFeedSocios`: PENDENTE/REPROVADO/sem-vínculo/`undefined`→false; APROVADO→true.
- `podeVerPost` post `TENANT`: PENDENTE→false; APROVADO→true; autor→true.

## 4. Fluxo / superfícies

- Rota `/onboarding` no domínio-mãe; gate por `PerfilTorcedor.onboardingConcluidoEm == null`.
- Passos: clube → região → torcida (ou "só torcedor") → sócio/torcedor → pendência.
- **Passo clube (grid):** escudo (`EscudoClube`), nome, apelido·UF, série, metadados
  (`ClubeOnboardingMeta`):
  - Estimativa web: inscritos digitais (IBOPE Top 50) ou “até 10 mil torcedores ou menos”.
  - Plataforma: sócios e torcedores (total + online, ponto verde).
  - Busca por prefixo (`startsWith`) em nome/apelido; dedup `saoMesmoClube`.
- Passo sócio coleta: nome, nº associado, idade, telefone, unidade/sede, imagem-prova,
  **departamento pretendido** (lista `Departamento` do tenant) — grava
  `SaasMembro.departamentoId` **sem** membership até aprovação da diretoria.
  Ver `docs/data/modulo-departamentos.md` § preferência ≠ membership.
  Copy do wizard: “Informativo para a diretoria — só entra na equipe após aprovação.”
- Tela de pendência reaproveita `apps/web/src/app/portal/cadastro/page.tsx`.
- Server Actions com `assertPermission` nas mutações administrativas + `AuditLog`.
- **Admin `/admin/membros`:** coluna Departamento + diálogo “Aprovar e incluir em X?”
  (ou **Sem área**). Reprovar/reverter limpa membership de área.

## 5. Base de clubes (seed) + escudos + estimativa de torcedores

- Script `seed:afiliacoes` popula `Afiliacao` a partir de `diretorio-nacional.md`
  (nome, apelido, cidade, estado, série, slug, escudoUrl local).
- Escudos: coletar via API gratuita (ex.: TheSportsDB) **na etapa de seed**, baixar e
  hospedar no Cloudinary (`torcida/catalogo/escudos/<slug>`). Nunca depender da
  API em runtime; gate `isXConfigured()` se usar serviço externo.
- **Soccer Wiki / Ogol / TheSportsDB** — ver `docs/data/escudos-afiliacoes.md`.
- **Estimativa torcedores / base digital (2026-07-13):**
  - Fonte Top 50: [IBOPE Repucom Ranking Digital](https://www.iboperepucom.com/br/rankings/)
    (inscritos em 5 redes — **não** torcedores presenciais).
  - `seed:torcedores-estimados` preenche **todos** os clubes: IBOPE ou teto 10 mil.
  - Dados: `ibope-ranking-digital.js`, `torcedores-estimados.js`.
  - Inteligência: `docs/data/torcedores-estimados.md`, `docs/knowledge/futebol-dados-publicos.md`.
- Torcidas que ainda não aderiram aparecem como referência (aproveita
  `Sede.sedeReferenciaNome/Slug`).

## 6. Fases

- **Fase 1 (MVP)**: hub `/onboarding` + clube/torcida + `PerfilTorcedor` + criação de
  `SaasMembro` + tela de pendência + **correção do gating feed sócio×torcedor**. Sem rivalidade.
- **Fase 2**: `Rivalidade` + bloqueio sócio×sócio rival + passo de departamento.
- **Fase 3**: coleta mensal IBOPE (`coleta:ibope-ranking` + `ibope-ranking-digital.json`),
  sugestões por região (filtro UF no passo clube), comunidade nacional do clube
  (torcedor global sem torcida na plataforma). Script: `pnpm --filter @torcida/db coleta:ibope-ranking`.

## 7. Riscos / pontos de atenção

- Furo de segregação: torcedor `PENDENTE` ver feed de sócio (mitigado por `podeVerFeedSocios`).
- Simetria de `Rivalidade`: sempre normalizar par ordenado antes de gravar/consultar.
- Inferência de tipo do Prisma quebra silenciosamente (ARCHITECTURE §5.2) — anotar
  tipos de retorno em toda query nova.
- Cookie de sessão compartilhado entre domínio-mãe e subdomínios (`ROOT_DOMAIN`) já
  cobre o hub central → tenant (ver `lib/auth.ts`).
- Copy do card de clube: inscritos digitais (IBOPE) ≠ torcedores presenciais;
  teto 10 mil é conservador para fora do Top 50 — não comparar com Flamengo/Corinthians.
