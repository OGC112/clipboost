$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host ""
Write-Host "ClipBoost - Publish Update" -ForegroundColor Magenta
Write-Host "Repository: $repoRoot"
Write-Host ""

# Make sure this is a Git repository.
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
    throw "This folder is not a Git repository."
}

# Refresh tags so we know whether the package version was already released.
git fetch origin --tags

$package = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$package.version
$tag = "v$version"

$existingTag = git tag --list $tag
if ($existingTag) {
    Write-Host "$tag already exists. Bumping patch version..." -ForegroundColor Yellow
    npm version patch --no-git-tag-version
    if ($LASTEXITCODE -ne 0) { throw "Could not bump package version." }

    $package = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
    $version = [string]$package.version
    $tag = "v$version"
}

Write-Host "Version to publish: $version" -ForegroundColor Cyan

# Stage all source changes. Ignored folders such as release/, node_modules/,
# dist/, storage/ and .env stay ignored automatically.
git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed." }

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host ""
    Write-Host "No source changes to publish." -ForegroundColor Yellow
    Write-Host "The local release/ folder is intentionally ignored."
    exit 0
}

Write-Host ""
Write-Host "Files to publish:" -ForegroundColor Green
$staged | ForEach-Object { Write-Host "  $_" }

git commit -m "Release v$version"
if ($LASTEXITCODE -ne 0) { throw "git commit failed." }

git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push failed." }

Write-Host ""
Write-Host "Push complete." -ForegroundColor Green
Write-Host "GitHub Actions will build and publish $tag automatically."
Write-Host "You do NOT need to commit or upload the local release/ folder."
