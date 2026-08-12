# Proposta — Confiança do torcedor (gamificação que desbloqueia funcionalidades)

> **Status: parado / backlog** (registrado em 2026-08-12). Nada implementado.
> Retomar depende das três decisões abertas no fim deste documento.

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

Sem essa regra nasce um sistema de permissões sombra — em seis meses ninguém
sabe por que fulano consegue criar canal.

## 3. Modelo de dados: ledger, nunca contador

- **`ConfiancaEvento`** — append-only: `(userId, tenantId?, sinal, peso,
  origemTipo, origemId, criadoEm)`. É a auditoria do score e a única forma de
  responder "por que caí de nível?" — pergunta que vai chegar.
- **`ConfiancaSaldo`** — materializado por `(userId, tenantId|null)`: `score`,
  `nivel`, `atualizadoEm`. É o que as queries leem. Recalcular varrendo o ledger
  em toda página contraria `ARCHITECTURE.md` §5.6.
- Tabela de níveis → capacidades como **dado puro** em `packages/types` (no
  espírito de `SYSTEM_ROLE_PERMISSIONS`), com função pura testável. Mexer em
  limiar deve ser mudar constante, não caçar `if`.

## 4. Sinais — ordenados por custo de falsificação

Sinal barato de emitir vira farm.

**Caros (peso alto)**
- Check-in em evento por QR (Agenda já tem QR offline) — presença física, o
  sinal mais valioso do produto.
- Mensalidade/financeiro em dia — dinheiro real.
- Aprovação de cadastro pela liderança; e o inverso, **reprovação com laudo**
  (`CATEGORIAS_REPROVACAO`), sinal negativo de primeira qualidade.
- `ProjetoParticipante`, responsabilidade em `DepartamentoArea`.

**Médios** — tempo de casa, caravana confirmada e cumprida, bateria/bandeiras.

**Baratos (peso baixo ou zero)** — post, reação, comentário. Se curtida vale
ponto, cria-se fazenda de likes na Comunidade. No máximo entram como
manutenção (evitam decaimento), nunca como ascensão.

**Negativos** — advertência (`members:warn`), bloqueio, denúncia procedente,
moderação de mensagem. Queda rápida, subida lenta: assimetria proposital.

## 5. Anti-burla

- **Teto por fonte e por janela**: sinal barato contribui no máximo X por semana.
- **Decaimento com piso**: inatividade reduz, mas presença física acumulada não
  evapora — quem sumiu 3 meses volta um nível abaixo, não como novato.
- **Sinal de terceiro ponderado pela confiança de quem emite**: endosso do
  presidente ≠ endosso de conta de 2 dias. Sem isso, contas-fantasma se
  endossam em círculo.
- **Rebaixamento não é retroativo**: quem criou um grupo mantém o grupo; perde a
  permissão de criar o próximo. Revogação retroativa quebra a comunidade em
  silêncio.

## 6. Riscos (levantar antes de codar)

- **Score visível é combustível social.** Em torcida organizada, ranking público
  de confiança vira hierarquia paralela e conflito. Recomendação: **nível
  visível (badge), score numérico privado** — "faltam 2 presenças para o próximo
  nível", nunca "743 pontos, 12º lugar".
- **LGPD**: score é dado pessoal inferido. Precisa entrar na exportação e o
  usuário precisa ver *por quê* — o ledger resolve de graça. Sem ledger, é um
  sistema opaco que pune pessoas. (Ver §5.24: exclusão de conta ainda pendente.)
- **Não usar confiança como punição disfarçada.** Moderação tem laudo e
  contraditório; se rebaixar virar castigo informal, perdem-se as duas coisas.
- **Canal restrito (R5)**: sinais de unidade isolada não podem vazar para o score
  global de forma que reexponha a unidade. Confiança local fica local.

## 7. Recorte sugerido

1. **Esqueleto sem gamificação visível** — ledger + saldo + 3 sinais (check-in,
   mensalidade, aprovação/reprovação) + níveis calculados. UI inalterada. Rodar
   semanas sobre dados reais e observar a distribuição **antes** de amarrar
   funcionalidade. Calibrar com dados é barato; recalibrar depois de prometer
   desbloqueio ao usuário é caro.
2. **Um desbloqueio só** — `groups:create` atrás do nível 2. Reversível, baixo
   risco, mede se o incentivo funciona.
3. **Canais e salas** — custo de abuso maior (sala = LiveKit = infra paga; canal
   = ruído estrutural). Só depois de confiar na curva.
4. **Camada visível** — badges, missões, progresso. Só com o motor calibrado.

## 8. Decisões abertas (bloqueiam o plano executável)

1. **Local e global, ou só local no MVP?** Só local já cobre grupo/canal/sala;
   global só importa quando cross-tenant entra em jogo.
2. **Score privado com nível visível, ou competição explícita?** Muda o produto
   inteiro.
3. **O problema é incentivar engajamento ou conter abuso?** (conta nova fazendo
   bagunça, excesso de canais/grupos, ruído). Implementação parecida,
   **calibração oposta**.

Ao retomar: agente `product-strategy` para cruzar com o roadmap e `rbac` para
fechar o gate composto.
