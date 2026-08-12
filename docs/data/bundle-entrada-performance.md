# Bundle de entrada — auditoria e otimização (2026-08-12)

Registro completo da auditoria do **bundle client de entrada** do `apps/web`: o
JavaScript que todo usuário baixa em **qualquer** página, antes do código da
rota. Decisão fechada resumida em `ARCHITECTURE.md` §5.6.2; aqui ficam o método,
os números medidos, o que foi descartado e o que sobrou.

Complementa — não substitui — `docs/data/modulo-comunidade-performance.md`
(round-trips ao Postgres, cache RSC, feed) e `ARCHITECTURE.md` §5.6/§5.6.1.
**O gargalo do produto continua sendo query, não bundle.** Ver § o que sobrou.

---

## 1. Resultado

| | antes | depois |
|---|---|---|
| **Total client (entrada)** | 445,9 KB gz | **397,4 KB gz** |
| | | **−48,5 KB (−10,9%)** |

Composição medida, antes → depois:

| bucket | antes (KB gz) | depois (KB gz) | nota |
|---|---:|---:|---|
| `next` (React 19 + App Router) | 252,9 | 252,9 | piso do framework |
| Sentry (todos os pacotes) | 78,2 | **51,7** | tracing do client removido |
| `@torcida/types` | 29,4 | **7,6** | 30 módulos → 2 |
| `globals.css` | 28,6 | 28,6 | 189,6 KB raw |
| `zod` | 14,8 | 14,7 | preso a `design.js` |
| `react-hook-form` | 9,2 | 9,2 | root layout |
| `sonner` | 8,9 | 8,9 | root layout |
| `@torcida/ui` | 8,2 | 8,2 | root layout |
| `apps/web/src` | 6,5 | 6,5 | código próprio |
| runtime Turbopack | 4,5 | 4,5 | — |
| `lucide-react` | 2,1 | 2,1 | já otimizado |
| `next-themes` | 1,4 | 1,4 | — |

Validação: `tsc --noEmit` 0 erros · `lint` 0 erros (147 warnings pré-existentes)
· 120 arquivos / 1129 testes Vitest passando · `next build` exit 0.

---

## 2. Método — como medir de novo

### A ferramenta certa

```bash
pnpm --filter @torcida/web exec next experimental-analyze -o
# saída: apps/web/.next/diagnostics/analyze/data/
# sem -o: sobe UI interativa
```

**Não use `pnpm --filter @torcida/web build:analyze`.** Esse script usa
`@next/bundle-analyzer`, que é plugin de **webpack**, e o Next 16 constrói com
**Turbopack por padrão** — o plugin nunca roda. Confirmado em
`next/dist/lib/bundler.js`:

```js
// The default is turbopack when nothing is configured.
if (bundlerFlags.size === 0) { process.env.TURBOPACK = 'auto'; return 0 }
```

Rode a partir da **raiz do repo**: com o shell dentro de `.next/`, o build falha
com `EBUSY: resource busy or locked, rmdir '.../diagnostics/analyze'`.

### Lendo `analyze.data`

Formato: chunks de JSON com prefixo de tamanho **u32 big-endian**. O primeiro
chunk tem o grafo inteiro; o resto é índice binário e pode ser ignorado.

```js
// parse-analyze.mjs <analyze.data>
import { readFileSync } from 'node:fs'
const buf = readFileSync(process.argv[2])
const len = buf.readUInt32BE(0)
const { sources, chunk_parts, output_files } = JSON.parse(
  buf.subarray(4, 4 + len).toString('utf8'),
)
// sources[i]        = { path, parent_source_index }  -> caminho é a cadeia de pais
// chunk_parts[i]    = { source_index, output_file_index, size, compressed_size }
// output_files[i]   = { filename }
// client            = filename inclui '/static/chunks/' e não '/server/'
```

Agregue `compressed_size` dos `chunk_parts` cujo `output_file` é client, com o
caminho resolvido subindo `parent_source_index`.

### Limites da medição

- `experimental-analyze` cobre o **grafo de entrada** (16 arquivos client), não
  os chunks por rota.
- **`next build` no Next 16/Turbopack não imprime mais First Load JS por rota.**
  Para rota, meça bytes em `.next/static/chunks` (171 arquivos, ~6,3 MB raw).
- Uma rodada de análise leva ~18–22s com cache quente.

---

## 3. O que foi mudado

### 3.1 Barrel do `@torcida/types` fora do root layout (−21,9 KB gz)

`packages/types/src/index.js` é um barrel de 37 `export *`, e o pacote só
expunha `"."` — não havia como importar um módulo isolado.
`ThemeProvider` e `PermissionProvider` (`packages/ui/src/services/`) estão no
**root layout**, então importar do barrel arrastava os 37 módulos para toda
página.

```jsonc
// packages/types/package.json
"exports": {
  ".": "./src/index.js",
  "./*": "./src/*.js"   // <- novo
}
```

```diff
- } from '@torcida/types'
+ } from '@torcida/types/design'       // services/theme.tsx
+ } from '@torcida/types/permissions'  // services/permission.tsx
```

Resultado: `@torcida/types` 29,4 → 7,6 KB gz (30 → 2 módulos).

> **`optimizePackageImports` não resolve isso.** Testado, delta byte a byte
> **zero**: a flag não reescreve barrel de `export *`. A entrada foi removida do
> `next.config.ts` com a nota. Continua valendo para `lucide-react`.

`zod` (14,7 KB gz) **não** saiu: `design.js` importa zod e `resolveTenantDesign`
roda dentro do `ThemeProvider`.

### 3.2 Tracing do Sentry removido em build (−26,5 KB gz)

Três caminhos foram testados; só o terceiro funciona sob Turbopack:

| tentativa | resultado |
|---|---|
| `webpack: { treeshake: { removeTracing } }` em `withSentryConfig` | **no-op** — `setupTreeshakingFromConfig` só roda no caminho webpack |
| filtrar integração em runtime (`integrations: (d) => d.filter(...)`) | **0 bytes** — o import é estático, o código continua no grafo |
| `compiler.define` no `next.config.ts` | **funciona** — SWC/Turbopack substitui em tempo de compilação |

```ts
// apps/web/next.config.ts
compiler: {
  define: {
    __SENTRY_TRACING__: false,
    __SENTRY_DEBUG__: false,
  },
},
```

O guard em `@sentry/nextjs` (`client/index.js`) vira código morto:

```js
if (typeof __SENTRY_TRACING__ === "undefined" || __SENTRY_TRACING__) {
  customDefaultIntegrations.push(browserTracingIntegration())
}
```

**Efeito colateral verificado — não houve.** `compiler.define` pegou só o
client; o tracing no servidor ficou **intacto**:

| tracing Sentry | antes | depois |
|---|---:|---:|
| client | 26,9 KB gz | 7,2 KB gz |
| **servidor** | 111,9 KB gz | **111,9 KB gz** |

Ou seja: o APM de produção (`sentry.server.config.ts`) continua funcionando; só
o browser parou de carregar performance monitoring. `tracesSampleRate` foi
removido de `instrumentation-client.ts` por ter virado config morta — o skew
recovery (`installChunkSkewRecovery`) e o `beforeSend` seguem intactos.

> **Nota de manutenção:** `webpack.treeshake.removeDebugLogging`, que já estava
> no `withSentryConfig`, também é **no-op hoje**. Foi substituído por
> `__SENTRY_DEBUG__: false` no `compiler.define`.

---

## 4. Tentado e descartado — não repetir

### 4.1 Converter os 49 client components para subpath (revertido)

49 client components importam `'@torcida/types'`. Foi feito um codemod que
resolve símbolo → módulo pelos exports reais do pacote e reescreve os imports.
`tsc` 0 erros e 1129 testes verdes — e **nenhum ganho**:

| | antes | depois |
|---|---:|---:|
| bundle de entrada | 397,4 KB gz | 397,4 KB gz (idêntico) |
| `.next/static/chunks` total | 6.342.516 B | **6.524.694 B (+182 KB)** |
| arquivos de chunk | 171 | 174 |

Imports estreitos **fragmentam** chunk e pioram o compartilhamento entre rotas.
O ganho do barrel existe só onde o módulo entra no **root layout**; em rota, o
Turbopack já resolve bem. Revertido.

**Regra prática:** importe do módulo direto quando o componente estiver na
cadeia do root layout. Em componente de rota, importar do barrel está ok.

### 4.2 Suspeitos que morreram na medição

- **LiveKit / Salas** — já está atrás de `next/dynamic` com `ssr: false`
  (`sala-ativa-shell.tsx`, `sala-popout-shell.tsx`), restrito a 2 rotas. Não
  aparece no bundle de entrada.
- **`globals.css`** — 28,6 KB gz (189,6 KB raw) para o app inteiro, gerado pelo
  Tailwind v4 a partir do `@source`. É proporcional; não vale cirurgia.

---

## 5. O que sobrou, e por que parar

Dos 397,4 KB gz, **252,9 são Next/React 19** — piso do framework. O controlável
são ~145 KB, já depois do corte.

| resta | KB gz | veredito |
|---|---:|---|
| Sentry erro/core | 51,7 | só sai tirando observabilidade |
| `globals.css` | 28,6 | proporcional ao app |
| `zod` | 14,7 | exige refactor de `design.js` |
| `react-hook-form` + `sonner` + `ui` + `types` | 33,9 | todos usados no root layout |

O único corte técnico limpo restante é o **zod**: separar `design.js` (1232
linhas) em constantes/derivações puras + schema, para o `ThemeProvider` parar de
arrastar o runtime do zod. Ganho ~14,7 KB (3,7%); risco de regressão em
paleta/contraste de **todo tenant**. **Não recomendado isoladamente** — só se
`design.js` for refatorado por outro motivo.

### Onde a performance real ainda está

Ordem recomendada, e nada disso é bundle:

1. **Round-trips ao Postgres** — o gargalo do produto. Ver
   `ARCHITECTURE.md` §5.6/§5.6.1 e `docs/data/modulo-comunidade-performance.md`.
   48 KB de JS a menos vale ~100ms em rede ruim; uma rota com 30 queries
   desnecessárias custa muito mais.
2. **CDN Cloudflare** — parado esperando domínio (`docs/ops/cloudflare-cdn.md`).
   Os headers `immutable` em `/_next/static` já estão no `next.config.ts`
   prontos para isso; sem CDN eles rendem menos do que renderiam.
3. **Remote cache do Turborepo** — eixo de build/CI, não de runtime. Não
   auditado nesta rodada.

---

## 6. Lição que generaliza

O achado mais durável não foram os 48 KB, e sim que **duas configs do repo eram
no-op silenciosas** sob Turbopack:

- `build:analyze` (`@next/bundle-analyzer`, plugin webpack);
- `webpack: { treeshake: … }` do `withSentryConfig`.

Nenhuma das duas dá erro nem aviso — simplesmente não fazem nada desde a
migração para Turbopack. Vale a mesma desconfiança para qualquer config herdada
da era webpack: **confirme com medição antes de creditar ganho a ela.**
