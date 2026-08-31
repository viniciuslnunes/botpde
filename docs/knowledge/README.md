# Base de conhecimento — Domínio de torcidas organizadas

> Inteligência de domínio do Torcida SaaS. Alimenta o time de agentes
> (`.claude/agents/`) e as decisões de produto. Base **viva**: cada entrada tem
> fonte e data de consulta; informação incerta é marcada como tal.

## Arquivos

| Arquivo | Conteúdo | Consumidores principais |
|---|---|---|
| [`aliancas.md`](aliancas.md) | Blocos nacionais, alianças bilaterais, rivalidades (moderação **e** isolamento de UX/dados) | `aliancas-torcidas`, `rbac`, `news-curator` |
| [`diretorio-nacional.md`](diretorio-nacional.md) | Mapa amplo clube → torcidas por região/estado (21 estados) | `aliancas-torcidas`, `news-curator`, `research-dominio` |
| [`torcidas-brasil.md`](torcidas-brasil.md) | Perfis aprofundados das principais organizadas por afiliação/região | `aliancas-torcidas`, `product-strategy`, `research-dominio` |
| [`estrutura-governanca.md`](estrutura-governanca.md) | Hierarquia, cargos, departamentos, escalões, modelo associativo; admissão ≠ lotação de área (2026-07-17) | `rbac`, `data-model`, `product-strategy` |
| [`cultura-ideologia.md`](cultura-ideologia.md) | Origem, gerações, escolas de samba, política e valores | `ux-review`, `news-curator`, `product-strategy` |
| [`identidade-visual-cores.md`](identidade-visual-cores.md) | Cores da torcida/clube, rivalidade cromática, regras do módulo Design (sem verde forçado, P&B) | `ux-review`, `implementation`, `product-strategy`, `qa-verification` |
| [`contexto-legal.md`](contexto-legal.md) | Estatuto do Torcedor, Lei Geral do Esporte, torcida única, cadastro | `product-strategy`, `data-model`, `rbac`, `qa-verification` |
| [`glossario.md`](glossario.md) | Jargão do nicho para UX, copy e moderação | `ux-review`, `implementation`, `news-curator` |
| [`futebol-dados-publicos.md`](futebol-dados-publicos.md) | IBOPE Ranking Digital; **APIs de jogos** (Google Sports ≠ API gratuita; alternativas para `Partida`) | `research-dominio`, `product-strategy`, `data-model`, `ux-review` |
| [`fontes-dados-clubes.md`](fontes-dados-clubes.md) | **Fonte certa por campo**: CBF RNC, federações estaduais, Wikidata, Ogol, Datafolha, IBGE, CNPJ — o que cada uma mede e onde erra (2026-08-27) | `research-dominio`, `data-model`, `aliancas-torcidas`, `implementation` |
| [`concorrentes-gestao.md`](concorrentes-gestao.md) | **Catálogo atômico de gaps** vs TorcidaWeb / Softaliza / TorcidasPRO / Clube Control (~110+ features; matrizes por domínio + ranking P0–P3) | `research-dominio`, `product-strategy` |

**Dados operacionais relacionados** (fora de `knowledge/`):

| Doc | Conteúdo |
|-----|----------|
| [`docs/data/escudos-afiliacoes.md`](../data/escudos-afiliacoes.md) | Escudos de `Afiliacao` (Soccer Wiki, Ogol, Cloudinary) |
| [`docs/data/torcedores-estimados.md`](../data/torcedores-estimados.md) | Base digital IBOPE + teto conservador no onboarding |
| [`docs/data/auditoria-catalogo-clubes.md`](../data/auditoria-catalogo-clubes.md) | **Auditoria medida** do catálogo (2026-08-27): 91 clubes do RNC ausentes, cidades inválidas, rivalidade sem dado de produção, torcidas SP × registro FPF |
| [`docs/data/setor-arquibancada.md`](../data/setor-arquibancada.md) | Setor da TO no estádio (cadastro na Sede; visão derivada do clube planejada) |
| [`docs/data/modulo-eventos.md`](../data/modulo-eventos.md) | Agenda unificada (eventos/caravanas/bateria), `Partida`, capacidade, série |
| [`docs/data/modulo-design.md`](../data/modulo-design.md) | Estúdio Design do tenant (paletas, tokens, contraste `*-fg`) |
| [`docs/data/modulo-comunidade-performance.md`](../data/modulo-comunidade-performance.md) | Feed, timeline, busca, caches e plano futuro Comunidade |
| [`docs/product/plano-paridade-concorrentes.md`](../product/plano-paridade-concorrentes.md) | O que integrar do mercado (fases A–D: caixa, LGE, QR, sede) |

## Protocolo de manutenção

1. **Fonte + data em tudo.** Prefira imprensa estabelecida (ge/Globo, Lance!,
   UOL, CNN Brasil, Trivela, O Tempo, agências públicas) e fontes acadêmicas
   (Ludopédio, Observatório Social do Futebol, repositórios universitários).
   Redes sociais valem só como pista — nunca como confirmação.
2. **Grau de confiança**: alta (múltiplas fontes sólidas) / média (uma fonte
   sólida) / baixa (indício; requer confirmação humana).
3. **Atualização incremental**: nunca reescrever entradas válidas; corrigir com
   nova fonte e data. Discrepâncias entre fontes ficam registradas.
4. **Ética (obrigatório)**: rivalidades são dado sensível. Usos permitidos:
   (a) nunca sugerir rivais como aliados; (b) moderação de conteúdo;
   (c) **isolamento técnico de UX/dados** — par `rival` não se enxerga
   (mesmo conteúdo PÚBLICO), igual `unrelated` (`resolveVisibility` → `false`;
   atualização 2026-07-16 em [`aliancas.md`](aliancas.md)). Nunca derivar
   ranking de inimizade, mapa de confronto ou qualquer conteúdo que possa
   escalar conflito ou expor pessoas. **Paralelo de UI:** não pintar a marca
   da torcida com cor típica de rival
   (ver [`identidade-visual-cores.md`](identidade-visual-cores.md)).
   **Corrigido 2026-08-26:** o texto anterior dizia “exclusivamente
   moderação”; isso ficou defasado quando `rival` passou a ser relação de
   `TenantRelation`.

## Guia rápido do nicho (TL;DR para agentes)

- Torcida organizada = **associação civil** com estatuto, diretoria eleita,
  sede, mensalidade e carteirinha — não é "grupo informal de torcedores".
  O SaaS existe porque essa operação é real e regulada por lei.
- A **Lei Geral do Esporte (14.597/2023, art. 178 § 4º)** obriga cadastro
  atualizado de integrantes com **dez** campos (nome, foto, filiação, registro
  civil, CPF, nascimento, **estado civil**, profissão, endereço, escolaridade)
  e impõe responsabilidade civil objetiva e solidária à torcida (§§ 5º e 6º) —
  gestão de membros não é conveniência, é obrigação legal. O "Cadastro Nacional
  de Torcedores" **não existe**: foi vetado (art. 158, XI).
- Alianças entre torcidas são públicas, estáveis e organizadas em **cinco
  blocos nacionais** (Punho Cruzado, Dedo pro Alto, Punho Colado, Lado A,
  Lado B) além de laços bilaterais. No produto, aliança = visibilidade
  cross-tenant de conteúdo PÚBLICO, sempre opt-in do Presidente. **Rival
  some do universo de interação** (feed, busca, DM, seguir) — não “existe
  mas o conteúdo é privado”. Catálogo de clubes no onboarding é a exceção
  (escolher o *próprio* time). Ver [`aliancas.md`](aliancas.md) § isolamento.
- **Cores da torcida/clube** são identidade e rivalidade: priorizar marca da
  torcida; não forçar verde (ou hue de rival) fora do contexto; preto é preto.
  Ver [`identidade-visual-cores.md`](identidade-visual-cores.md).
- O movimento tem ~2 milhões de envolvidos; a ANATORG (2014) representa 247+
  torcidas em 21 estados. Perfis, jornadas e dores variam por região.
