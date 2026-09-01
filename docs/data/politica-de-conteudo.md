# Política de conteúdo da plataforma

> Fecha o item **P1** do gate em `docs/data/plano-criptografia-e-moderacao.md`.
> Documento **normativo**: é a fonte única do que é proibido, de qual é a
> resposta padrão e de quem decide. Serve a três consumidores ao mesmo tempo —
> (1) o texto público de Termos de Uso, (2) o *system prompt* do classificador
> automático, (3) a régua do moderador humano na fila.
> Lastro jurídico e comparativo: `docs/knowledge/moderacao-plataformas.md`.
> Vigente desde 2026-09-01. Revisão obrigatória a cada 6 meses.

## 0. Princípios

1. **Rotular não é punir.** Classificação automática produz *sinal*; ação sobre
   pessoa ou conteúdo grave exige política explícita e, nas classes altas,
   decisão humana.
2. **Três respostas, não uma.** Remover, reduzir alcance ou informar com
   contexto. Nem todo problema é remoção.
3. **Toda ação é comunicada e recorrível.** Sem exceção fora de spam/malware.
4. **Proporcionalidade e recuperação.** Sanção expira; reincidência pesa.
5. **A torcida define o teto, não o piso.** Cada tenant pode ser *mais*
   rigoroso que esta política; **nunca menos**. As classes S3 e S4 são piso da
   plataforma e não são configuráveis pelo tenant.
6. **Contexto de arquibancada é levado a sério, mas não é salvo-conduto.**
   Provocação e rivalidade fazem parte da cultura; discriminação e incitação a
   violência não viram aceitáveis por estarem em cântico, meme ou "zoeira" — a
   Lei 14.532/2023 inclusive **agrava** a pena quando o crime ocorre em contexto
   de descontração.

## 1. Escala de gravidade

| Classe | Nome | Resposta padrão | Quem decide | SLA de ação |
|---|---|---|---|---|
| **S4** | Crítica | Bloqueio na publicação + preservação de prova + escalonamento à plataforma | Plataforma (super-admin de safety). Tenant **não** encerra | Imediato (automático) + revisão humana ≤ 2 h |
| **S3** | Grave | Bloqueio na publicação + fila do tenant + strike | Moderador do tenant; plataforma audita | ≤ 24 h |
| **S2** | Moderada | Retenção para revisão **ou** redução de alcance | Moderador do tenant | ≤ 72 h |
| **S1** | Leve | Publica com aviso/contexto, ou atrito no compositor | Automático | — |
| **S0** | Sem violação | Publica | — | — |

"Bloqueio na publicação" = o conteúdo **não chega a existir publicamente**;
fica registrado apenas para prova, recurso e auditoria.

## 2. Taxonomia — categorias de violação

Cada categoria tem código estável (usado no schema, no classificador, nas
denúncias e no relatório de transparência), classe de gravidade e base legal.

### 2.1 Crítico — S4 (dever de cuidado; plataforma assume)

Rol alinhado ao **STF, Tema 987** (atuação proativa independente de denúncia) e
ao **ECA Digital**.

| Código | Categoria | Inclui | Base |
|---|---|---|---|
| `CSAM` | Abuso sexual infantil | Imagem, vídeo, texto ou link de abuso/exploração sexual de menor; solicitação de material | ECA Digital art. correlatos; STF item 3 |
| `ALICIAMENTO_MENOR` | Aliciamento / grooming | Adulto buscando contato sexualizado, isolamento ou encontro com menor; pedido de foto | ECA Digital; STF item 3 |
| `AUTOLESAO` | Suicídio e automutilação | Induzimento, instrução, desafio, incentivo | STF item 2 |
| `TERRORISMO` | Terrorismo | Apologia, planejamento, recrutamento | STF item 1 |
| `TRAFICO_PESSOAS` | Tráfico de pessoas | Oferta, recrutamento, exploração | STF item 4 |
| `ATO_ANTIDEMOCRATICO` | Atos antidemocráticos | Conclamação a golpe, ataque a instituições | STF item 7 |
| `AMEACA_CRIVEL` | Ameaça crível à vida | Ameaça específica a pessoa identificável, com meio ou plano | CP art. 147; STF |
| `NCII` | Imagem íntima não consentida | "Pornografia de vingança", nudez sem consentimento, deepfake sexual | MCI art. 21; Lei 13.718/2018 |

**Nunca** é decisão só do tenant. Fluxo obrigatório em §4.

### 2.2 Grave — S3 (bloqueio + strike)

| Código | Categoria | Inclui | Base |
|---|---|---|---|
| `RACISMO` | Racismo e injúria racial | Ofensa por raça/cor/etnia/procedência nacional; termo racializado dirigido a pessoa ou grupo; código e emoji equivalentes (banana, macaco); negação/apologia | **Lei 14.532/2023** (2–5 anos, +1/2 se coletivo, +1/3 a 1/2 se em "descontração"); LGE art. 183 §2º |
| `ODIO_IDENTIDADE` | Ódio por identidade | Homofobia, transfobia, xenofobia, intolerância religiosa, capacitismo, misoginia, antissemitismo | Lei 7.716/1989; STF item 5 |
| `VIOLENCIA_GENERO` | Violência de gênero | Ameaça, humilhação ou exposição de mulher em razão do gênero | STF item 6; Lei 14.192/2021 |
| `INCITACAO_VIOLENCIA` | Incitação a confronto | Convocação para briga entre torcidas, "marcação" de encontro, chamada para emboscada, apologia a agressão | **LGE art. 183 §2º e art. 184** (banimento coletivo até 5 anos) |
| `ARMAS_ARTEFATOS` | Armas e artefatos | Oferta, exibição ou instrução de arma, sinalizador/rojão para uso contra pessoas, artefato incendiário | LGE; Estatuto do Desarmamento |
| `DOXXING` | Exposição de dados | Endereço, telefone, local de trabalho, rotina de terceiro; "cartaz" de rival | LGPD; CP art. 146/147 |
| `ASSEDIO` | Assédio dirigido | Campanha coordenada contra pessoa, perseguição, humilhação repetida | Lei 14.132/2021 (stalking) |
| `CONTEUDO_SEXUAL` | Conteúdo sexual explícito | Nudez e ato sexual explícito (a plataforma não é ambiente adulto) | Política própria + ECA Digital (menores presentes) |
| `FACCAO` | Vínculo com facção criminosa | Apologia, símbolo, recrutamento, atribuição da torcida a organização criminosa | Lei 12.850/2013 |
| `DROGAS` | Drogas ilícitas | Venda, oferta, instrução de uso | Lei 11.343/2006 |

### 2.3 Moderada — S2 (retenção ou redução de alcance)

| Código | Categoria | Inclui |
|---|---|---|
| `PROVOCACAO_AGRESSIVA` | Provocação além da linha | Rivalidade que descamba em desejo de dano, deboche com morte/tragédia, "zoeira" com desastre |
| `PALAVRAO_PESADO` | Linguagem chula severa | Xingamento pesado sem alvo protegido — permitido em canal interno adulto, retido em superfície pública/nacional |
| `SPAM` | Spam e divulgação | Corrente, propaganda externa não autorizada, repetição, link suspeito |
| `GOLPE` | Fraude e golpe | Rifa falsa, venda inexistente, phishing, cobrança fora do sistema (**relevante no brechó**) |
| `DESINFORMACAO_DANOSA` | Desinformação com dano | Boato sobre segurança de evento, falsa informação sobre jogo/portões que possa causar tumulto |
| `IDENTIDADE_FALSA` | Falsidade de identidade | Passar-se por diretoria, por outra torcida, por clube |
| `VIOLENCIA_GRAFICA` | Violência gráfica | Imagem chocante de briga, sangue, corpo — sem apologia |

### 2.4 Leve — S1 (aviso ou contexto)

| Código | Categoria | Inclui |
|---|---|---|
| `PALAVRAO_LEVE` | Palavrão comum | Linguagem informal de arquibancada sem alvo protegido |
| `OFF_TOPIC` | Fora do escopo | Conteúdo alheio ao propósito do canal |
| `BAIXA_QUALIDADE` | Baixa qualidade | Repetição, caixa alta excessiva, flood leve |

### 2.5 O que **não** é violação (lista de proteção contra falso positivo)

Explicitar isto importa tanto quanto proibir — é o que impede o classificador
de virar censura de arquibancada:

- **Rivalidade e provocação** entre torcidas e clubes, incluindo apelidos
  tradicionais, cânticos de gozação e memes de derrota;
- **Palavrão** dirigido a time, árbitro, jogada, resultado — não a grupo protegido;
- **Crítica dura** a diretoria da torcida, a dirigentes do clube, a árbitros e à
  própria plataforma;
- **Relato ou denúncia** de racismo/violência que precisa **citar** o termo
  ofensivo para descrever o ocorrido — contar não é praticar;
- **Discussão política** legítima, inclusive sobre a lei das torcidas;
- **Conteúdo histórico da torcida** (Memória) que registre confronto passado
  como fato, sem apologia.

Na dúvida entre §2.5 e uma categoria S1/S2, **o classificador escolhe §2.5** e
não sinaliza. Na dúvida em S3/S4, sinaliza e deixa a pessoa decidir.

## 3. Matriz de resposta

| Classe | Conteúdo | Autor | Denunciante |
|---|---|---|---|
| S4 | Bloqueado; snapshot preservado; jamais exibido a moderador do tenant sem necessidade | Conta **suspensa preventivamente**; sem detalhe que atrapalhe investigação | Confirmação de recebimento e de escalonamento |
| S3 | Bloqueado ou removido | Notificação com categoria, trecho, política violada e link de recurso; **strike** | Resultado (sem dados do autor) |
| S2 | Retido para revisão ou publicado com alcance reduzido | Notificação; strike só se confirmado por humano | Resultado |
| S1 | Publica; aviso no compositor ou rótulo | Nenhuma sanção | — |

**Strikes.** Contador por categoria e por gravidade, com expiração:

| Gravidade | Peso | Expira em | Limiar de suspensão |
|---|---|---|---|
| S4 | — | não expira | **1ª ocorrência = banimento**, sem escada |
| S3 | 3 | 180 dias | 6 pontos = suspensão 7 dias; 12 = suspensão 30 dias; 18 = banimento do tenant |
| S2 | 1 | 90 dias | 6 pontos = restrição de publicação 72 h |
| S1 | 0 | — | — |

Suspensão **restringe publicação e mensagens**; não apaga o vínculo associativo
do membro (que tem efeito jurídico próprio na LGE — ver
`docs/knowledge/contexto-legal.md`). Desligar sócio continua sendo ato de
governança, não de moderação.

## 4. Fluxo obrigatório para S4

1. **Bloquear** a publicação/entrega imediatamente e suspender a conta.
2. **Preservar**: snapshot do conteúdo, `midiaUrls`, metadados (autor, IP se
   houver, `userAgent`, timestamps, destinatários) e hash — em armazenamento
   com acesso restrito, **antes** de qualquer remoção. Nunca "apagar e depois
   ver": remoção sem preservação destrói prova exigida pelo ECA Digital.
3. **Escalonar** à plataforma automaticamente (fila `/super-admin/moderacao`,
   prioridade crítica) — não depende do moderador do tenant abrir o caso.
4. **Comunicar autoridade** conforme a classe: CSAM/aliciamento →
   canal do ECA Digital / SaferNet / autoridade policial. 🔴 O procedimento
   exato, o prazo e o destinatário formal precisam ser fechados com assessoria
   jurídica antes do go-live da Fase 1 — até lá o caso vai à fila da plataforma
   e a comunicação é manual, registrada em `AuditLog`.
5. **Retenção**: material preservado por **180 dias** (ou pelo prazo que a
   autoridade indicar, o que for maior), com acesso logado por leitura.
6. **Minimizar exposição**: moderador do tenant vê que existe um caso S4 e o
   desfecho, **não** o material.

## 5. Quem decide o quê

| Papel | Permissão | Pode |
|---|---|---|
| Autor | — | Recorrer de decisão sobre seu conteúdo/conta |
| Membro | — | Denunciar em qualquer superfície |
| Moderador do tenant | `community:moderate` / `messages:moderate` | Decidir S1–S3 do próprio tenant; ver conteúdo e trecho; aplicar remover/reduzir/informar |
| Liderança do tenant | + `moderation:policy` (nova) | Ajustar sensibilidade **para cima**; definir quem modera; ver relatório do tenant |
| Plataforma (safety) | allowlist super-admin | Decidir S4; revisar recurso de 2ª instância; agir cross-tenant; ver auditoria completa |

**Revisor de recurso ≠ decisor original** — regra dura, validada no servidor.

## 6. Transparência

- **Ao usuário**: toda ação vem com categoria, política violada, trecho e prazo
  de recurso.
- **Ao tenant**: painel com volume por categoria, tempo de ação, taxa de reforma
  de decisão em recurso.
- **Público**: relatório **semestral** com volumes por categoria, ações por tipo,
  recursos recebidos e providos, e pedidos de autoridade atendidos. Alinha, de
  uma vez só, Santa Clara, tese do STF (relatório anual) e ECA Digital
  (semestral).

## 7. Limites declarados

- Classificação automática **erra**; por isso S3+ tem revisão humana e recurso.
- Não prometemos detecção exaustiva — prometemos **processo**: sinal, fila,
  prazo, decisão registrada e recurso.
- Não há E2EE; conteúdo é legível no servidor para moderação — declarado em
  `docs/data/plano-criptografia-e-moderacao.md`. Não prometer criptografia de
  ponta a ponta em nenhum material de produto.
- Esta política **não** substitui obrigação legal do usuário nem da torcida.

## Histórico

| Data | Evento |
|---|---|
| 2026-09-01 | Versão 1 — taxonomia, escala S0–S4, strikes, fluxo S4, papéis |
