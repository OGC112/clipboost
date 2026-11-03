param(
  [ValidateSet('Daily', 'Weekly')]
  [string]$Period = 'Daily',
  [datetime]$Date = (Get-Date)
)
$ErrorActionPreference = 'Stop'
$homeDir = Join-Path $env:LOCALAPPDATA 'ClipBoostAgent'
$progressPath = Join-Path $homeDir 'progress.json'
$reportsDir = Join-Path $homeDir 'reports'
$logsDir = Join-Path $homeDir 'logs'
New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

if ($Period -eq 'Daily') {
  $start = $Date.Date
  $end = $start.AddDays(1)
  $label = $start.ToString('yyyy-MM-dd')
  $heading = 'Daily'
} else {
  $offset = ([int]$Date.DayOfWeek + 6) % 7
  $start = $Date.Date.AddDays(-$offset)
  $end = $start.AddDays(7)
  $label = $start.ToString('yyyy-MM-dd') + '_to_' + $end.AddDays(-1).ToString('yyyy-MM-dd')
  $heading = 'Weekly'
}

$progress = [pscustomobject]@{ published = @(); blocked = @(); discovery_runs = @() }
if (Test-Path -LiteralPath $progressPath) {
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    try {
      $progress = Get-Content -LiteralPath $progressPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      break
    } catch {
      if ($attempt -eq 2) { throw "Cannot read progress.json after retries: $($_.Exception.Message)" }
      Start-Sleep -Seconds 2
    }
  }
}
function In-Range($entry) {
  if ($null -eq $entry -or -not $entry.recorded_at) { return $false }
  try {
    $when = [datetimeoffset]::Parse([string]$entry.recorded_at).ToLocalTime().DateTime
    return ($when -ge $start -and $when -lt $end)
  } catch { return $false }
}
function Read-ReportExcerpt($entry) {
  if (-not $entry.report) { return 'No detailed agent report recorded.' }
  $path = [string]$entry.report
  $full = [System.IO.Path]::GetFullPath($path)
  $root = [System.IO.Path]::GetFullPath($logsDir).TrimEnd('\') + '\'
  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return 'Report path outside the agent logs directory; omitted.'
  }
  if (-not (Test-Path -LiteralPath $full)) { return 'Detailed report not found on this PC.' }
  try {
    $raw = (Get-Content -LiteralPath $full -Raw -ErrorAction Stop).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { return 'Detailed report is empty.' }
    if ($raw.Length -gt 1800) { return $raw.Substring(0, 1800) + "`n`n[Excerpt shortened; open the full report in logs.]" }
    return $raw
  } catch { return 'Detailed report could not be read.' }
}
function Escape-Md($value) {
  return ([string]$value).Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ')
}
$published = @($progress.published | Where-Object { In-Range $_ })
$blocked = @($progress.blocked | Where-Object { In-Range $_ })
$discovery = @($progress.discovery_runs | Where-Object {
  if (-not $_ -or -not $_.started_at) { return $false }
  try {
    $when = [datetimeoffset]::Parse([string]$_.started_at).ToLocalTime().DateTime
    return ($when -ge $start -and $when -lt $end)
  } catch { return $false }
})
$lines = New-Object 'System.Collections.Generic.List[string]'
[void]$lines.Add("# ClipBoost Agent - $heading report")
[void]$lines.Add('')
[void]$lines.Add("Period: $($start.ToString('yyyy-MM-dd')) to $($end.AddDays(-1).ToString('yyyy-MM-dd')) (PC local time)")
[void]$lines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$lines.Add('')
[void]$lines.Add('## Overview')
[void]$lines.Add('')
[void]$lines.Add("- Published branches requiring review: **$($published.Count)**")
[void]$lines.Add("- Blocked/no-change investigations: **$($blocked.Count)**")
[void]$lines.Add("- Autonomous discovery attempts recorded: **$($discovery.Count)**")
[void]$lines.Add('')
[void]$lines.Add('**Important:** Published means committed and pushed to an agent branch, NOT merged into main, installed in ClipBoost, or verified in the Windows GUI. Tests and builds are described only when recorded in an agent report.')
[void]$lines.Add('')
[void]$lines.Add('## Improvements published')
[void]$lines.Add('')
if ($published.Count -eq 0) {
  [void]$lines.Add('No branches published during this period.')
} else {
  foreach ($item in $published) {
    $id = Escape-Md $item.id
    $branchName = [string]$item.branch
    [void]$lines.Add("### $id")
    [void]$lines.Add('')
    if ($branchName -match '^agent/[a-zA-Z0-9/_-]+$') {
      [void]$lines.Add("- GitHub branch: [$branchName](https://github.com/OGC112/clipboost/tree/$branchName)")
      [void]$lines.Add("- Open review: https://github.com/OGC112/clipboost/compare/main...$branchName")
    } else {
      [void]$lines.Add("- Branch: $(Escape-Md $branchName)")
    }
    [void]$lines.Add("- Recorded: $(Escape-Md $item.recorded_at)")
    [void]$lines.Add('')
    [void]$lines.Add('Agent report excerpt (not independently validated):')
    [void]$lines.Add('')
    [void]$lines.Add('~~~text')
    [void]$lines.Add((Read-ReportExcerpt $item))
    [void]$lines.Add('~~~')
    [void]$lines.Add('')
  }
}
[void]$lines.Add('## Investigations with no published change')
[void]$lines.Add('')
if ($blocked.Count -eq 0) {
  [void]$lines.Add('None recorded.')
} else {
  foreach ($item in $blocked) {
    [void]$lines.Add("### $(Escape-Md $item.id)")
    [void]$lines.Add('')
    [void]$lines.Add("- Reason: $(Escape-Md $item.reason)")
    [void]$lines.Add("- Recorded: $(Escape-Md $item.recorded_at)")
    [void]$lines.Add('')
    [void]$lines.Add('~~~text')
    [void]$lines.Add((Read-ReportExcerpt $item))
    [void]$lines.Add('~~~')
    [void]$lines.Add('')
  }
}
[void]$lines.Add('## Discovery focus areas explored')
[void]$lines.Add('')
if ($discovery.Count -eq 0) {
  [void]$lines.Add('None recorded.')
} else {
  foreach ($entry in $discovery) {
    [void]$lines.Add("- $(Escape-Md $entry.focus) - $(Escape-Md $entry.started_at)")
  }
}
[void]$lines.Add('')
[void]$lines.Add('## Next steps')
[void]$lines.Add('')
[void]$lines.Add('Review the published branches, check relevant tests, and validate affected features in the Windows app before merging. Stacked branches may depend on earlier agent branches.')
[void]$lines.Add('')
[void]$lines.Add('Source: local ClipBoostAgent progress.json and saved Codex reports. This is a local summary; it does not independently query GitHub for merge status.')
$fileName = if ($Period -eq 'Daily') { "daily-$label.md" } else { "weekly-$label.md" }
$destination = Join-Path $reportsDir $fileName
$latest = Join-Path $reportsDir ("latest-" + $Period.ToLowerInvariant() + ".md")
$body = $lines -join [Environment]::NewLine
Set-Content -LiteralPath $destination -Value $body -Encoding UTF8
Set-Content -LiteralPath $latest -Value $body -Encoding UTF8
Write-Host "ClipBoost $Period report created: $destination"
Write-Host "Latest report: $latest"
