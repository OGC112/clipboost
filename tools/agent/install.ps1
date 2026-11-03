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
Register-ScheduledTask -TaskName 'ClipBoost Local Agent' -Action $action -Trigger @($logon, $daily) -Principal $principal -Settings $settings -Description 'Persistent local ClipBoost Codex worker; capped cycles, isolated Git branches, no auto-merge.' -Force | Out-Null
Write-Host 'ClipBoost continuous worker installed: logon start, daily 12:00 fallback, one instance while logged in.'
Write-Host 'Manual test: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\worker.ps1 -MaxCyclesPerDay 2'
Write-Host 'Stop running task: Stop-ScheduledTask -TaskName "ClipBoost Local Agent"'
