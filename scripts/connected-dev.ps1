# Compatibility entry point; the portfolio session owns tunnel registration/cleanup.
$ErrorActionPreference='Stop'
& "$PSScriptRoot/start-portfolio.ps1"
exit $LASTEXITCODE
