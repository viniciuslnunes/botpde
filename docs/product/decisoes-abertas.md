# Decisões — Torcida SaaS

## Decididas nesta rodada (2026-07-06)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Âncora de identidade da torcida | **Tenant raiz é a torcida.** Sem entidade `Organizacao`. Âncora global de dados externos = **`Afiliacao`** (o time apoiado) — não se usa o termo "clube" como entidade |
| 2 | Confirmação da aliança | **Mútua**: A propõe → B aceita → `ATIVA` |
| 3 | Granularidade da aliança | **Nível torcida**, herdada pelas sub-unidades |
| 4 | Escopo dos dados externos | **Global por afiliação** (compartilhado entre torcidas do mesmo time) |
| 5 | Rastrear rivalidades | **Sim, só para moderação/segurança** — registro factual e neutro, nunca sugeridas como aliadas nem usadas para conteúdo de confronto |
| 6 | Fonte da importação de associados | Dedup por prioridade **`discordId > email > telefone`** |
| 8 | Permissão dedicada de "sócio" | Reusar `MEMBERS_APPROVE` por ora; revisitar se o fluxo de sócio crescer |

Vocabulário (decisão #1): o **time é a razão de viver da torcida** (identidade), por
isso é modelado como `Afiliacao`, não como tabela genérica "clube". Sede → Subsede →
PDE é **afiliação territorial** (subsedes/PDEs afiliadas à sede), já modelada pela
auto-relação de `Sede`.

## Ainda em aberto

| # | Decisão | Opções | Nota |
|---|---|---|---|
| 7 | Provedor de API de jogos | ex.: API-Football, outros | Spike técnico na Fase 2: avaliar limites do plano free antes de fechar |

## Já decididas antes (referência — ver `ARCHITECTURE.md` §5)

- API central = **tRPC** (uso interno primeiro).
- `assertPermission` é o **único** critério de autorização do admin.
- Permissões resolvidas no servidor a cada request (não no JWT).
- Árvore de menu do admin estática no código (`packages/types`).
- `db push` (sem migrations) no estágio atual.
