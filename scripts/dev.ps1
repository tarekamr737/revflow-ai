$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path (Get-Location) '.cache/npm'
$env:DOCKER_CONFIG = Join-Path (Get-Location) '.cache/docker'
New-Item -ItemType Directory -Force $env:TEMP,$env:npm_config_cache,$env:DOCKER_CONFIG | Out-Null
npm ci
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run db:migrate
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm start
