param(
    [Parameter(Mandatory=$true)]
    [string]$RepoRoot,
    [switch]$Once,
    [switch]$ForceLatest
)

$ErrorActionPreference = 'Stop'

$StateDir = Join-Path $env:LOCALAPPDATA 'ClipBoostAutoPublisher'
$LogFile = Join-Path $StateDir 'auto-publisher.log'
$ProcessedFile = Join-Path $StateDir 'processed.txt'
$PidFile = Join-Path $StateDir 'watcher.pid'
$StatusFile = Join-Path $StateDir 'status.json'

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
if (-not (Test-Path $ProcessedFile)) { New-Item -ItemType File -Path $ProcessedFile -Force | Out-Null }

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    if ($Once) { Write-Host $line }
}

function Get-DownloadsFolder {
    $regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
    $downloadsGuid = '{374DE290-123F-4565-9164-39C4925E467B}'
    try {
        $props = Get-ItemProperty -Path $regPath -ErrorAction Stop
        $raw = $props.$downloadsGuid
        if ($raw) {
            $expanded = [Environment]::ExpandEnvironmentVariables([string]$raw)
            if (Test-Path $expanded) { return (Resolve-Path $expanded).Path }
        }
    } catch {}

    $candidates = @()
    if ($env:USERPROFILE) {
        $candidates += (Join-Path $env:USERPROFILE 'Downloads')
        $candidates += (Join-Path $env:USERPROFILE 'Téléchargements')
    }
    if ($env:OneDrive) {
        $candidates += (Join-Path $env:OneDrive 'Downloads')
        $candidates += (Join-Path $env:OneDrive 'Téléchargements')
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return (Resolve-Path $candidate).Path }
    }
    throw 'Unable to locate the Windows Downloads folder.'
}

$Downloads = Get-DownloadsFolder
$RepoRoot = (Resolve-Path $RepoRoot).Path

function Save-Status {
    param([string]$State, [string]$LastMessage = '')
    $data = [ordered]@{
        state = $State
        pid = $PID
        repo = $RepoRoot
        downloads = $Downloads
        last_message = $LastMessage
        updated_at = (Get-Date).ToString('o')
    }
    $data | ConvertTo-Json | Set-Content -Path $StatusFile -Encoding UTF8
}

function Invoke-GitCommand {
    param(
        [Parameter(Mandatory=$true)]
        [string[]]$GitArguments
    )
    & git @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Get-Signature {
    param([System.IO.FileInfo]$File)
    return "$($File.FullName)|$($File.Length)|$($File.LastWriteTimeUtc.Ticks)"
}

function Is-Processed {
    param([string]$Signature)
    if (-not (Test-Path $ProcessedFile)) { return $false }
    return [bool](Select-String -Path $ProcessedFile -SimpleMatch -Quiet -Pattern $Signature -ErrorAction SilentlyContinue)
}

function Mark-Processed {
    param([string]$Signature)
    Add-Content -Path $ProcessedFile -Value $Signature -Encoding UTF8
}

function Wait-FileReady {
    param([string]$Path)
    $lastLength = -1
    $stableCount = 0
    for ($i = 0; $i -lt 90; $i++) {
        if (-not (Test-Path $Path)) { return $false }
        try {
            $item = Get-Item -LiteralPath $Path
            $length = $item.Length
            $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'None')
            $stream.Close()
            if ($length -gt 0 -and $length -eq $lastLength) { $stableCount++ }
            else { $lastLength = $length; $stableCount = 0 }
            if ($stableCount -ge 2) { return $true }
        } catch { $stableCount = 0 }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Parse-Version {
    param([string]$Value)
    if ($Value -match '^(\d+)\.(\d+)\.(\d+)$') {
        return [version]$Value
    }
    return $null
}

function Find-PackageRoot {
    param([string]$Staging)
    $direct = Join-Path $Staging 'package.json'
    if (Test-Path $direct) { return $Staging }
    $candidate = Get-ChildItem -Path $Staging -Filter 'package.json' -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object { $_.FullName.Split([IO.Path]::DirectorySeparatorChar).Count } |
        Select-Object -First 1
    if ($candidate) { return $candidate.Directory.FullName }
    return $null
}

function Process-ClipBoostZip {
    param(
        [Parameter(Mandatory=$true)]
        [System.IO.FileInfo]$ZipFile,
        [switch]$Force
    )

    $signature = Get-Signature $ZipFile
    if (-not $Force -and (Is-Processed $signature)) { return }
    if ($ZipFile.Name -notmatch '(?i)^clipboost.*\.zip$') { return }

    Write-Log "Detected: $($ZipFile.FullName)"
    Save-Status 'processing' "Detected $($ZipFile.Name)"

    if (-not (Wait-FileReady $ZipFile.FullName)) {
        Write-Log "File is still downloading or locked: $($ZipFile.Name)"
        Save-Status 'running' 'Waiting for completed download'
        return
    }

    $staging = Join-Path $env:TEMP ('ClipBoostAutoPublisher-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $staging | Out-Null

    try {
        Expand-Archive -LiteralPath $ZipFile.FullName -DestinationPath $staging -Force
        $packageRoot = Find-PackageRoot $staging
        if (-not $packageRoot) {
            Write-Log "Ignored helper ZIP (no package.json): $($ZipFile.Name)"
            Mark-Processed $signature
            Save-Status 'running' "Ignored non-app ZIP: $($ZipFile.Name)"
            return
        }

        $package = Get-Content (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json
        $newVersion = Parse-Version ([string]$package.version)
        if (-not $newVersion) {
            Write-Log "Ignored ZIP with invalid package version: $($ZipFile.Name)"
            Mark-Processed $signature
            return
        }

        if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { throw "Not a Git repository: $RepoRoot" }

        Push-Location $RepoRoot
        try {
            Write-Log 'Checking Git repository...'

            $branch = ((& git branch --show-current) -join '').Trim()
            if ($LASTEXITCODE -ne 0) { throw 'git branch --show-current failed' }
            if ($branch -ne 'main') {
                throw "Auto Publisher expects the repository to be on branch 'main', but current branch is '$branch'."
            }

            # Fetch only here. A strict pull --ff-only used to fail whenever local main
            # was already ahead of GitHub or had diverged. We safely reconcile after
            # the update is committed, when the worktree is clean.
            Invoke-GitCommand -GitArguments @('fetch','origin')

            $currentVersion = $null
            $currentPackagePath = Join-Path $RepoRoot 'package.json'
            if (Test-Path $currentPackagePath) {
                try {
                    $currentPackage = Get-Content $currentPackagePath -Raw | ConvertFrom-Json
                    $currentVersion = Parse-Version ([string]$currentPackage.version)
                } catch {}
            }

            $remoteVersion = $null
            try {
                $remotePackageJson = (& git show 'origin/main:package.json' 2>$null) -join "`n"
                if ($LASTEXITCODE -eq 0 -and $remotePackageJson) {
                    $remotePackage = $remotePackageJson | ConvertFrom-Json
                    $remoteVersion = Parse-Version ([string]$remotePackage.version)
                }
            } catch {}

            $highestExistingVersion = $currentVersion
            if ($remoteVersion -and ((-not $highestExistingVersion) -or $remoteVersion -gt $highestExistingVersion)) {
                $highestExistingVersion = $remoteVersion
            }
            if ($highestExistingVersion -and $newVersion -lt $highestExistingVersion) {
                Write-Log "Ignored older version $newVersion because repository/GitHub already has $highestExistingVersion."
                Mark-Processed $signature
                Save-Status 'running' "Ignored older v$newVersion"
                return
            }

            Write-Log "Applying ClipBoost v$newVersion..."
            $excludeDirs = @(
                (Join-Path $RepoRoot '.git'),
                (Join-Path $RepoRoot 'node_modules'),
                (Join-Path $RepoRoot 'storage'),
                (Join-Path $RepoRoot 'release'),
                (Join-Path $RepoRoot 'dist')
            )
            $copyArgs = @(
                $packageRoot, $RepoRoot,
                '/E','/R:2','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD'
            ) + $excludeDirs + @('/XF','.env')
            & robocopy @copyArgs | Out-Null
            $copyCode = $LASTEXITCODE
            if ($copyCode -ge 8) { throw "robocopy failed with exit code $copyCode" }

            Write-Log 'Installing npm dependencies...'
            & npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

            Invoke-GitCommand -GitArguments @('add','-A')
            $changes = (& git status --porcelain) -join "`n"
            if ($LASTEXITCODE -ne 0) { throw 'git status failed' }

            if ($changes.Trim()) {
                Invoke-GitCommand -GitArguments @('commit','-m',"Auto publish ClipBoost v$newVersion")
                Write-Log "Created Git commit for v$newVersion."
            } else {
                Write-Log "No new file changes for v$newVersion; checking push state."
            }

            # Re-fetch because GitHub may have moved while npm/install/build prep was
            # running. Reconcile main without deleting local commits or files.
            Invoke-GitCommand -GitArguments @('fetch','origin')
            $countsLine = ((& git rev-list --left-right --count 'HEAD...origin/main') -join ' ').Trim()
            if ($LASTEXITCODE -ne 0) { throw 'git rev-list failed while comparing local main with origin/main' }
            $parts = $countsLine -split '\s+'
            if ($parts.Count -lt 2) { throw "Unable to parse Git divergence state: $countsLine" }
            $ahead = [int]$parts[0]
            $behind = [int]$parts[1]

            Write-Log "Git state before push: local ahead=$ahead, behind=$behind"

            if ($behind -gt 0 -and $ahead -eq 0) {
                Write-Log 'GitHub is ahead; fast-forwarding local main...'
                Invoke-GitCommand -GitArguments @('merge','--ff-only','origin/main')
            }
            elseif ($behind -gt 0 -and $ahead -gt 0) {
                Write-Log 'Local main and GitHub both changed; rebasing local commits onto origin/main...'
                & git rebase origin/main
                if ($LASTEXITCODE -ne 0) {
                    & git rebase --abort 2>$null | Out-Null
                    throw 'Automatic rebase could not be completed. No local commit was deleted. Resolve the Git conflict once, then retry.'
                }
            }

            Invoke-GitCommand -GitArguments @('push','origin','main')
            Mark-Processed $signature
            Write-Log "SUCCESS: ClipBoost v$newVersion pushed to GitHub."
            Save-Status 'running' "Last push succeeded: v$newVersion"
        }
        finally { Pop-Location }
    }
    catch {
        $message = $_.Exception.Message
        Write-Log "ERROR: $message"
        Save-Status 'error' $message
        if ($Once) { throw }
    }
    finally {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($Once) {
    Save-Status 'processing' 'Manual one-shot check started'
    $zips = Get-ChildItem -LiteralPath $Downloads -Filter '*.zip' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '(?i)^clipboost.*\.zip$' } |
        Sort-Object LastWriteTimeUtc -Descending
    if (-not $zips) {
        Write-Host "No ClipBoost ZIP found in: $Downloads" -ForegroundColor Yellow
        Save-Status 'running' 'No ClipBoost ZIP found'
        exit 0
    }
    if ($ForceLatest) {
        # Check newest first, but continue past helper ZIPs such as the Auto Publisher
        # itself until every available ClipBoost package has been evaluated. Older app
        # versions are safely ignored by the version guard.
        foreach ($zip in $zips) { Process-ClipBoostZip -ZipFile $zip -Force }
    } else {
        foreach ($zip in $zips) { Process-ClipBoostZip -ZipFile $zip }
    }
    exit 0
}

# Background watcher single-instance guard.
if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid -match '^\d+$') {
        $existing = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
        if ($existing) { exit 0 }
    }
}
Set-Content -Path $PidFile -Value $PID -Encoding ASCII
Save-Status 'running' 'Watcher started'
Write-Log "Watcher started. Repo=$RepoRoot Downloads=$Downloads PID=$PID"

try {
    while ($true) {
        try {
            $zips = Get-ChildItem -LiteralPath $Downloads -Filter '*.zip' -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '(?i)^clipboost.*\.zip$' } |
                Sort-Object LastWriteTimeUtc
            foreach ($zip in $zips) { Process-ClipBoostZip -ZipFile $zip }
        } catch {
            $message = $_.Exception.Message
            Write-Log "Watcher loop error: $message"
            Save-Status 'error' $message
        }
        Start-Sleep -Seconds 5
    }
}
finally {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Save-Status 'stopped' 'Watcher stopped'
}
