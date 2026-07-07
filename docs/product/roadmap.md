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

**Resultado:** base estável, acesso consistente e dados reais para métrica.

## Fase 2 — Alianças + fundação de informação

1. `Afiliacao` (o time) + associação da torcida à sua afiliação na configuração.
2. Modelo de **Alianças**: `Alianca`, visibilidade `'allied'`, `/admin/aliancas`,
   permissão `ALLIANCES_MANAGE`; recomendações do agente `aliancas-torcidas`.
3. Integração de **jogos/calendário/resultados** (`Partida`) → alimenta eventos.
4. Iniciar **tRPC** (API central interna) — base para mobile e ingestão externa.

**Resultado:** comunidade com aliados + primeira camada de informação confiável.

## Fase 3 — Comunidade profunda + inteligência

1. Notícias + gerenciador de dados institucionais; feed curado por afiliação (time).
2. Superfícies de interação entre aliados (comunidade pública cross-torcida).
3. Métricas/dashboards (engajamento, presença, crescimento) sobre a base real.
4. Mobile (React Native/Expo sobre tRPC); convergência bot → tRPC/Prisma (sai do raw `pg`).
5. **Grafo nacional de relacionamento entre torcidas** (aliados/rivais) e aprendizado
   de padrões de rivalidade/confronto — base de conhecimento expandida do agente
   `aliancas-torcidas`. **Guarda ética:** esses dados existem só para segurança,
   prevenção e moderação; nunca para facilitar, ranquear ou glorificar conflito.

**Resultado:** utilidade, engajamento e inteligência operacional.

## Épicos (backlog)

A. Fundamentos de autorização · B. Territorialidade · C. Comunicados oficiais ·
D. Eventos e mobilização · E. Experiência do associado · F. API compartilhada (tRPC) ·
G. Convergência bot ↔ web · **H. Alianças** 🆕 · **I. Informação do nicho** 🆕 ·
**J. Importação de base** 🆕.
