$ErrorActionPreference='Stop'
. "$PSScriptRoot/load-runtime.ps1"
$env:ADAPTER_MODE='mock'
$env:DATA_MODE='synthetic'
$env:PERSONAL_CONFIG_JSON=''
$env:GMAIL_SENDER=''
$env:GMAIL_TEST_RECIPIENT=''
foreach($revflowName in @('N8N_INGEST_URL','N8N_SEND_URL','N8N_REPLY_URL','N8N_MEETING_URL','N8N_FOLLOWUPS_URL','N8N_OPERATIONS_URL','AI_GATEWAY_URL','CONNECTOR_GATEWAY_URL')){[Environment]::SetEnvironmentVariable($revflowName,'','Process')}
docker compose --progress quiet up -d policy
if($LASTEXITCODE){exit $LASTEXITCODE}
Write-Output 'Local runtime restored to the synthetic mock demo.'
