# Performance do dev server local (Next 16 + Turbopack no Windows)

> Investigação de 2026-08-30. Sintoma relatado: "termino a alteração e o
> localhost fica compilando; nunca consigo testar rápido".
>
> Isto **não** é o mesmo problema de `docs/ops/postgres-local-dev.md`. Lá o
> gargalo era latência de rede até o Postgres da Railway (já resolvido: o
> `DATABASE_URL` local aponta para `localhost:5432`). Aqui o gargalo é **I/O de
> disco durante a compilação** — nenhuma query envolvida.

## O achado

O cache persistente do Turbopack (`apps/web/.next/dev/cache/turbopack`) havia
crescido até **70,4 GB**, em 6.806 arquivos `.sst`, muitos de 256 MB, numa única
geração aberta desde 7/ago. O `.next` inteiro somava **76 GB**.

O disco `C:` (SSD Kingston de 466 GB) estava com **28 GB livres — 94% cheio**.
Nessa faixa o controlador do SSD já estrangula escrita por falta de espaço para
wear-leveling. Somado ao Windows Defender varrendo cada `.sst` lido e escrito, o
resultado é que **cada compilação de rota pagava um pedágio de I/O** que nenhuma
otimização de código alcança.

Medição do ciclo de dev com o cache de 70 GB, antes de qualquer mudança:

| Etapa                            | Tempo     |
| -------------------------------- | --------- |
| `Ready` (subida do servidor)     | **3,2 s** |
| Primeira compilação de `/entrar` | **36 s**  |
| Revisita à mesma rota            | 3 s       |

Repare que a **subida é rápida** — o custo está inteiro na compilação de rota,
que é exatamente o momento em que se espera para testar uma alteração.

O processo do dev server segurava **11–14,5 GB residentes** (o heap JS está
limitado a 8 GB por `--max-old-space-size`; o excesso é memória nativa do lado
Rust do Turbopack mapeando o store).

## Duas hipóteses descartadas por medição

Vale registrar para ninguém gastar tempo de novo:

1. **`experimental.turbopackFileSystemCacheForDev` e
   `experimental.turbopackServerFastRefresh` já vêm `true` por padrão** no Next
   16.2.9 (`next/dist/server/config-shared.js` e
   `next/dist/server/lib/router-server.js`). Declará-las no config não muda nada.
2. **Não era hardware**: 16 núcleos lógicos e 40 GB de RAM, ambos folgados.

## Por que o cache inflou

`config.env` do `next.config.ts` vira **define de tempo de compilação**
(`getNextConfigEnv` → `define-env.js`), portanto participa da chave de cache do
Turbopack. O config declarava:

```ts
const appPublishedAt = process.env.NEXT_PUBLIC_APP_PUBLISHED_AT?.trim() || new Date().toISOString()
```

Ou seja: **um valor novo a cada `next dev`**. A cada start, a árvore compilada é
regravada como entradas novas e as antigas viram lixo que só sai em compactação.

O mesmo bloco rodava três `git rev-list` via `execSync` no carregamento do
config, a cada start.

> **A hipótese NÃO se sustentou como causa principal.** Ela foi aplicada porque o
> conserto é gratuito e o mecanismo é real, mas o dado seguinte a enfraquece: com
> o define já estabilizado, o cache saiu de 0,2 GB e voltou a **10,8 GB em ~13 h**
> de uso. É verdade que esse uso foi anormal (vários restarts e duas invalidações
> totais de `packages/db` por causa das próprias medições), então o número não
> prova o contrário também — só derruba a conclusão antiga.
>
> O que fica: **o store LSM do Turbopack cresce rápido em uso normal, e é isso que
> precisa ser administrado.** A proteção efetiva é a rotina de higiene abaixo, não
> uma causa raiz única. Fixar o define continua valendo (evita invalidar tudo a
> cada start), mas não trate isso como o conserto — trate como economia marginal.
>
> A comprovação está em § O tamanho do cache manda no ciclo: 10,8 GB → ciclo de
> 4 s; após `dev:clean` → 1,3 s, mesma sessão. A variável que importa é o
> **tamanho**, venha ele de onde vier.

## O que foi feito

1. **`.next` apagado** — 77,3 GB devolvidos; `C:` foi de 28,0 → 105,3 GB livres.
2. **`next.config.ts`**: em dev, `appVersion` e `appPublishedAt` passaram a ser
   estáveis (versão lida do `package.json`, carimbo vindo do `mtime` dele). Sem
   `execSync` de git no start. Produção segue igual — carimbo do build.
3. **`proxy.ts`**: o matcher passou a excluir `_next/` inteiro, não só
   `_next/static|_next/image`. O wrapper `auth()` roda **antes** do early-return
   de `PUBLIC_PATHS`, então cada poll de HMR pagava uma decodificação de JWT.
4. **Worktrees de agente removidos** de `.claude/worktrees` — eram **185.123
   arquivos** dentro da raiz do repo, que é a árvore que o Turbopack vigia. Dois
   estavam registrados no git (branches `claude/*` preservados); dois eram pastas
   órfãs sem `.git`, cópias soltas do monorepo.
   Os 4 GB que eles aparentavam ocupar eram **lógicos**: os `node_modules` são
   hardlinks para o pnpm store, e apagá-los devolveu só 0,1 GB de disco. O ganho
   aqui é em arquivos vigiados, não em espaço — vale registrar para não se
   creditar economia que não houve.
5. **`scripts/dev-defender-exclusoes.ps1`** — exclusões do Defender para as
   pastas de build e para `node.exe`. Precisa de PowerShell **como
   Administrador**; sem elevação o Defender nem deixa ler as exclusões.
6. **`scripts/dev-cache.mjs`** — higiene recorrente.

## Segunda rodada (2026-08-30) — onde o tempo está agora

Com o disco fora do caminho, o ciclo que importa passa a ser **editar um arquivo
e ver a mudança**, não a subida. Medido em `/portal`, três repetições:

| Fase                                       | Tempo      |
| ------------------------------------------ | ---------- |
| Watcher perceber a escrita                 | ~630 ms    |
| Turbopack compilar (são **duas** passadas) | ~950 ms    |
| Render + overhead de invalidação           | ~1,1 s     |
| **Ciclo completo**                         | **~2,7 s** |

> Esse 2,7 s foi medido com o cache já parcialmente inchado. Com cache limpo e
> as duas mudanças desta rodada, o ciclo fecha em **~1,3 s** — ver a seção
> seguinte, que é o resultado que vale.

Rotas autenticadas, primeira compilação: `/portal` 1,5 s,
`/portal/comunidade` 1,8 s, `/admin` 4,4 s; revisita 0,09–1,07 s.

### O tamanho do cache manda no ciclo — medido de novo, na mesma sessão

O número mais importante desta rodada saiu por acidente. Depois de ~13 h de uso
(intenso: vários restarts e duas invalidações totais de `packages/db` por conta
das próprias medições), o cache tinha voltado a **10,8 GB** — e o ciclo de edição
foi junto:

| Estado do cache do Turbopack      | Ciclo de edição (`/portal`)          |
| --------------------------------- | ------------------------------------ |
| **10,8 GB**                       | 3.909 / 4.116 ms                     |
| **0,4–0,7 GB** (após `dev:clean`) | **1.264 / 1.359 / 1.359 / 1.387 ms** |

Mesma máquina, mesmo código, mesma sessão, minutos de diferença: **~3× mais
rápido só por zerar o cache**. É a mesma física dos 70 GB, agora numa escala que
aparece em horas de trabalho, não em semanas.

Por isso `pnpm dev:cache` sai com erro acima de 8 GB, e por isso a rotina de
higiene não é enfeite: é **o** mecanismo de controle. Rode `dev:clean` quando o
ciclo começar a arrastar — o custo é uma subida fria (`/portal` 8,3 s,
`/portal/comunidade` 9,7 s, uma vez só) e o retorno é o ciclo de volta a ~1,3 s.

Depois de quatro ciclos o cache tinha **encolhido** de 0,7 para 0,4 GB — o store
compacta sozinho quando não está sob invalidação em massa. O problema não é
escrever cache, é acumular lixo de invalidação sem nunca compactar.

### Descartado por medição

Separar `auth.config` do `auth.ts` (padrão NextAuth v5) para aliviar o proxy
**não vale**: o `middleware.js` compilado em dev é ~0 MB. O `proxy.ts` importa
`auth` (e com ele NextAuth + Prisma + bcrypt), mas o Turbopack não materializa
isso num bundle pesado em dev. Meça antes de refatorar por esse motivo.

### Reexport do Prisma (aplicado)

`packages/db/src/index.js` fazia `export * from '@prisma/client'`. Como o client
do Prisma é **CommonJS**, seus nomes só existem em runtime — o Turbopack emitia
`unexpected export *` para cada módulo da cadeia (**127 avisos por
recompilação**, afogando o log) e gerava código de resolução em runtime.

Trocado por reexport nomeado, com estes números medidos:

|                  | Ciclo de edição  | Avisos por recompilação |
| ---------------- | ---------------- | ----------------------- |
| `export *`       | 2.939 / 2.716 ms | **127**                 |
| Reexport nomeado | 2.540 / 2.589 ms | **0**                   |

~9% no ciclo, e o log volta a ser legível — que na prática foi o ganho maior.

**A lista não é escrita à mão**, porque desatualizaria a cada mudança de schema:
`scripts/gerar-prisma-exports.js` a extrai do próprio client já gerado, e roda
grudado no `prisma generate` (`db:generate` e `postinstall`). O CI trava
divergência com `git diff --exit-code` no arquivo commitado.

**São dois arquivos, e a razão importa:**

- `src/prisma-exports.js` — reexporta os ~203 nomes que existem **em runtime**
  (`Object.keys`). É o que o bundler lê, e o motivo de tudo isto.
- `src/prisma-exports.d.ts` — `export * from '@prisma/client'`, só tipos.

O `.d.ts` não é enfeite: 62 arquivos fazem `import type { Tenant }`,
`{ Alianca }` e afins, e **model type do Prisma não aparece em `Object.keys`**.
Sem ele o `tsc` quebra com 24 erros de `has no exported member 'Tenant'`. E o
`.d.ts` some na compilação, então o `export *` ali não custa nada ao Turbopack.
Se um dia o `.js` listar um nome que o CJS não expõe, o erro é de **link do
ESM** em runtime, não de tipo — por isso ele nunca deve ganhar nomes à mão.

## Armadilha: apagar árvores com `node_modules` do pnpm

Para apagar pastas gigantes no Windows é tentador usar
`robocopy <vazio> <alvo> /MIR`, que é bem mais rápido que `Remove-Item -Recurse`.
**Não faça isso em nada que contenha `node_modules` do pnpm sem `/XJ`.**

O pnpm monta `node_modules` com symlinks e junctions apontando para
`node_modules/.pnpm` da raiz do workspace. O `/MIR` **segue** esses links e
espelha o vazio no alvo real — ou seja, esvazia pacotes do store compartilhado,
fora da pasta que você mandou apagar. Aconteceu nesta investigação ao limpar os
worktrees: três pacotes (`require-in-the-middle`, `import-in-the-middle`,
`ioredis`) ficaram como diretórios vazios e o dev server passou a morrer com
`Cannot find module 'require-in-the-middle'` ao carregar o `next.config.ts` (o
`withSentryConfig` puxa `@sentry/node` → `@opentelemetry/instrumentation`).

Conserto: `pnpm install --force`. Um `pnpm install` normal **não** resolve — ele
confia no lockfile e responde "Already up to date" sem olhar os arquivos.

Prevenção: use `/MIR /XJ`, ou o `pnpm dev:clean` (o `fs.rmSync` do Node remove o
link em si, não atravessa para o alvo).

## Resultado medido

Mesma máquina, mesmo script de medição, mesma rota (`/entrar`):

| Ciclo                              | `Ready` | 1ª compilação de `/entrar` | Revisita | Total até rota utilizável |
| ---------------------------------- | ------- | -------------------------- | -------- | ------------------------- |
| **Antes** — cache de 70 GB         | 3,2 s   | **36 s**                   | 3 s      | 42 s                      |
| Depois, subida fria (cache zerado) | 469 ms  | 10 s                       | 0 s      | 12 s                      |
| **Depois**, cache reconstruído     | 445 ms  | **3 s**                    | 1 s      | **5 s**                   |

**12× na primeira compilação de rota** (36 s → 3 s), e o pior caso depois da
limpeza (subida fria, 10 s) ainda é 3,6× melhor que o caso comum de antes.

O cache reconstruído ficou em **0,2 GB / 22 arquivos**, contra 70,4 GB / 6.806.

> Medido de novo ~13 h depois: **10,8 GB**. Ele volta a crescer rápido — ver a
> ressalva em § Por que o cache inflou. Rode `pnpm dev:cache` com regularidade.

## Rotina de manutenção

```bash
pnpm dev:cache    # mostra o tamanho de .next e do cache do Turbopack
pnpm dev:clean    # apaga .next quando passar do teto
```

`dev:cache` sai com código 1 acima de **8 GB** — o ponto a partir do qual o cache
cobra mais do que rende. Vale rodar quando a compilação começar a arrastar, e não
esperar chegar em dezenas de GB de novo.

Uma vez, como administrador:

```powershell
./scripts/dev-defender-exclusoes.ps1
```

## Sinal de alerta

Se a compilação de rota voltar a passar de ~10 s, **meça o disco antes de
otimizar código**:

```powershell
pnpm dev:cache
Get-PSDrive C | Select-Object @{n='LivreGB';e={[math]::Round($_.Free/1GB,1)}}
```

Um SSD acima de ~85% de ocupação já degrada escrita o bastante para dominar
qualquer perfil de build.
