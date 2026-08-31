<#
.SYNOPSIS
  Exclui do Windows Defender as pastas e processos do ciclo de dev.

.DESCRIPTION
  Em Windows + Node, a varredura em tempo real do Defender entra no caminho de
  cada leitura/escrita do bundler. Num monorepo deste tamanho (node_modules com
  ~60k arquivos, cache do Turbopack com milhares de .sst) isso domina o tempo de
  compilação. As exclusões abaixo cobrem só artefatos de build e dependências —
  nada de código-fonte executável vindo de fora.

  PRECISA DE TERMINAL COMO ADMINISTRADOR. Sem elevação o Defender nem deixa
  LER as exclusões, muito menos gravá-las.

.EXAMPLE
  # PowerShell como Administrador, na raiz do repo:
  ./scripts/dev-defender-exclusoes.ps1

.EXAMPLE
  # Ver o que seria feito, sem aplicar:
  ./scripts/dev-defender-exclusoes.ps1 -WhatIf

.EXAMPLE
  # Desfazer:
  ./scripts/dev-defender-exclusoes.ps1 -Remover
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Remover
)

$ErrorActionPreference = 'Stop'

$ehAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $ehAdmin) {
  Write-Host ''
  Write-Host '  Este script precisa de PowerShell como Administrador.' -ForegroundColor Yellow
  Write-Host '  Abra o Terminal com "Executar como administrador" e rode de novo.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

$repo = Split-Path -Parent $PSScriptRoot

$pastas = @(
  $repo
  (Join-Path $repo 'node_modules')
  (Join-Path $repo 'apps\web\.next')
  (Join-Path $repo 'apps\web\node_modules')
  (Join-Path $repo '.turbo')
  "$env:LOCALAPPDATA\pnpm"
  "$env:LOCALAPPDATA\pnpm-store"
) | Where-Object { Test-Path $_ } | Select-Object -Unique

# Processos do ciclo de build. Nome do executável basta — o Defender casa por nome.
$processos = @('node.exe', 'pnpm.exe', 'next-server.exe', 'esbuild.exe')

if ($Remover) {
  foreach ($p in $pastas) {
    if ($PSCmdlet.ShouldProcess($p, 'Remover exclusão de pasta')) {
      Remove-MpPreference -ExclusionPath $p
      Write-Host "  - pasta   $p" -ForegroundColor DarkGray
    }
  }
  foreach ($p in $processos) {
    if ($PSCmdlet.ShouldProcess($p, 'Remover exclusão de processo')) {
      Remove-MpPreference -ExclusionProcess $p
      Write-Host "  - proc    $p" -ForegroundColor DarkGray
    }
  }
  Write-Host ''
  Write-Host '  Exclusões removidas.' -ForegroundColor Green
  exit 0
}

Write-Host ''
Write-Host '  Excluindo do Defender:' -ForegroundColor Cyan
foreach ($p in $pastas) {
  if ($PSCmdlet.ShouldProcess($p, 'Excluir pasta')) {
    Add-MpPreference -ExclusionPath $p
    Write-Host "  + pasta   $p" -ForegroundColor Green
  }
}
foreach ($p in $processos) {
  if ($PSCmdlet.ShouldProcess($p, 'Excluir processo')) {
    Add-MpPreference -ExclusionProcess $p
    Write-Host "  + proc    $p" -ForegroundColor Green
  }
}

Write-Host ''
Write-Host '  Conferindo o que ficou gravado:' -ForegroundColor Cyan
(Get-MpPreference).ExclusionPath | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
(Get-MpPreference).ExclusionProcess | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
Write-Host ''
