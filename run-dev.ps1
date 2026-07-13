$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $root 'SiraStudio'
$backendPath = Join-Path $root 'sirastudio_ai'

if (-not (Test-Path $frontendPath)) {
  throw "Frontend folder not found: $frontendPath"
}

if (-not (Test-Path $backendPath)) {
  throw "Backend folder not found: $backendPath"
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  throw 'uv is required to start the backend. Install it from https://docs.astral.sh/uv/.'
}

$frontendCommand = "Set-Location '$frontendPath'; npm run dev"
$backendCommand = "Set-Location '$backendPath'; uv run manage.py runserver"

$backendProcess = Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCommand -PassThru
$frontendProcess = Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand -PassThru

Write-Host 'Backend started in a new PowerShell window.'
Write-Host 'Frontend started in a new PowerShell window.'
Write-Host 'Close both server windows, or press Ctrl+C here to stop waiting.'

Wait-Process -Id $frontendProcess.Id, $backendProcess.Id
