param([ValidateSet('API_TOKEN','APPROVAL_TOKEN','WEBHOOK_SECRET','N8N_INBOUND_TOKEN','N8N_GATEWAY_TOKEN')][string]$Name='API_TOKEN',[switch]$Bearer,[switch]$PlaceholderJson)
$ErrorActionPreference='Stop'
$revflowRoot=Split-Path $PSScriptRoot -Parent
$env:DOCKER_CONFIG=(Join-Path $revflowRoot '.cache/docker')
$env:TEMP=(Join-Path $revflowRoot '.tmp')
$env:TMP=$env:TEMP
if($Bearer -and $PlaceholderJson){throw 'Choose either Bearer or PlaceholderJson.'}
$revflowMetadata=docker inspect revflow-policy-1 | ConvertFrom-Json
if($LASTEXITCODE){throw 'Start the RevFlow Docker stack first.'}
$revflowEntry=$revflowMetadata[0].Config.Env | Where-Object { $_.StartsWith($Name+'=') } | Select-Object -First 1
if(-not $revflowEntry){throw 'Requested credential is not configured in the RevFlow policy container.'}
$revflowValue=($revflowEntry -split '=',2)[1]
if($revflowValue.Length -lt 32){throw 'Requested credential is not configured.'}
if($Bearer){$revflowValue='Bearer '+$revflowValue}
if($PlaceholderJson){$revflowValue=@{api_key=$revflowValue}|ConvertTo-Json -Compress}
Set-Clipboard -Value $revflowValue
Write-Output 'Credential copied to the local clipboard without printing it. Paste into the intended credential field, then clear the clipboard.'
