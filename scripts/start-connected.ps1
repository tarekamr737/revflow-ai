param([string]$TestRecipient='')
$ErrorActionPreference='Stop'
& "$PSScriptRoot/start-portfolio.ps1" -TestRecipient $TestRecipient
exit $LASTEXITCODE
