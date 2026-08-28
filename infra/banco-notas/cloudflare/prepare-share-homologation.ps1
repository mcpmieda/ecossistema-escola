[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$TeacherEntraObjectId,
  [Parameter(Mandatory = $true)][string]$TeacherUpn,
  [switch]$ConfirmSyntheticWrites
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$generatedConfig = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$databaseBinding = 'BANCO_NOTAS_DB'
$expectedDatabaseName = 'banco-notas-homologation'
$teacherId = 'homologation-share-teacher-20260826'
$teacherModelId = 'homologation-share-model-20260826'
$schoolYearFallbackId = 'homologation-share-year-2026'

if (-not $ConfirmSyntheticWrites) {
  throw 'Esta preparação grava somente dados sintéticos no D1 de homologação. Execute novamente com -ConfirmSyntheticWrites.'
}
if ($TeacherEntraObjectId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') {
  throw 'TeacherEntraObjectId deve ser um UUID Entra válido.'
}
if ($TeacherUpn -notmatch '^[^@\s]+@[^@\s]+$') {
  throw 'TeacherUpn deve ser um UPN válido.'
}
if (-not (Test-Path -LiteralPath $generatedConfig)) {
  throw 'Config de homologação ausente. Execute provision-homologation.ps1 primeiro.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw 'CLOUDFLARE_API_TOKEN não está disponível.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID)) {
  throw 'CLOUDFLARE_ACCOUNT_ID não está disponível.'
}

$config = Get-Content -LiteralPath $generatedConfig -Raw | ConvertFrom-Json
$database = @($config.d1_databases) | Where-Object { $_.binding -eq $databaseBinding } | Select-Object -First 1
if (-not $database -or $database.database_name -ne $expectedDatabaseName) {
  throw "Preparação recusada: database_name deve ser exatamente $expectedDatabaseName."
}

$d1Endpoint = "https://api.cloudflare.com/client/v4/accounts/$($env:CLOUDFLARE_ACCOUNT_ID)/d1/database/$($database.database_id)/query"
$d1Headers = @{
  Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN"
  'Content-Type' = 'application/json'
}

function Invoke-D1 {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $body = @{ sql = $Sql } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Method Post -Uri $script:d1Endpoint -Headers $script:d1Headers -Body $body
  if (-not $response.success) {
    throw 'Cloudflare D1 retornou failure na preparação de compartilhamento.'
  }
  return $response
}

function Get-D1Rows {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $response = Invoke-D1 -Sql $Sql
  $rows = @()
  foreach ($entry in @($response.result)) {
    if ($null -ne $entry.results) { $rows += @($entry.results) }
  }
  return @($rows)
}

function Escape-SqlLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return $Value.Replace("'", "''")
}

$safeOid = Escape-SqlLiteral -Value $TeacherEntraObjectId.ToLowerInvariant()
$safeUpn = Escape-SqlLiteral -Value $TeacherUpn.ToUpperInvariant()

Invoke-D1 -Sql "INSERT OR IGNORE INTO school_years (id, year, name, starts_on, ends_on) VALUES ('$schoolYearFallbackId', 2026, 'Homologação sintética 2026', '2026-01-01', '2026-12-31');" | Out-Null
$yearRows = Get-D1Rows -Sql 'SELECT id FROM school_years WHERE year = 2026 LIMIT 2;'
if ($yearRows.Count -ne 1) { throw 'Ano letivo sintético 2026 não foi resolvido de forma unívoca.' }
$schoolYearId = Escape-SqlLiteral -Value ([string]$yearRows[0].id)

$existingIdentity = Get-D1Rows -Sql "SELECT id FROM teachers WHERE entra_object_id = '$safeOid' LIMIT 2;"
if ($existingIdentity.Count -gt 1) { throw 'OID Entra não é unívoco no D1 de homologação.' }
if ($existingIdentity.Count -eq 1 -and [string]$existingIdentity[0].id -ne $teacherId) {
  throw 'OID Entra já está vinculado a outro professor no D1 de homologação.'
}

Invoke-D1 -Sql "INSERT INTO teachers (id, external_id, display_name, status, entra_object_id) VALUES ('$teacherId', '$safeUpn', 'Docente sintético de homologação', 'active', '$safeOid') ON CONFLICT(id) DO UPDATE SET external_id = excluded.external_id, display_name = excluded.display_name, status = 'active', entra_object_id = excluded.entra_object_id, updated_at = CURRENT_TIMESTAMP;" | Out-Null
Invoke-D1 -Sql "INSERT INTO teacher_models (id, school_year_id, teacher_id, state, sync_enabled, environment) VALUES ('$teacherModelId', '$schoolYearId', '$teacherId', 'ready_to_share', 0, 'homologation') ON CONFLICT(id) DO UPDATE SET state = 'ready_to_share', sync_enabled = 0, environment = 'homologation', updated_at = CURRENT_TIMESTAMP;" | Out-Null

$verified = Get-D1Rows -Sql "SELECT teacher.entra_object_id, teacher.status, model.state, model.sync_enabled, model.environment FROM teachers teacher JOIN teacher_models model ON model.teacher_id = teacher.id WHERE teacher.id = '$teacherId' AND model.id = '$teacherModelId';"
if ($verified.Count -ne 1) { throw 'Vínculo sintético professor/modelo não foi persistido.' }
if ([string]$verified[0].entra_object_id -ne $safeOid) { throw 'OID persistido diverge do OID autorizado.' }
if ([string]$verified[0].status -ne 'active') { throw 'Professor sintético não ficou ativo.' }
if ([string]$verified[0].state -ne 'ready_to_share') { throw 'Modelo sintético não ficou ready_to_share.' }
if ([int]$verified[0].sync_enabled -ne 0) { throw 'Modelo sintético não permaneceu com sync desligado.' }
if ([string]$verified[0].environment -ne 'homologation') { throw 'Modelo sintético saiu de homologation.' }

Write-Host 'PASS: vínculo sintético professor/modelo preparado no D1 de homologação.'
Write-Host 'PASS: OID autorizado corresponde ao vínculo persistido.'
Write-Host 'PASS: environment=homologation e sync_enabled=0.'
