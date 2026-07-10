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
| Operação | membros, sócios, carteirinha, sedes/subsedes/PDE, departamentos, RBAC, auditoria | Existe |
| Mobilização | eventos, RSVP, check-in, presença | Existe |
| Comunidade | comunicados oficiais, mural/posts por unidade, salas de vídeo ao vivo (Meet) | Existe (intra-tenant) |
| Alianças 🆕 | relação curada torcida↔torcida; visibilidade pública cross-tenant | Novo |
| Informação do nicho 🆕 | afiliação (time), jogos/calendário/resultados, notícias, dados institucionais | Novo |

**Âncora nova — `Afiliacao`**: o time que a torcida existe para apoiar (sua *razão de
viver*) — não se usa o termo genérico "clube" como entidade. Tabela global;
jogos/notícias/dados institucionais chaveiam por afiliação e são compartilhados entre
todas as torcidas do mesmo time. Tenant raiz (a torcida) → tem uma `Afiliacao`.
A hierarquia Sede → Subsede → PDE é **afiliação territorial** (subsedes/PDEs afiliadas
à sede).

## Atores e perfis

| Perfil | Superfície | Papel |
|---|---|---|
| Associado | Portal | Status, eventos, comunicados, unidade local, feed do time |
| Admin de núcleo | Admin local | Opera sede/subsede/PDE, membros, eventos |
| Diretoria | Admin ampliado | Comunicados e ações de maior alcance |
| Presidente (owner) | Admin + Config | Define alianças, afiliação (time) da torcida, governança |
| Super-admin | Painel global | Governança técnica da plataforma |

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
