# Plano — Paridade e diferenciação vs. gestão de torcidas

> Baseado no catálogo atômico de gaps em
> `docs/knowledge/concorrentes-gestao.md` (consulta 2026-07-16, **versão
> abrangente**). Este arquivo **prioriza**; o knowledge **inventaria**.
>
> Princípio: endurecer núcleo operacional. ~110 gaps atômicos mapeados ≠
> backlog a implementar. Só P0–P2 entram no horizonte próximo.

## Veredito

O mercado (TorcidaWeb, Softaliza, TorcidasPRO, Clube Control) cobre um
**ERP associativo**: planos, cobrança multi-meio, régua, carteirinha com QR
de adimplência, portal financeiro do sócio, docs/PDF, e-mail, e — no caso do
Clube Control — **sede física** (portaria, day use, bar, catracas).

Nós cobrimos um **sistema de organizada**: território Sede→PDE, alianças,
departamentos, caravanas/bateria, comunidade, Meet.

**Lacuna comercial crítica (antes):** table stakes de caixa/carteirinha ausentes.
**Status 2026-07-16:** Fase A (P0) entregue; Fase B com MVP parcial (régua in-app,
export CSV, recibo, dismiss, check-in QR). Gaps restantes: gateway Loja, e-mail,
gate de benefício só adimplente.

**Não** tratar os ~20 gaps de sede física do Clube Control como roadmap
default.

---

## Inventário condensado: o que falta (P0–P2)

### P0 — Table stakes de caixa (Fase A) ✓ 2026-07-16

| ID | Gap | Status | Aceite |
|---|---|---|---|
| A1 | Campos LGE em `SaasMembro` | ✓ | Cadastro/admin + LGPD |
| A2 | `PlanoAssociacao` (≠ `Tenant.plano`) | ✓ | CRUD + vínculo sócio |
| A3 | `CobrancaAssociacao` + status adimplente | ✓ | Geração + baixa manual MVP |
| A4 | Gateway Pix (mock + MP opcional) | ✓ | Pagar no portal + webhook |
| A5 | Carteirinha QR verificável ↔ adimplência | ✓ | Endpoint validação |
| A6 | Portal: histórico financeiro + 2ª via | ✓ | Self-service `/portal/cobrancas` |
| A7 | Home do sócio = status + CTA pagar | ✓ | `/portal` |

### P1 — Ciclo associativo (Fase B) — MVP parcial ✓

| ID | Gap | Status |
|---|---|---|
| B1 | Régua D−3/D0/D+3 (in-app → e-mail → WA) | ✓ parcial (in-app manual) |
| B2 | Gateway na Loja (mesmo provedor) | pendente |
| B3 | Export CSV/PDF + relatório inadimplência | ✓ CSV livro-caixa |
| B4 | Loja/cobrança → `FinanceiroLancamento` auto | ✓ cobrança→lançamento; loja pendente |
| B5 | PDF recibo + declaração de membro | ✓ recibo HTML |
| B6 | Biblioteca documental básica | pendente |
| B7 | Check-in eventos/caravanas via QR carteirinha | ✓ |
| B8 | Desligamento estatutário + disciplinar web | ✓ dismiss |
| B9 | Gate benefício só adimplente (loja/caravana) | pendente |
| B10 | E-mail transacional + reset de senha | pendente |
| B11 | Fila comprovante manual (transferência) | pendente |
| B12 | Cupom em anuidade | pendente |

Implementação: `docs/data/modulo-associacao.md`.

### P2 — Domínio / governança (Fase C)

| ID | Gap | Notas |
|---|---|---|
| C1 | Pagamento vaga caravana + lotação | MVP: `Evento.valorVaga` + cobranca AVULSA `eventoId`; lotação via sede.capacidade |
| C2 | Assembleia/eleição (quórum, sigilo, ata) | SF CC |
| C3 | Dossiê LGE export único | Ninguém tem — diferencial |
| C4 | PWA + Web Push | Antes de RN/Expo |
| C5 | Contas a pagar | TP |
| C6 | Aniversariantes | SF CC |
| C7 | Importação CSV ativa | SF CC |

### P3 — Fora do horizonte (Fase D / descartar)

Dependentes, ficha médica, CRM kanban, OKRs, achados e perdidos, portaria,
day use, convidados, bar, reservas de quadra, catracas/biometria, hospedagem,
Academy/cursos, site institucional, Wallet, editor visual de carteirinha,
API REST pública, avaliações de produto, bilheteria VIP completa, copiloto IA,
login WhatsApp, 2FA (salvo compliance forçar), USD internacional.

Abrir P3 **só** com cliente pagante pedindo sede física ou feature pontual.

---

## Matriz de decisão (integrar?)

| Feature do mercado | Integrar? | Fase |
|---|---|---|
| Planos + Pix + adimplência + QR | **Sim** | A |
| Régua + e-mail + docs PDF + loja gateway | **Sim** | B |
| Caravana paga + assembleia + PWA + dossiê LGE | **Sim** | C |
| WhatsApp API | Parcial | B templates / C chat |
| Wallet / editor carteirinha | Depois | pós-B |
| Portaria / catracas / bar / day use | Condicional | D |
| CRM kanban / IA / Academy | **Não** (default) | — |
| Softaliza científico / sindicato folha | **Não** | — |

---

## Sprints sugeridos (2 semanas)

| Sprint | Escopo |
|---|---|
| S1 | A1 LGE + decisão gateway (#14) + modelagem A2/A3 (`data-model`/`rbac`) |
| S2 | A2–A3 planos + cobranças + adimplência (baixa manual) |
| S3 | A4 Pix + webhooks + AuditLog |
| S4 | A5–A7 QR + histórico/2ª via + home sócio |
| S5–S7 | Fase B (régua, loja gateway, export, PDF, QR check-in, dismiss) |
| S8+ | Fase C conforme métrica |

Importação de membros (roadmap Fase 1) **continua em paralelo** — cobrança sem
base real é teatro.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Scope creep “virar Clube Control” | Gate P3; ICP sede explícito |
| `Tenant.plano` vs plano de sócio | Nomes `PlanoAssociacao` / `Cobranca` |
| PCI/LGPD com CPF + gateway | Provedor hospeda PAN; minimização |
| Comunidade sugar eng | Manutenção only; sem Fase E/F feed |
| Pricing SaaS indefinido | Decisão #13 antes de GTM |

---

## Decisões abertas

- #9 LGE · #10 dismiss · **#13** pricing fixo vs por sócio · **#14** provedor Pix  
- Spike: Asaas vs Mercado Pago vs PagBank  

## Agentes

| Agente | Papel |
|---|---|
| `research-dominio` | Mantém matriz em `concorrentes-gestao.md` |
| `product-strategy` | Recorta P0–P2; recusa P3 sem ICP |
| `data-model` / `rbac` / `loja` / `ux-review` | Executam A–B |
| `implementation` | Só após aceite de sprint |

Leitura obrigatória antes de priorizar caixa: **seção 12** de
`docs/knowledge/concorrentes-gestao.md` (ranking P0–P3).
