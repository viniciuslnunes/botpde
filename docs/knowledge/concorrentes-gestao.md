# Base de conhecimento — Gaps de funcionalidade vs. concorrentes

> Catálogo **atômico** do que TorcidaWeb, Softaliza, TorcidasPRO e Clube Control
> oferecem (segundo landings oficiais) e o que o Torcida SaaS **não tem** ou tem
> só parcial. Consulta **2026-07-16**. Plano derivado:
> `docs/product/plano-paridade-concorrentes.md`.
>
> **Legenda de status nosso:** `✗` ausente · `~` parcial · `✓` existe  
> **Legenda concorrente:** `●` afirmam ter · `·` não aparece no material público  
> **Confiança:** MKT = só marketing/site · OBS = observado em copy detalhada /
> FAQ / planos. Não há acesso a demos internas — tratar `●` como *claim*, não
> como auditoria de qualidade.

Fontes:
- [TorcidaWeb](https://torcidaweb.com.br/) (TW)
- [Softaliza apresenta](https://www.softaliza.com.br/apresenta) + [associações](https://www.softaliza.com.br/associacoes) + [blog torcidas](https://softaliza.com.br/blog/sistema-de-gestao-torcidas-organizadas) (SF)
- [TorcidasPRO](https://torcidas.pro/) (TP)
- [Clube Control / torcidas](https://clubecontrol.com.br/torcidas/) (CC)

Inventário as-is nosso: schema + permissões + `docs/data/modulo-*.md` + rotas
portal/admin (auditoria de código 2026-07-16).

---

## 0. Resumo: o que eles têm e nós não (por volume)

| Domínio | Features atômicas onde ≥1 concorrente tem e nós `✗`/`~` | Concorrente dominante |
|---|---:|---|
| Cobrança & adimplência | ~18 | SF, CC, TW, TP |
| Carteirinha & identidade do sócio | ~8 | SF, CC |
| Planos / categorias de associado | ~6 | SF, TP, CC |
| Portal do sócio (autoatendimento financeiro) | ~7 | SF, TP, TW |
| Comunicação externa (e-mail/WhatsApp/push) | ~10 | SF, CC |
| Documentos / PDF / biblioteca | ~8 | SF, CC, TW |
| Assembleia / votação formal / disciplinar | ~9 | SF, CC |
| Eventos pagos / bilheteria / check-in QR | ~10 | CC (SF eventos científicos) |
| Portaria / sede física / day use / bar | ~20 | **só CC** |
| CRM / leads / captação | ~5 | CC (SF inscrição pública) |
| App / PWA / Wallet | ~5 | SF, CC |
| Relatórios / dashboard financeiro | ~6 | SF, TP, CC |
| Financeiro avançado (contas, conciliação) | ~6 | SF, CC, TP |
| **Total aproximado de gaps atômicos** | **~110+** | — |

Isso **não** significa “implementar 110 features”. Significa o mapa completo do
mercado. Priorização em `plano-paridade-concorrentes.md`.

---

## 1. Membros, planos, carteirinha, compliance

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Cadastro de sócios | ● | ● | ● | ● | ✓ | |
| Categorias / planos de sócio (ouro, pleno…) | · | ● | ● | ● | ✗ | SF: categorias + troca; TP: “planos de assinatura”; CC: planos+regras |
| Valores e periodicidade por plano | · | ● | ● | ● | ✗ | |
| Dependentes no cadastro | · | · | · | ● | ✗ | CC explícito |
| Taxa de adesão | · | · | · | ● | ✗ | |
| Aceite de estatuto no ingresso | · | · | · | ● | ✗ | |
| Formulário de cadastro customizável | · | ● | · | · | ✗ | SF |
| Campos LGE (CPF, RG, filiação, escolaridade, profissão, nascimento, foto) | · | ~ | · | ~ | ✗ | Mercado fala “cadastro completo”; LGE explícita é nosso ângulo — e ainda gap |
| Ficha médica (sangue, alergias, emergência) | · | · | · | ● | ✗ | CC |
| Portal / área do sócio | ● | ● | ● | ● | ~ | Temos portal; **não** centrado em financeiro/2ª via |
| Sócio atualiza próprios dados | · | ● | · | ● | ~ | Parcial via perfil |
| Status adimplente em tempo real | · | ● | ● | ● | ✗ | Table stake |
| Histórico financeiro do sócio | · | ● | ● | ● | ✗ | |
| 2ª via de boleto/cobrança | · | ● | ● | ● | ✗ | |
| Carteirinha digital visual | ● | ● | ● | ● | ✓ | |
| QR Code na carteirinha | · | ● | · | ● | ✗ | SF: QR de **adimplência**; CC: QR acesso |
| Carteirinha liga status ao pagamento | · | ● | · | ● | ✗ | |
| Editor visual de carteirinha (templates) | · | ● | · | · | ✗ | SF |
| Apple Wallet / Google Wallet | · | ● | · | · | ✗ | SF |
| Cartilhado / lote de carteirinhas | ● | · | · | · | ✗ | TW nomeia “Cartilhado Sócio” |
| Importação de base (Excel/planilha) | · | ● | · | ● | ~ | Nós: MOCK ok; CSV “em breve” |
| Migração assistida pelo fornecedor | · | ● | · | ● | ✗ | Comercial/ops, não produto |
| Página pública de filiação/interesse | · | ● | · | ● | ~ | Onboarding torcedor ≠ CRM lead CC |
| Desligamento estatutário auditado | · | · | · | ~ | ✗ | CC: suspensão; nós: decisão #10 |
| Troca de categoria de sócio | · | ● | · | · | ✗ | |

### Gaps nossos neste domínio (lista explícita)

1. Planos/categorias de associação com preço e regras  
2. Status adimplente/inadimplente  
3. Histórico financeiro + 2ª via no portal  
4. QR verificável + vínculo pagamento↔carteirinha  
5. Wallet (Apple/Google)  
6. Editor/templates de carteirinha  
7. Dependentes  
8. Ficha médica  
9. Taxa de adesão + aceite de estatuto  
10. Campos LGE completos  
11. Formulário de cadastro customizável  
12. Cartilhado em lote  
13. Desligamento estatutário  
14. CSV de importação ativo  

---

## 2. Cobrança, pagamentos, régua, conciliação

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Pagamento Pix (sócio → torcida) | ● | ● | ● | ● | ✗ | Table stake universal |
| Boleto | · | ● | · | ● | ✗ | SF/CC |
| Cartão de crédito | ● | ● | · | ● | ✗ | TW+SF+CC |
| Cartão recorrente + retentativa | · | ● | · | · | ✗ | SF |
| Pix recorrente | · | ● | · | · | ✗ | SF |
| Cobrança internacional (USD) | · | ● | · | · | ✗ | SF (baixo valor p/ torcida BR) |
| Geração automática de cobranças | · | ● | · | ● | ✗ | |
| Baixa automática via webhook | · | ● | · | ● | ✗ | |
| Régua pré-vencimento (D−3/−7/−15) | · | ● | · | ● | ✗ | SF detalha; CC WhatsApp D−3 |
| Régua pós-vencimento | · | ● | · | ● | ✗ | |
| Controle de inadimplência (lista/painel) | · | ● | ● | ● | ✗ | |
| Cupons de desconto em anuidade | · | ● | · | · | ✗ | SF (nós temos cupom só na **loja**) |
| Validação de comprovante manual (fila) | · | ● | · | · | ✗ | SF: aprovar/recusar transferência |
| Conciliação bancária automática | · | ● | · | · | ✗ | SF |
| Contas bancárias no sistema | · | · | · | ● | ✗ | CC |
| Extrato / transferências entre contas | · | · | · | ● | ✗ | CC |
| Cobrança só de adimplentes no pricing SaaS | ● | · | · | · | · | Modelo comercial TW |

### Gaps nossos (explícitos)

1. Qualquer gateway (Pix/boleto/cartão)  
2. Entidade Cobrança/Contribuição  
3. Recorrência e retentativa  
4. Régua completa  
5. Painel de inadimplência  
6. Baixa automática  
7. Fila de comprovantes manuais  
8. Conciliação / multi-conta  
9. Cupom em mensalidade (não só loja)  

---

## 3. Financeiro & relatórios

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Livro-caixa receitas/despesas | ● | ● | ● | ● | ✓ | |
| Fluxo de caixa consolidado | · | ● | ● | ● | ~ | Saldo derivado; sem projeção |
| Contas a pagar (AP) | · | · | ● | · | ✗ | TP destaca |
| Dashboard arrecadação / novos sócios | · | ● | ● | ● | ~ | KPIs parciais; sem adimplência |
| Relatório de inadimplência | · | ● | ● | ● | ✗ | |
| Relatório membros / crescimento | · | ● | ● | ● | ~ | |
| Export CSV/PDF financeiro | · | ● | · | ● | ✗ | |
| Pacote prestação de contas assembleia | · | · | · | ● | ✗ | CC âncora “assembleia” |
| Integração loja → financeiro auto | · | · | ● | · | ✗ | TP e-commerce nativo |
| Fechamento financeiro de evento | · | · | · | ● | ✗ | CC |

### Gaps nossos

1. Contas a pagar  
2. Relatório/painel de inadimplência  
3. Export CSV/PDF  
4. Pacote assembleia  
5. Lançamento automático a partir de loja/evento/cobrança  
6. Dashboard “saúde financeira” com adimplência %  

---

## 4. Loja / e-commerce

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Catálogo de produtos | · | · | ● | ~ | ✓ | CC tem bar/comanda (outro eixo) |
| Sacola / checkout | · | · | ● | · | ✓ | |
| Cupons loja | · | · | · | · | ✓ | |
| Pedidos com status (pago/enviado) | · | · | ● | · | ✓ | |
| Avaliações / visualizações produto | · | · | ● | · | ✗ | TP |
| Gateway na loja | · | · | ● | · | ✗ | TP: sem take-rate sobre venda |
| Frete / logística avançada | · | · | ~ | · | ✗ | |
| Desconto loja só para adimplente | · | · | · | · | ✗ | Dor citada no blog SF |

### Gaps nossos

1. Gateway na loja  
2. Avaliações de produto  
3. Gate de benefício “só adimplente” (loja + caravana)  

---

## 5. Eventos, caravanas, bilheteria, check-in

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Calendário / agenda | ● | ● | · | ● | ✓ | Hub Agenda + `Partida` (manual; sync API aberto) |
| Eventos gerais + RSVP | · | ● | ~ | ● | ✓ | + lista de espera / capacidade |
| Tipos de evento custom | · | · | · | ● | ~ | Temos GERAL/CARAVANA/ENSAIO fixos |
| Check-in por QR | · | ● | · | ● | ✓ | Admin + fila offline (browser) |
| Lista de presença / embarque | · | · | · | · | ✓ | Caravanas/bateria |
| Planejamento de viagens / caravanas | ● | · | · | · | ~ | TW marketing; nós plugin + hub Agenda |
| Compra de ingressos em grupo | ● | · | · | · | ✗ | TW |
| Bilheteria (presencial + online) | · | · | · | ● | ✗ | |
| Categorias ingresso (VIP/meia/cortesia) | · | · | · | ● | ✗ | |
| Caixa de bilheteria (abertura/fechamento) | · | · | · | ● | ✗ | |
| Pagamento de vaga em caravana | · | · | · | · | ~ | Fluxo parcial no detalhe do evento |
| Ônibus / mapa de assentos | · | · | · | · | ✗ | |
| Credenciamento científico / anais | · | ● | · | · | ✗ | SF (irrelevante p/ torcida) |
| Certificados automáticos | · | ● | · | · | ✗ | SF Academy |

### Gaps nossos (relevantes ao nicho)

1. ~~Check-in via QR~~ — ✓ (2026-07-17; fila offline no browser; PWA completa ainda horizonte)
2. Bilheteria / ingressos pagos  
3. Pagamento de vaga caravana (completar + financeiro do evento)  
4. Ingressos em grupo / viagens (TW)  
5. Fechamento financeiro do evento  
6. ~~Capacidade/lotação enforced~~ — ✓ lista de espera FIFO  
7. Sync externo de `Partida` (API de futebol — **não** Google Sports SERP)  

---

## 6. Comunicação

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Comunicados / boletins internos | ● | ● | · | ● | ✓ | Announcement |
| Notificações in-app | ● | ● | · | ● | ✓ | |
| E-mail em massa / segmentado | · | ● | · | ● | ✗ | |
| WhatsApp Business / templates | · | · | · | ● | ✗ | CC chat integrado |
| Push mobile | · | ● | · | ● | ✗ | |
| Régua: boas-vindas, vencimento, aniversário | · | ● | · | ● | ✗ | SF 10+ templates |
| Disparo multi-canal (WA+email+push) | · | · | · | ● | ✗ | CC boletins |
| Histórico de envios + taxa abertura | · | ● | · | · | ✗ | SF |
| Login por WhatsApp | · | ● | · | · | ✗ | SF |
| 2FA opcional | · | ● | · | · | ✗ | SF |
| Reset de senha por e-mail | · | ● | ● | ● | ✗ | TP “recuperação”; nós ARCHITECTURE aberto |

### Gaps nossos

1. E-mail transacional e broadcast  
2. WhatsApp API  
3. Push / PWA  
4. Aniversariantes  
5. Templates de régua (além de cobrança)  
6. Reset de senha  
7. 2FA  

---

## 7. Documentos, geração, biblioteca, jurídico

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Controle de documentos / regularização jurídica | ● | ● | · | ● | ✗ | TW âncora marketing |
| Biblioteca (atas, estatuto, regulamentos) | · | ● | · | ● | ✗ | SF segmenta por adimplência |
| Versionamento documental | · | · | · | ● | ✗ | |
| Geração: declaração de membro | · | ● | · | ● | ✗ | |
| Geração: recibo de pagamento | · | ● | · | ● | ✗ | |
| Geração: contratos / termos de adesão | · | · | · | ● | ✗ | |
| Termos de responsabilidade | · | · | · | ● | ✗ | |
| Comprovantes de pagamento ao sócio | · | ● | · | · | ✗ | |
| Dossiê LGE export único | · | · | · | · | ✗ | **Ninguém vende isso** — oportunidade |

### Gaps nossos

1. Biblioteca documental  
2. PDFs (recibo, declaração, termo)  
3. Segmentação doc por adimplência  
4. Dossiê LGE (diferencial nosso a construir)  

---

## 8. Governança: votações, ocorrências, metas

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Enquetes informais | · | ● | · | ● | ✓ | Feed + Meet |
| Eleição / votação com quórum | · | ● | · | ● | ✗ | SF: chapas, ata, sigilo auditável |
| Voto secreto auditável | · | ● | · | ● | ✗ | |
| Ata gerada automaticamente | · | ● | · | · | ✗ | SF |
| Pesquisas de satisfação | · | · | · | ● | ✗ | |
| Ocorrências / advertências com histórico | · | · | · | ● | ~ | Model bot; sem módulo web |
| Suspensão auto (ex.: inadimplência) | · | · | · | ● | ✗ | |
| Canal de denúncias disciplinar | · | · | · | ● | ~ | Denúncia social comunidade ≠ disciplinar |
| Achados e perdidos | · | · | · | ● | ✗ | |
| Metas / OKRs | · | · | · | ● | ✗ | |
| Liberações (atestados, autorizações) | · | · | · | ● | ✗ | |

### Gaps nossos

1. Assembleia/eleição formal  
2. Módulo disciplinar web completo  
3. Suspensão ligada a inadimplência  
4. Achados e perdidos / OKRs / liberações (baixo ROI salvo sede)  

---

## 9. Operação de sede física (quase exclusivo Clube Control)

| Feature | TW | SF | TP | CC | Nós |
|---|:-:|:-:|:-:|:-:|:-:|
| Portaria (validação entrada) | · | · | · | ● | ✗ |
| Histórico de entradas/saídas | · | · | · | ● | ✗ |
| Convidados com cota por plano | · | · | · | ● | ✗ |
| Compra de convites extras | · | · | · | ● | ✗ |
| Day use (visitante pagante) | · | · | · | ● | ✗ |
| Portal do visitante | · | · | · | ● | ✗ |
| Reservas de espaços/quadras | · | · | · | ● | ✗ |
| Bar / comanda eletrônica | · | · | · | ● | ✗ |
| Atividades / turmas / aulas | · | · | · | ● | ✗ |
| Acesso inteligente (catraca/biometria/facial) | · | · | · | ● | ✗ |
| Bloqueio físico de inadimplente | · | · | · | ● | ✗ |
| Hospedagem / unidades | · | · | · | ● | ✗ |
| Taxistas / transporte institucional | · | · | · | ● | ✗ |
| Galeria / patrocinadores / site público | · | ● | · | ● | ~ | Branding básico; sem site institucional |

**Quase todo este bloco é gap nosso vs CC apenas.** Relevância depende de ICP
com sede movimentada — não é table stake de “gestão de torcida digital”.

---

## 10. CRM, IA, app, white-label, API

| Feature | TW | SF | TP | CC | Nós | Notas |
|---|:-:|:-:|:-:|:-:|:-:|---|
| CRM leads + kanban | · | · | · | ● | ✗ | |
| Formulário público de interesse | · | ● | · | ● | ~ | |
| Relatório de conversão lead→sócio | · | · | · | ● | ✗ | |
| Copiloto IA gestor | · | · | · | ● | ✗ | Add-on CC |
| Copiloto IA secretaria (chat) | · | · | · | ● | ✗ | |
| App nativo iOS/Android white-label | · | ● | · | ~ | ✗ | CC: PWA/app +R$49 |
| Personalização cores/logo | ● | ● | ● | ● | ✓ | |
| Domínio / ambiente dedicado | · | · | · | ● | ~ | Subdomínio preparado |
| API REST | · | ● | · | · | ✗ | SF Premium; nós tRPC planejado |
| Página de perfil pública da torcida | ● | · | · | · | ~ | |
| Academy / cursos para sócios | · | ● | · | · | ✗ | SF |
| Site institucional da associação | · | ● | · | ● | ✗ | |

### Gaps nossos

1. CRM kanban  
2. App nativo / PWA  
3. API pública  
4. IA (baixa prioridade)  
5. Academy/cursos (baixo fit)  
6. Site institucional gerado  

---

## 11. O que NÓS temos e o mercado tipicamente não

(Para não distorcer o estudo — gaps deles.)

| Feature nossa | TW | SF | TP | CC |
|---|:-:|:-:|:-:|:-:|
| Hierarquia Sede → Subsede → PDE multi-tenant | · | · | · | · |
| Visibilidade cross-tenant + alianças | · | · | · | · |
| Rivalidade como bloqueio de visibilidade | · | · | · | · |
| Departamentos canônicos (bateria, caravanas…) + RBAC | · | · | · | · |
| Plugin caravanas / bateria operacional | · | · | · | · |
| Comunidade / feed / stories / seguimento | · | · | · | · |
| Comunidade nacional por afiliação | · | · | · | · |
| DM + grupos + canais | · | · | · | · |
| Meet / salas de vídeo (LiveKit) | · | · | · | · |
| Notícias curadas + Sofascore widgets | · | · | · | · |
| Patrimônio inventário (MVP) | · | · | · | ● |
| Grafo alianças/rivalidades (knowledge) | · | · | · | · |

---

## 12. Ranking de gaps por impacto comercial (só o que falta)

Critério: frequência no mercado × dor da diretoria × fit com ICP “organizada”
(não escolinha/clube social).

### P0 — Table stakes (sem isso perdemos demo de caixa)

| # | Gap | Quem tem | Esforço relativo |
|---|---|---|---|
| 1 | Planos de associação + preço | SF TP CC | M |
| 2 | Cobranças + status adimplente | todos | G |
| 3 | Gateway Pix (+ boleto) | todos | G |
| 4 | Baixa automática | SF CC TP? | M |
| 5 | Carteirinha QR ↔ adimplência | SF CC | M |
| 6 | Histórico financeiro + 2ª via no portal | SF TP CC | M |
| 7 | Home do sócio = status financeiro | SF | P |
| 8 | Campos LGE | (ângulo nosso) | M |

### P1 — Fecha o ciclo associativo

| # | Gap | Quem tem |
|---|---|---|
| 9 | Régua de cobrança (e-mail/in-app; WA depois) | SF CC |
| 10 | Gateway na loja | TP |
| 11 | Export CSV/PDF + relatório inadimplência | SF CC TP |
| 12 | Loja/cobrança → lançamento financeiro | TP SF |
| 13 | PDF recibo + declaração de membro | SF CC |
| 14 | Biblioteca documental básica | SF CC TW |
| 15 | Check-in evento/caravana via QR | CC SF |
| 16 | Desligamento / disciplinar web | CC |
| 17 | Gate benefício só adimplente (loja/caravana) | (dor SF blog) |
| 18 | Reset de senha / e-mail transacional | SF TP |
| 19 | Cupom em anuidade | SF |
| 20 | Fila comprovante manual | SF |

### P2 — Diferenciação de domínio / governança

| # | Gap | Quem tem |
|---|---|---|
| 21 | Pagamento de vaga caravana + lotação | (dor domínio; TW viagens) |
| 22 | Assembleia / eleição com quórum e ata | SF CC |
| 23 | Dossiê LGE export | ninguém |
| 24 | PWA + Web Push | SF CC |
| 25 | Contas a pagar | TP |
| 26 | Aniversariantes | SF CC |
| 27 | Importação CSV ativa + migração | SF CC |

### P3 — Sede física / nice-to-have (só com ICP)

Portaria, day use, convidados, bar, reservas, catracas, ficha médica,
dependentes, CRM kanban, OKRs, achados e perdidos, IA, Academy, site
institucional, Wallet, editor de carteirinha, API REST pública, avaliações
loja, bilheteria completa, hospedagem.

---

## 13. Por concorrente: catálogo do que eles afirmam e nós não cobrimos

### TorcidaWeb — gaps vs nós
Área do sócio financeira · Cartilhado · Pagamentos Pix/Cartão · Notificações
(provável push/email) · Regularização jurídica/docs · Viagens · Ingressos em
grupo · Arrecadação de fundos · Página de perfil personalizada (pública) ·
Calendário (se mais rico que o nosso).

**Confiança:** média-baixa — lista de features idêntica em todos os planos;
pouco detalhe.

### Softaliza — gaps vs nós
Ciclo completo de cobrança (Pix/boleto/cartão/recorrência/retentativa/USD) ·
Régua · Conciliação · Carteirinha editor + Wallet + QR adimplência ·
Categorias/planos · Cupom anuidade · Fila comprovantes · Votações com quórum/
ata · Biblioteca + timeline · E-mails segmentados · Templates automáticos ·
Academy/cursos/certificados · App nativo WL · API REST · 2FA · Login WhatsApp ·
Página filiação pública · Migração inclusa · Eventos científicos (ignorar).

**Confiança:** alta no catálogo (página `/apresenta` muito detalhada); baixa
relevância de módulos científicos/sindicato.

### TorcidasPRO — gaps vs nós
Planos de assinatura · Status pagamento em tempo real na listagem de sócios ·
Painel do torcedor (faturas/carteirinha) · Contas a pagar · Dashboard
arrecadação+e-commerce · Gateway loja sem take-rate · Avaliações/visualizações
produto · Personalização (já parcial) · Recuperação de senha.

**Confiança:** média — landing curta; +8 anos e clientes nomeados aumentam
credibilidade do núcleo sócio+loja+financeiro.

### Clube Control — gaps vs nós (além do table stake de caixa)
**Gestão:** dependentes, taxa adesão, aceite estatuto, CRM kanban, ficha médica,
WhatsApp chat, push, aniversariantes, boletins multi-canal, docs+geração,
votações, ocorrências, achados e perdidos, metas/OKRs, relatórios ricos,
institucional (galeria, patrocinadores, taxistas, site), contas bancárias.

**Operação:** eventos com QR e fechamento $, bilheteria, convidados, day use,
portaria, portal visitante, bar/comanda, reservas espaços, liberações,
atividades/turmas.

**Especializados:** catracas/biometria/facial, hospedagem, copiloto IA ×2, app.

**Confiança:** alta no *mapa de módulos* (landing exaustiva); qualidade real
não auditada.

---

## 14. Protocolo

1. Atualizar esta matriz a cada trimestre ou pós-demo comercial.  
2. Novos claims: data + URL + marcar MKT vs OBS.  
3. Quem escreve: `research-dominio`. Priorização: `product-strategy` via
   `plano-paridade-concorrentes.md`.  
4. Nunca tratar módulo CC de sede como obrigatório sem ICP.
