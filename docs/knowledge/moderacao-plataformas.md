# Base de conhecimento — Moderação de conteúdo: estado da arte e cerco jurídico

> Pesquisa de 2026-09-01. Estuda como plataformas modernas moderam conteúdo e o
> que a lei brasileira passou a exigir depois de 2025. É o lastro do
> `docs/data/modulo-moderacao.md` (spec do nosso módulo) e da
> `docs/data/politica-de-conteudo.md` (política escrita).
> **Não é aconselhamento jurídico** — os itens marcados 🔴 exigem validação com
> assessoria antes de virar promessa pública.

---

## 1. Por que isso deixou de ser opcional (o que mudou em 2025–2026)

Três mudanças, todas posteriores ao desenho atual do nosso produto, tornaram
moderação uma **obrigação de arquitetura**, não uma feature de comunidade.

### 1.1 STF, Tema 987 — o art. 19 do Marco Civil caiu em parte (jun/2025)

Julgamento encerrado em **junho de 2025** (8×2); acórdão publicado em
**06/11/2025**. O art. 19 não nasceu inconstitucional — tornou-se
*progressivamente* inconstitucional. O que sai da decisão:

| Regime | Quando | O que basta para responsabilizar |
|---|---|---|
| **Judicial** (art. 19 preservado) | Crimes contra a honra (calúnia, injúria, difamação) | Só ordem judicial descumprida |
| **Notificação extrajudicial** (lógica do art. 21 generalizada) | Demais ilícitos e violações de direitos | **Notificação da vítima** — sem juiz. Não remover = mora |
| **Dever de cuidado / falha sistêmica** | Rol grave abaixo | Atuação **proativa**, independente de notificação ou ordem |
| **Responsabilidade presumida** | Anúncios, impulsionamento pago, contas inautênticas/rede de bots | Presume-se responsabilidade do provedor |

**O rol do dever de cuidado** (atuar sem esperar denúncia):

1. terrorismo;
2. induzimento ao suicídio ou à automutilação;
3. pornografia infantil e crimes graves contra criança, adolescente e vulnerável;
4. tráfico de pessoas;
5. **discriminação e discurso de ódio**;
6. crimes contra a mulher em razão do gênero;
7. atos antidemocráticos.

O item 5 é o nosso. Uma torcida organizada é exatamente o ambiente onde
discurso de ódio circula — e o STF disse que esperar denúncia não basta.

**Ponto crítico para nós:** a proposta de exigir "risco sistêmico" (o limiar
de proporcionalidade europeu, que protegeria plataformas pequenas) **não foi
incorporada à tese**. O dimensionamento passa por critérios qualitativos —
porte econômico, grau de interferência no conteúdo, estado da arte, risco da
atividade — avaliados **caso a caso**. Ou seja: ser pequeno atenua, mas não
isenta. E "estado da arte" é literalmente o critério: quanto mais barato e
disponível fica classificar conteúdo automaticamente, menos defensável fica
não fazer.

Deveres procedimentais que a tese impõe (autorregulação): **canal de
atendimento** acessível, **relatórios anuais de transparência**, e **devido
processo** — notificar o usuário atingido e permitir contestação.

### 1.2 ECA Digital — Lei 15.211/2025 (vigência 17/03/2026)

Sancionada em 17/09/2025 ("lei da adultização"), em vigor desde **17/03/2026**.
Aplica-se a produtos e serviços de TI **acessíveis a crianças e adolescentes** —
o que nos inclui: torcida organizada tem sócio menor de idade, e nosso
onboarding não barra menores.

Obrigações concretas:

- **Verificação de idade confiável** — autodeclaração isolada é expressamente
  insuficiente;
- **Vinculação da conta de menor de 16 anos a um responsável legal**;
- **Privacidade no modo mais protetivo por padrão** para conta de menor;
- proibição de **perfilamento publicitário** de menor; vedação de design
  manipulativo;
- ferramentas de **supervisão parental**;
- **remoção + comunicação às autoridades** de conteúdo de abuso/exploração
  sexual, com **preservação de metadados e do conteúdo** por prazo regulado;
- avaliação de impacto sobre direitos de crianças;
- relatório de transparência **semestral** (obrigatório acima de 1 milhão de
  usuários menores — abaixo disso não é exigido, mas é a régua que a ANPD usa).

Sanções: advertência, multa até **10% do faturamento do grupo no Brasil** ou
até **R$ 50 milhões por infração**, suspensão e proibição de atividade.
Cronograma: orientações definitivas da ANPD em **ago/2026**, sanções
administrativas a partir de **nov/2026**, fiscalização formal em **jan/2027**.
Criou-se o **Centro Nacional de Proteção à Criança e ao Adolescente**, que
centraliza denúncias vindas das plataformas.

🔴 Precisa de assessoria: se somos "provedor" na acepção da lei, qual o
mecanismo de aferição de idade proporcional ao nosso porte, e para qual
autoridade comunicamos (Centro Nacional / SaferNet / autoridade policial).

### 1.3 Lei 14.532/2023 — racismo no contexto esportivo

Equiparou **injúria racial a racismo** (pena 2–5 anos, imprescritível,
inafiançável). Três agravantes que descrevem literalmente o nosso ambiente:

- **contexto esportivo**: agressão a atletas, árbitros, torcedores ou torcidas
  em ambiente de prática esportiva → além da reclusão, **proibição de
  frequentar locais de prática esportiva por 3 anos**;
- **duas ou mais pessoas**: pena aumentada de **metade** — ou seja, ação
  coletiva (a natureza de uma torcida) pesa mais;
- **"descontração, diversão ou recreação"**: aumento de **1/3 até metade** —
  mata a defesa do "era brincadeira", que é exatamente como o racismo circula
  em grupo de torcida.

Somado ao **art. 183, § 2º da Lei Geral do Esporte** (banimento coletivo de até
5 anos da torcida *e de seus associados* por conduta discriminatória — ver
`docs/knowledge/contexto-legal.md`), o risco não é só nosso: **conteúdo
racista publicado dentro do sistema em nome da torcida pode banir a torcida
inteira dos estádios**. Isso transforma moderação de custo em *feature de
proteção do cliente* — e é assim que ela deve ser vendida.

### 1.4 Escala do problema no nicho

O Observatório da Discriminação Racial no Futebol (ativo desde 2014) registrou
**136 casos** de discriminação racial no futebol brasileiro em 2023, contra 98
em 2022 — alta de **38,8%**. Do total de 2023: 104 em estádios, **19
denúncias por ataques em redes sociais**, 13 em outros locais. A curva das
redes sociais é a que mais cresce, e é a superfície que operamos.

---

## 2. Como as plataformas de ponta moderam (benchmark)

### 2.1 A tríade que organiza tudo: *remove, reduce, inform* (Meta, desde 2016)

O framework mais reutilizável da indústria. Três respostas, não uma:

- **Remove** — viola a política: sai.
- **Reduce** — não viola, mas é *borderline*: continua no ar, com **alcance
  reduzido**. A tese da Meta (2018) é que engajamento cresce conforme o
  conteúdo se aproxima da linha, então demover borderline é o que efetivamente
  baixa a temperatura sem censurar.
- **Inform** — mantém e **acrescenta contexto** (rótulo, aviso, tela de
  interstício, "veja antes de compartilhar").

Por que importa para nós: hoje só temos `oculto: true` (remove) e nada mais.
Um sistema com só um botão força o moderador a escolher entre censurar e
ignorar — e o resultado prático é ignorar.

### 2.2 Escada de sanções e strikes (TikTok, YouTube, Meta)

TikTok é o modelo mais bem documentado:

- violação → **remoção do conteúdo + strike na conta**;
- limiares **por feature** (comentários, LIVE) **e por política** (bullying,
  ódio) — limiares mais duros para políticas mais graves;
- strikes **expiram em 90 dias** (a conta se recupera; a punição não é eterna);
- acúmulo cruzado entre políticas também bane permanentemente;
- **banimento na primeira ocorrência** para violações severas: CSAM, ameaça ou
  promoção de violência, violência real/tortura.

A lição de desenho: **a gravidade decide a curva**, não o contador único. Um
sistema com "3 strikes e sai" trata racismo como spam.

### 2.3 Filtro automático no write path (Discord AutoMod, Twitch AutoMod)

**Discord AutoMod** — configurável por servidor, executa **antes** da mensagem
existir:
- listas mantidas pela plataforma (*Insults & Slurs*, *Sexual Content*, *Severe
  Profanity*) + até 6 regras próprias de até 1.000 termos/wildcards;
- filtro de spam por modelo (não por lista);
- limite de menções únicas por mensagem (anti-brigada);
- ação por regra: **bloquear a mensagem**, **alertar a equipe** (sem bloquear),
  ou **timeout automático** do autor;
- o usuário recebe aviso pelo *Warning System* — a punição é comunicada.

**Twitch AutoMod** — ML + NLP, e o desenho mais inteligente da lista:
- quatro categorias (*identity*, *sexual*, *aggressive*, *profanity*), cada uma
  com **níveis 0–4** que o dono do canal calibra;
- mensagem suspeita não é apagada nem publicada: fica **retida numa fila** para
  o moderador aprovar ou rejeitar — o modelo não decide sozinho;
- detecta **grafia evasiva** (leet, separadores, erros propositais) nativamente;
- **Suspicious User Detection**: modelo classifica contas em "provável" e
  "possível" fuga de ban — as prováveis têm mensagens ocultas
  automaticamente, as possíveis aparecem sinalizadas só para o moderador.

A ideia central: **três ações, não duas** — bloquear, *reter para revisão*,
sinalizar. A fila de retenção é o que dá precisão sem exigir modelo perfeito.

### 2.4 Reputação como filtro (Reddit)

Reddit não classifica só conteúdo, classifica **quem posta**:

- **Contributor Quality Score** — risco de comportamento problemático a partir
  de karma, verificação e outros sinais de conta;
- **Reputation Filter** — segura automaticamente conteúdo de contas de baixo CQS;
- **Crowd Control** — colapsa/filtra conteúdo de quem **ainda não é membro
  confiável daquela comunidade** (não do site inteiro) — desenhado justamente
  para invasão de comunidade por gente de fora;
- **Harassment Filter** — LLM treinado nas **ações dos próprios moderadores** e
  nas remoções internas, com sensibilidade *low* (mais preciso) / *high* (mais
  cobertura);
- **Ban Evasion Filter** — sinais de conexão e de conta, com janela e confiança
  ajustáveis pelo moderador.

Isto encaixa direto no nosso módulo **Confiança** (`docs/data/modulo-confianca.md`):
já temos um score por tenant com sinais caros (check-in, mensalidade,
aprovação). Reddit prova que o mesmo eixo serve de *gate de moderação*: quem
é novo passa por fila, quem é de casa passa direto.

### 2.5 Detecção proativa em nível de conversa (Roblox Sentinel, ago/2025)

O avanço técnico mais relevante e **open source**. Filtros clássicos olham uma
mensagem; grooming e aliciamento acontecem **ao longo de dias**. Sentinel:

- tira *snapshots de 1 minuto* do chat e avalia a **conversa**, não a linha;
- **contrastive learning** com dois índices (mensagens benignas × mensagens com
  violação confirmada) — lida com dataset extremamente desbalanceado;
- agrega scores de mensagens recentes da mesma origem e mede **assimetria
  (skewness)** da distribuição: muita coisa comum + algumas semelhanças raras =
  padrão suspeito;
- resultado: ~1.200 reports ao NCMEC no 1º semestre de 2025, **35% dos casos
  detectados proativamente** — antes de qualquer denúncia.

Lição: para risco a menores, **janela de conversa e agregação por autor** valem
mais que qualquer lista de palavras.

### 2.6 Moderação componível (Bluesky / Ozone)

Arquitetura oposta à monolítica: **labelers** independentes emitem *rótulos*
sobre conteúdo; o app **empilha** rótulos de vários serviços e cada usuário
escolhe quais aplicar (ocultar, borrar, avisar). **Ozone** é a ferramenta open
source onde uma equipe revisa reports e cria rótulos colaborativamente.

Lição estrutural: **separar rotulagem de decisão**. O classificador não
"remove"; ele *rotula*. Quem age sobre o rótulo é uma política — e a política
pode variar por tenant. Para um SaaS multi-tenant isso não é elegância
acadêmica, é o único jeito de a Sede A ser mais rígida que a Sede B sem
reescrever o pipeline.

### 2.7 Atrito antes da publicação (nudges)

Aviso do tipo "tem certeza que quer publicar isso?" antes do envio. A pesquisa
é mais modesta do que o marketing sugere: o efeito é **real mas decai**, é
específico de contexto, e **excesso de aviso treina o usuário a ignorar**. Serve
como camada barata sobre conteúdo *borderline* — nunca como substituto de
enforcement, e nunca disparado com frequência alta.

### 2.8 Transparência e devido processo (Princípios de Santa Clara, DSA)

Padrão consolidado desde 2018 (revisão 2021), três pilares operacionais:

- **Numbers** — publicar volumes de remoção, por categoria;
- **Notice** — **todo** usuário cujo conteúdo foi removido ou conta suspensa
  recebe explicação do motivo (exceção declarada: spam/phishing/malware);
- **Appeal** — recurso significativo e tempestivo, revisado por **pessoa que não
  tomou a decisão original**.

O DSA europeu transformou isso em *statement of reasons* obrigatório. A tese do
STF pede a mesma coisa com outras palavras (canal de atendimento + relatório
anual + devido processo). Convergência: **um só desenho atende os três**.

### 2.9 Métricas que a indústria usa

| Métrica | O que mede | Faixa citada como boa prática |
|---|---|---|
| **Precisão** | % do que foi bloqueado que realmente violava | falso-positivo < 5% geral; < 2% em usuários verificados (ódio/sexual) |
| **Recall** | % do violador que foi capturado | — |
| **Prevalência** | % do conteúdo visto que violava | métrica de resultado, melhor que métrica de modelo |
| **Time-to-action** | tempo até agir | severidade alta em **segundos/minutos**, não horas |
| **Reversal rate** | % de recursos providos | subida = precisão caindo ou política ambígua |

Aviso da própria literatura regulatória: **reversal rate isolado engana** — só
mede quem recorreu. Tem de andar com precisão e prevalência.

### 2.10 Ferramentas disponíveis (avaliação para o nosso porte)

| Ferramenta | Serve para | Veredito para nós |
|---|---|---|
| **Perspective API** (Jigsaw) | toxicidade / ataque de identidade / insulto / ameaça, 18+ idiomas incl. PT, grátis, 1 QPS | ❌ **Não adotar** — Google anunciou **descontinuação após dez/2026**. Escolher isso agora é dívida com data marcada |
| **OpenAI Moderation** | 13 categorias, texto+imagem, endpoint gratuito | Viável tecnicamente, mas exige fornecedor extra e não é o provedor da casa |
| **Llama Guard / ShieldGemma** | classificador self-hosted | Custo de infra e ops que não temos (Railway; sem GPU) |
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | classificação com a política **na íntegra** no prompt, PT-BR nativo, saída estruturada | ✅ **Escolha recomendada** — ver §3 |
| **Cloudinary add-ons** (AWS Rekognition, Google SafeSearch, WebPurify) | moderação de **imagem/vídeo** no próprio pipeline de upload que já usamos | ✅ **Escolha recomendada** para mídia — sem mudar a arquitetura de upload |
| **PhotoDNA / hash matching de CSAM** | correspondência com base conhecida | 🔴 Fora do nosso alcance direto hoje; o caminho realista é **detecção + preservação + comunicação** (SaferNet / Centro Nacional / autoridade), não matching próprio |

Sobre imagem: Google Cloud Vision SafeSearch custa **grátis até 1.000/mês**,
depois **US$ 1,50/1.000**; AWS Rekognition ~**US$ 3,00/1.000**. Nos volumes de
uma torcida isso é ruído no orçamento.

---

## 3. Por que Claude Haiku para classificação de texto

Modelo: **`claude-haiku-4-5`** — US$ 1,00 / 1M tokens de entrada, US$ 5,00 /
1M de saída, contexto 200K.

Três razões de arquitetura, não de preferência:

1. **A política vira o prompt.** Um classificador de lista fixa não sabe o que é
   "provocação de rivalidade aceitável" versus "incitação a confronto na saída
   do estádio". Um LLM com a nossa `politica-de-conteudo.md` inteira no system
   prompt sabe — e quando a política muda, o classificador muda junto, sem
   retreino.
2. **Português brasileiro e gíria de arquibancada.** É onde listas de palavrão
   importadas quebram: `macaco`, `bicha`, `veado`, `preto` mudam completamente
   de sentido conforme contexto e alvo — e o racismo real circula em código
   (emoji de banana/macaco, "volta pra jaula"), que lista nenhuma pega.
3. **Custo desprezível no nosso volume.** Com *prompt caching* na política
   (leitura cacheada custa ~0,1× a entrada) e saída estruturada curta:

   | Item | Por 1.000 posts |
   |---|---|
   | Política cacheada (~1.500 tk × 1.000 @ $0,10/1M) | US$ 0,15 |
   | Conteúdo novo (~200 tk × 1.000 @ $1/1M) | US$ 0,20 |
   | Saída estruturada (~60 tk × 1.000 @ $5/1M) | US$ 0,30 |
   | **Total** | **≈ US$ 0,65 (~R$ 3,50)** |

   Com **Batch API** (metade do preço) para a varredura assíncrona de
   retaguarda, cai para ~US$ 0,33 / 1.000.

Detalhes de implementação que importam: `output_config.format` para saída
estruturada (nunca parsear texto livre), `max_tokens: 256` (é classificação),
`cache_control` na política para o *prefix* ficar estável — e a política tem de
vir **antes** do conteúdo no prompt, senão o cache não pega.

Limites a assumir por escrito: LLM **erra**, não é determinístico, e tem
latência. Por isso ele **rotula**, não pune (§2.6) — e nada de gravidade alta é
decidido sem pessoa, nem sem recurso.

---

## 4. Síntese — o que trazer para dentro

| # | Padrão da indústria | Origem | Onde entra em nós |
|---|---|---|---|
| 1 | Três ações, não uma: remover / reduzir / informar | Meta | `AcaoModeracao` em vez de `oculto: true` |
| 2 | Rotular ≠ decidir; política por tenant sobre o mesmo rótulo | Bluesky/Ozone | `ConteudoSinal` + `PoliticaModeracaoTenant` |
| 3 | Fila de retenção (nem publica, nem apaga) | Twitch AutoMod | `status: RETIDO` no write path |
| 4 | Escada de sanções por gravidade, com expiração | TikTok | `SancaoUsuario` + strikes com TTL |
| 5 | Reputação filtra antes do conteúdo | Reddit | AND com o módulo **Confiança** já existente |
| 6 | Janela de conversa, não linha isolada | Roblox Sentinel | Varredura agregada por autor (fase 3) |
| 7 | Categorias estruturadas de denúncia com SLA por gravidade | DSA / TikTok | Substitui `motivo: String` livre |
| 8 | Notice + Appeal por decisão | Santa Clara / DSA / STF | `RecursoModeracao` + notificação obrigatória |
| 9 | Relatório de transparência periódico | Santa Clara / STF / ECA Digital | `/admin/moderacao/transparencia` |
| 10 | Atrito leve em borderline | pesquisa de nudges | Aviso no compositor, com teto de frequência |
| 11 | Dever de cuidado proativo em 7 categorias | STF Tema 987 | Classificação no write path é **obrigação**, não otimização |
| 12 | Preservar prova antes de apagar | ECA Digital | `ConteudoPreservado` (hash + snapshot) antes do soft-delete |

---

## Fontes

Jurídico brasileiro:
- [ARTIGO 19 — Nota técnica sobre a decisão do STF no art. 19 do MCI](https://artigo19.org/2025/08/15/nota-tecnica-decisao-do-stf-sobre-o-artigo-19-do-marco-civil-da-internet/)
- [Conjur — STF fixa tese sobre responsabilização de plataformas](https://conjur.com.br/2025-jun-26/supremo-fixa-tese-sobre-responsabilizacao-de-plataformas-por-conteudo-de-usuarios/)
- [Migalhas — Responsabilidade civil dos provedores: análise do Tema 987](https://www.migalhas.com.br/depeso/458612/responsabilidade-civil-dos-provedores-analise-do-tema-987-do-stf)
- [CartaCapital — STF publica acórdão (06/11/2025)](https://www.cartacapital.com.br/justica/stf-publica-acordao-que-torna-parcialmente-inconstitucional-o-artigo-19-do-marco-civil-da-internet/)
- [Planalto — Lei 15.211/2025 (ECA Digital)](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm)
- [Mayer Brown — Vigência do ECA Digital e novas obrigações](https://www.mayerbrown.com/pt/insights/publications/2026/04/enforcement-of-brazils-eca-digital-introduces-new-obligations-for-companies)
- [Machado Meyer — Lei 15.211/25: proteção no ambiente digital](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/direito-digital/lei-15-211-25-protecao-para-criancas-e-adolescentes-no-ambiente-digital)
- [Senado — Lei 14.532/2023 tipifica injúria racial como racismo](https://www12.senado.leg.br/noticias/materias/2023/01/12/sancionada-lei-que-tipifica-como-crime-de-racismo-a-injuria-racial)
- [Politize! — O que muda com a Lei 14.532](https://www.politize.com.br/lei-14-532/)
- [SaferNet Brasil — canal de denúncia](https://new.safernet.org.br/denuncie)
- [Observatório da Discriminação Racial no Futebol — relatórios anuais](https://observatorioracialfutebol.com.br/observatorio/relatorios-anuais-da-discriminacao/)

Plataformas e padrões:
- [Meta Transparency Center — Reducing distribution of problematic content](https://transparency.meta.com/enforcement/taking-action/lowering-distribution-of-problematic-content/)
- [Meta — Why we reduce instead of removing](https://transparency.meta.com/enforcement/taking-action/reducing-content-instead-of-removing/)
- [TikTok Newsroom — Updated account enforcement system](https://newsroom.tiktok.com/en-us/supporting-creators-with-an-updated-account-enforcement-system)
- [Discord — Auto Moderation](https://discord.com/safety/auto-moderation-in-discord) · [Our approach to content moderation](https://discord.com/safety/our-approach-to-content-moderation)
- [Twitch — How to use AutoMod](https://twitch-help.fandom.com/wiki/How_to_Use_AutoMod)
- [Reddit — Safety Filters](https://support.reddithelp.com/hc/en-us/articles/15484574845460-Safety-Filters) · [Moderation Tools overview](https://support.reddithelp.com/hc/en-us/articles/15484384020756-Moderation-Tools-overview)
- [Roblox — Open-sourcing Sentinel](https://about.roblox.com/newsroom/2025/08/open-sourcing-roblox-sentinel) · [InfoQ — análise técnica](https://www.infoq.com/news/2025/08/roblox-sentinel-classifier/)
- [Bluesky — Stackable approach to moderation](https://bsky.social/about/blog/03-12-2024-stackable-moderation) · [Moderation architecture](https://docs.bsky.app/blog/blueskys-moderation-architecture) · [Ozone](https://github.com/bluesky-social/ozone/blob/main/docs/userguide.md)
- [Santa Clara Principles](https://santaclaraprinciples.org/)
- [GetStream — Moderation metrics & KPIs](https://getstream.io/blog/moderation-performance-metrics/) · [DSA Observatory — métricas ausentes](https://dsa-observatory.eu/2026/01/08/the-metrics-were-missing-in-dsa-content-moderation-transparency/)
- [Cloudinary — Moderação automática e programática de assets](https://cloudinary.com/documentation/moderate_assets) · [Add-on AWS Rekognition](https://cloudinary.com/documentation/aws_rekognition_ai_moderation_addon)
- [Lasso — Perspective API está sendo descontinuada](https://www.lassomoderation.com/blog/what-is-perspective-api/)

## Histórico

| Data | Evento |
|---|---|
| 2026-09-01 | Pesquisa inicial: STF Tema 987, ECA Digital, Lei 14.532, benchmark de 6 plataformas, avaliação de ferramentas |
