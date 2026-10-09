$ErrorActionPreference='Stop'
. "$PSScriptRoot/load-runtime.ps1"
Assert-RevFlowNoSession
$revflowTracePolicy=Get-Content -LiteralPath (Join-Path $revflowRoot 'docs/workflow-tracing.json') -Raw | ConvertFrom-Json
if($revflowTracePolicy.enabled){throw 'Disable synthetic execution tracing through n8n MCP before starting real-contact mode. See docs/personal-use.md.'}
$revflowConfigPath=Join-Path (Get-Location) 'config/personal.json'
if(-not(Test-Path -LiteralPath $revflowConfigPath)){throw 'Prepare ignored config/personal.json from the example and review docs/personal-use.md first.'}
$env:PERSONAL_CONFIG_JSON=Get-Content -LiteralPath $revflowConfigPath -Raw
node --input-type=module -e "import {validatePersonalConfig} from './src/personal-policy.mjs';validatePersonalConfig(JSON.parse(process.env.PERSONAL_CONFIG_JSON));console.log('Personal configuration validated.');"
if($LASTEXITCODE){exit $LASTEXITCODE}
$revflowConfig=$env:PERSONAL_CONFIG_JSON|ConvertFrom-Json
$env:DATA_MODE='personal'
$env:ADAPTER_MODE='live'
$env:GMAIL_TEST_RECIPIENT=''
$env:GOOGLE_CALENDAR_ID=$revflowConfig.calendar_id
$env:HUBSPOT_PIPELINE=$revflowConfig.hubspot_pipeline
$env:HUBSPOT_DEAL_STAGE=$revflowConfig.hubspot_deal_stage
$env:SLACK_CHANNEL=$revflowConfig.slack_channel
$revflowProfile=Invoke-RestMethod -Uri $env:CONNECTOR_GATEWAY_URL -Method POST -Headers @{Authorization='Bearer '+$env:N8N_GATEWAY_TOKEN} -ContentType 'application/json' -Body '{"method":"GET","url":"https://gmail.googleapis.com/gmail/v1/users/me/profile"}'
if($revflowProfile.status -ne 200){throw 'Gmail account lookup failed.'}
$env:GMAIL_SENDER=$revflowProfile.body.emailAddress
docker compose run --rm -T -e PERSONAL_CONFIG_JSON migrate node scripts/configure-personal.mjs
if($LASTEXITCODE){exit $LASTEXITCODE}
docker compose --progress quiet up -d --build policy
if($LASTEXITCODE){exit $LASTEXITCODE}
node scripts/portfolio-session.mjs
$revflowSessionExit=$LASTEXITCODE
if($revflowSessionExit){& "$PSScriptRoot/stop-portfolio.ps1"}
exit $revflowSessionExit
