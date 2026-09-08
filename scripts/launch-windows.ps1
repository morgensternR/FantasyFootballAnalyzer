param(
  [switch]$SkipPlayerUpdate
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$AppUrl = 'http://localhost:5173/'
$NodeMinimumMajor = 20

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $paths = @()
  if ($env:ProgramFiles) {
    $nodePath = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path $nodePath) { $paths += $nodePath }
  }
  if ($machinePath) { $paths += $machinePath }
  if ($userPath) { $paths += $userPath }
  if ($paths.Count -gt 0) { $env:Path = ($paths -join ';') }
}

function Get-NodeMajor {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { return $null }
  $version = (& $node.Source --version 2>$null)
  if ($LASTEXITCODE -ne 0) { return $null }
  if ($version -match '^v(\d+)') { return [int]$Matches[1] }
  return $null
}

function Ensure-Node {
  Refresh-ProcessPath
  $major = Get-NodeMajor
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($major -ge $NodeMinimumMajor -and $npm) {
    Write-Host "Node $(& node.exe --version) and npm are ready." -ForegroundColor Green
    return
  }

  Write-Step "Node.js $NodeMinimumMajor+ is required. Installing Node.js LTS automatically"
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Node.js $NodeMinimumMajor+ is not installed and Windows Package Manager (winget) is unavailable. Install Microsoft's App Installer/winget, then double-click the launcher again."
  }

  if ($major) {
    & $winget.Source upgrade --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  } else {
    & $winget.Source install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  }

  Refresh-ProcessPath
  $major = Get-NodeMajor
  if ($major -lt $NodeMinimumMajor) {
    # The existing Node install may not have been registered as the winget LTS
    # package. Give the normal LTS installer one explicit chance before failing.
    & $winget.Source install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-ProcessPath
    $major = Get-NodeMajor
  }

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($major -lt $NodeMinimumMajor -or -not $npm) {
    throw "Node.js installation finished, but this Windows session cannot see Node $NodeMinimumMajor+ yet. Close this launcher and double-click it once more."
  }

  Write-Host "Installed Node $(& node.exe --version)." -ForegroundColor Green
}

function Ensure-Dependencies {
  Write-Step 'Checking app dependencies'
  $lockPath = Join-Path $Root 'package-lock.json'
  $modulesPath = Join-Path $Root 'node_modules'
  $stampPath = Join-Path $modulesPath '.ffa-package-lock.sha256'
  $needsInstall = -not (Test-Path $modulesPath)
  $lockHash = $null

  if (Test-Path $lockPath) {
    $lockHash = (Get-FileHash -Algorithm SHA256 -Path $lockPath).Hash
    if (-not (Test-Path $stampPath)) {
      $needsInstall = $true
    } else {
      $oldHash = [string](Get-Content -Raw -Path $stampPath -ErrorAction SilentlyContinue)
      $oldHash = $oldHash.Trim()
      if ($oldHash -ne $lockHash) { $needsInstall = $true }
    }
  }

  if (-not $needsInstall) {
    & npm.cmd ls --depth=0 --silent *> $null
    if ($LASTEXITCODE -ne 0) { $needsInstall = $true }
  }

  if (-not $needsInstall) {
    Write-Host 'Dependencies are already installed.' -ForegroundColor Green
    return
  }

  Write-Host 'Installing project dependencies. This is normally only needed on the first run or after an app update.'
  Push-Location $Root
  try {
    if (Test-Path $lockPath) {
      & npm.cmd ci
    } else {
      & npm.cmd install
    }
    if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }
  } finally {
    Pop-Location
  }

  if ($lockHash) {
    Set-Content -Path $stampPath -Value $lockHash -Encoding ASCII
  }
  Write-Host 'Dependencies installed.' -ForegroundColor Green
}

function Update-PlayerData {
  if ($SkipPlayerUpdate) {
    Write-Host 'Player-data refresh skipped by command-line option.' -ForegroundColor Yellow
    return
  }

  Write-Step 'Refreshing fantasy rankings, ADP, player pool, projections, volume, and snap data'
  Push-Location $Root
  try {
    & npm.cmd run update:rankings
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'The online player-data refresh failed. The app will still open using the last good bundled data.'
      return
    }
  } catch {
    Write-Warning "The online player-data refresh failed: $($_.Exception.Message)"
    Write-Warning 'The app will still open using the last good bundled data.'
    return
  } finally {
    Pop-Location
  }
  Write-Host 'Player data refresh finished.' -ForegroundColor Green
}

function Test-AppServer {
  try {
    $response = Invoke-WebRequest -Uri $AppUrl -UseBasicParsing -TimeoutSec 1
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Start-App {
  Write-Step 'Starting Fantasy Football Analyzer'

  if (-not (Test-AppServer)) {
    $serverCommand = 'title Fantasy Football Analyzer Server && npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort'
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $serverCommand) -WorkingDirectory $Root | Out-Null

    $ready = $false
    for ($i = 0; $i -lt 160; $i++) {
      Start-Sleep -Milliseconds 250
      if (Test-AppServer) {
        $ready = $true
        break
      }
    }
    if (-not $ready) {
      throw 'The local app server did not become ready on http://localhost:5173/. Check the Fantasy Football Analyzer Server window for the error.'
    }
  } else {
    Write-Host 'The local app server is already running.' -ForegroundColor Green
  }

  Start-Process $AppUrl | Out-Null
  Write-Host "Opened $AppUrl" -ForegroundColor Green
  Write-Host 'Leave the Fantasy Football Analyzer Server window open while using the app. Close that server window when you are done.'
}

try {
  Set-Location $Root
  Write-Host 'Fantasy Football Analyzer - automatic Windows launcher' -ForegroundColor White
  Write-Host 'This launcher checks Node/npm, installs project dependencies when needed, refreshes automated player data, starts the app, and opens your browser.'

  Ensure-Node
  Ensure-Dependencies
  Update-PlayerData
  Start-App
  exit 0
} catch {
  Write-Host ''
  Write-Host 'Launcher stopped because of an error:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
