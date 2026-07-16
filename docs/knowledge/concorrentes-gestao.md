# Base de conhecimento — Concorrentes de gestão para torcidas

> Benchmark de produtos SaaS que vendem **gestão de torcidas organizadas**
> (ou associação genérica posicionada para o nicho). Alimenta
> `product-strategy`, `research-dominio` e o plano em
> `docs/product/plano-paridade-concorrentes.md`.
>
> **Consulta:** 2026-07-16. **Confiança:** alta para o que está no site
> (pricing, módulos listados); média/baixa para profundidade real de
> implementação (marketing ≠ produto). Não é aconselhamento comercial.

## Escopo e método

Fontes primárias (sites oficiais / landing):

| Produto | URL | Posicionamento declarado |
|---|---|---|
| [TorcidaWeb](https://torcidaweb.com.br/) | torcidaweb.com.br | Gestão de membros para torcidas / clubes / grupos |
| Softaliza | [blog torcidas](https://softaliza.com.br/blog/sistema-de-gestao-torcidas-organizadas) + [associações](https://www.softaliza.com.br/associacoes) | Plataforma de **associações** reposicionada para torcidas |
| [TorcidasPRO](https://torcidas.pro/) | torcidas.pro | Gestão completa + loja + financeiro (+8 anos) |
| [Clube Control](https://clubecontrol.com.br/torcidas/) | clubecontrol.com.br/torcidas | ERP operacional sede+portaria+eventos (31+ módulos) |

Critério: o que o mercado **vende como obrigatório**, o que é **diferencial de
marketing**, e o que **nenhum** resolve bem no domínio real de organizada
(hierarquia sede/PDE, alianças, departamentos de bateria/caravanas, LGE,
comunidade cross-tenant).

---

## A) Matriz de value prop

| | TorcidaWeb | Softaliza | TorcidasPRO | Clube Control |
|---|---|---|---|---|
| **Promessa** | Membros + carteirinha + pagamentos, preço justo | Transformação digital associativa (cobrança auto) | Sócios + loja + financeiro num lugar | Substituir planilhas + WhatsApp + catracas |
| **Persona** | Diretoria de torcida média | Associação/sindicato (torcida = canal) | Torcida com loja e mensalidade | Torcida/escolinha/clube **com sede física** |
| **Core** | Área do sócio, carteirinha, Pix/cartão | Régua de cobrança, portal, carteirinha QR, app WL | Dashboard, loja nativa, planos, carteirinha | 21–35 módulos: CRM→portaria→bar |
| **Prova social** | Genérica (sem logos de torcida no site) | Cases **não-torcida** (ABRAPESP, LBE…) | Bravo 18/52, Facção Brasiliense, Jovem Garra, Metal Tricolor, Pavilhão 6, Sangue Azul | Depoimentos anônimos / escolinha / liga |
| **Ângulo legal** | “Regularização jurídica / documentos” (vago) | LGPD + associação | Pouco explícito | Assembleia / auditoria / prestação de contas |
| **Mobile** | Web | App nativo iOS/Android white-label | Web 100% | App/PWA add-on (+R$49) |

---

## B) Precificação do mercado (2026-07-16)

| Produto | Modelo | Faixa publicada | Nota |
|---|---|---|---|
| **TorcidaWeb** | Faixa por **sócios adimplentes** | R$ 90 (≤150) → R$ 9.200 (≤20k); ~R$0,46–0,60/membro; trial 30d | Não cobra inadimplente/inativo — alinha incentivo à cobrança |
| **Softaliza** | Assinatura associação | A partir de **R$ 297/mês** (site associações) | Não é pricing “por torcida”; pacote associativo |
| **TorcidasPRO** | Faixa por **sócios ativos** | R$ 199 (≤200) → R$ 899 (≤2000); custom >2000 | Loja **sem taxa** sobre vendas (só gateway) |
| **Clube Control** | **Preço fixo** (anti-volume) | Gestão R$ 350; G+O R$ 500; app +49; acesso/IA extras | Diferencial comercial forte vs. cobrança por cabeça; impl. R$1k |

**Implicação para nós:** o mercado ancora valor em **(1) cobrança de mensalidade
que se paga sozinha** e **(2) carteirinha com status de adimplência**. Preço por
membro vs fixo é decisão estratégica aberta — Clube Control ataca o medo de
“crescer e pagar mais”; TorcidaWeb/TorcidasPRO monetizam escala.

---

## C) Table stakes vs diferenciais

### Table stakes (todo concorrente sério promete)

1. Cadastro de sócios + área do associado  
2. Carteirinha digital (idealmente com QR de adimplência)  
3. Cobrança Pix (± boleto/cartão) + baixa automática  
4. Calendário / eventos básicos  
5. Notificações (in-app ou push)  
6. Painel financeiro / prestação de contas  
7. Branding (cores/logo)  

### Diferenciais reais observados

| Diferencial | Quem lidera | Relevância p/ organizada |
|---|---|---|
| Loja e-commerce nativa sem take-rate | TorcidasPRO | Alta (materiais, camisas) |
| Régua de cobrança + carteirinha Wallet | Softaliza | Alta (caixa) |
| Portaria / catracas / day use / bar / reservas sede | Clube Control | Alta **só se** a torcida tem sede com fluxo físico |
| CRM de interessados + IA copiloto | Clube Control | Média (captação) |
| Votações / eleições auditáveis | Softaliza / Clube Control | Alta (assembleia estatutária) |
| Pricing fixo + white-label dedicado | Clube Control | Comercial |
| Clientes torcida nomeados | TorcidasPRO | Credibilidade no nicho |
| Viagens / ingressos em grupo (marketing) | TorcidaWeb | Alta se for real (site vago) |

### O que o mercado **não** resolve (gaps estruturais)

Confirmado por ausência em landings e por contraste com `docs/knowledge/`:

| Gap | Por que importa |
|---|---|
| Hierarquia **Sede → Subsede → PDE** multi-tenant | Operação real de torcidas grandes (ver `estrutura-governanca.md`) |
| **Alianças** e visibilidade cross-tenant | Cultura do movimento; blocos nacionais |
| Departamentos operacionais (**bateria, caravanas**, materiais) como plugins de trabalho | Não é “evento genérico” — é logística + reputação |
| **Comunidade** / feed / mobilização digital | Concorrentes são ERP de associação, não plataforma de presença |
| Compliance **LGE 14.597/2023** explícita (campos obrigatórios, dossiê, desligamento auditado) | Argumento de venda central (`contexto-legal.md`) — sites falam “jurídico” sem mapear a lei |
| Rivalidade como **bloqueio** de visibilidade (não glamour) | Só faz sentido com domínio de alianças |

**Confiança:** alta para “não aparece no site”; média para “não implementam
algo escondido” — validar em demos comerciais se necessário.

---

## D) Fichas por concorrente

### 1. TorcidaWeb

- **Força:** pricing transparente + trial; mensagem “só adimplente”; stack
  clássica de sócio (carteirinha, área, admin, agenda, Pix/cartão).
- **Fraqueza:** feature list **idêntica** em todos os planos (só muda teto);
  copy jurídica genérica; sem prova social de torcidas nomeadas; sem loja
  destacada; sem operação de sede/portaria.
- **Ameaça:** entrada barata (R$90) para torcidas pequenas — floor de preço.
- **Oportunidade nossa:** superar em hierarquia, departamentos, caravanas
  reais, LGE e comunidade — eles vendem “gestão de membros”, nós vendemos
  **operação de organizada**.

### 2. Softaliza

- **Força:** maturidade associativa (régua, Wallet, app nativo, votações,
  conciliação); métricas de marketing fortes (↓inadimplência); preço entrada
  ~R$297.
- **Fraqueza:** **não é produto de torcida** — blog de torcidas sem cases do
  nicho; vocabulário de associação/sindicato; zero hierarquia territorial /
  alianças / bateria.
- **Ameaça:** se uma torcida “pensa como associação”, Softaliza ganha no
  financeiro automatizado.
- **Oportunidade nossa:** posicionar **domínio de organizada** (LGE +
  caravanas + PDE) acima de “mais um ERP de associados”; aprender o playbook
  de cobrança/carteirinha QR, sem copiar o DNA de sindicato.

### 3. TorcidasPRO

- **Força:** +8 anos no nicho; **loja** como produto; clientes reais
  nomeados; personalização visual; pricing claro até 2k sócios.
- **Fraqueza:** landing não detalha caravanas/portaria/assembleia; parece
  forte em **sócio + caixa + e-commerce**, não em mobilização territorial.
- **Ameaça:** concorrente direto de **loja + mensalidade**; prova social no
  Centro-Oeste/Norte (Bravo, Facção, etc.).
- **Oportunidade nossa:** loja já temos (sem gateway); combinar loja +
  hierarquia + comunidade + caravanas é pacote que eles não articulam.
  Gateway + adimplência na carteirinha fecha o gap comercial.

### 4. Clube Control

- **Força:** mapa de módulos mais completo do sample; **sede como negócio**
  (reservas, day use, bar, portaria, catracas); WhatsApp; votações;
  ocorrências; preço fixo; ROI story (−50% inadimplência); implementação
  assistida.
- **Fraqueza:** genérico “torcida / escolinha / academia / liga” — dilui
  identidade; hardware (catracas) = complexidade e ticket; IA copiloto é
  add-on; ainda sem alianças/PDE/comunidade de organizada.
- **Ameaça:** se o ICP é torcida **com sede movimentada**, eles cobrem
  operação física que nós não temos.
- **Oportunidade nossa:** não competir em catraca no curto prazo; competir
  em **identidade de organizada** + digital (comunidade, alianças, LGE).
  Portaria/QR real entra depois, como camada de presença — não como ERP de
  clube social.

---

## E) Onde Torcida SaaS já ganha (as-is)

Inventário cruzado com o código/docs (2026-07-16):

| Capacidade | Nós | Mercado típico |
|---|---|---|
| Multi-tenant Sede→Subsede→PDE + visibility | **Liderança** | Ausente |
| Alianças / rivalidade (moderação + bloqueio) | **Liderança** | Ausente |
| Departamentos (bateria, caravanas, …) + RBAC | **Liderança** | Evento genérico no máximo |
| Comunidade / feed / Meet / mensagens | **Liderança** | Quase ausente |
| Loja operacional (sem gateway) | Paridade parcial vs TorcidasPRO | TorcidasPRO à frente no pagamento |
| Livro-caixa manual | Abaixo | Softaliza/Clube à frente |
| Carteirinha | Abaixo (QR placeholder) | Todos à frente |
| Cobrança / régua / Pix | **Ausente** | Table stake |
| Portaria / catracas | Ausente | Só Clube Control |
| Assembleia / votação formal | Ausente (só enquetes) | Softaliza/Clube |
| Campos LGE completos | Gap conhecido | Pouco explícito em todos |

---

## F) Protocolo de atualização

1. Revisitar landings a cada **trimestre** ou antes de decisão de pricing.  
2. Marcar claims novos com data + URL; separar marketing de evidência.  
3. Demais agentes **só leem** este arquivo; quem escreve:
   `research-dominio` (+ `product-strategy` se fechar decisão de produto).  
4. Plano acionável de produto: `docs/product/plano-paridade-concorrentes.md`.
