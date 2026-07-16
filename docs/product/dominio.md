# Mapa de domínio — Torcida SaaS

> Documento de produto. A verdade técnica (as-is/to-be, RBAC, deploy) está em
> `ARCHITECTURE.md`. Aqui descrevemos o **domínio** e as **jornadas**.
> O conhecimento profundo do nicho (torcidas reais, blocos de alianças,
> governança interna, contexto legal, glossário) vive em **`docs/knowledge/`**
> — índice em `docs/knowledge/README.md`.

## Visão

Plataforma útil e confiável para torcidas organizadas: coordena a operação (sede,
subsedes, PDEs, membros), mobiliza (eventos, presença), conecta a comunidade (interna
+ aliados curados) e informa com dados confiáveis do nicho (time, jogos, notícias).
Não é rede social genérica — cada recurso resolve uma dor real da torcida.

## Domínios

| Domínio | Núcleo | Estado |
|---|---|---|
| Operação | membros, sócios, carteirinha, sedes/subsedes/PDE, departamentos (colaborador/gestor), RBAC, auditoria | Existe — **gap comercial:** planos de associação, cobrança/Pix e QR de adimplência (ver `plano-paridade-concorrentes.md`) |
| Mobilização | eventos, RSVP, check-in, presença | Existe |
| Comunidade | comunicados oficiais, mural/posts por unidade, feed social (perfil, seguir, enquetes, canais), **Comunidade Nacional** (feed cross-tenant por afiliação), notificações sociais, salas de vídeo ao vivo (Meet) | **Entregue além do previsto** — deixou de ser intra-tenant (2026-07-16: reconciliar com `roadmap.md`) |
| Alianças | relação curada torcida↔torcida; visibilidade pública cross-tenant; recomendações automáticas; rivalidade como bloqueio técnico de visibilidade | **Entregue** — ver `docs/knowledge/aliancas.md` |
| Aquisição / torcedor global 🆕 | perfil de torcedor sem organizada própria, onboarding com estimativa de base digital, funil para virar sócio | Novo — sem racional de produto próprio ainda (ver Atores) |
| Informação do nicho | afiliação (time), jogos/calendário/resultados, notícias, dados institucionais | Existe |

**Âncora nova — `Afiliacao`**: o time que a torcida existe para apoiar (sua *razão de
viver*) — não se usa o termo genérico "clube" como entidade. Tabela global;
jogos/notícias/dados institucionais chaveiam por afiliação e são compartilhados entre
todas as torcidas do mesmo time. Tenant raiz (a torcida) → tem uma `Afiliacao`.
A hierarquia Sede → Subsede → PDE é **afiliação territorial** (subsedes/PDEs afiliadas
à sede).

## Atores e perfis

| Perfil | Superfície | Papel |
|---|---|---|
| Torcedor 🆕 | Portal (Comunidade Nacional, onboarding) | Simpatizante da afiliação sem organizada própria; topo do funil de aquisição; `PerfilTorcedor` global; pode publicar posts públicos mesmo antes de virar sócio de uma torcida (`SaasMembro.tipo = TORCEDOR`) |
| Associado (sócio) | Portal | Status, eventos, comunicados, unidade local, feed do time; `SaasMembro.tipo = SOCIO` |
| Admin de núcleo | Admin local | Opera sede/subsede/PDE, membros, eventos |
| Diretoria | Admin ampliado | Comunicados e ações de maior alcance |
| Presidente (owner) | Admin + Config | Define alianças, afiliação (time) da torcida, governança |
| Super-admin | Painel global | Governança técnica da plataforma |

> **Torcedor** ainda não tem racional de produto registrado (por que existe,
> que dor de aquisição resolve, como converte a sócio) — pendência levantada
> na auditoria de 2026-07-16, ver `roadmap.md`.

## Jornadas centrais

1. **Adesão do associado**: cadastro → aprovação (admin) → role `member` + departamento
   → (sócio) emissão de carteirinha.
2. **Mobilização**: comunicado/evento criado → associado vê próxima ação na Home →
   RSVP → check-in no local.
3. **Configuração da torcida (Presidente)**: define a afiliação (time) → recebe
   recomendações de aliados (agente `aliancas-torcidas`) → confirma alianças (mútuas)
   → aliados passam a ver o conteúdo público.
4. **Onboarding de dados**: importar base de associados existente → métricas reais →
   refino das regras de negócio.
5. **Reunião ao vivo**: membro com `meetings:host` cria sala (opcionalmente ligada a um
   evento) → associados entram, conversam e votam em enquetes → host modera e encerra.

## Regras de visibilidade (resumo)

`self`/`ancestor` veem tudo; `descendant` vê só PÚBLICO; `unrelated` não vê nada;
`allied` (aliança) vê só PÚBLICO. Restrito = membros, sócios, pedidos, financeiro,
permissões, auditoria. Público = loja, sedes, eventos, comunidade.
Fonte: `packages/types/src/visibility.js`.
