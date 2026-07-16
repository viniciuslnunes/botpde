# Roadmap — Torcida SaaS

Foco atual (decisão do usuário): **endurecer o núcleo operacional** antes de expandir.
Sprints de 2 semanas. Cada item precisa de critério de aceite (ver DoR/DoD no
`ARCHITECTURE.md` e nos rituais do time).

## Fase 1 — Endurecer núcleo + dados reais (agora)

1. Fechar rollout de `resolveVisibility` cross-tenant na hierarquia sede/subsede/PDE.
2. Comunicados oficiais na Home + indicador de leitura; separar oficial de mural local.
3. Home do associado como dashboard contextual (status, próxima ação, próximo evento).
4. **Importação da base de associados** (`ImportacaoMembros`) — prioridade #1 de dados,
   habilita métricas reais.
5. Decidir permissão dedicada de "sócio" (hoje reusa `MEMBERS_APPROVE`).

**Entregue fora de ordem:** Salas de vídeo (Meet) — reuniões ao vivo com chat, presença e
enquetes via LiveKit/WebRTC (permissão `MEETINGS_HOST`). Ver `docs/data/modulo-salas.md`.
Controle de acesso por **Departamentos** (perfis compostos, herança viva de permissão
por depto, worktree de acesso) — ver `docs/data/modulo-departamentos.md`.

**Resultado:** base estável, acesso consistente e dados reais para métrica.

> **Nota de coerência (2026-07-16):** o foco declarado desta fase é endurecer o
> núcleo operacional, mas Alianças e Comunidade Nacional/torcedor global (Fase 2
> e 3) já foram antecipadas e entregues — mesmo padrão de Salas. Ler "Fase 1" como
> "em endurecimento", não "única frente em andamento".

## Fase 2 — Alianças + fundação de informação

1. `Afiliacao` (o time) + associação da torcida à sua afiliação na configuração.
2. Modelo de **Alianças**: `Alianca`, visibilidade `'allied'`, `/admin/aliancas`,
   permissão `ALLIANCES_MANAGE`; recomendações do agente `aliancas-torcidas`.
3. Integração de **jogos/calendário/resultados** (`Partida`) → alimenta eventos.
4. Iniciar **tRPC** (API central interna) — base para mobile e ingestão externa.

**Entregue além do previsto:** recomendações automáticas de aliança, co-irmãs
(mesma afiliação, confiança ALTA sempre), grafo nacional de rivalidade
(`RivalidadeClube`/`RivalidadeTorcida`, ver item 5 da Fase 3 abaixo — já
entregue, não só planejado) e herança de aliança pela worktree inteira.

**Resultado:** comunidade com aliados + primeira camada de informação confiável.

## Fase 3 — Comunidade profunda + inteligência

1. Notícias + gerenciador de dados institucionais; feed curado por afiliação (time).
2. ~~Superfícies de interação entre aliados (comunidade pública cross-torcida)~~ —
   **entregue antecipadamente** como Comunidade Nacional (feed por afiliação,
   `Post.alcanceNacional`, tenant sintético, perfil de torcedor global) e central
   de notificações sociais. Ver `docs/data/modulo-comunidade.md`.
3. Métricas/dashboards (engajamento, presença, crescimento) sobre a base real.
4. Mobile (React Native/Expo sobre tRPC); convergência bot → tRPC/Prisma (sai do raw `pg`).
5. **Grafo nacional de relacionamento entre torcidas** (aliados/rivais) e aprendizado
   de padrões de rivalidade/confronto — **entregue antecipadamente**
   (`RivalidadeClube`, `RivalidadeTorcida`, integrado a `resolveVisibility`).
   Base de conhecimento segue expandida pelo agente `aliancas-torcidas`.
   **Guarda ética:** esses dados existem só para segurança, prevenção e
   moderação; nunca para facilitar, ranquear ou glorificar conflito.
6. **Escudos de clubes (`Afiliacao`)** — inteligência de casamento clube ↔ imagem
   (Soccer Wiki + aliases + dedup). Fase A entregue; fases B–E em
   `docs/data/escudos-afiliacoes.md`.

**Resultado:** utilidade, engajamento e inteligência operacional.

## Épicos (backlog)

A. Fundamentos de autorização · B. Territorialidade · C. Comunicados oficiais ·
D. Eventos e mobilização · E. Experiência do associado · F. API compartilhada (tRPC) ·
G. Convergência bot ↔ web · **H. Alianças** ✅ entregue (incl. grafo nacional de
rivalidade e recomendações) · **I. Informação do nicho** 🆕 ·
**J. Importação de base** 🆕 · **K. Salas de vídeo (Meet)** ✅ entregue ·
**L. Escudos de clubes** 🔄 fase A entregue (`docs/data/escudos-afiliacoes.md`) ·
**M. Comunidade Nacional / torcedor global** ✅ entregue — falta racional de
produto próprio, ver `dominio.md` · **N. Controle de acesso por Departamentos**
✅ entregue, ver `docs/data/modulo-departamentos.md`.
