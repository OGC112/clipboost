$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$downloads = Join-Path $env:USERPROFILE "Downloads"
if (-not (Test-Path $downloads)) { throw "Downloads folder not found: $downloads" }

$zip = Get-ChildItem $downloads -File -Filter "clipboost-*.zip" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $zip) { throw "No clipboost-*.zip was found in Downloads." }

Write-Host "ClipBoost - Apply Downloaded Update" -ForegroundColor Magenta
Write-Host "Source: $($zip.FullName)"
Write-Host "Target: $repoRoot"
Write-Host ""

$temp = Join-Path $env:TEMP ("clipboost-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

try {
  Expand-Archive -LiteralPath $zip.FullName -DestinationPath $temp -Force
  $source = $temp
  if (-not (Test-Path (Join-Path $source "package.json"))) {
    $dirs = Get-ChildItem $source -Directory
    if ($dirs.Count -eq 1 -and (Test-Path (Join-Path $dirs[0].FullName "package.json"))) {
      $source = $dirs[0].FullName
    }
  }
  if (-not (Test-Path (Join-Path $source "package.json"))) { throw "The ZIP does not look like a ClipBoost project." }

  # Robocopy exit codes 0-7 are successful. Protected user/repository data is not touched.
  & robocopy $source $repoRoot /E /R:2 /W:1 /XD ".git" "node_modules" "storage" "release" "dist" /XF ".env" | Out-Host
  if ($LASTEXITCODE -gt 7) { throw "Robocopy failed with code $LASTEXITCODE." }

  Set-Location $repoRoot
  Write-Host ""
  Write-Host "Installing/updating Node dependencies..." -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

  Write-Host ""
  Write-Host "Update applied successfully." -ForegroundColor Green
  Write-Host "Your .env, .git, storage, node_modules data, releases and exports were preserved."
  Write-Host "Run ClipBoost, test the update, then use Publish ClipBoost Update.bat when ready."
}
finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
