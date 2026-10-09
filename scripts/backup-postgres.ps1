$ErrorActionPreference='Stop'
. "$PSScriptRoot/load-runtime.ps1"
$revflowBackupDir=Join-Path (Get-Location) '.data/backups'
New-Item -ItemType Directory -Force -Path $revflowBackupDir|Out-Null
$revflowBackupName='revflow-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N')+'.dump'
$revflowContainerPath='/tmp/'+$revflowBackupName
$revflowBackupPath=Join-Path $revflowBackupDir $revflowBackupName
docker exec revflow-postgres-1 pg_dump -U revflow -d revflow --format=custom --file $revflowContainerPath
if($LASTEXITCODE){exit $LASTEXITCODE}
docker cp ('revflow-postgres-1:'+$revflowContainerPath) $revflowBackupPath
if($LASTEXITCODE){exit $LASTEXITCODE}
docker exec revflow-postgres-1 pg_restore --list $revflowContainerPath|Out-Null
if($LASTEXITCODE){throw 'Backup archive verification failed.'}
docker exec revflow-postgres-1 rm -- $revflowContainerPath
if($LASTEXITCODE){throw 'Backup copied; container temporary-file cleanup failed.'}
Write-Output ('Verified private PostgreSQL backup saved: '+$revflowBackupPath)
