# Proposta — Confiança do torcedor (gamificação que desbloqueia funcionalidades)

> **Status: recortes 1–4 entregues (2026-08-30).** Ledger + saldo + sinais;
> AND em grupo/canal/sala no tenant; badge de nível no perfil; progresso
> privado no próprio perfil. Sem ranking público.
> Decisões 1–3 **fechadas** abaixo.

## Ideia

Avaliar a confiança do torcedor ao longo das suas interações com o sistema e com
a torcida e, a partir de um patamar, liberar funcionalidades hoje restritas:
criar **grupos**, **canais**, **salas**.

## 1. São dois eixos, não um score único

| Eixo | Onde mora | Do que trata | Desbloqueia |
| --- | --- | --- | --- |
| Confiança **na plataforma** | global, por `User`/`PerfilTorcedor` | antifraude/antiabuso: verificação, tempo de casa, histórico de moderação, denúncias | interação cross-tenant (DM, busca, canais de aliados) |
| Confiança **na torcida** | por tenant, no `SaasMembro` | mérito e pertencimento: presença, mensalidade, projetos/áreas, aprovação da liderança | criar grupo/canal/sala **dentro** da torcida |

Motivo da separação: score único produz o pior caso — o membro presente há anos
travado por não postar no app, e o farmador de posts virando "confiável".

**MVP (recorte 1):** só o eixo local. Tabela `ConfiancaSaldo` é `(userId, tenantId)`.

## 2. Confiança NÃO concede permissão

`assertPermission` continua sendo o único critério de autorização (CLAUDE.md).
Confiança é um **segundo eixo, sempre restritivo**, composto por AND:

```
podeCriarGrupo = assertPermission('groups:create')  E  temCapacidade(nivel, 'grupo:criar')
```

- Permissões relevantes já existem: `groups:create`, `channels:manage`,
  `meetings:host`, `messages:send` (`packages/types/src/permissions.js`).
- Liderança pode dar **override manual** (com `AuditLog`); ninguém sobe de nível
  contornando o RBAC.
- **Cargo dá piso de nível**: responsável de área que assume hoje precisa criar
  canal hoje. Sem piso, o score trava a operação real da torcida.
  Recorte 1: `owner`/`admin`/`vice` → piso 2.

Sem essa regra nasce um sistema de permissões sombra — em seis meses ninguém
sabe por que fulano consegue criar canal.

## 3. Modelo de dados: ledger, nunca contador

- **`ConfiancaEvento`** — append-only: `(userId, tenantId, sinal, peso,
  origemTipo, origemId, criadoEm)`. Unique `(sinal, origemTipo, origemId)`.
- **`ConfiancaSaldo`** — materializado por `(userId, tenantId)`: `score`,
  `nivel`, `atualizadoEm`.
- Tabela de níveis → capacidades em `packages/types/src/confianca.js`.

Doc de implementação: `docs/data/modulo-confianca.md`.

## 4. Sinais — ordenados por custo de falsificação

Sinal barato de emitir vira farm.

**Caros (peso alto)** — recorte 1 ligado
- Check-in em evento por QR — presença física.
- Mensalidade paga (`CobrancaAssociacao` tipo `MENSALIDADE`).
- Aprovação / reprovação com laudo.

**Médios** — ainda não: tempo de casa, caravana cumprida, bateria/bandeiras.

**Baratos (peso baixo ou zero)** — post, reação, comentário. Não entram.

**Negativos** — reprovação (−40). Advertência/bloqueio/denúncia: recortes seguintes.

## 5. Anti-burla

- **Teto por fonte e por janela**: check-in 45 pts / 30 dias; mensalidade
  20 pts / 30 dias (uma competência). Check-in de quem não é membro APROVADO
  no tenant não pontua.
- **Decaimento com piso**: check-in antigo conta metade (não evapora).
- **Rebaixamento não é retroativo**: quem criou um grupo mantém o grupo (recorte 2).

## 6. Riscos (levantar antes de codar)

- **Score visível é combustível social.** Recorte 4: **nível (badge) visível;
  score numérico privado**; progresso só no próprio perfil. Sem ranking.
- **LGPD**: score é dado pessoal inferido. Precisa entrar na exportação. Ledger
  responde "por quê".
- **Canal restrito (R5)**: sinal fica no tenant onde aconteceu.

## 7. Recortes

1. **Esqueleto sem gamificação visível** — ✅ 2026-08-30. Ledger + saldo + 3
   sinais.
2. **Um desbloqueio** — ✅ `groups:create` atrás do nível 2 (tenant; não CN).
   Reversível; grupos já criados permanecem.
3. **Canais e salas** — ✅ mesmo AND (`canal:criar`, `sala:hospedar`). Piso 2
   cobre liderança no dia 1. LiveKit continua atrás de `isLiveKitConfigured()`.
4. **Camada visível** — ✅ badge de nível no perfil; “faltam N para {nível}”
   só no próprio Sobre. Sem ranking / leaderboard.

## 8. Decisões (fechadas 2026-08-30)

1. **Local e global, ou só local no MVP?** → **Só local.** Global entra quando
   cross-tenant (DM/busca de aliados) for o problema.
2. **Score privado com nível visível, ou competição explícita?** → **Score
   privado; nível visível no recorte 4.** Sem ranking público.
3. **Incentivar engajamento ou conter abuso?** → **Conter abuso.** Sinais caros;
   post/reação não pontuam. Calibração oposta à "farm de like".
