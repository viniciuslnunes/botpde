<#
.SYNOPSIS
  Copia o banco da Railway para o Postgres local de desenvolvimento.

.DESCRIPTION
  Motivo: ver docs/ops/postgres-local-dev.md. O banco da Railway só é
  alcançável de fora pelo proxy público (RTT ~125ms), e cada query Prisma paga
  esse RTT. Este script traz os dados para um Postgres local (~0,1ms).

  Não exige pg_dump/pg_restore instalados no Windows: usa a própria imagem
  postgres:18 do Docker como ferramenta.

  A URL de origem é lida de DATABASE_URL_RAILWAY (preferida) ou DATABASE_URL,
  nesta ordem de arquivos: apps/web/.env.local, packages/db/.env. Nenhuma
  credencial fica no script.

.EXAMPLE
  pwsh -File scripts/db-local-sync.ps1
#>
[CmdletBinding()]
param(
  # Destino local. Bate com o docker-compose.dev.yml.
  [string]$LocalUrl = 'postgresql://torcida:torcida@localhost:5432/torcida',
  # Opcional: força um único arquivo. Sem isso, procura nos caminhos padrão.
  [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'

function Read-EnvVar {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path) {
    # .env.local pode vir com BOM na primeira linha — remove antes de casar.
    $clean = $line -replace '^﻿', ''
    if ($clean -match "^\s*$Name\s*=\s*(.+)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker não encontrado no PATH. Instale o Docker Desktop primeiro (docs/ops/postgres-local-dev.md).'
}

$envCandidates = @()
if ($EnvFile) {
  $envCandidates += $EnvFile
} else {
  $envCandidates += (Join-Path $PSScriptRoot '..\apps\web\.env.local')
  $envCandidates += (Join-Path $PSScriptRoot '..\packages\db\.env')
}

# Origem: preferimos DATABASE_URL_RAILWAY (existe depois que o env já aponta
# para o local); caímos em DATABASE_URL enquanto ela ainda for a remota.
$sourceUrl = $null
$sourceFile = $null
foreach ($candidate in $envCandidates) {
  $sourceUrl = Read-EnvVar -Path $candidate -Name 'DATABASE_URL_RAILWAY'
  if (-not $sourceUrl) { $sourceUrl = Read-EnvVar -Path $candidate -Name 'DATABASE_URL' }
  if ($sourceUrl) { $sourceFile = $candidate; break }
}
if (-not $sourceUrl) {
  throw "Não achei DATABASE_URL nem DATABASE_URL_RAILWAY em: $($envCandidates -join ', ')"
}
Write-Host "    origem: $sourceFile" -ForegroundColor DarkGray

if ($sourceUrl -match 'localhost|127\.0\.0\.1') {
  throw "A URL de origem aponta para localhost ($sourceUrl). Guarde a URL da Railway em DATABASE_URL_RAILWAY no .env.local antes de rodar."
}

$dumpDir = Join-Path $PSScriptRoot '..\.dumps'
if (-not (Test-Path $dumpDir)) { New-Item -ItemType Directory -Path $dumpDir | Out-Null }
$dumpDir = (Resolve-Path $dumpDir).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpName = "railway-$stamp.dump"

Write-Host "==> Dump da Railway (formato custom, comprimido)..." -ForegroundColor Cyan
# --no-owner / --no-acl: os roles da Railway não existem no container local.
docker run --rm -v "${dumpDir}:/dump" postgres:18 `
  pg_dump --format=custom --no-owner --no-acl --file "/dump/$dumpName" $sourceUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou (exit $LASTEXITCODE)." }

$dumpPath = Join-Path $dumpDir $dumpName
$sizeMb = [math]::Round((Get-Item $dumpPath).Length / 1MB, 1)
Write-Host "    dump gravado: $dumpPath ($sizeMb MB)" -ForegroundColor DarkGray

Write-Host "==> Recriando o schema public local (destrutivo, só no banco local)..." -ForegroundColor Cyan
docker exec -i torcida-postgres-dev psql -U torcida -d torcida -v ON_ERROR_STOP=1 `
  -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
if ($LASTEXITCODE -ne 0) { throw "Falha ao recriar o schema. O container torcida-postgres-dev está de pé? (docker compose -f docker-compose.dev.yml up -d)" }

Write-Host "==> Restaurando no Postgres local..." -ForegroundColor Cyan
# host.docker.internal: o container do pg_restore falando com o container do
# Postgres pela porta publicada no host.
$localFromContainer = $LocalUrl -replace 'localhost', 'host.docker.internal'
# Sem ON_ERROR_STOP aqui: pg_restore emite avisos benignos (extensão que já
# existe, comentário de extensão) que não invalidam a restauração.
docker run --rm -v "${dumpDir}:/dump" postgres:18 `
  pg_restore --no-owner --no-acl --dbname $localFromContainer "/dump/$dumpName"

Write-Host "==> Garantindo extensões (pg_trgm)..." -ForegroundColor Cyan
docker exec -i torcida-postgres-dev psql -U torcida -d torcida -v ON_ERROR_STOP=1 `
  -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar a extensão pg_trgm.' }

Write-Host "==> Conferindo..." -ForegroundColor Cyan
docker exec -i torcida-postgres-dev psql -U torcida -d torcida -c `
  "SELECT count(*) AS tabelas FROM information_schema.tables WHERE table_schema='public';"

Write-Host ''
Write-Host 'Pronto. Aponte o app para o banco local (packages/db/.env e/ou apps/web/.env.local):' -ForegroundColor Green
Write-Host "  DATABASE_URL=$LocalUrl" -ForegroundColor Green
Write-Host '  DATABASE_URL_RAILWAY=<a URL antiga da Railway>' -ForegroundColor Green
