$ErrorActionPreference = 'Stop'
$revflowRoot=Split-Path $PSScriptRoot -Parent
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:DOCKER_CONFIG = (Join-Path $revflowRoot '.cache/docker')
$env:TEMP = (Join-Path $revflowRoot '.tmp')
$env:TMP = $env:TEMP
$revflowExistingContainers = docker ps -a --format '{{.Names}}'
foreach ($revflowContainerName in @('revflow-postgres-1','revflow-migrate-1','revflow-policy-1','revflow-n8n-1')) {
 if ($revflowExistingContainers -contains $revflowContainerName) {
  $revflowContainerMetadata = docker inspect $revflowContainerName | ConvertFrom-Json
  foreach ($revflowEnvEntry in $revflowContainerMetadata[0].Config.Env) {
   $revflowEnvPair = $revflowEnvEntry -split '=',2
   if ($revflowEnvPair[0] -in @('POSTGRES_PASSWORD','APP_DATABASE_PASSWORD','API_TOKEN','APPROVAL_TOKEN','WEBHOOK_SECRET','N8N_ENCRYPTION_KEY','N8N_INBOUND_TOKEN','N8N_GATEWAY_TOKEN') -and -not [Environment]::GetEnvironmentVariable($revflowEnvPair[0],'Process')) {
    [Environment]::SetEnvironmentVariable($revflowEnvPair[0],$revflowEnvPair[1],'Process')
   }
  }
 }
}
foreach ($revflowSecretName in @('POSTGRES_PASSWORD','APP_DATABASE_PASSWORD','API_TOKEN','APPROVAL_TOKEN','WEBHOOK_SECRET','N8N_ENCRYPTION_KEY','N8N_INBOUND_TOKEN','N8N_GATEWAY_TOKEN')) {
 if (-not [Environment]::GetEnvironmentVariable($revflowSecretName,'Process')) {
  $revflowBytes=New-Object byte[] 32
  $revflowRandom=[Security.Cryptography.RandomNumberGenerator]::Create()
  try { $revflowRandom.GetBytes($revflowBytes) } finally { $revflowRandom.Dispose() }
  [Environment]::SetEnvironmentVariable($revflowSecretName,([BitConverter]::ToString($revflowBytes) -replace '-','').ToLowerInvariant(),'Process')
 }
}
docker compose config --quiet
if ($LASTEXITCODE) { exit $LASTEXITCODE }
docker compose --progress quiet up -d --build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
docker compose exec -T policy node scripts/container-smoke.mjs
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Output 'Compose startup, migrations, PostgreSQL policy API, approvals, and booking smoke passed.'
