$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $root 'SiraStudio'

if (-not (Test-Path $frontendPath)) {
  throw "Frontend folder not found: $frontendPath"
}

$frontendCommand = "Set-Location '$frontendPath'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand

Write-Host 'Frontend started in a new PowerShell window.'
