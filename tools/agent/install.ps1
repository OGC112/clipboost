param([string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$RepoPath = (Resolve-Path $RepoPath).Path
$runner = Join-Path $PSScriptRoot 'run.ps1'
$argsLine = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $runner + '" -RepoPath "' + $RepoPath + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argsLine
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$daily = New-ScheduledTaskTrigger -Daily -At '12:00'
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ClipBoost Local Agent' -Action $action -Trigger @($logon, $daily) -Principal $principal -Description 'Local ClipBoost Codex maintenance; isolated Git branches, no auto-merge.' -Force | Out-Null
Write-Host 'ClipBoost Local Agent scheduled at logon and daily 12:00 while logged in.'
Write-Host 'Try it now: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\run.ps1'
