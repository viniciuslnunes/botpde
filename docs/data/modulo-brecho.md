# Módulo Brechó — P2P entre sócios

> Referência factual. Dados: `packages/db/prisma/schema.prisma`; regras puras em
> `packages/types/src/brecho.js`; Zod em `packages/types/src/schemas/brecho.js`.

## O que é

Praça de **bens pessoais** entre sócios da mesma torcida (sede + unidades, nível
nacional). Camisa, bermuda, patch, bandeirinha de mão. **Não** é a loja oficial
(`SaasProduto`) e **não** lista `PatrimonioItem` / bandeirão do acervo.

Sem pagamento na plataforma. Modalidades: `TROCA`, `DOACAO`, `VENDA` (preço
informativo; acerto no chat). Interesse abre conversa; denúncia de má fé chama
a equipe de Materiais/Loja.

## Entidades

| Model | Papel |
|---|---|
| `BrechoLoja` | 1 por `(tenantId raiz, userId)` — vitrine do sócio + score + `capaUrl` |
| `BrechoAnuncio` | item; `origemTenantId` só para badge da unidade |
| `BrechoInteresse` | 1 conversa por `(anuncioId, interessadoId)` → `Conversa` GRUPO |
| `BrechoTroca` | os dois confirmam entrega → `CONCLUIDA` → score |
| `DenunciaBrecho` | má fé; staff `STORE_*` de qualquer tenant da linhagem atende |

`tenantId` das entidades = **Sede raiz**. Flag `Tenant.brechoAliados` (default
`false`) na raiz: presidente (`settings:manage`) liga em Transparência.

## Quem entra

- Sócio `SOCIO` + `APROVADO` + não desligado na linhagem (`espelhado: false`).
- Torcedor não lista nem negocia.
- R5: sócio *só* de unidade restrita não entra na praça nacional.
- Rivais / `BloqueioUsuario`: `avaliarAcessoDm` antes de abrir conversa.

## Seed de teste (Gaviões)

```bash
TORCIDA_ENV=local pnpm --filter @torcida/db seed:gavioes-logins   # sócios nomeados
TORCIDA_ENV=local pnpm --filter @torcida/db seed:brecho-gavioes    # lojas + anúncios
```

Títulos com prefixo `[TESTE-BRECHO]`. Não é o catálogo oficial (`seed:loja-gavioes`).
`--reset` apaga só esses anúncios. Entre como `socio.gavioes@teste.corinthians.torcida.app`
(senha `m1k43l3n`) em `/portal/loja/brecho`.

## Superfície

- Hub `/portal/loja` — mesma listagem em toda torcida: grade de **lojas**
  oficiais (por unidade), depois grade de **brechós**: card da praça nacional
  (abre o feed de anúncios) + as **duas vitrines de sócio** com maior
  `scoreConfianca` (com anúncio ativo). Cada vitrine tem capa (`BrechoLoja.capaUrl`,
  16:9) e aponta para `/portal/loja/brecho/lojas/[userId]`. O sócio gerencia a
  própria loja em `/minha-loja` (capa, foto, anúncios) e no hover do card.
  Feed **nunca** mistura outra torcida (`resolverContextoBrecho` = raiz
  do tenant ativo).
- `/portal/loja/brecho` feed · `/lojas` ranking · `/lojas/[userId]` vitrine
  (capa compacta + grade de anúncios no mesmo card da loja oficial; o dono
  edita nome, capa e foto na própria página) · `/[id]` anúncio (galeria no
  mesmo recorte da loja oficial) · `/minha-loja`
- Admin `/admin/loja/brecho` (tab do módulo Loja)
- Confiança: `calcularScoreConfianca` — contraparte única pesa mais; denúncia
  procedente e loja congelada derrubam. Feed e hub listam **confiáveis primeiro**
  (`scoreConfianca` da `BrechoLoja`). Na UI, o ranking vira **0–5 estrelas
  relativas à praça** (0 se o score é nulo; 5 para o maior score ativo da
  unidade) + o número de **trocas** (`trocasConcluidas`: venda, troca ou
  doação confirmada pelos dois lados — um único valor).

## Tickets / staff

Sem intermediário no default. Denúncia → notificação `BRECHO_DENUNCIA` para
quem tem `store:view_orders` ou `store:manage` em **qualquer** tenant da
linhagem. Atender faz claim e entra na conversa (padrão do ticket da loja).

## Fora desta fase

PIX/escrow, cruzar patrimônio oficial, torcedor anunciando, Discord.
