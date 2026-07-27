# Módulo — Super Admin (operação da plataforma)

> Painel `/super-admin`, isolado do admin de tenant: gestão de torcidas (tenants),
> afiliações cross-tenant, usuários, moderação, auditoria e relatórios operacionais
> em nível de **plataforma** — não de uma torcida específica.

## Autorização

Não usa RBAC por tenant (`assertPermission`/roles). Acesso é por **allowlist de
e-mail**: `SUPER_ADMIN_EMAILS` (env var) → `apps/web/src/lib/env.ts`
(`superAdminEmails`) → `isSuperAdminEmail(email)` em
`apps/web/src/lib/tenant-context.ts`. Todas as páginas de `/super-admin/*`
repetem o guard `if (!isSuperAdminEmail(session.user.email)) redirect('/')`
(o `layout.tsx` já barra o acesso, mas cada page confere de novo por
segurança — server actions confiam só no próprio guard, nunca no layout).

Queries deste módulo são **cross-tenant por natureza** — a exceção documentada
em `CLAUDE.md` para `Afiliacao`/`Partida`/`Noticia` (sem filtro de `tenantId`)
se aplica aqui também: as libs em `apps/web/src/lib/super-admin/` e as queries
inline nas pages não filtram por tenant, propositalmente.

## Shell e navegação

`apps/web/src/components/super-admin/super-admin-shell.tsx` — shell próprio
(topbar + sidebar com drawer mobile), independente do `AdminShell` do tenant,
mas seguindo os mesmos tokens de tema (`rgb(var(--*))`) e o mesmo padrão de
drawer via portal. Menu em `super-admin-nav.tsx`
(`SUPER_ADMIN_NAV_ITEMS`, array local — não usa `packages/types/src/menu.js`,
que é RBAC por tenant). Badges de contagem (`afiliacoes`, `moderacao`) vêm de
`contarPendentesSuperAdmin()` (`lib/super-admin/pendentes-badges.ts`),
buscado uma vez no `layout.tsx` e repassado via prop — sem polling/SSE (baixo
volume de tráfego no super-admin não justifica o custo do
`use-admin-navbar-context` do admin).

## Rotas

| Rota | Função |
|---|---|
| `/super-admin` | Dashboard — KPIs agregados (`lib/super-admin/plataforma-dashboard.ts`) |
| `/super-admin/torcidas` | Hub: trocar de torcida (`TenantSwitcher`), lista com busca (`torcidas-lista-cliente.tsx`), transferir owner |
| `/super-admin/setup` | Criar tenant; lista todos os tenants (ativos e inativos) com busca (`tenants-lista-cliente.tsx`), toggle ativo/inativo, seletor de plano |
| `/super-admin/afiliacoes` | Fila de solicitações de unidade (subsede/PDE) de todas as torcidas |
| `/super-admin/usuarios` | Busca de usuário por e-mail/nome/@nickname + vínculos em todos os tenants + exportação LGPD |
| `/super-admin/moderacao` | Fila cross-tenant de denúncias (post/mensagem) pendentes |
| `/super-admin/auditoria` | `AuditLog` de todas as torcidas, com filtro por torcida/ação/busca |
| `/super-admin/relatorios/perfis-torcedores-privados` | Relatório de perfis marcados como privados |

## Padrões de mutação

Toda ação de escrita segue o mesmo esqueleto: `'use server'`, gate
`superAdminEmails.includes(email)`, Zod, `db.$transaction`, `auditLog.create`
com `tenantId` do **registro afetado** (não do host da requisição — o
super-admin não está "dentro" de nenhum tenant). Ações que espelham uma
operação que também existe no admin do tenant (moderação de denúncia)
gravam `detalhes.viaSuperAdmin: true` no `AuditLog`, para o admin local saber
que a ação veio da operação da plataforma, não de alguém da própria diretoria.

Referências: `torcidas/actions.ts` (`alternarAtivoTenantAction`,
`alterarPlanoTenantAction`, `transferirOwnerAction`), `moderacao/actions.ts`
(`resolverDenunciaSuperAdminAction` e pares).

## Pendências conhecidas

- **LGPD — exclusão/anonimização de conta (fase 2)**: só existe exportação
  read-only (`lib/super-admin/exportar-dados-usuario.ts`, botão em
  `/super-admin/usuarios`). Exclusão real foi deixada de fora deliberadamente:
  toca ~21 models com FK direta em `User` (identidade, comércio, comunidade,
  mensageria) e cruza tenants (um `User` pode ter `SaasMembro` em vários
  tenants ao mesmo tempo). Depende de resolver antes o furo de visibilidade
  cross-tenant já registrado em `docs/knowledge/contexto-legal.md`.
- **Badge de contagem no menu**: implementado só para "Afiliações"
  (`SolicitacaoUnidade` PENDENTE) e "Moderação" (`Denuncia` +
  `DenunciaMensagem` PENDENTE). "Auditoria" não tem um conceito de
  pendência — não existe badge lá.
