# Decisões — Torcida SaaS

## Decididas nesta rodada (2026-07-06)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Âncora de identidade da torcida | **Tenant raiz é a torcida.** Sem entidade `Organizacao`. Âncora global de dados externos = **`Afiliacao`** (o time apoiado) — não se usa o termo "clube" como entidade |
| 2 | Confirmação da aliança | **Mútua**: A propõe → B aceita → `ATIVA` |
| 3 | Granularidade da aliança | **Nível torcida**, herdada pelas sub-unidades |
| 4 | Escopo dos dados externos | **Global por afiliação** (compartilhado entre torcidas do mesmo time) |
| 5 | Rastrear rivalidades | **Sim** — registro factual e neutro, nunca sugeridas como aliadas nem usadas para conteúdo de confronto. **Atualizado 2026-07-16**: além de moderação, `rival` agora também bloqueia visibilidade cross-tenant (`resolveVisibility` trata `rival` como `unrelated`); ver `docs/knowledge/aliancas.md` |
| 6 | Fonte da importação de associados | Dedup por prioridade **`discordId > email > telefone`** |
| 8 | Permissão dedicada de "sócio" | Reusar `MEMBERS_APPROVE` por ora; revisitar se o fluxo de sócio crescer |
| 9 | Campos obrigatórios da LGE no cadastro de membro | **Fechado 2026-07-16** — campos RG, CPF, filiação, escolaridade, profissão, data de nascimento em `SaasMembro`; edição admin em `/admin/membros/[id]`; export CSV com `MEMBERS_EXPORT_LGE` |
| 10 | Permissão dedicada de desligamento estatutário | **Fechado 2026-07-16** — `MEMBERS_DISMISS` + `desligadoEm`/`desligadoMotivo`/`desligadoPorId` em `SaasMembro` |
| 14 | Provedor de gateway (Pix/boleto/cartão) | **Fechado 2026-07-16 (MVP Pix)** — mock default (`PIX_GATEWAY_MODE=mock`); Mercado Pago Pix opcional via `PIX_GATEWAY_MODE=mercadopago` + `MERCADOPAGO_ACCESS_TOKEN`. Ver `docs/data/modulo-associacao.md` |
| 15 | E2EE em conversas/canais vs moderação de conteúdo grave | **Fechado 2026-08-07 — Fase A**: plaintext + ACL + denúncia/filas; sem E2EE prometido. Feed/canais fora de E2EE; DM candidata só em fases B (envelope+escrow) / C (E2EE com moderação sem plaintext). Ver `docs/data/plano-criptografia-e-moderacao.md` e `ARCHITECTURE.md` §5.23 |

## Ainda em aberto

| # | Decisão | Opções | Nota |
|---|---|---|---|
| 7 | Provedor de API de jogos | API-Football, TheSportsDB, outros pagos; Wikidata spike | **2026-07-17:** Google Sports / painel SERP **descartado** como fonte — sem API oficial gratuita; Knowledge Graph ≠ fixtures; scraping SERP fora. Modelo `Partida` + cadastro manual já entregues. Spike: limites do plano free do provedor escolhido antes de fechar. Ver `docs/knowledge/futebol-dados-publicos.md` |
| 11 | Lock otimista no estoque da Loja | Adicionar campo `version`/lock otimista aos itens de estoque JSON, vs. manter read-modify-write | Sob concorrência real (duas compras simultâneas do mesmo item) o mapa de estoque pode ser sobrescrito. Achado da auditoria de 2026-07-16 (agente `loja`) |
| 12 | Remover `fazerPedido` (deprecated) | Remover quando não houver mais chamador do fluxo single-item antigo | Hoje delega a `adicionarAoCarrinho`; resquício do fluxo pré multi-item. Achado da auditoria de 2026-07-16 (agente `loja`) |
| 13 | Modelo de preço do SaaS vs mercado | Preço **fixo** (estilo Clube Control R$350–500) vs faixa por **sócios ativos/adimplentes** (TorcidaWeb / TorcidasPRO) | Benchmark 2026-07-16 em `docs/knowledge/concorrentes-gestao.md`; impacta GTM antes de vender cobrança como ROI |

Vocabulário (decisão #1): o **time é a razão de viver da torcida** (identidade), por
isso é modelado como `Afiliacao`, não como tabela genérica "clube". Sede → Subsede →
PDE é **afiliação territorial** (subsedes/PDEs afiliadas à sede), já modelada pela
auto-relação de `Sede`.

## Já decididas antes (referência — ver `ARCHITECTURE.md` §5)

- API central = **tRPC** (uso interno primeiro).
- `assertPermission` é o **único** critério de autorização do admin.
- Permissões resolvidas no servidor a cada request (não no JWT).
- Árvore de menu do admin estática no código (`packages/types`).
- `db push` (sem migrations) no estágio atual.
