# sample_process.ps1 — record a running server's memory, threads and handles
# over time (Phase 8 soak tests). Finds the newest `python ... app.py` process
# started after -Since, samples it every -Every seconds until it exits or
# -Minutes pass, and writes CSV to -Out.
#
#   powershell -File scripts/sample_process.ps1 -Out soak.csv -Minutes 15
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Minutes = 15,
  [int]$Every = 30,
  [datetime]$Since = (Get-Date).AddMinutes(-10)
)
$deadline = (Get-Date).AddMinutes($Minutes)
$proc = $null
while (-not $proc -and (Get-Date) -lt $deadline) {
  $proc = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -match 'app\.py' -and $_.CreationDate -gt $Since } |
    Sort-Object CreationDate -Descending | Select-Object -First 1
  if (-not $proc) { Start-Sleep -Seconds 2 }
}
if (-not $proc) { Write-Error "no app.py process found"; exit 1 }
"minute,working_set_mb,private_mb,threads,handles,cpu_s" | Set-Content -Encoding utf8 $Out
$start = Get-Date
while ((Get-Date) -lt $deadline) {
  $p = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { break }
  $m = [math]::Round(((Get-Date) - $start).TotalMinutes, 2)
  $row = @($m, [math]::Round($p.WorkingSet64 / 1MB, 1), [math]::Round($p.PrivateMemorySize64 / 1MB, 1),
           $p.Threads.Count, $p.HandleCount, [math]::Round($p.CPU, 1))
  ($row | ForEach-Object { [string]::Format([cultureinfo]::InvariantCulture, "{0}", $_) }) -join "," |
    Add-Content -Encoding utf8 $Out
  Start-Sleep -Seconds $Every
}
