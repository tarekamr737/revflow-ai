$ErrorActionPreference='Stop'
$revflowRoot=Split-Path $PSScriptRoot -Parent
Set-Location $revflowRoot
$env:TEMP=Join-Path $revflowRoot '.tmp'
$env:TMP=$env:TEMP
$env:npm_config_cache=Join-Path $revflowRoot '.cache/npm'
$env:AGENT_BROWSER_HOME=Join-Path $revflowRoot '.cache/agent-browser'
$env:DATABASE_URL=''
$env:ADAPTER_MODE='mock'
$env:DATA_DIR=Join-Path $revflowRoot ('.data/verification-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $env:TEMP,$env:npm_config_cache | Out-Null
npm ci --no-audit --no-fund
if($LASTEXITCODE){exit $LASTEXITCODE}
npm run db:migrate
if($LASTEXITCODE){exit $LASTEXITCODE}
npm test
if($LASTEXITCODE){exit $LASTEXITCODE}
npm run fixtures
if($LASTEXITCODE){exit $LASTEXITCODE}
npm run eval
if($LASTEXITCODE){exit $LASTEXITCODE}
npm run demo
if($LASTEXITCODE){exit $LASTEXITCODE}
npm run check
if($LASTEXITCODE){exit $LASTEXITCODE}
Write-Output 'Clean install, fresh migration, tests, synthetic evaluation, demo, syntax, and repository secret-pattern checks passed.'
