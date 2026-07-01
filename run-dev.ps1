$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $root 'SiraStudio'
$backendPath = Join-Path $root 'sirastudio_ai'
$backendPython = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path $frontendPath)) {
  throw "Frontend folder not found: $frontendPath"
}

if (-not (Test-Path $backendPath)) {
  throw "Backend folder not found: $backendPath"
}

if (-not (Test-Path $backendPython)) {
  $backendPython = 'python'
}

$frontendCommand = "Set-Location '$frontendPath'; npm run dev"
$backendCommand = "Set-Location '$backendPath'; & '$backendPython' manage.py runserver 8000"

$frontendProcess = Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand -PassThru
$backendProcess = Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCommand -PassThru

Write-Host 'Frontend started in a new PowerShell window.'
Write-Host 'Backend started in a new PowerShell window.'
Write-Host 'Close both server windows, or press Ctrl+C here to stop waiting.'

Wait-Process -Id $frontendProcess.Id, $backendProcess.Id
