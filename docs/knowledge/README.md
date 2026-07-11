# Base de conhecimento — Domínio de torcidas organizadas

> Inteligência de domínio do Torcida SaaS. Alimenta o time de agentes
> (`.claude/agents/`) e as decisões de produto. Base **viva**: cada entrada tem
> fonte e data de consulta; informação incerta é marcada como tal.

## Arquivos

| Arquivo | Conteúdo | Consumidores principais |
|---|---|---|
| [`aliancas.md`](aliancas.md) | Blocos nacionais, alianças bilaterais, rivalidades (só moderação) | `aliancas-torcidas`, `rbac`, `news-curator` |
| [`diretorio-nacional.md`](diretorio-nacional.md) | Mapa amplo clube → torcidas por região/estado (21 estados) | `aliancas-torcidas`, `news-curator`, `research-dominio` |
| [`torcidas-brasil.md`](torcidas-brasil.md) | Perfis aprofundados das principais organizadas por afiliação/região | `aliancas-torcidas`, `product-strategy`, `research-dominio` |
| [`estrutura-governanca.md`](estrutura-governanca.md) | Hierarquia, cargos, departamentos, escalões, modelo associativo | `rbac`, `data-model`, `product-strategy` |
| [`cultura-ideologia.md`](cultura-ideologia.md) | Origem, gerações, escolas de samba, política e valores | `ux-review`, `news-curator`, `product-strategy` |
| [`contexto-legal.md`](contexto-legal.md) | Estatuto do Torcedor, Lei Geral do Esporte, torcida única, cadastro | `product-strategy`, `data-model`, `rbac`, `qa-verification` |
| [`glossario.md`](glossario.md) | Jargão do nicho para UX, copy e moderação | `ux-review`, `implementation`, `news-curator` |

## Protocolo de manutenção

1. **Fonte + data em tudo.** Prefira imprensa estabelecida (ge/Globo, Lance!,
   UOL, CNN Brasil, Trivela, O Tempo, agências públicas) e fontes acadêmicas
   (Ludopédio, Observatório Social do Futebol, repositórios universitários).
   Redes sociais valem só como pista — nunca como confirmação.
2. **Grau de confiança**: alta (múltiplas fontes sólidas) / média (uma fonte
   sólida) / baixa (indício; requer confirmação humana).
3. **Atualização incremental**: nunca reescrever entradas válidas; corrigir com
   nova fonte e data. Discrepâncias entre fontes ficam registradas.
4. **Ética (obrigatório)**: rivalidades são dado sensível registrado
   **exclusivamente** para (a) nunca sugerir rivais como aliados e (b) moderação
   de conteúdo. Nunca derivar ranking de inimizade, mapa de confronto ou
   qualquer conteúdo que possa escalar conflito ou expor pessoas.

## Guia rápido do nicho (TL;DR para agentes)

- Torcida organizada = **associação civil** com estatuto, diretoria eleita,
  sede, mensalidade e carteirinha — não é "grupo informal de torcedores".
  O SaaS existe porque essa operação é real e regulada por lei.
- A **Lei Geral do Esporte (14.597/2023)** obriga cadastro atualizado de
  integrantes (nome, foto, filiação, endereço, escolaridade, profissão,
  nascimento, RG, CPF) e impõe responsabilidade civil objetiva e solidária à
  torcida — gestão de membros não é conveniência, é obrigação legal.
- Alianças entre torcidas são públicas, estáveis e organizadas em **cinco
  blocos nacionais** (Punho Cruzado, Dedo pro Alto, Punho Colado, Lado A,
  Lado B) além de laços bilaterais. No produto, aliança = visibilidade
  cross-tenant de conteúdo PÚBLICO, sempre opt-in do Presidente.
- O movimento tem ~2 milhões de envolvidos; a ANATORG (2014) representa 247+
  torcidas em 21 estados. Perfis, jornadas e dores variam por região.
