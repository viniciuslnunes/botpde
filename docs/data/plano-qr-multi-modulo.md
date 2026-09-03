# Plano — QR como primitiva multi-módulo (2026-09-02)

> Estudo de expansão do fluxo de QR para além de Caravanas. Base implementada:
> `ARCHITECTURE.md` §5.37. Este documento decide **onde mais aplicar**, com que
> desenho, e em que ordem.
>
> Status: **fases 1–3 implementadas** (2026-09-02) — convite por QR, presença em
> ensaio/evento e registro único de propósitos. A fase 4 (bar antecipado) está
> **bloqueada** pelas decisões da §8.1 e §8.2, que não são técnicas.

## 1. O que já está de pé

Primitiva `apps/web/src/lib/qr-token.ts` — HMAC com **propósito** (namespace),
payload `dados.assinatura`, desenho local por `QrCodeVisual` (`qrcode.react`),
leitura por `lib/use-qr-scanner.ts` (nativo + `jsQR` para Safari/iOS).

| Consumidor | Propósito | Identifica | Gira? | Verifica? |
|---|---|---|---|---|
| Carteirinha | `carteirinha` | pessoa | não | servidor |
| Embarque de caravana | `embarque` | **evento** (recurso coletivo) | **sim, 30s** | servidor |
| Retirada de pedido | `pedido-retirada` | conta (pedido) | não | servidor |
| Comanda do bar | `bar-comanda` | conta (comanda) | não | **cliente** |
| Etiqueta do acervo | `patrimonio-item` | objeto físico | não | servidor |

## 2. As duas regras que decidem qualquer caso novo

Elas saíram da prática, não do desenho prévio. Todo candidato abaixo foi
avaliado por elas.

**Regra A — o que o QR identifica manda no desenho.**
Recurso **coletivo** (o QR do evento, que serve a quem apontar) **tem de girar**:
fixo, ele vira print no grupo do WhatsApp e a resposta que ele existe para dar
passa a ser errada. Pessoa, conta e objeto são **estáticos**: o conferente vê
quem está na frente dele, o dono pode estar sem sinal, e etiqueta colada não se
reemite.

**Regra B — verificar assinatura só é obrigatório quando a leitura DECIDE algo.**
Liberar embarque, entregar pedido, validar carteirinha → action no servidor com
`lerPayload`. Escolher entre itens que já estão autorizados na tela do operador
(comanda no PDV) → `lib/qr-payload.ts` no cliente, instantâneo e offline. A
exceção precisa se justificar caso a caso.

## 3. Por que o QR rende tanto neste produto

Porque o mesmo buraco aparece em módulo após módulo: **o sistema sabe que houve
intenção, mas não sabe que houve entrega.**

| Módulo | O sistema sabia | Não sabia | Fechado por |
|---|---|---|---|
| Caravana | RSVP confirmado | embarcou? e voltou? | `EventoCheckin` |
| Loja | pedido pago | retirou no balcão? | status `ENTREGUE` |
| Patrimônio | item emprestado | onde está agora? | etiqueta + ficha |
| **Bar (proposto)** | venda `PAGA` | **retirou a bebida?** | **falta** |

O QR é a prova de transferência de posse ou de presença. É por isso que ele cabe
em tanto lugar aqui — e é o critério para recusar os casos onde não há
transferência nenhuma (ver §5).

## 4. Candidatos

### 4.1 Bar — venda antecipada (a proposta do usuário) ⭐

**O problema real:** intervalo de 15 minutos, fila única, e quem está na fila
perde o segundo tempo. Comprar antes e só retirar resolve a fila sem contratar
gente.

**O trilho já existe, e é mais do que eu esperava:**
- `/portal/bar` já mostra o cardápio (`BarCardapio`) — hoje **só leitura**, com
  preço na tela e nenhum botão.
- `criarCobrancaPixBar` já emite cobrança PIX ligada a `BarVenda`.
- `BarVenda` já tem `PENDENTE → PAGA` e webhook.

**O que falta, em ordem de peso:**

1. **`BarVenda` não sabe dizer "foi retirado".** `PAGA` significa pago, não
   entregue — exatamente o buraco da §3. Precisa de `retiradoEm` +
   `retiradoPorId` (ou um ledger, se quiser retirada parcial: comprou 4 cervejas
   e levou 2). **Recomendo começar sem parcial**: um `retiradoEm` resolve 95% e
   não trava a evolução.
2. **Sacola + checkout no portal do bar** — não existe. O da Loja
   (`/portal/loja/sacola`) é o modelo, mas o Bar tem estoque por unidade
   (`sedeId`) e o da Loja não.
3. **Botão "Bar" na top bar.** Hoje não existe (a navbar tem Comunidade,
   Carteirinha, Agenda, Sedes, Lojas, Memórias). Cabe, mas **compete por espaço
   num alvo mobile-first** — sete itens numa barra de 320px é apertado. Avaliar
   se entra como item fixo ou só no dia de jogo.

**Desenho do QR:** identifica **uma venda de uma pessoa** → estático (Regra A).
A leitura **libera mercadoria** → servidor (Regra B), idempotente: segunda
leitura responde "já retirado", como a retirada de pedido da Loja.

**Duas decisões que precisam de dono antes de codar:**

- **Quando baixa o estoque?** No pagamento (arrisca vender o que não tem se
  baixar só na retirada) ou na retirada (arrisca prometer o que não existe).
  Recomendo **no pagamento**, com devolução ao estoque no cancelamento — mesmo
  padrão do estorno que já existe.
- **Em qual turno de caixa a venda antecipada entra?** Ela acontece **fora do
  turno** — alguém compra às 14h para retirar às 21h. Se entrar no turno do
  pagamento, pode não haver turno aberto; se entrar no da retirada, o dinheiro
  aparece num turno diferente do em que caiu. Isto **não é detalhe**: quebra a
  conferência de caixa, que hoje é uma regra dura do módulo.

**Esforço:** alto (schema + sacola + checkout + retirada + caixa). É uma feature
de produto, não uma extensão de QR.

### 4.2 Convite da torcida por QR ⭐ (melhor relação valor/esforço)

`/convite/<slug>` **já existe e já funciona** (`lib/convite.ts`). Falta apenas
**desenhar o QR desse link** numa tela imprimível: cartaz na sede, banner no
jogo, adesivo no ônibus da caravana. Quem aponta a câmera cai no fluxo de
entrada que já está pronto.

- **Zero schema, zero action, zero regra nova.** É `QrCodeVisual` sobre uma URL
  que já existe.
- Fora da primitiva HMAC de propósito: o link de convite **já é** a credencial,
  com validade e revogação próprias. Não precisa de segunda assinatura.
- **Esforço:** baixíssimo. **Valor:** recrutamento presencial, que é como
  torcida organizada de fato cresce.

### 4.3 Portaria da sede

`/carteirinha/validar` já valida (aberto, sem sessão). Falta **registrar a
entrada** — hoje a validação não deixa rastro.

- Precisa de tabela nova (`PortariaEntrada`: quem, quando, qual sede, quem
  conferiu) e responde perguntas de segurança e de LGPD que não são de
  engenharia: guarda por quanto tempo? conta como presença em evento? e o
  visitante sem carteirinha?
- **Esforço:** médio. **Bloqueio:** decisão de produto/jurídica, não técnica.

### 4.4 Presença por QR em evento e ensaio

A máquina inteira já existe (`EventoCheckin`, painel, auto-embarque) — hoje o
painel só aparece em `Evento.tipo = CARAVANA` por recorte deliberado.

- Ensaio da bateria e evento geral na sede têm o mesmo problema de lista de
  presença, sem ida/volta.
- **Esforço:** baixo (ampliar o gate e trocar o rótulo de trecho por presença
  única). **Valor:** alto para a Bateria, que hoje faz chamada na mão.

### 4.5 Vitrine física da loja

QR no produto exposto na sede → abre a página do produto no portal, com tamanho
e estoque. Compra ali mesmo, sem fila e sem "tem M?".

- Estático, identifica objeto/produto, e **não decide nada** → pode ser
  simplesmente o link público do produto. Sem primitiva.
- **Esforço:** baixo. **Valor:** médio.

### 4.6 Campanha / projeto — arrecadação

`Projeto` já existe (Agasalho, Festa das Crianças). Um QR que abre a página da
campanha com o que falta arrecadar transforma qualquer cartaz e qualquer post em
canal de doação.

- Depende de existir um fluxo de doação — hoje **não existe**. Sem ele, o QR só
  informa.
- **Esforço:** alto (depende de doação). **Valor:** alto se a doação existir.

### 4.7 Brechó — confirmação de entrega P2P

Dois sócios combinam a troca; o comprador escaneia o QR do vendedor para marcar
"recebi".

- Identifica um anúncio/negociação (conta) → estático; decide (fecha a
  negociação e alimenta Confiança) → servidor.
- **Ressalva honesta:** o valor é reputacional, não operacional, e o mesmo
  resultado sai de um botão "confirmei o recebimento" sem QR nenhum. O QR só
  agrega se exigir presença física dos dois. **Prioridade baixa.**

### 4.8 Memória — placa na sede

QR numa placa física (troféu, quadro, sala) que abre aquele ponto da linha do
tempo. Bonito e barato, mas é marketing, não operação.

## 5. Recusados, e por quê

- **Salas / Meet** — QR para entrar numa reunião. Quem vai entrar já está com o
  dispositivo na mão; o link resolve. Não há transferência de posse (§3).
- **Confiança** — score não se transfere nem se apresenta na porta.
- **PIX (EMV BR Code)** — **não confundir**: o QR do PIX é padrão do Banco
  Central, gerado pelo gateway, e não tem relação com `qr-token.ts`. Documentar
  isso evita alguém tentar "unificar" as duas coisas.

## 6. Infraestrutura antes de escalar

Com quatro consumidores dá para improvisar; com oito, não.

1. **Registro único de propósitos.** Hoje são literais espalhados
   (`'carteirinha'`, `'embarque'`, `'pedido-retirada'`, `'bar-comanda'`,
   `'patrimonio-item'`). Um mapa em `@torcida/types` com teste de unicidade
   impede colisão silenciosa — que seria uma falha de segurança, não um bug de
   digitação.
2. **Hub de leitura `/q?t=`.** Uma entrada só, que lê o propósito e despacha
   para a tela certa, em vez de uma rota por módulo. **Custo escondido:** exige
   o propósito *dentro* do payload, e o formato da carteirinha está **congelado**
   (carteirinha impressa pararia de validar). Caminho: formato v2 com prefixo
   para os novos, v1 aceito para sempre na carteirinha.
3. **Etiquetas em lote** — folha imprimível de QR do acervo. Hoje é um QR por
   card; colar etiqueta em 200 bandeiras assim é inviável.
4. **Auditoria de leitura.** Hoje cada consumidor grava o seu `AuditLog`. Um
   evento comum ("QR de propósito X lido por Y") daria resposta a "esse código
   foi usado?" sem caçar em cinco tabelas.

## 7. Ordem sugerida

| Fase | O quê | Estado |
|---|---|---|
| 1 | Convite por QR (§4.2) | ✅ **feito** — QR + cartaz imprimível em Configurações › Convite |
| 2 | Presença em ensaio/evento (§4.4) | ✅ **feito** — `PainelEmbarque` ganhou `modo: 'presenca'` |
| 3 | Registro de propósitos (§6.1) | ✅ **feito** — `packages/types/src/qr.js` + testes |
| 4 | Bar — venda antecipada (§4.1) | ✅ **feito** — decisões §8.1 e §8.2 respondidas |
| 5 | Vitrine física (§4.5) · Etiquetas em lote (§6.3) | ✅ **feito** — `FolhaEtiquetas` serve os dois |
| 6 | Portaria (§4.3) | 🔁 **em andamento por outra frente** — `PortariaEntrada` já está no schema |
| — | Hub `/q` (§6.2) | só quando houver 6+ consumidores |

### O que as fases 1–3 entregaram

**Fase 1 — convite.** `ConviteQr` em Configurações › Convite: QR do link que já
existia, mais um **cartaz imprimível** (`.app-cartaz` em `globals.css`, que usa
`visibility` em vez de `display` para não colapsar o layout ao imprimir). Avisa
quando o convite está pausado — imprimir cartaz de link desligado seria o erro
óbvio. Confirmado no desenho: **não passa pela primitiva HMAC**, porque o link
`/convite/<slug>` já é a credencial, com rotação e revogação próprias.

**Fase 2 — presença.** O painel deixou de ser exclusivo de `CARAVANA`. Em
`modo: 'presenca'` (ensaio, evento na sede) não há seletor de trecho — existe
uma perna só, e ela é sempre `IDA`, que é a que materializa `checkedInAt`. A
tela do sócio troca "Ida para o jogo" por "Registrar presença": chamar de "ida"
um ensaio confundiria quem escaneou. Nenhuma mudança de schema.

**Fase 3 — registro.** `QR_PROPOSITOS` em `@torcida/types` guarda os propósitos
com **a decisão de desenho ao lado** (o que identifica, se gira, onde verifica).
Os testes travam três coisas: id duplicado, `recurso-coletivo` que não gira, e
módulo novo que defina o propósito como string crua em vez de importar a
constante.

**Fase 4 — bar antecipado.** Ver `docs/data/modulo-bar.md` § compra antecipada.
A decisão do turno **dissolveu** o problema em vez de escolher um lado.

**Fase 5 — etiquetas.** Um componente só (`components/ui/folha-etiquetas.tsx`)
serve os dois usos, que pareciam diferentes e têm a mesma mecânica: etiqueta do
item do acervo e placa da vitrine física. Grade só na impressão, com
`break-inside: avoid` — etiqueta cortada na quebra de página não escaneia.
Valor começando com `/` vira URL absoluta no cliente, porque o servidor não
conhece o host do navegador. No acervo imprime a **página atual**, não o
inventário inteiro: papel gasto com item que ninguém vai etiquetar hoje.

**Fase 6 — portaria: não foi feita aqui.** Ao desenhar o modelo descobri que
`PortariaEntrada` **já existe no schema**, criada por outra frente de trabalho —
e resolvendo justamente a pergunta que este documento deixou em aberto: o
visitante sem carteirinha entra por `userId` nulo + `visitanteNome`. O modelo
duplicado que eu havia adicionado foi revertido. Quem for continuar: alinhar com
essa frente antes de escrever a leitura por QR.

## 8. Decisões — respondidas e abertas

**Respondidas em 2026-09-02, e a primeira dissolveu o problema em vez de
escolher um lado:**

1. ~~Turno de caixa da venda fora do turno~~ → **o bar só aparece no portal com
   turno aberto.** Não se escolheu entre "turno do pagamento" e "turno da
   retirada": eliminou-se o caso. Toda venda antecipada nasce dentro de um turno
   e a conferência de caixa continua fechando. De quebra respondeu a decisão 4 —
   o item da top bar é contextual, e ele aparecer é o sinal de que o bar está
   funcionando.
2. ~~Estoque baixa no pagamento ou na retirada~~ → **no pagamento**, como o PDV
   já faz com PIX pendente. A venda reserva a mercadoria.
4. ~~Botão Bar fixo ou contextual~~ → **contextual**, por consequência da 1.

**Ainda abertas:**

3. **Retirada parcial** no bar (levou 2 de 4) — hoje não existe; `retiradoEm`
   resolve o caso comum e não trava a evolução para um ledger por item.
5. **Portaria**: retenção do histórico, presença em evento, visitante sem
   carteirinha (§4.3).
6. **Doação** existe como fluxo? Sem ela, §4.6 não sai do papel.
