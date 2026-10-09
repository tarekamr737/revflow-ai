$ErrorActionPreference='Stop'
$revflowRoot=Split-Path $PSScriptRoot -Parent
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:DOCKER_CONFIG=(Join-Path $revflowRoot '.cache/docker')
$env:TEMP=(Join-Path $revflowRoot '.tmp')
$env:TMP=$env:TEMP
$env:npm_config_cache=(Join-Path $revflowRoot '.cache/npm')
function Assert-RevFlowNoSession {
 $revflowSessionFile=(Join-Path $revflowRoot '.tmp/session.json')
 if(Test-Path -LiteralPath $revflowSessionFile){$revflowSession=Get-Content -LiteralPath $revflowSessionFile -Raw|ConvertFrom-Json;if(Get-Process -Id $revflowSession.pid -ErrorAction SilentlyContinue){throw 'A RevFlow session is already running. Close its terminal with Ctrl+C before starting another.'}}
}
$revflowSecretNames=@('POSTGRES_PASSWORD','APP_DATABASE_PASSWORD','API_TOKEN','APPROVAL_TOKEN','WEBHOOK_SECRET','N8N_ENCRYPTION_KEY','N8N_INBOUND_TOKEN','N8N_GATEWAY_TOKEN')
foreach($revflowContainer in @('revflow-postgres-1','revflow-migrate-1','revflow-policy-1','revflow-n8n-1')){
 $revflowMetadata=docker inspect $revflowContainer 2>$null | ConvertFrom-Json
 if($LASTEXITCODE){continue}
 foreach($revflowEntry in $revflowMetadata[0].Config.Env){$revflowPair=$revflowEntry -split '=',2;if($revflowSecretNames -contains $revflowPair[0]){[Environment]::SetEnvironmentVariable($revflowPair[0],$revflowPair[1],'Process')}}
}
if($revflowSecretNames|Where-Object{-not [Environment]::GetEnvironmentVariable($_,'Process')}){throw 'Start Docker Desktop and run scripts/docker-smoke.ps1 once to prepare the stack.'}
if(-not(Test-Path -LiteralPath (Join-Path $revflowRoot 'config/n8n.json'))){throw 'Copy config/n8n.example.json to config/n8n.json and configure your n8n instance first.'}
$revflowAccount=Get-Content -LiteralPath (Join-Path $revflowRoot 'config/n8n.json') -Raw|ConvertFrom-Json
$revflowInstance=[string]$revflowAccount.instance
if($revflowInstance -notmatch '^https://[a-z0-9-]+\.app\.n8n\.cloud$'){throw 'Invalid n8n Cloud instance URL in config/n8n.json.'}
$revflowPrefix=if($revflowAccount.webhook_prefix){[string]$revflowAccount.webhook_prefix}else{'revflow'}
if($revflowPrefix -notmatch '^revflow(?:-unified)?$'){throw 'Invalid configured webhook prefix.'}
$env:AI_GATEWAY_URL=$revflowInstance+'/webhook/'+$revflowPrefix+'-ai'
$env:CONNECTOR_GATEWAY_URL=$revflowInstance+'/webhook/'+$revflowPrefix+'-connectors'
$env:AI_GATEWAY_TOKEN=$env:N8N_GATEWAY_TOKEN
foreach($revflowName in @('INGEST','SEND','REPLY','MEETING')){[Environment]::SetEnvironmentVariable('N8N_'+$revflowName+'_URL',$revflowInstance+'/webhook/'+$revflowPrefix+'-'+$revflowName.ToLowerInvariant(),'Process')}
$env:N8N_OPERATIONS_URL=$revflowInstance+'/webhook/'+$revflowPrefix+'-ops'
$env:N8N_FOLLOWUPS_URL=$env:N8N_OPERATIONS_URL
