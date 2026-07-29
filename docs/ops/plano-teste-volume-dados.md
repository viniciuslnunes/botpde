# Plano de teste de volume de dados

Objetivo: navegar o produto (Agenda, Loja, painel admin, Comunidade) sob
volume realista de uso antes de alimentar a plataforma com dados reais,
usando dados sintéticos fáceis de identificar e apagar por completo.

## Convenção de marcação (reutilizável)

Não existe hoje um campo formal `isTest`/`isSeed` no schema. A marcação é
por convenção, aplicada em todo seed de volume:

- **`User` sintético**: e-mail com domínio reservado dedicado ao lote
  (ex.: `@teste.corinthians.torcida.app`) + `nickname` com prefixo `teste_`.
- **`Conversa`/`Evento`/`SalaReuniao`/`Post` institucional criados pelo
  seed**: título/nome com um marcador **específico do lote**, não o
  genérico `[TESTE]` já usado por `seed-dados-teste.js` — use algo como
  `[TESTE-<LOTE>]` (ex.: `[TESTE-CORINTHIANS]`) para não colidir com dados
  de teste de outros scripts que já rodaram no mesmo ambiente. Isso
  importa: `seed-dados-teste.js` já cria um `Evento` com título começando
  em `[TESTE] `, e um reset que filtrasse por esse prefixo genérico
  apagaria dados de teste de origem diferente.
- Posts institucionais (autor = owner/admin **real** da torcida) só podem
  ser identificados pelo prefixo do título — não pelo autor.

Cada seed de volume deve vir com um script de reset irmão, com `--dry-run`
por padrão de segurança de operação (nunca apagar sem confirmação
explícita), que apaga **só** o que aquele seed criou, respeitando a ordem
de FKs (ver `seed-corinthians-teste.js` / `reset-corinthians-teste.js`
como referência).

## Fase 1 (concluída) — Corinthians

Escopo: as 6 torcidas reais do Corinthians já cadastradas em dev
(`pde-gavioes-fiel`, `camisa-12-corinthians`, `pavilhao-nove`,
`estopim-da-fiel-sp`, `torcida-fiel-macabra-sp`,
`torcida-organizada-coringao-chopp-sp`) — 32 unidades territoriais
(Sede/Subsede/PDE) reais na varredura em 2026-07-27, 50 pessoas por
unidade (1.600 pessoas) + 150 torcedores 100% globais para a Comunidade
Nacional. Ambiente: banco de dev compartilhado (Railway), não produção.

Scripts: `packages/db/scripts/seed-corinthians-teste.js` /
`reset-corinthians-teste.js` — comandos `pnpm --filter @torcida/db
seed:corinthians-teste` / `reset:corinthians-teste -- --dry-run`.

## Fase 2 (futura) — nacional, todos os clubes

Ideia: repetir o padrão da Fase 1 em loop por `Afiliacao`, para todo clube
com torcidas cadastradas na plataforma. Pontos a decidir antes de rodar:

- **Volume por unidade, não por clube**: manter o padrão "N pessoas por
  Sede/Subsede/PDE", capado por unidade — nunca dimensionado pelo
  `torcedoresEstimados` real do IBOPE (que é ordens de grandeza maior e
  não deve virar volume de linhas no banco).
- **Estimativa de tamanho de banco**: extrapolar a partir da Fase 1 (32
  unidades → ~1.750 users, ~1.600 SaasMembro, ~840 posts, ~4.500
  reações+comentários, ~20 eventos, ~1.100 RSVPs, 9 salas, 610
  MembroConversa, 57 pedidos — em ~90s de execução). Multiplicar pelo
  número de unidades territoriais de todos os clubes cadastrados antes de
  rodar, e orçar espaço em disco/índices de acordo.
- **Ambiente**: rodar em ambiente separado de produção (nunca no banco
  usado por usuários reais) — mesmo o dev/staging compartilhado deve ser
  avisado com antecedência, dado o volume de escrita.
- **Performance**: consultar o agente `performance` antes de rodar em
  escala nacional — risco real de carga em índices/queries de feed e
  busca da Comunidade (ver
  `docs/data/modulo-comunidade-performance.md`), especialmente com muitos
  tenants gerando posts/reações simultaneamente.
- Reaproveitar a convenção de marcação acima (domínio de e-mail reservado
  por lote + prefixo `[TESTE-<LOTE>]`), com um domínio/lote por rodada
  para permitir resets parciais (por clube) sem afetar os demais.
