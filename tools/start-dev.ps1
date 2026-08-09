Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"
$serverPort = 8080

if (Test-Path $envFile) {
    $portEntry = Get-Content $envFile | Where-Object { $_ -match "^PORT=" } | Select-Object -First 1
    if ($portEntry) {
        $configuredPort = $portEntry -replace "^PORT=", ""
        if ($configuredPort -match "^\d+$") {
            $serverPort = [int]$configuredPort
        }
    }
}

$listeners = Get-NetTCPConnection -LocalPort $serverPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $listeners) {
    $processInfo = Get-Process -Id $processId -ErrorAction Stop
    if ($processInfo.ProcessName -notmatch "^node(\.exe)?$") {
        throw "Port $serverPort is already used by $($processInfo.ProcessName) (PID $processId). Stop that process or change PORT in .env."
    }

    Write-Host "Stopping stale Node.js development process on port $serverPort (PID $processId)..."
    Stop-Process -Id $processId -Force
}

Set-Location $projectRoot
& (Join-Path $projectRoot "node_modules\.bin\nodemon.cmd") --exec "tsx backend/src/server.ts" --ext "ts,js,json"
exit $LASTEXITCODE
