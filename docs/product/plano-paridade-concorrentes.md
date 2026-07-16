# Plano — Paridade e diferenciação vs. gestão de torcidas

> Decisão de produto a partir do benchmark de 2026-07-16
> (`docs/knowledge/concorrentes-gestao.md`) cruzado com o inventário as-is
> do Torcida SaaS. Objetivo: **gerar valor** onde o mercado já cobra
> table stakes, **sem diluir** o que só nós temos (hierarquia, alianças,
> departamentos, comunidade).
>
> Princípio do roadmap vigente: **endurecer o núcleo operacional** antes de
> expandir. Este plano respeita isso — cobrança/carteirinha/LGE vêm antes de
> catracas/bar/IA.

## Veredito executivo

Os quatro concorrentes ([TorcidaWeb](https://torcidaweb.com.br/),
[Softaliza](https://softaliza.com.br/blog/sistema-de-gestao-torcidas-organizadas),
[TorcidasPRO](https://torcidas.pro/),
[Clube Control](https://clubecontrol.com.br/torcidas/)) competem no eixo
**“associação com mensalidade + carteirinha + caixa”**. Nós já competimos
(e ganhamos) no eixo **“organizada com território, alianças e mobilização”**.

O gap que **trava conversão comercial** hoje não é comunidade — é:

1. **Cobrança recorrente** (Pix/boleto) ligada a adimplência  
2. **Carteirinha com QR real** (status ativo/adimplente)  
3. **Cadastro LGE-completo** + exportação / desligamento auditado  
4. **Home do sócio** centrada em status financeiro + próxima ação  

Sem isso, o mercado nos lê como “rede social de torcida”, não como sistema
que **paga a mensalidade do software com redução de inadimplência** — narrativa
central de TorcidaWeb, Softaliza e Clube Control.

**Não** priorizar no horizonte próximo: catracas/biometria, bar/comanda,
hospedagem, CRM kanban de leads, copiloto IA, day use. São módulos de
**clube social / sede física** (Clube Control). Só entram quando o ICP
confirmado for “sede com portaria”.

---

## Norte de produto (posicionamento)

| Eixo | Mensagem |
|---|---|
| **Compliance** | Cadastro LGE + dossiê + desligamento auditado (argumento que o mercado só menciona de leve) |
| **Operação territorial** | Sede → Subsede → PDE, departamentos, caravanas/bateria |
| **Caixa** | Planos de sócio + régua de cobrança + carteirinha viva |
| **Mobilização** | Comunidade, alianças, eventos, presença (já forte) |
| **Comércio** | Loja + gateway (fechar paridade com TorcidasPRO) |

Uma frase: *o único SaaS que une governança de organizada (LGE + território +
alianças) com o caixa automatizado que a diretoria já espera.*

---

## Fases de integração

### Fase A — Table stakes de caixa (agora / próximo ciclo)

**Por quê:** sem isso, qualquer demo contra TorcidaWeb/TorcidasPRO/Softaliza
perde no primeiro “e a mensalidade?”. Alinha com Fase 1 do `roadmap.md`
(núcleo operacional + dados reais).

| # | Entrega | Base existente | Aprende de | Critério de aceite |
|---|---|---|---|---|
| A1 | **Campos LGE** em `SaasMembro` (RG, CPF, filiação, escolaridade, profissão, nascimento) + retenção LGPD | Cadastro mínimo; decisão aberta #9 | Softaliza (campos custom) + `contexto-legal.md` | Cadastro/edição/admin; não expor em público; exportação CSV restrita |
| A2 | **Planos de associação** do tenant (valor, periodicidade, benefícios) | Hoje `Tenant.plano` = tier SaaS — **não** confundir | TorcidasPRO / Softaliza / Clube | CRUD admin; vincular sócio a plano |
| A3 | **Contribuições / cobranças** (mensalidade, taxa adesão) + status adimplente | Livro-caixa manual (`FinanceiroLancamento`) | Softaliza régua; Clube contribuições | Geração de cobrança; baixa manual MVP; status no sócio |
| A4 | **Gateway Pix** (MVP: Pix QR ou link; boleto/cartão depois) | Loja sem gateway | TorcidaWeb / Softaliza | Pagar cobrança no portal; webhook baixa; AuditLog |
| A5 | **Carteirinha com QR verificável** (token assinado + endpoint validação) | `SaasSocio` + UI placeholder | Softaliza Wallet (fase posterior); Clube QR | QR abre validação: ativo/adimplente/bloqueado; check-in eventos pode reusar |
| A6 | **Home do associado** = status + 2ª via / pagar + próximo evento | Roadmap item 3 parcial | Softaliza portal | Um olhar = “estou em dia?” + CTA |

**Fora da Fase A:** WhatsApp API, Apple/Google Wallet, conciliação bancária
OFX, catracas.

**Dependências técnicas:** provedor Pix (decidir: Asaas, Mercado Pago,
PagBank — spike); permissões novas `finance:billing` vs reusar
`finance:manage` (agente `rbac`); schemas Zod em `@torcida/types`.

**Agentes:** `product-strategy` (já fechou), `data-model`, `rbac`,
`research-dominio` (LGE), `ux-review`, `implementation`, `qa-verification`.

---

### Fase B — Fechar o núcleo associativo (importante depois)

| # | Entrega | Por quê | Concorrente |
|---|---|---|---|
| B1 | Régua de cobrança (D−3, D0, D+3) + e-mail/WhatsApp **ou** notificação in-app forte | −inadimplência é a história de ROI do mercado | Softaliza, Clube |
| B2 | Gateway na **Loja** (mesmo provedor da mensalidade) | Paridade TorcidasPRO; unifica caixa | TorcidasPRO |
| B3 | Exportação financeiro CSV/PDF + pacote “assembleia” (receitas, despesas, adimplência) | Prestação de contas | Clube Control |
| B4 | Integração Loja/Pedidos → lançamento financeiro automático | Caixa deixa de ser só manual | TorcidasPRO |
| B5 | Desligamento estatutário (`MEMBERS_DISMISS`) + histórico disciplinar leve | LGE / responsabilidade objetiva | Softaliza ocorrências (versão mínima) |
| B6 | Documentos: recibo de pagamento + declaração de membro (PDF) | TorcidaWeb “jurídico”; Softaliza comprovantes | Softaliza |
| B7 | Check-in eventos/caravanas via **mesmo QR** da carteirinha | Fecha MVP caravanas sem app offline | Clube bilheteria (subset) |

**Não fazer em B:** bilheteria completa com categorias VIP/meia; bar; reservas
de quadra.

---

### Fase C — Diferenciação de domínio (futuro próximo)

Aqui o plano **não** é paridade — é alavancar o que só nós temos e o que o
mercado ignora.

| # | Entrega | Valor |
|---|---|---|
| C1 | Caravanas: pagamento de vaga + lista embarque + check-in QR | Dor #1 de logística (`product-strategy` / glossário) |
| C2 | Assembleia / votação formal (quórum, sigilo opcional, ata) | Softaliza/Clube têm; nós temos Meet+enquetes — evoluir |
| C3 | Dossiê de regularidade LGE (export único para poder público) | Argumento de venda único |
| C4 | PWA + Web Push (antes de RN/Expo) | Mobile-first do nicho sem custo de app stores |
| C5 | CRM leve de interessados → funil torcedor→sócio | Só se métrica de onboarding justificar; Clube tem kanban |

---

### Fase D — Operação de sede física (só com ICP validado)

Copiar Clube Control **inteiro** é armadilha de escopo. Entrar só se
clientes pagantes pedirem sede com fluxo:

1. Reservas de espaços da sede  
2. Portaria com validação QR (sem hardware)  
3. Day use / convidados por cota de plano  
4. Depois: integração catracas (parceiro), bar/comanda  

Até lá: **não** competir no pricing “31 módulos”.

---

## Matriz de decisão rápida (o que integrar / o que ignorar)

| Feature do mercado | Integrar? | Fase | Motivo |
|---|---|---|---|
| Planos + mensalidade + Pix | **Sim** | A | Table stake / ROI |
| Carteirinha QR adimplência | **Sim** | A | Table stake + check-in |
| Campos LGE | **Sim** | A | Compliance + venda |
| Régua + lembretes | **Sim** | B | ROI inadimplência |
| Gateway loja | **Sim** | B | Paridade TorcidasPRO |
| PDF recibo/declaração | **Sim** | B | Baixo esforço / confiança |
| WhatsApp API chat | Parcial | B (templates) / D | Caro; notif in-app primeiro |
| Votação assembleia | **Sim** | C | Governança real |
| App nativo white-label | Não agora | pós-C (PWA→RN) | Softaliza diferencia; roadmap já tem Expo |
| Portaria / catracas | Condicional | D | Só sede física |
| Bar / day use / hospedagem | **Não** (default) | — | Fora do ICP organizada digital |
| CRM kanban leads | Condicional | C | Onboarding torcedor pode bastar |
| Copiloto IA | **Não** | — | Add-on de marketing; sem dados de caixa maduros |
| Pricing por membro vs fixo | Decisão aberta | — | Ver `decisoes-abertas` (novo item) |

---

## Ordem sugerida de sprints (2 semanas)

Assumindo continuidade do endurecimento do núcleo:

| Sprint | Foco |
|---|---|
| S1 | A1 LGE fields + decisão gateway + modelo Planos/Contribuição (`data-model`) |
| S2 | A2–A3 planos + cobranças + status adimplente (baixa manual) |
| S3 | A4 Pix MVP + webhooks + AuditLog |
| S4 | A5–A6 carteirinha QR + home sócio |
| S5+ | Fase B (régua, loja gateway, export assembleia, docs PDF) |

Importação de membros e visibility (roadmap Fase 1) **continuam** —
alimentam base real para cobrança. Não pausar importação por causa deste
plano; cobrança sem base é teatro.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Escopo vira “ERP Clube Control” | Gate de Fase D; ICP explícito |
| Gateway + compliance PCI/LGPD | Preferir provedor com Pix + hospedagem de dados; minimização CPF |
| Confundir `Tenant.plano` (SaaS) com plano de sócio | Nomes distintos no schema (`PlanoAssociacao` / `Contribuicao`) |
| Comunidade continuar atraindo atenção de eng | Manter performance em manutenção; **não** abrir Fase E/F sem métrica |
| Pricing nosso indefinido | Abrir decisão #13 (fixo vs por sócio ativo) antes de GTM |

---

## Decisões a registrar (produto)

1. **Provedor de pagamento** (spike S1).  
2. **Modelo de preço do SaaS** vs mercado (fixo Clube vs faixa TorcidaWeb/PRO).  
3. Fechar `decisoes-abertas.md` #9 (LGE) e #10 (desligamento) como pré-requisito
   de A1/B5.  
4. Wallet (Apple/Google) — só após QR estável (Fase B+).

---

## Como os agentes usam este doc

| Agente | Uso |
|---|---|
| `research-dominio` | Atualiza `concorrentes-gestao.md`; não inventa feature sem cruzar aqui |
| `product-strategy` | Prioriza backlog; recusa catracas/IA sem evidência de ICP |
| `data-model` | Propõe `PlanoAssociacao`, `Cobranca`, campos LGE |
| `rbac` | Permissões de cobrança / export LGE / dismiss |
| `loja` | Gateway compartilhado com mensalidade (Fase B) |
| `ux-review` | Home do sócio = status financeiro primeiro |
| `implementation` | Só após aceite de fase; escopo mínimo por sprint |
| `qa-verification` | Aceite = adimplência correta + QR validável + AuditLog |

Ver também: `docs/product/roadmap.md`, `docs/product/dominio.md`,
`docs/knowledge/contexto-legal.md`.
