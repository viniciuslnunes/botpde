# Glossário do nicho — torcidas organizadas

> Vocabulário real do movimento, para copy, UX, moderação e modelagem.
> Termos que o produto **usa** e termos que o produto deve **entender**.

## Organização e estrutura

- **Torcida organizada (TO)** — associação civil de torcedores com estatuto,
  diretoria e sede. Nunca chamar de "fã-clube".
- **Uniformizada** — nome da 1ª geração (anos 1940); hoje sobrevive em siglas
  (TUP, TUF, TUSP).
- **Barra brava** — modelo platino de livre adesão, sem cadastro nem
  mensalidade (ex.: Geral do Grêmio).
- **Sede** — QG da torcida; também a unidade-mãe na hierarquia do sistema.
- **Subsede** — representação da torcida em outra cidade/bairro.
- **PDE (Ponto de Encontro)** — célula local onde os membros se reúnem
  (ex.: Ponto de Encontro dos Gaviões da Fiel).
- **Batalhão** — divisão territorial de membros por cidade, com
  representante e vice (sinônimo prático de subsede em algumas torcidas).
- **Embaixada** — representação da torcida em outro estado/país.
- **Velha guarda** — fundadores e membros históricos; conselho moral.
- **Pixote** — membro jovem/novato (uso informal; pode ser pejorativo).
- **Diretoria / prancheta** — quem administra; "de prancheta" = burocrata.
- **Conselho fiscal / deliberativo** — órgãos estatutários de controle.
- **Presidente / presida** — liderança máxima eleita.

## Identidade e arquibancada

- **Afiliação** — no nosso produto: o time que a torcida apoia (não usar
  "clube" como entidade).
- **Escudo / mascote / pavilhão** — símbolos da torcida; pavilhão também
  nomeia torcidas (Pavilhão 6, Pavilhão Jovem).
- **Bandeirão** — bandeira gigante que cobre setores da arquibancada.
- **Trapo** — faixa/pano da torcida pendurado no estádio (linguagem barra);
  perder um trapo para rivais é humilhação máxima — furto de material é
  gatilho clássico de conflito (contexto de moderação).
- **Batucada / bateria** — núcleo de percussão da torcida.
- **Grito de guerra / canto** — músicas da arquibancada.
- **Setor** — área da torcida no estádio (ex.: setor norte).
- **Caravana** — excursão organizada para jogo fora de casa.
- **Excursão / busão** — ônibus da caravana.
- **Festa / recepção** — mosaicos, sinalizadores e festa na chegada do time.

## Associativismo

- **Associado / sócio da torcida** — membro com cadastro e mensalidade
  (≠ sócio-torcedor do clube, programa do clube).
- **Carteirinha** — credencial do associado; dá acesso a sede, caravana e
  descontos.
- **Mensalidade** — contribuição recorrente do associado.
- **Materiais** — produtos oficiais da torcida (camisas, bonés, patches);
  "material de jogo" = bandeiras e instrumentos levados ao estádio.
- **Ficha / cadastro** — registro legal obrigatório de integrantes (LGE).

## Relações entre torcidas

- **Aliança / irmandade** — relação formal e pública de amizade entre
  torcidas de clubes diferentes.
- **Bloco / união** — rede nacional de alianças (Punho Cruzado, Dedo pro
  Alto, Punho Colado, Lado A, Lado B).
- **Torcida coirmã** — torcida aliada.
- **Rival** — par histórico de conflito. No produto: dado de moderação,
  nunca conteúdo.
- **Torcida única** — medida que proíbe torcida visitante (clássicos de SP
  desde 2016).

## Contexto institucional

- **ANATORG** — Associação Nacional das Torcidas Organizadas (2014).
- **Lei Geral do Esporte (LGE)** — Lei 14.597/2023; sucedeu o **Estatuto do
  Torcedor** (Lei 10.671/2003).
- **Escola de samba da torcida** — braço carnavalesco (Gaviões, Mancha,
  Camisa 12, TUP); envolve **barracão**, **carnavalesco**, **alas**.

## Dados públicos e onboarding (card de clube)

- **Inscritos digitais** — soma de seguidores/inscritos nos perfis **oficiais**
  do clube em redes (IBOPE Repucom, Top 50). Copy do produto: “X inscritos
  digitais”. **Não** significa torcedores presenciais nem deduplica pessoas.
- **Base digital** — presença do clube nas redes; no produto, tier `IBOPE_DIGITAL`
  (Top 50) vs `LIMITE_ATE` (fora do ranking, teto conservador).
- **Torcedores estimados** — rótulo genérico na UI para clubes fora do Top 50:
  “até 10 mil torcedores ou menos” (estimativa conservadora, não dado IBOPE).
- **Online (plataforma)** — usuários com sessão ativa na janela de presença
  (`ultimoAcessoEm`); dado **próprio** do SaaS, separado de inscritos digitais.

Ver `docs/knowledge/futebol-dados-publicos.md` e `docs/data/torcedores-estimados.md`.

## Comunidade e cadastro

- **Sócio** — associado cadastrado (e em geral pagante) de uma torcida
  organizada específica; `SaasMembro.tipo = SOCIO`.
- **Torcedor** — simpatizante da **afiliação** (o time), sem vínculo formal
  com nenhuma organizada; `SaasMembro.tipo = TORCEDOR`. Persona de topo do
  funil de aquisição — tem `PerfilTorcedor` global, participa da Comunidade
  Nacional, pode iniciar admissão para virar sócio.
- **Perfil do torcedor** (`PerfilTorcedor`, global, um por usuário) × **Perfil
  de membro** (`PerfilMembro`, por tenant) — não confundir: o primeiro é a
  identidade única da pessoa na plataforma; o segundo é a identidade social
  dela dentro de uma torcida específica.
- **Torcida conhecida** (`PerfilTorcedor.torcidaConhecida`) — organizada que o
  torcedor diz conhecer/torcer junto fora da plataforma, sem vínculo formal.
- **Número de associado / anos de sócio** — antiguidade do vínculo, usada
  como sinal de status dentro da torcida (não confundir com "sócio-torcedor"
  do clube, que é outro programa).
- **Imagem de prova / comprovante de vínculo** — documento anexado no
  cadastro para validar a admissão do associado (dado pessoal sensível).
- **Importação de base** — migração de uma base de associados já existente
  (planilha, sistema legado) para o cadastro do produto.
- **Seguir / seguimento com aprovação** — camada de comunidade: seguir um
  perfil privado exige aprovação do dono, distinto do vínculo associativo.

## Uso no produto

- Copy do portal fala com o **associado** ("sua torcida", "sua sede", "próxima
  caravana"); admin fala com a **diretoria** (vocabulário estatutário).
- Termos sensíveis em moderação: convocações com menção a rival + local/hora
  fora de contexto de jogo merecem revisão humana.
