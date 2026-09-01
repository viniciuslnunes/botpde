# Base de conhecimento — Contexto legal e regulatório

> Legislação que incide sobre torcidas organizadas. É o **argumento de venda
> central do SaaS**: a lei obriga as torcidas a manterem gestão formal de
> membros. Fontes consultadas em 2026-07-10; **revisão 2026-08-27 contra o
> texto integral da lei no Planalto** (correções marcadas abaixo).
> Não é aconselhamento jurídico.

## Lei Geral do Esporte — Lei nº 14.597/2023 (substituiu o Estatuto do Torcedor)

### Definição legal (art. 178, §§ 1º a 3º)

Torcedor é quem aprecia, apoia ou se associa a organização esportiva. É
**facultado** ao torcedor organizar-se em entidades associativas — as torcidas
organizadas —, definidas como **pessoa jurídica de direito privado ou
existente de fato** que se organiza para fins lícitos, especialmente torcer
por uma organização esportiva. A lei separa explicitamente a torcida do clube
que ela apoia (§ 3º).

→ Implicação de produto: a lei acomoda tanto a associação registrada quanto o
grupo "existente de fato" (caso da Geral do Grêmio) — o onboarding não pode
exigir CNPJ como condição de existência.

### Cadastro obrigatório de integrantes (core do produto) — art. 178, § 4º

A torcida organizada **deve manter cadastro atualizado** de seus associados ou
membros com, no mínimo: **nome completo, fotografia, filiação, número do
registro civil, CPF, data de nascimento, estado civil, profissão, endereço
completo e escolaridade** (dez campos, na ordem da lei).
Fonte primária: [Planalto — Lei 14.597/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14597.htm).

**Correção 2026-08-27:** a versão anterior desta página omitia **estado civil**
e dizia "RG" onde a lei diz "número do registro civil". Quem for modelar os
campos deve usar a lista acima.

→ Implicação direta: o módulo de membros do SaaS (ficha completa,
carteirinha, foto) não é conveniência — é **compliance legal**. Campos do
cadastro legal devem existir no modelo de dados.

**Gap atual (achado da auditoria de 2026-07-16):** `SaasMembro` hoje só
modela `idade`, `telefone`, `cidade` e endereço — registro civil, CPF,
filiação, estado civil, escolaridade e profissão exigidos pela LGE não estão
no modelo. Decisão em aberto #9 em `docs/product/decisoes-abertas.md`.

**Nota LGPD sobre `imagemProva`:** o comprovante de vínculo anexado na
admissão do sócio (ver `docs/knowledge/estrutura-governanca.md`) é dado
pessoal — ao modelar os campos legais acima, tratar retenção e minimização
com o mesmo cuidado (não expor em telas públicas, não reter além do
necessário à comprovação).

### Responsabilidade civil objetiva e solidária — art. 178, §§ 5º e 6º

A torcida responde civil e **objetivamente** (independe de culpa) e
**solidariamente** pelos danos causados por qualquer associado **no local do
evento, em suas imediações ou no trajeto de ida e volta**. O dever de reparar
é da própria torcida **e de seus dirigentes e membros, que respondem
solidariamente, inclusive com o próprio patrimônio** (§ 6º). Fontes: texto da
lei (Planalto); Conjur, "Responsabilidade civil dos membros de torcidas
organizadas" (2023).

→ Implicação: saber **quem é membro ativo, desde quando, e quem foi
desligado** (com data e auditoria) tem valor jurídico para a torcida.

### Banimento coletivo — art. 183, § 2º (e art. 184)

Torcida que promover tumulto, praticar/incitar violência, praticar condutas
discriminatórias (racistas, xenófobas, homofóbicas, transfóbicas) ou invadir
área restrita a competidores, árbitros, dirigentes, organizadores ou
jornalistas pode ser impedida — **junto com seus associados ou membros** — de
comparecer a eventos esportivos por até **5 anos**.

O **art. 184** estende a punição a fatos ocorridos **fora do evento e em outra
data**: invasão de local de treinamento, confronto (ou induzimento a confronto)
entre torcedores, e ilícitos contra atletas, árbitros, dirigentes e
jornalistas.

**Nota de leitura (2026-08-27):** o *caput* do art. 183 e seus incisos foram
**vetados**; sobreviveu o § 2º. Ao citar a base legal do banimento, citar
"art. 183, § 2º", não o artigo inteiro.

→ Implicação: moderação de conteúdo na Comunidade não é opcional — conteúdo
de incitação publicado em nome da torcida gera risco jurídico real ao tenant.
Por isso feed/canais permanecem legíveis no servidor (Fase A); E2EE que cegue
a plataforma conflita com esse dever prático — ver
`docs/data/plano-criptografia-e-moderacao.md` e `ARCHITECTURE.md` §5.23.

### Cadastro Nacional de Torcedores — **não existe** (art. 158, XI, vetado)

**Correção 2026-08-27.** A versão anterior desta página afirmava haver um
"Cadastro Nacional de Torcedores Impedidos (art. 181)". Lendo o texto
sancionado:

- O dispositivo que criaria o cadastro nacional de torcedores era o
  **art. 158, XI — e está `(VETADO)`**. A sociedade civil (Data Privacy Brasil)
  atuou pelo veto, argumentando risco a direitos de personalidade sem
  mitigação.
- O **art. 181** trata de outra coisa: o **Plano Nacional pela Cultura de Paz
  no Esporte**.
- O único "Cadastro Nacional" da LGE é o **Cadastro Nacional de Organizações
  Esportivas** (art. 16, IX), ligado ao acesso a recursos do Fundesporte — não
  é cadastro de torcedor nem de torcida.
- Há projeto de lei em tramitação (PL 4068/25) propondo um registro nacional
  unificado de torcedores banidos. **Enquanto não virar lei, não citar como
  obrigação vigente.**

### Biometria nos estádios — art. 148 e art. 158, XII (em vigor)

Arena com capacidade **acima de 20.000 pessoas** deve ter monitoramento por
imagem das catracas, **identificação biométrica dos espectadores** e central
técnica de informações, com prazo de implementação de **2 anos** a contar da
vigência da lei (junho/2023 → junho/2025). O art. 158, XII condiciona o acesso
do espectador **maior de 16 anos** a estar cadastrado nesse sistema biométrico.

→ Implicação de produto: o sócio de torcida já é obrigado a ter cadastro
biométrico no clube/arena para entrar. Isso reforça a ficha completa como
rotina — e reforça também o cuidado com LGPD: o SaaS **não** coleta biometria
e não deve virar intermediário desse dado.

## Estatuto do Torcedor (Lei 10.671/2003) — legado

Vigorou por 20 anos; criou direitos do torcedor (segurança, transparência,
ingresso) e as primeiras obrigações para organizadas (cadastro). Foi absorvido
pela LGE em 2023. Ainda é referência cultural ("Estatuto do Torcedor" é o nome
que o público conhece). Fontes: rosenbaum.adv.br; Observatório da
Discriminação Racial no Futebol.

## Medidas estaduais relevantes

### Torcida única em clássicos paulistas (desde abril/2016)

Clássicos entre Corinthians, Palmeiras, São Paulo, Santos, Ponte Preta e
Guarani no estado de SP são disputados **sem torcida visitante**, por
recomendação do MP-SP após confrontos com morte em 2016. MP aponta queda de
crimes e aumento de público feminino/infantil; há debate periódico sobre o
fim da medida. Fontes: MP-SP; Agência Brasil (2024); MeuTimão (2025).

### Setor da organizada no estádio — Lei paulista nº 17.832/2023

Substituiu a Lei 15.868/2015 (revogada em 01/11/2023) e mantém as regras que
interessam ao módulo de setor/arquibancada:

- a área reservada às torcidas organizadas **não pode exceder 20% da
  capacidade total do estádio**;
- cada organizada acessa sua área em **horário diferenciado**, sem coincidir
  com o público geral nem com a torcida adversária;
- torcidas adversárias ficam **preferencialmente atrás das metas e sempre em
  áreas opostas**;
- sanções à entidade: advertência, multa de 1.000 a 10.000 UFESPs e suspensão
  de repasses públicos ou incentivos fiscais estaduais por até 6 meses.

→ Cruzar com `docs/data/setor-arquibancada.md`: o setor cadastrado na Sede tem
lastro legal, e o teto de 20% é um dado útil de contexto ao planejar lotação.

### Registro da torcida e restrição de uniformes/materiais

Em SP (e em estatutos de clubes como Flamengo, Fluminense, São Paulo, Ponte
Preta e Guarani), a entrada com camisas e materiais de organizada é
condicionada a registro regular da torcida junto ao poder público. Fonte:
rosenbaum.adv.br.

Na prática, quem mantém o registro visível é a **federação estadual**: a FPF
publica a *Relação de Torcidas Cadastradas* (135 torcidas na edição de
21/02/2024), com nome, clube e cidade. A base legal específica desse cadastro
não foi localizada na lei estadual 17.832/2023 — trata-se de exigência
administrativa da federação, alinhada a recomendação do MP-SP.
**Confiança: média** quanto à base legal; **alta** quanto à existência da
lista. Dataset: `packages/db/src/data/fpf-torcidas-cadastradas-sp.json`;
análise em `docs/data/auditoria-catalogo-clubes.md` §6.

→ Implicação: "estar regularizada" (estatuto, cadastro, registro) é condição
de existência pública da torcida — o SaaS pode ser o dossiê vivo dessa
regularidade.

## Responsabilidade da plataforma pelo conteúdo (2026-09-01)

Esta seção trata do risco **do SaaS**, não da torcida. Detalhe, fontes e
benchmark em `docs/knowledge/moderacao-plataformas.md`; política em
`docs/data/politica-de-conteudo.md`; módulo em `docs/data/modulo-moderacao.md`.

- **STF, Tema 987 (jun/2025; acórdão 06/11/2025)** — art. 19 do Marco Civil
  declarado **parcialmente inconstitucional**. Fora dos crimes contra a honra,
  **notificação extrajudicial** já basta para constituir a mora do provedor. E
  há **dever de cuidado proativo** — agir sem denúncia e sem ordem judicial —
  em sete classes, entre elas **discriminação e discurso de ódio**, que é
  exatamente o risco deste nicho. O limiar de "risco sistêmico" que protegeria
  plataformas pequenas **não entrou na tese**: porte atenua, não isenta, e
  "estado da arte" é critério expresso.
- **ECA Digital — Lei 15.211/2025**, em vigor desde **17/03/2026**. Alcança
  serviço acessível a menores (é o nosso caso: torcida tem sócio menor).
  Exige aferição de idade confiável (autodeclaração não basta), conta de menor
  de 16 vinculada a responsável, remoção **e comunicação às autoridades** de
  material de abuso sexual com **preservação de conteúdo e metadados**.
  Multa até 10% do faturamento no Brasil ou R$ 50 mi por infração; sanções
  administrativas a partir de **nov/2026**.
- **Lei 14.532/2023** — injúria racial equiparada a racismo (2–5 anos). Três
  agravantes desenham o nosso ambiente: **contexto esportivo** (+ proibição de
  frequentar estádio por 3 anos), **duas ou mais pessoas** (+1/2) e
  **"descontração/diversão"** (+1/3 a 1/2) — que remove a defesa do "era só
  zoeira".

→ Implicação de produto: moderação deixou de ser feature de comunidade e virou
requisito de arquitetura. E vira **argumento de venda**: conteúdo racista
publicado em nome da torcida pode, pela LGE art. 183 § 2º, banir a torcida
**e seus associados** dos estádios por até 5 anos — o sistema que detecta e
registra a remoção protege o cliente, não só a plataforma.

## Riscos e debates em aberto

- **Criminalização × reconhecimento**: parte do movimento vê a LGE como
  instrumento de criminalização (Esquerda Online, 2023); a ANATORG negocia
  mudanças na Câmara (2024). O produto deve ser neutro: ferramenta de gestão
  e compliance, nunca instrumento de vigilância de terceiros.
- **Punição coletiva** (torcida única, banimento) tem constitucionalidade
  questionada academicamente (Revista FT). Acompanhar.
- **Infiltração de facções criminosas** em algumas organizadas é tema de
  imprensa (Gazeta do Povo, sobre o Ceará). Risco reputacional do nicho:
  reforça a importância de auditoria, transparência financeira e cadastros
  limpos como valores do produto.

## Checklist de compliance para o produto

1. Ficha de membro cobre todos os **dez** campos do art. 178, § 4º: nome
   completo, fotografia, filiação, número do registro civil, CPF, data de
   nascimento, **estado civil**, profissão, endereço completo e escolaridade.
2. Desligamento/exclusão de membro com data e trilha de auditoria.
3. Exportação do cadastro (a torcida precisa apresentá-lo a autoridades).
4. Moderação de conteúdo público com política anti-incitação.
5. Dados pessoais sensíveis sob LGPD: minimização de acesso (RBAC), sem
   exposição cross-tenant (já garantido pela visibilidade: membros nunca são
   públicos).
