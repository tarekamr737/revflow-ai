param([string]$TestRecipient='')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/load-runtime.ps1"
Assert-RevFlowNoSession
$env:DATA_MODE='synthetic'
$env:PERSONAL_CONFIG_JSON=''
# Prepare live adapters before opening the session; provider credentials stay in n8n.
$env:ADAPTER_MODE='live'
$env:GOOGLE_CALENDAR_ID='primary'
$env:HUBSPOT_PIPELINE='default'
$env:HUBSPOT_DEAL_STAGE='appointmentscheduled'
$env:SLACK_CHANNEL='C0C6V1LKAMN'
$revflowProfile=Invoke-RestMethod -Uri $env:CONNECTOR_GATEWAY_URL -Method POST -Headers @{Authorization='Bearer '+$env:N8N_GATEWAY_TOKEN} -ContentType 'application/json' -Body '{"method":"GET","url":"https://gmail.googleapis.com/gmail/v1/users/me/profile"}'
if($revflowProfile.status -ne 200 -or $revflowProfile.body.emailAddress -notmatch '^[^\s@]+@[^\s@]+$'){throw 'Gmail account lookup failed.'}
$env:GMAIL_SENDER=$revflowProfile.body.emailAddress
$revflowLocalConfig=Join-Path $revflowRoot 'config/connected.local.json'
if(-not $TestRecipient -and (Test-Path -LiteralPath $revflowLocalConfig)){$TestRecipient=[string](Get-Content -LiteralPath $revflowLocalConfig -Raw|ConvertFrom-Json).test_recipient}
if($TestRecipient -and $TestRecipient -notmatch '^[^\s<>@]+@[^\s<>@]+$'){throw 'Invalid test recipient address.'}
$env:GMAIL_TEST_RECIPIENT=if($TestRecipient){$TestRecipient}else{$env:GMAIL_SENDER}
docker compose --progress quiet up -d --build policy
if($LASTEXITCODE){exit $LASTEXITCODE}
node scripts/portfolio-session.mjs
$revflowSessionExit=$LASTEXITCODE
if($revflowSessionExit){& "$PSScriptRoot/stop-portfolio.ps1"}
exit $revflowSessionExit
