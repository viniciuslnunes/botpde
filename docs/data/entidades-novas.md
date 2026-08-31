# Entidades novas (proposta) — Torcida SaaS

> **Rascunho para validação.** Não aplicar sem aprovação. O projeto usa `db push`
> (sem migrations). Schema atual: `packages/db/prisma/schema.prisma`. Convenções em
> `.claude/agents/data-model.md`.

## Vocabulário do domínio (decidido)

- **`Afiliacao`** = a agremiação de futebol que a torcida existe para apoiar (o time,
  "razão de viver" da torcida). É a **âncora global** de dados externos — não se usa o
  termo genérico "clube" como tabela. Todas as torcidas devotadas ao mesmo time
  compartilham uma `Afiliacao`.
- **Afiliação territorial** = relação Sede → Subsede → PDE. Subsedes e PDEs são
  **afiliadas da sede**. Já modelada pela auto-relação `Sede.sedeId` — não é entidade nova.
- **Torcida** = o **tenant raiz** (decisão #1). Não há entidade `Organizacao` acima do
  Tenant nesta fase.

## Referências globais (sem `tenantId` — compartilhadas entre torcidas)

### `Afiliacao` (o time apoiado)
- `id, nome, apelido, escudoUrl, cidade, estado, apiExternalId?, criadoEm`
- Back-ref: `tenants Tenant[]`, `partidas Partida[]`, `noticias Noticia[]`.
- Em `Tenant`: adicionar `afiliacaoId String?` + relação (onDelete: SetNull).

### `Partida` (por afiliação) — ✅ no schema (2026-07-17)

Jogos/calendário/resultados; alimenta `Evento` via `partidaId`. **Implementado** —
ver `packages/db/prisma/schema.prisma` e `docs/data/modulo-eventos.md`. Sync externo
ainda **não** — cadastro manual / partida rápida; decisão aberta #7 (provedor API).

- `id, afiliacaoId (FK, Cascade), adversario, competicao?, dataHora, local?,
  mando (MandoJogo: CASA|FORA), placarCasa?, placarFora?, status (StatusPartida),
  fonteExternalId?, criadoEm`
- Em `Evento`: `partidaId String?` (SetNull) + `serieId?`, `lat?`/`lng?`, `fotoUrl?`
- `EventoRsvp.criadoEm` + status `LISTA_ESPERA` (fila FIFO)
### `Noticia` (por afiliação)
Feed informativo curado.
- `id, afiliacaoId (FK, Cascade), titulo, resumo?, url, fonte, publicadoEm,
  curadoPorId?, criadoEm`

### `DadoInstitucional` (por afiliação)
Fallback manual para dados oficiais quando não há API confiável.
- `id, afiliacaoId (FK, Cascade), tipo, valor Json, atualizadoPorId, atualizadoEm`

## Escopadas por tenant

### `Alianca` (aliança confirmada)
Relação curada torcida↔torcida, declarada pelo Presidente. **Confirmação mútua**
(decisão #2): A propõe → B aceita → `ATIVA`. **Nível torcida**, herdada pelas
sub-unidades (decisão #3). Leitura simétrica.
- `id, tenantOrigemId (FK Tenant, Cascade), tenantAliadoId (FK Tenant, Cascade),
  status (StatusAlianca: SUGERIDA|PENDENTE|ATIVA|ENCERRADA), propostaPorId (FK User),
  confirmadaPorId? (FK User), confirmadaEm?, criadoEm`
- Único: par não-ordenado (evitar duplicar A→B e B→A — normalizar ordem na escrita).
- Consumo: aliança `ATIVA` adiciona a relação `'allied'` em `resolveVisibility` → só
  recursos **PÚBLICOS** (nunca membros/sócios/financeiro).

### `RecomendacaoAlianca` (sugestão, separada da aliança confirmada) 🆕
Refinamento vindo do piloto do agente `aliancas-torcidas`: recomendação **não é**
aliança. A camada de recomendação carrega confiança + fonte; só o que é **alta
confiança** vira sugestão automática — o resto exige confirmação do Presidente.
Origem dos dados: `docs/knowledge/aliancas.md`.
- `id, tenantId (FK, Cascade), tenantSugeridoId? (FK Tenant), nomeSugerido,
  confianca (ConfiancaRecomendacao: ALTA|MEDIA|BAIXA), fonte, observacao?, criadoEm`
- Regra de produto: `BAIXA/MEDIA` nunca vira sugestão automática; apenas informa o
  Presidente. Rivais (da base de conhecimento) **nunca** são recomendados.

### `ImportacaoMembros`
Staging + auditoria da importação da base existente (prioridade #1 de dados).
- `id, tenantId (FK, Cascade), origem (OrigemImportacao: CSV|BOT|DISCORD), status,
  totalLinhas, importados, duplicados, erros Json, criadoPorId, criadoEm`
- Dedup por prioridade `discordId > email > telefone` (decisão #6).
- Toda execução gera `AuditLog`.

## Enums novos

- `MandoJogo`: CASA, FORA — ✅ em uso com `Partida`
- `StatusPartida`: AGENDADA, AO_VIVO, ENCERRADA, CANCELADA — ✅ com `Partida`
- `StatusAlianca`: SUGERIDA, PENDENTE, ATIVA, ENCERRADA
- `ConfiancaRecomendacao`: ALTA, MEDIA, BAIXA
- `OrigemImportacao`: CSV, BOT, DISCORD

## Mudanças em entidades existentes

| Entidade | Mudança |
|---|---|
| `Tenant` | `afiliacaoId String?` + relação para `Afiliacao` (SetNull) |
| `Evento` | `partidaId String?` + relação para `Partida` (SetNull) |
| `TenantRelation` (types) | novo valor `'allied'` em `packages/types/src/visibility.js` |

## Impactos a validar (para o `data-model` agent)
- Unicidade/ordem do par em `Alianca` (normalizar para não duplicar A→B e B→A).
- `Afiliacao` global exige que queries de `Partida`/`Noticia` **não** filtrem por tenant.
- Índices: `(afiliacaoId, dataHora)` em `Partida`; `(afiliacaoId, publicadoEm)` em `Noticia`.
- Anotar tipos de retorno explícitos nas queries novas (teto de inferência Prisma).

## Achados da auditoria de conhecimento (2026-07-16)

- **RSVP ≠ check-in**: `EventoRsvp.checkedInAt`/`checkedInPorId` são campos
  independentes de `status` (que só tem `CONFIRMADO`/`RECUSADO`, sem estado
  "pendente"). Confirmar presença não implica ter comparecido — o check-in é
  um evento separado, registrado à parte.
- **Sede pré-adesão**: `Sede.tenantId` é nullable, e `sedeReferenciaNome`/
  `sedeReferenciaSlug` apontam para uma sede-mãe que **ainda não é um tenant**
  no sistema. Modela o caso de onboarding em que uma subsede/PDE se cadastra
  antes da sede principal existir na plataforma.
- **Gap de campos legais (LGE)**: `docs/knowledge/contexto-legal.md` exige RG,
  CPF, filiação, escolaridade, profissão, foto e data de nascimento no cadastro
  de membro; `SaasMembro` hoje só tem `idade`, `telefone`, `cidade`, endereço e
  `imagemProva`. Ver decisão em aberto #9 em `docs/product/decisoes-abertas.md`.

## Memória (entregue 2026-08-30 — fases 2–5)

Contrato em `packages/types/src/memoria.js`. Doc: `docs/data/modulo-memoria.md`.
Aplicado no schema: `MemoriaFato`, `Tenant.memoriaAliados`,
`PerfilMembro.memoriaPresencaVisivel`. Índice `MemoriaDia` ainda não.

### `MemoriaFato` (fase 3)

Fato atrasado ligado a um dia civil. Não reescreve `Post.criadoEm`.
- `id, tenantId, autorId, dia, conteudo, midiaUrls[], visibilidade (PUBLICO|TENANT),
  status (PENDENTE|APROVADA|REJEITADA), postId?, eventoId?, aprovadoPorId?,
  decididoEm?, motivoRejeicao?, criadoEm`
- Índices: `(tenantId, status, dia)`, `(tenantId, dia)`, `(autorId, criadoEm)`

### `MemoriaDia` (índice — fase 3 ou se p95 da espinha clube estourar)

- `escopoTipo (tenant|afiliacao), escopoId, dia, kinds[], totais Json, atualizadoEm`
- Unique `(escopoTipo, escopoId, dia)`

### Colunas em entidades existentes

| Entidade | Fase | Campo |
|---|---|---|
| `Tenant` | 4 | `memoriaAliados Boolean @default(false)` — só a raiz SEDE |
| `PerfilMembro` | 5 | `memoriaPresencaVisivel Boolean @default(false)` |

