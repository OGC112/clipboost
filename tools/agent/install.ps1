param([string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$RepoPath = (Resolve-Path $RepoPath).Path
$worker = Join-Path $PSScriptRoot 'worker.ps1'
$argsLine = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -RepoPath "' + $RepoPath + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argsLine
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$daily = New-ScheduledTaskTrigger -Daily -At '12:00'
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName 'ClipBoost Local Agent' -Action $action -Trigger @($logon, $daily) -Principal $principal -Settings $settings -Description 'Persistent local ClipBoost Codex worker; no daily cycle cap, isolated Git branches, no auto-merge.' -Force | Out-Null
Write-Host 'ClipBoost continuous worker installed: logon start, daily 12:00 fallback, one instance while logged in.'
Write-Host 'Manual test: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\worker.ps1 -PauseMinutes 10'
Write-Host 'Stop running task: Stop-ScheduledTask -TaskName "ClipBoost Local Agent"'

# Separate local summaries continue to work even when the Codex worker is paused.
$reporter = Join-Path $PSScriptRoot 'report.ps1'
$reportSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew -StartWhenAvailable
$dailyAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $reporter + '" -Period Daily')
$weeklyAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $reporter + '" -Period Weekly')
$dailyReportTrigger = New-ScheduledTaskTrigger -Daily -At '20:00'
$weeklyReportTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '20:10'
Register-ScheduledTask -TaskName 'ClipBoost Agent Daily Report' -Action $dailyAction -Trigger $dailyReportTrigger -Principal $principal -Settings $reportSettings -Description 'Save a local Markdown summary of ClipBoost agent changes each evening.' -Force | Out-Null
Register-ScheduledTask -TaskName 'ClipBoost Agent Weekly Report' -Action $weeklyAction -Trigger $weeklyReportTrigger -Principal $principal -Settings $reportSettings -Description 'Save a local weekly Markdown summary of ClipBoost agent changes.' -Force | Out-Null
Write-Host 'Local reports scheduled: daily at 20:00; weekly Sunday at 20:10.'
Write-Host 'Reports folder: %LOCALAPPDATA%\ClipBoostAgent\reports'
