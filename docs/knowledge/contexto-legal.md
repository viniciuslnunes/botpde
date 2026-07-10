# Base de conhecimento — Contexto legal e regulatório

> Legislação que incide sobre torcidas organizadas. É o **argumento de venda
> central do SaaS**: a lei obriga as torcidas a manterem gestão formal de
> membros. Fontes consultadas em 2026-07-10. Não é aconselhamento jurídico.

## Lei Geral do Esporte — Lei nº 14.597/2023 (substituiu o Estatuto do Torcedor)

### Cadastro obrigatório de integrantes (core do produto)

A torcida organizada **deve manter cadastro atualizado** de seus integrantes
com: nome completo, fotografia, filiação, endereço, escolaridade, profissão,
data de nascimento, RG e CPF. Fontes: normas.leg.br (Lei 14.597/2023, Título
III); modeloinicial.com.br.

→ Implicação direta: o módulo de membros do SaaS (ficha completa,
carteirinha, foto) não é conveniência — é **compliance legal**. Campos do
cadastro legal devem existir no modelo de dados.

### Responsabilidade civil objetiva e solidária

A torcida responde civil e **objetivamente** (independe de culpa) e
**solidariamente** pelos danos causados por qualquer associado no local do
evento, imediações ou trajeto de ida/volta. Dirigentes e membros respondem
solidariamente, inclusive com patrimônio próprio. Fontes: Conjur,
"Responsabilidade civil dos membros de torcidas organizadas" (2023);
Lei 14.597/2023.

→ Implicação: saber **quem é membro ativo, desde quando, e quem foi
desligado** (com data e auditoria) tem valor jurídico para a torcida.

### Banimento coletivo

Torcida que promover tumulto, praticar/incitar violência, praticar condutas
discriminatórias (racistas, xenófobas, homofóbicas, transfóbicas) ou invadir
áreas restritas pode ser impedida — junto com seus membros — de comparecer a
eventos esportivos por até **5 anos**. Fonte: Lei 14.597/2023.

→ Implicação: moderação de conteúdo na Comunidade não é opcional — conteúdo
de incitação publicado em nome da torcida gera risco jurídico real ao tenant.

### Cadastro Nacional de Torcedores Impedidos (art. 181)

Registro nacional que viabiliza barrar torcedores punidos na compra de
ingressos e nas catracas. Fonte: Vernalha Pereira, "Sancionada a Lei Geral do
Esporte".

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

### Restrição de uniformes/materiais

Em SP (e em estatutos de clubes como Flamengo, Fluminense, São Paulo, Ponte
Preta e Guarani), entrada com camisas e materiais de organizada é
condicionada a registro regular da torcida junto ao poder público. Fonte:
rosenbaum.adv.br.

→ Implicação: "estar regularizada" (estatuto, cadastro, registro) é condição
de existência pública da torcida — o SaaS pode ser o dossiê vivo dessa
regularidade.

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

1. Ficha de membro cobre todos os campos do cadastro legal (foto, filiação,
   endereço, escolaridade, profissão, nascimento, RG, CPF).
2. Desligamento/exclusão de membro com data e trilha de auditoria.
3. Exportação do cadastro (a torcida precisa apresentá-lo a autoridades).
4. Moderação de conteúdo público com política anti-incitação.
5. Dados pessoais sensíveis sob LGPD: minimização de acesso (RBAC), sem
   exposição cross-tenant (já garantido pela visibilidade: membros nunca são
   públicos).
