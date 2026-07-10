# Torcida SaaS — Brief de redesenho

Base para levar ao Claude Design (claude.ai/design). Capturas reais (Playwright,
autenticado) em `apps/web/e2e/screenshots/` — anexar junto com este brief.

## O que é o produto

SaaS multi-tenant para torcidas organizadas de futebol. Hierarquia Sede →
Subsede → PDE. Três áreas: **Portal** (associado), **Admin** (gestão da
torcida), **Comunidade** (feed social + Salas ao vivo). Web responsivo,
mobile é fase futura. Cor primária é configurável por tenant (white-label).

## Telas capturadas (pasta → conteúdo)

| Pasta | Conteúdo |
|---|---|
| `home-institucional/` | Hoje idêntica ao login — não existe landing institucional real |
| `login/` | Opções de entrada (Discord/Google/e-mail) + criar conta |
| `portal-home/` | Home do associado (autenticado) |
| `portal-carteirinha/` | Carteirinha digital |
| `portal-sedes/` | Lista de sedes/subsedes/PDEs |
| `portal-perfil/` | Perfil do associado |
| `portal-eventos/` | Próximos eventos + histórico |
| `portal-cadastro/` | Capturou a home (usuário de teste já cadastrado — não representa o form vazio) |
| `portal-loja/`, `portal-loja-pedidos/` | Loja e pedidos do associado |
| `comunidade/` | Feed social (posts, comunicados oficiais) + composer expandido |
| `portal-comunidade-seguindo/` | Solicitações de seguir |
| `salas/` | Lobby de Salas ao vivo (Meet) — não há captura de uma sala aberta |
| `admin-*/` | 15 telas do painel administrativo (membros, sócios, eventos, sedes, acessos, hierarquia, comunidade/moderação/notícias, alianças, configurações, loja/pedidos) |

## Diagnóstico (via agente `ux-review`)

### Pontos fortes a preservar
- **Empty states do admin** são excelentes e consistentes (borda tracejada, ícone, título, subtítulo) — melhor ativo de UI hoje.
- **Separação comunicado oficial × mural da comunidade** é clara e repetida (badges OFICIAL/Fixado/Urgente).
- **Badges territoriais** (Sede/Subsede/Ponto de Encontro) dão contexto local.
- **Dashboard do admin** (KPIs, próximos eventos, atividade recente) tem boa densidade e hierarquia.

### Problemas a corrigir no redesenho
1. **Dois "primários" competindo.** A cor do tenant (configurável, hoje quase preto) convive com roxo/indigo cravado direto em vários CTAs (perfil, criar evento, publicar, config). O token não governa a UI de fato — qualquer redesenho precisa passar 100% por variáveis derivadas do tenant, senão quebra o white-label.
2. **Três shells de navegação diferentes.** Portal usa top-nav alto; Admin usa sidebar; Comunidade usa um terceiro layout próprio (barra compacta + sidebar própria). O salto entre áreas parece trocar de app.
3. **Botões fantasma (contraste zero)** ainda presentes em alguns pontos: "Ir à loja" (portal-loja-pedidos), "+ Novo produto" (admin-loja) — claro sobre claro.
4. **Imagens de produto quebradas** (loja, portal e admin) — sem placeholder.
5. **Embeds de vídeo no feed** renderizam como grandes vãos brancos quando não carregam — precisa de aspect-ratio/skeleton.
6. **Não existe landing institucional** — `/` cai direto no login.

### Prioridade sugerida (impacto × esforço)
1. Unificar o token de cor primária (resolver preto vs. roxo) + eliminar os botões fantasma restantes.
2. Unificar o shell de navegação entre portal/comunidade/admin.
3. Placeholders de mídia (produto e embed).
4. Landing institucional real.

### Riscos de regressão a não perder no redesenho
- Estados de **vazio/erro/loading** são obrigatórios (regra do repo) — as capturas mostram vazios bons, mas nenhum loading real e só um erro (de dev tools, não de produto). Não desenhar como se "vazio bonito" cobrisse tudo.
- **Salas sem LiveKit configurado**: a sala deve continuar funcionando como chat/enquetes/presença, sem UI de vídeo quebrada onde o bloco de vídeo iria. Não verificado visualmente ainda (falta captura de sala aberta).
- Não perder a separação comunicado oficial × mural ao redesenhar o feed/shell.

## Stack (para contexto de implementação depois)
Next.js 16 (App Router), React 19, Tailwind v4 (CSS variables), `@torcida/ui`
(componentes compartilhados), next-themes (dark/light). Tokens de cor em
`apps/web/src/app/globals.css` (`--color-primary` etc., consumidos como
`rgb(var(--color-primary))`).
