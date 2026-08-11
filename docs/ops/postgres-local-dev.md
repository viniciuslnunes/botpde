# Postgres local em desenvolvimento

> Por que o app parece lento em `localhost:3000` e como devolver a paridade com produção.
>
> **Atalho:** no Cursor digite `/setup` (agente + skill). Ou na raiz:
> `powershell -File scripts/dev-setup.ps1` / `bash scripts/dev-setup.sh`.
> Secrets do time: [`dev-secrets.md`](./dev-secrets.md).

## O diagnóstico

O app **não** está lento em local. O banco é que está a 125ms de distância.

Em produção, o container Next e o Postgres rodam no mesmo datacenter da Railway
— o round-trip de uma query é de ~1ms. Em desenvolvimento, o Next roda na
máquina do dev e o Postgres da Railway só é alcançável pelo **proxy TCP
público** (`*.proxy.rlwy.net`). Cada query Prisma atravessa a internet.

Medições nesta máquina (2026-08-06), contra `turntable.proxy.rlwy.net`:

| Medida | Local (proxy Railway) | Produção (rede interna) |
| --- | --- | --- |
| RTT ICMP até o host do banco | **125 ms** | ~1 ms |
| Latência média por query Prisma (`SELECT 1`, 20x sequenciais) | **131 ms** | ~1–2 ms |
| Primeira query (TCP + TLS + handshake Prisma) | **1.240 ms** | ~5 ms |
| 20 queries em paralelo, `connection_limit=5` | **1.430 ms** | ~10 ms |

A conta que explica tudo: uma página de módulo que faz **30 queries** paga
**~4 segundos só de espera de rede** em local, contra ~40ms em produção. Nenhum
`React.cache`, Suspense ou índice muda isso — a latência é do meio físico.

Some a isso o custo de compilação sob demanda do `next dev`: a primeira carga de
uma rota mede **5.493 ms** (Turbopack compilando), e **268 ms** na segunda. Isso
é normal e esperado em dev; o problema real é o banco.

## A correção: Postgres na sua máquina

O banco é pequeno (**95 MB**, PostgreSQL **18.3**, extensões `pg_trgm` e
`plpgsql`) — cabe local sem esforço.

### Pré-requisitos (uma vez, exigem privilégio de administrador)

O Docker Desktop no Windows roda sobre WSL2, que por sua vez exige virtualização
habilitada no firmware. Nesta máquina (**AMD Ryzen 7 5700X**) a virtualização
está **desabilitada na BIOS** (`VirtualizationFirmwareEnabled: False`), e o WSL
não está instalado.

1. **BIOS — habilitar SVM Mode.** Reiniciar, entrar no setup (`Del` ou `F2` na
   maioria das placas AMD), procurar `SVM Mode` em *Advanced → CPU Configuration*
   (em placas ASUS/Gigabyte costuma estar em *AI Tweaker* ou *M.I.T.*), mudar
   para `Enabled`, salvar e sair. Sem isso o Docker Desktop não sobe.
2. **WSL2** — num PowerShell **como administrador**:
   ```powershell
   wsl --install --no-distribution
   ```
   Reiniciar quando pedido.
3. **Docker Desktop** — num PowerShell **como administrador**:
   ```powershell
   winget install --id Docker.DockerDesktop -e
   ```
   Abrir o Docker Desktop uma vez e aceitar os termos.

Para conferir que ficou tudo de pé:

```powershell
docker run --rm hello-world
```

### Subir o banco

Na raiz do repositório:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Sobe um `postgres:18` (mesma major version da Railway, para o dump restaurar
limpo) em `localhost:5432`, com `fsync=off` — banco de desenvolvimento é
descartável, e sem fsync o restore e os seeds ficam bem mais rápidos.

### Copiar os dados da Railway

```powershell
powershell -File scripts/db-local-sync.ps1
```

O script faz `pg_dump` da Railway e restaura no container. Ele usa a própria
imagem `postgres:18` como ferramenta, então **não** é preciso instalar
`pg_dump`/`pg_restore` no Windows. A URL de origem é lida de
`apps/web/.env.local` — nenhuma credencial fica no script. Os dumps vão para
`.dumps/` (fora do git).

Rode de novo sempre que quiser ressincronizar com o estado da Railway; o script
recria o schema `public` local antes de restaurar.

### Apontar o app para o banco local

Em `apps/web/.env.local` **e** em `packages/db/.env` (Prisma/scripts leem daí):

```env
DATABASE_URL=postgresql://torcida:torcida@localhost:5432/torcida
# URL antiga preservada — é dela que scripts/db-local-sync.ps1 puxa os dados.
DATABASE_URL_RAILWAY=postgresql://USER:PASSWORD@HOST.proxy.rlwy.net:PORT/railway
```

O sync procura `DATABASE_URL_RAILWAY` / `DATABASE_URL` nesses dois arquivos.
Reinicie o `pnpm --filter @torcida/web dev`.

> **Cuidado:** com `DATABASE_URL` apontando para o local, os scripts de
> `packages/db` (`db:push`, `seed:*`, `reset:*`, `db:repair-*`) passam a agir no
> banco **local** — que é exatamente o que se quer. Confira a variável antes de
> rodar qualquer `reset:*`.

> **Nota `postgres:18`:** o volume do compose monta em `/var/lib/postgresql`
> (não `.../data`). A imagem 18+ mudou o layout; montar no path antigo faz o
> container reiniciar em loop.

### Alternativa sem Docker

Se habilitar SVM na BIOS não for viável, o PostgreSQL nativo do Windows resolve
igual e não depende de virtualização (só do instalador, que pede admin):

```powershell
winget install --id PostgreSQL.PostgreSQL.18 -e
```

Depois é o mesmo fluxo: criar o banco, e usar o `pg_dump`/`pg_restore` que vêm
no pacote em vez dos do container. O ganho de latência é idêntico.

## Ganhos já aplicados no repositório

Estes valem mesmo enquanto o banco continuar remoto:

- **Pool maior em dev** (`packages/db/src/index.js`): `connection_limit` passa de
  5 para 20 fora de produção. Com RTT de 125ms, um pool de 5 transformava as
  queries paralelas de uma página em ondas sequenciais. Medido depois da
  mudança, com o pool quente: **40 queries em paralelo em 265 ms** (antes, 20
  queries em 1.430 ms). Produção continua em 5 — lá o gargalo nunca foi o pool,
  e o pool pequeno protege o `max_connections`.
- **Sentry inerte em dev** (`sentry.server.config.ts`, `sentry.edge.config.ts`,
  `src/instrumentation-client.ts`): sem DSN em `NODE_ENV=development`, o SDK
  deixa de instrumentar cada request e de mandar trace pela internet. Erro local
  aparece no terminal — e o Sentry de produção para de receber ruído da máquina
  do dev.

## Como medir

O proxy já loga por rota em dev (`apps/web/src/proxy.ts`):

```
[prisma] GET /admin/membros — 34 queries (4210ms db)
```

Com o banco local, o mesmo número de queries deve cair para dezenas de ms. Se
uma rota continuar lenta **depois** da migração, aí sim o problema é a rota —
use o agente `performance` e `docs/data/modulo-comunidade-performance.md`.
