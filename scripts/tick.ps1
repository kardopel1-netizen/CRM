# Calls CRM automation tick (reminders + escalation).
# Usage:
#   .\scripts\tick.ps1
#   .\scripts\tick.ps1 -BaseUrl http://localhost:3000 -ApiKey "your-key"

param(
  [string]$BaseUrl = $(if ($env:CRM_BASE_URL) { $env:CRM_BASE_URL } else { "http://localhost:3000" }),
  [string]$ApiKey = $(
    if ($env:JOBS_API_KEY) { $env:JOBS_API_KEY }
    elseif ($env:LEAD_INGEST_API_KEY) { $env:LEAD_INGEST_API_KEY }
    else { "dev-lead-key-change-me" }
  )
)

$uri = ($BaseUrl.TrimEnd("/")) + "/api/jobs/tick"

Write-Host "POST $uri"
try {
  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ "x-api-key" = $ApiKey } -ContentType "application/json"
  $response | ConvertTo-Json -Depth 6
  if (-not $response.ok) { exit 1 }
} catch {
  Write-Error $_
  exit 1
}
