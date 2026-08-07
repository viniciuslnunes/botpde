<#
.SYNOPSIS
  Onboarding mecanico da maquina de desenvolvimento (Torcida SaaS).

.DESCRIPTION
  Idempotente. Usado pelo agente /setup. Ver .cursor/skills/setup/checklist.md
  e docs/ops/postgres-local-dev.md.

  Exit codes:
    0  ok
    1  pre-requisito (Node/pnpm/Docker CLI)
    2  Docker engine / compose / health
    3  sync Railway -> local
    4  env / secrets

.EXAMPLE
  powershell -File scripts/dev-setup.ps1
  powershell -File scripts/dev-setup.ps1 -SkipSync -SecretsFile .\torcida-dev.secrets.env
#>
[CmdletBinding()]
param(
  [switch]$SkipSync,
  [switch]$SkipInstall,
  [string]$SecretsFile = '',
  [string]$LocalUrl = 'postgresql://torcida:torcida@localhost:5432/torcida'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

# Docker Desktop costuma instalar o CLI sem atualizar o PATH da sessao atual.
$dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
if (Test-Path $dockerBin) {
  $env:Path = "$dockerBin;$env:Path"
}

function Write-Step([string]$Msg) {
  Write-Host "==> $Msg" -ForegroundColor Cyan
}

function Write-Ok([string]$Msg) {
  Write-Host "    OK: $Msg" -ForegroundColor Green
}

function Write-Warn([string]$Msg) {
  Write-Host "    ! $Msg" -ForegroundColor Yellow
}

function Exit-Code([int]$Code, [string]$Msg) {
  Write-Host "ERRO ($Code): $Msg" -ForegroundColor Red
  exit $Code
}

function Read-EnvVar {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path -Encoding UTF8) {
    $clean = $line -replace '^\uFEFF', ''
    if ($clean -match "^\s*$Name\s*=\s*(.+)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

function Test-Placeholder([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
  return $Value -match 'your_|change.?me|exemplo|example\.com|xxxx|password_here|secret_here'
}

function Ensure-EnvFile {
  param([string]$Target, [string]$Example)
  if (Test-Path $Target) { return $false }
  if (-not (Test-Path $Example)) {
    New-Item -ItemType File -Path $Target -Force | Out-Null
    return $true
  }
  Copy-Item $Example $Target
  return $true
}

function Merge-SecretsFile {
  param([string]$SecretsPath, [string]$TargetPath)
  if (-not (Test-Path $SecretsPath)) {
    Exit-Code 4 "Arquivo de secrets nao encontrado: $SecretsPath"
  }
  if (-not (Test-Path $TargetPath)) {
    New-Item -ItemType File -Path $TargetPath -Force | Out-Null
  }

  $targetLines = @(Get-Content $TargetPath -Encoding UTF8 | ForEach-Object { $_ -replace '^\uFEFF', '' })
  $map = @{}
  foreach ($line in $targetLines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $map[$Matches[1]] = $Matches[2]
    }
  }

  $added = 0
  $skipped = 0
  foreach ($line in Get-Content $SecretsPath -Encoding UTF8) {
    $clean = $line -replace '^\uFEFF', ''
    if ($clean -match '^\s*#' -or $clean -match '^\s*$') { continue }
    if ($clean -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
    $key = $Matches[1]
    $val = $Matches[2]
    $existing = $null
    if ($map.ContainsKey($key)) { $existing = $map[$key] }
    if ($existing -and -not (Test-Placeholder $existing)) {
      $skipped++
      continue
    }
    $map[$key] = $val
    $added++
  }

  $out = New-Object System.Collections.Generic.List[string]
  $written = @{}
  foreach ($line in $targetLines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      $k = $Matches[1]
      if ($map.ContainsKey($k) -and -not $written.ContainsKey($k)) {
        $out.Add("$k=$($map[$k])")
        $written[$k] = $true
      }
    } else {
      $out.Add($line)
    }
  }
  foreach ($k in ($map.Keys | Sort-Object)) {
    if (-not $written.ContainsKey($k)) {
      $out.Add("$k=$($map[$k])")
    }
  }
  [System.IO.File]::WriteAllText($TargetPath, (($out -join "`n") + "`n"))
  Write-Ok "merge secrets -> $TargetPath (preenchidas=$added, preservadas=$skipped)"
}

function Set-EnvKey {
  param([string]$Path, [string]$Name, [string]$Value)
  $lines = @()
  if (Test-Path $Path) {
    $lines = @(Get-Content $Path -Encoding UTF8 | ForEach-Object { $_ -replace '^\uFEFF', '' })
  }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$Name\s*=") {
      $lines[$i] = "$Name=$Value"
      $found = $true
      break
    }
  }
  if (-not $found) {
    if ($lines.Count -eq 0 -or $lines[-1] -ne '') { $lines += "$Name=$Value" }
    else { $lines[-1] = "$Name=$Value"; $lines += '' }
  }
  [System.IO.File]::WriteAllText($Path, (($lines -join "`n").TrimEnd() + "`n"))
}

function Get-RemoteDatabaseUrl {
  $candidates = @(
    (Join-Path $Root 'apps\web\.env.local'),
    (Join-Path $Root 'packages\db\.env')
  )
  foreach ($c in $candidates) {
    $u = Read-EnvVar $c 'DATABASE_URL_RAILWAY'
    if (-not $u) { $u = Read-EnvVar $c 'DATABASE_URL' }
    if ($u -and $u -notmatch 'localhost|127\.0\.0\.1') { return $u }
  }
  return $null
}

# -- 1. Detect ---------------------------------------------------------------
Write-Step 'Detectando pre-requisitos (Node, pnpm, Docker)'

try { $nodeV = (node -v) } catch { Exit-Code 1 'Node nao encontrado. Instale Node 20 LTS.' }
if ($nodeV -notmatch 'v(2[0-9]|[3-9]\d)') {
  Exit-Code 1 "Node $nodeV - precisa >= 20.x"
}
Write-Ok "Node $nodeV"

try { $pnpmV = (pnpm -v) } catch {
  Exit-Code 1 'pnpm nao encontrado. Rode: corepack enable && corepack prepare pnpm@9.15.9 --activate'
}
Write-Ok "pnpm $pnpmV"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Exit-Code 1 'Docker CLI nao encontrado. Instale Docker Desktop e reinicie o terminal. Ver docs/ops/postgres-local-dev.md'
}
Write-Ok 'Docker CLI'

docker info 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Exit-Code 2 'Docker engine nao responde. Abra o Docker Desktop e espere o status verde, depois rode de novo.'
}
Write-Ok 'Docker engine'

# -- 2. Deps -----------------------------------------------------------------
if (-not $SkipInstall) {
  Write-Step 'pnpm install'
  pnpm install
  if ($LASTEXITCODE -ne 0) { Exit-Code 1 "pnpm install falhou (exit $LASTEXITCODE)" }
  Write-Ok 'dependencias'
} else {
  Write-Warn 'pulando pnpm install (-SkipInstall)'
}

# -- 3. Env ------------------------------------------------------------------
Write-Step 'Arquivos de ambiente'
$webEnv = Join-Path $Root 'apps\web\.env.local'
$webExample = Join-Path $Root 'apps\web\.env.example'
$dbEnv = Join-Path $Root 'packages\db\.env'

if (Ensure-EnvFile $webEnv $webExample) { Write-Ok "criado $webEnv a partir do example" }
else { Write-Ok "ja existe $webEnv" }

if (-not (Test-Path $dbEnv)) {
  Set-EnvKey $dbEnv 'DATABASE_URL' $LocalUrl
  Write-Ok "criado $dbEnv"
} else {
  Write-Ok "ja existe $dbEnv"
}

$secretsPath = $SecretsFile
if (-not $secretsPath) {
  foreach ($candidate in @(
    (Join-Path $Root 'torcida-dev.secrets.env'),
    (Join-Path $Root 'apps\web\.env.team'),
    (Join-Path $Root '.env.team')
  )) {
    if (Test-Path $candidate) { $secretsPath = $candidate; break }
  }
}
if ($secretsPath) {
  Merge-SecretsFile $secretsPath $webEnv
  # Espelha DATABASE_* no packages/db/.env
  $rail = Read-EnvVar $webEnv 'DATABASE_URL_RAILWAY'
  $dbUrl = Read-EnvVar $webEnv 'DATABASE_URL'
  if ($rail) { Set-EnvKey $dbEnv 'DATABASE_URL_RAILWAY' $rail }
  if ($dbUrl) { Set-EnvKey $dbEnv 'DATABASE_URL' $dbUrl }
} else {
  Write-Warn 'nenhum pacote de secrets encontrado (torcida-dev.secrets.env / .env.team). Ver docs/ops/dev-secrets.md'
}

$missing = @()
foreach ($key in @('AUTH_SECRET', 'TENANT_SLUG', 'SUPER_ADMIN_EMAILS')) {
  $v = Read-EnvVar $webEnv $key
  if (Test-Placeholder $v) { $missing += $key }
}
if ($missing.Count -gt 0) {
  $missingList = [string]::Join(', ', $missing)
  Write-Warn "chaves ainda faltando ou placeholder: $missingList"
  Write-Warn 'Preencha manualmente ou passe -SecretsFile. Continuando infra...'
}

# -- 4. DB -------------------------------------------------------------------
Write-Step 'Subindo Postgres local (docker compose)'
docker compose -f docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) { Exit-Code 2 "docker compose up falhou (exit $LASTEXITCODE)" }

$healthy = $false
for ($i = 1; $i -le 30; $i++) {
  $status = docker inspect --format='{{.State.Health.Status}}' torcida-postgres-dev 2>$null
  if ($status -eq 'healthy') { $healthy = $true; break }
  if ($status -eq 'unhealthy') {
    docker logs torcida-postgres-dev 2>&1 | Select-Object -Last 20
    Exit-Code 2 'Container unhealthy. Se o log citar volume /var/lib/postgresql/data, o compose do repo ja corrige - rode: docker compose -f docker-compose.dev.yml down -v && up -d (apaga dados locais).'
  }
  Start-Sleep -Seconds 2
}
if (-not $healthy) { Exit-Code 2 'Timeout esperando healthcheck do torcida-postgres-dev' }
Write-Ok 'torcida-postgres-dev healthy'

# -- 5-6. Sync + point local -------------------------------------------------
$remote = Get-RemoteDatabaseUrl
# Preserva remota antes de apontar local
if ($remote) {
  Set-EnvKey $webEnv 'DATABASE_URL_RAILWAY' $remote
  Set-EnvKey $dbEnv 'DATABASE_URL_RAILWAY' $remote
}

Set-EnvKey $webEnv 'DATABASE_URL' $LocalUrl
Set-EnvKey $dbEnv 'DATABASE_URL' $LocalUrl
Write-Ok 'DATABASE_URL -> localhost nos dois .env'

if ($SkipSync) {
  Write-Warn 'pulando sync (-SkipSync)'
} elseif (-not $remote) {
  Write-Warn 'sem DATABASE_URL_RAILWAY / URL remota - banco local pode estar vazio. Sync pulado. Confirme antes de db:push/seed.'
} else {
  Write-Step 'Sync Railway -> local'
  & (Join-Path $PSScriptRoot 'db-local-sync.ps1')
  if ($LASTEXITCODE -ne 0) { Exit-Code 3 "db-local-sync falhou (exit $LASTEXITCODE)" }
  # Sync pode deixar DATABASE_URL apontando local no report; reafirma
  Set-EnvKey $webEnv 'DATABASE_URL' $LocalUrl
  Set-EnvKey $dbEnv 'DATABASE_URL' $LocalUrl
  Write-Ok 'sync concluido'
}

# -- 7. Prisma ---------------------------------------------------------------
Write-Step 'prisma generate'
pnpm --filter @torcida/db db:generate
if ($LASTEXITCODE -ne 0) { Exit-Code 1 "db:generate falhou (exit $LASTEXITCODE)" }
Write-Ok 'Prisma Client'

# -- 8. Smoke ----------------------------------------------------------------
Write-Step 'Smoke'
docker exec torcida-postgres-dev psql -U torcida -d torcida -tAc 'SELECT 1' | Out-Null
if ($LASTEXITCODE -ne 0) { Exit-Code 2 'SELECT 1 falhou no Postgres local' }
$tables = docker exec torcida-postgres-dev psql -U torcida -d torcida -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
$tableCount = ($tables | Out-String).Trim()
Write-Ok "SELECT 1 ok - tabelas public=$tableCount"

Write-Host ''
Write-Host 'Setup concluido.' -ForegroundColor Green
Write-Host '  Subir web:  pnpm --filter @torcida/web dev'
Write-Host '  Login seed: senha m1k43l3n (usuarios de seed)'
Write-Host '  Docs:       docs/ops/postgres-local-dev.md | docs/ops/dev-secrets.md'
if ($missing.Count -gt 0) {
  $missingList = [string]::Join(', ', $missing)
  Write-Host "  Pendente:   preencha $missingList em apps/web/.env.local" -ForegroundColor Yellow
  exit 4
}
exit 0
