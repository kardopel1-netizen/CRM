# Registers Windows Task Scheduler job for CRM automation tick (every 15 minutes).
# Run PowerShell as the user that should own the task (or elevated if needed).
# Usage:
#   .\scripts\register-tick-task.ps1
#   .\scripts\register-tick-task.ps1 -BaseUrl http://127.0.0.1:3000

param(
  [string]$TaskName = "AureliaCRM-JobsTick",
  [string]$BaseUrl = $(if ($env:CRM_BASE_URL) { $env:CRM_BASE_URL } else { "http://localhost:3000" }),
  [string]$ApiKey = $(
    if ($env:JOBS_API_KEY) { $env:JOBS_API_KEY }
    elseif ($env:LEAD_INGEST_API_KEY) { $env:LEAD_INGEST_API_KEY }
    else { "dev-lead-key-change-me" }
  ),
  [int]$Minutes = 15
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$tickScript = Join-Path $PSScriptRoot "tick.ps1"

if (-not (Test-Path $tickScript)) {
  throw "Не найден $tickScript"
}

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$tickScript`" -BaseUrl `"$BaseUrl`" -ApiKey `"$ApiKey`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Задача '$TaskName' зарегистрирована (каждые $Minutes мин → $BaseUrl/api/jobs/tick)."
Write-Host "Проверка: Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "Удаление: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
