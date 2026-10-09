$ErrorActionPreference='Stop'
. "$PSScriptRoot/load-runtime.ps1"
$revflowSessionFile=Join-Path $revflowRoot '.tmp/session.json'
if(Test-Path -LiteralPath $revflowSessionFile){
 $revflowSession=Get-Content -LiteralPath $revflowSessionFile -Raw|ConvertFrom-Json
 $revflowProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($revflowSession.pid)"
 if($revflowProcess -and $revflowProcess.CommandLine -match 'scripts/portfolio-session.mjs'){
  @{session_id=$revflowSession.session_id}|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $revflowRoot '.tmp/session-stop.json') -Encoding Ascii
  for($revflowWait=0;$revflowWait -lt 45;$revflowWait++){if(-not (Get-Process -Id $revflowSession.pid -ErrorAction SilentlyContinue)){Write-Output 'Connected session stopped and mock runtime restored.';exit 0};Start-Sleep -Seconds 1}
  throw 'Session shutdown is still running. Wait, then check the session terminal.'
 }
 if($revflowProcess){throw 'Session PID belongs to another process; no process was stopped.'}
 Remove-Item -LiteralPath $revflowSessionFile
}
& "$PSScriptRoot/restore-mock.ps1"
exit $LASTEXITCODE
