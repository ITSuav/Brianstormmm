$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$port = 5174
$url = "http://127.0.0.1:$port/?v=latest"

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
    $devCommand = "Set-Location '$projectRoot'; npm run dev -- --host 127.0.0.1 --port $port"
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $devCommand) -WindowStyle Minimized
}

Start-Process $url
