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

Vocabulário (decisão #1): o **time é a razão de viver da torcida** (identidade), por
isso é modelado como `Afiliacao`, não como tabela genérica "clube". Sede → Subsede →
PDE é **afiliação territorial** (subsedes/PDEs afiliadas à sede), já modelada pela
auto-relação de `Sede`.

## Ainda em aberto

| # | Decisão | Opções | Nota |
|---|---|---|---|
| 7 | Provedor de API de jogos | ex.: API-Football, outros | Spike técnico na Fase 2: avaliar limites do plano free antes de fechar |
| 9 | Campos obrigatórios da LGE no cadastro de membro | Adicionar RG, CPF, filiação, escolaridade, profissão, data de nascimento a `SaasMembro`, ou manter mínimo atual | LGE 14.597/2023 exige esses dados; `SaasMembro` hoje só tem idade/telefone/endereço/`imagemProva`. Achado da auditoria de 2026-07-16 (agente `data-model`) |
| 10 | Permissão dedicada de desligamento estatutário de associado | Nova permissão `MEMBERS_DISMISS` (ou similar) com AuditLog próprio, vs. reusar `MEMBERS_BLOCK`/`MEMBERS_WARN` | Desligamento é figura estatutária distinta de bloqueio/advertência; hoje sem par dedicado. Achado da auditoria de 2026-07-16 (agentes `rbac`/`research-dominio`) |
| 11 | Lock otimista no estoque da Loja | Adicionar campo `version`/lock otimista aos itens de estoque JSON, vs. manter read-modify-write | Sob concorrência real (duas compras simultâneas do mesmo item) o mapa de estoque pode ser sobrescrito. Achado da auditoria de 2026-07-16 (agente `loja`) |
| 12 | Remover `fazerPedido` (deprecated) | Remover quando não houver mais chamador do fluxo single-item antigo | Hoje delega a `adicionarAoCarrinho`; resquício do fluxo pré multi-item. Achado da auditoria de 2026-07-16 (agente `loja`) |
| 13 | Modelo de preço do SaaS vs mercado | Preço **fixo** (estilo Clube Control R$350–500) vs faixa por **sócios ativos/adimplentes** (TorcidaWeb / TorcidasPRO) | Benchmark 2026-07-16 em `docs/knowledge/concorrentes-gestao.md`; impacta GTM antes de vender cobrança como ROI |
| 14 | Provedor de gateway (Pix/boleto/cartão) | Asaas vs Mercado Pago vs PagBank (ou outro) — spike técnico | Pré-requisito Fase A do `plano-paridade-concorrentes.md`; mesmo provedor deve servir mensalidade e Loja (Fase B) |

## Já decididas antes (referência — ver `ARCHITECTURE.md` §5)

- API central = **tRPC** (uso interno primeiro).
- `assertPermission` é o **único** critério de autorização do admin.
- Permissões resolvidas no servidor a cada request (não no JWT).
- Árvore de menu do admin estática no código (`packages/types`).
- `db push` (sem migrations) no estágio atual.
