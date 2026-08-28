[CmdletBinding()]
param(
  [switch]$ConfirmSyntheticWrites
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$generatedConfig = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$databaseBinding = 'BANCO_NOTAS_DB'
$expectedDatabaseName = 'banco-notas-homologation'

if (-not $ConfirmSyntheticWrites) {
  throw 'Este smoke grava evidência sintética append-only no D1 de homologação. Execute novamente com -ConfirmSyntheticWrites.'
}
if (-not (Test-Path -LiteralPath $generatedConfig)) {
  throw 'Config de homologação ausente. Execute provision-homologation.ps1 somente após autorização explícita para o D1 remoto.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw 'CLOUDFLARE_API_TOKEN não está disponível para o smoke remoto.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID)) {
  throw 'CLOUDFLARE_ACCOUNT_ID não está disponível para o smoke remoto.'
}

$config = Get-Content -LiteralPath $generatedConfig -Raw | ConvertFrom-Json
$database = @($config.d1_databases) | Where-Object { $_.binding -eq $databaseBinding } | Select-Object -First 1
if (-not $database) {
  throw "Binding $databaseBinding não encontrado na configuração de homologação."
}
if ($database.database_name -ne $expectedDatabaseName) {
  throw "Smoke recusado: database_name deve ser exatamente $expectedDatabaseName."
}
if ([string]::IsNullOrWhiteSpace([string]$database.database_id)) {
  throw 'database_id do D1 de homologação não está disponível.'
}

$d1Endpoint = "https://api.cloudflare.com/client/v4/accounts/$($env:CLOUDFLARE_ACCOUNT_ID)/d1/database/$($database.database_id)/query"
$d1Headers = @{
  Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN"
  'Content-Type' = 'application/json'
}

function Invoke-D1 {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [switch]$AllowFailure
  )

  $body = @{ sql = $Sql } | ConvertTo-Json -Compress
  try {
    $response = Invoke-RestMethod -Method Post -Uri $script:d1Endpoint -Headers $script:d1Headers -Body $body
    $serialized = $response | ConvertTo-Json -Depth 20 -Compress
    if (-not $response.success) {
      if ($AllowFailure) {
        return [pscustomobject]@{ ExitCode = 1; Stdout = ''; Stderr = $serialized; Combined = $serialized }
      }
      throw "Cloudflare D1 retornou failure: $serialized"
    }
    return [pscustomobject]@{ ExitCode = 0; Stdout = $serialized; Stderr = ''; Combined = $serialized }
  }
  catch {
    $details = $_.ErrorDetails.Message
    if ([string]::IsNullOrWhiteSpace($details)) {
      $details = $_.Exception.Message
    }
    if ($AllowFailure) {
      return [pscustomobject]@{ ExitCode = 1; Stdout = ''; Stderr = $details; Combined = $details }
    }
    throw "Cloudflare D1 falhou: $details"
  }
}

function Get-D1Rows {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $result = Invoke-D1 -Sql $Sql
  try {
    $parsed = $result.Stdout | ConvertFrom-Json
  }
  catch {
    throw "Cloudflare não retornou JSON válido para a consulta: $($result.Stdout)"
  }

  $rows = @()
  foreach ($entry in @($parsed.result)) {
    if ($null -ne $entry.results) {
      $rows += @($entry.results)
    }
  }
  return @($rows)
}

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if (-not $Condition) { throw "SMOKE FAILED: $Message" }
}

function Assert-D1Failure {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$ExpectedMessage,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $result = Invoke-D1 -Sql $Sql -AllowFailure
  Assert-True -Condition ($result.ExitCode -ne 0) -Message "$Label deveria falhar."
  Assert-True -Condition ($result.Combined -match [regex]::Escape($ExpectedMessage)) -Message "$Label falhou por motivo inesperado: $($result.Combined)"
  Write-Host "PASS: $Label"
}

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][string]$Value)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

Write-Host "Validando D1 remoto: $expectedDatabaseName"

$tables = Get-D1Rows -Sql "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('school_years','data_sources','source_assignments','import_jobs','import_analyses','import_finding_resolutions');"
Assert-True -Condition ([int]$tables[0].total -eq 6) -Message 'Tabelas esperadas das migrations base não estão completas.'

$migrations = Get-D1Rows -Sql "SELECT COUNT(*) AS total FROM d1_migrations WHERE name LIKE '000%'; SELECT COUNT(*) AS analysis_migration FROM d1_migrations WHERE name LIKE '0005_banco_notas_import_analysis%'; SELECT COUNT(*) AS identity_migration FROM d1_migrations WHERE name LIKE '0007_banco_notas_teacher_entra_identity%';"
Assert-True -Condition ([int]$migrations[0].total -ge 7) -Message 'Menos de sete migrations Banco de Notas constam como aplicadas.'
Assert-True -Condition ([int]$migrations[1].analysis_migration -eq 1) -Message 'Migration 0005 não consta como aplicada.'
Assert-True -Condition ([int]$migrations[2].identity_migration -eq 1) -Message 'Migration 0007 não consta como aplicada.'
Write-Host 'PASS: schema e migrations 0001-0007'

$availableYears = Get-D1Rows -Sql "WITH RECURSIVE years(year) AS (SELECT 2200 UNION ALL SELECT year - 1 FROM years WHERE year > 2000) SELECT year FROM years WHERE NOT EXISTS (SELECT 1 FROM school_years current WHERE current.year = years.year) LIMIT 2;"
Assert-True -Condition ($availableYears.Count -eq 2) -Message 'Não há dois anos sintéticos livres para o smoke.'
$primaryYear = [int]$availableYears[0].year
$secondaryYear = [int]$availableYears[1].year

$runToken = "$(Get-Date -AsUTC -Format 'yyyyMMddHHmmss')-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$prefix = "smoke-$runToken"
$primaryYearId = "$prefix-year-primary"
$secondaryYearId = "$prefix-year-secondary"
$teacherId = "$prefix-teacher"
$otherTeacherId = "$prefix-teacher-other"
$teacherModelId = "$prefix-teacher-model"
$entraObjectId = [guid]::NewGuid().ToString()
$replacementEntraObjectId = [guid]::NewGuid().ToString()
$sourceId = "$prefix-source"
$assignmentId = "$prefix-authority"
$referenceAssignmentId = "$prefix-reference"
$overlapAssignmentId = "$prefix-overlap"
$crossYearAssignmentId = "$prefix-cross-year"
$jobId = "$prefix-job"
$analysisId = "$prefix-analysis"
$findingId = "$prefix-finding"
$resolutionId = "$prefix-resolution"
$sourceHash = Get-Sha256Hex -Value "$prefix-source-workbook"
$wrongHash = Get-Sha256Hex -Value "$prefix-wrong-workbook"

Invoke-D1 -Sql "INSERT INTO school_years (id, year, name, starts_on, ends_on) VALUES ('$primaryYearId', $primaryYear, 'SMOKE $runToken', '$primaryYear-01-01', '$primaryYear-12-31');" | Out-Null
Invoke-D1 -Sql "INSERT INTO school_years (id, year, name, starts_on, ends_on) VALUES ('$secondaryYearId', $secondaryYear, 'SMOKE secondary $runToken', '$secondaryYear-01-01', '$secondaryYear-12-31');" | Out-Null
Invoke-D1 -Sql "INSERT INTO teachers (id, display_name) VALUES ('$teacherId', 'Pessoa sintética smoke $runToken');" | Out-Null
Invoke-D1 -Sql "INSERT INTO teachers (id, display_name) VALUES ('$otherTeacherId', 'Outra pessoa sintética smoke $runToken');" | Out-Null
Invoke-D1 -Sql "INSERT INTO teacher_models (id, school_year_id, teacher_id, state, sync_enabled, environment) VALUES ('$teacherModelId', '$primaryYearId', '$teacherId', 'connected', 0, 'homologation');" | Out-Null

Assert-D1Failure -Label 'teacher model sync without Entra identity' -ExpectedMessage 'teacher model entra identity required for sync' -Sql "UPDATE teacher_models SET sync_enabled = 1 WHERE id = '$teacherModelId';"
$modelSync = Get-D1Rows -Sql "SELECT sync_enabled FROM teacher_models WHERE id = '$teacherModelId';"
Assert-True -Condition ([int]$modelSync[0].sync_enabled -eq 0) -Message 'Falha de identidade não pode deixar sync habilitado.'

Invoke-D1 -Sql "UPDATE teachers SET entra_object_id = '$entraObjectId' WHERE id = '$teacherId';" | Out-Null
$identity = Get-D1Rows -Sql "SELECT entra_object_id FROM teachers WHERE id = '$teacherId';"
Assert-True -Condition ($identity[0].entra_object_id -eq $entraObjectId) -Message 'Identidade Entra sintética não foi persistida.'
Assert-D1Failure -Label 'duplicate teacher Entra identity' -ExpectedMessage 'UNIQUE constraint failed' -Sql "UPDATE teachers SET entra_object_id = '$entraObjectId' WHERE id = '$otherTeacherId';"
Write-Host 'PASS: identidade Entra é única e necessária antes de sync'

Invoke-D1 -Sql "UPDATE teacher_models SET sync_enabled = 1 WHERE id = '$teacherModelId';" | Out-Null
Assert-D1Failure -Label 'teacher Entra identity change while sync enabled' -ExpectedMessage 'teacher entra identity locked while sync enabled' -Sql "UPDATE teachers SET entra_object_id = '$replacementEntraObjectId' WHERE id = '$teacherId';"
Assert-D1Failure -Label 'teacher deactivation while sync enabled' -ExpectedMessage 'active teacher required while sync enabled' -Sql "UPDATE teachers SET status = 'inactive' WHERE id = '$teacherId';"
$protectedIdentity = Get-D1Rows -Sql "SELECT teacher.entra_object_id, teacher.status, model.sync_enabled FROM teachers teacher JOIN teacher_models model ON model.teacher_id = teacher.id WHERE teacher.id = '$teacherId' AND model.id = '$teacherModelId';"
Assert-True -Condition ($protectedIdentity[0].entra_object_id -eq $entraObjectId) -Message 'Falha de troca de identidade não pode alterar o Entra OID protegido.'
Assert-True -Condition ($protectedIdentity[0].status -eq 'active') -Message 'Falha de inativação não pode deixar professor em status inválido.'
Assert-True -Condition ([int]$protectedIdentity[0].sync_enabled -eq 1) -Message 'Modelo deveria permanecer temporariamente em sync durante o teste dos locks.'

Invoke-D1 -Sql "UPDATE teacher_models SET sync_enabled = 0 WHERE id = '$teacherModelId'; UPDATE teachers SET entra_object_id = '$replacementEntraObjectId', status = 'inactive' WHERE id = '$teacherId';" | Out-Null
$safeFinalIdentity = Get-D1Rows -Sql "SELECT teacher.entra_object_id, teacher.status, model.sync_enabled FROM teachers teacher JOIN teacher_models model ON model.teacher_id = teacher.id WHERE teacher.id = '$teacherId' AND model.id = '$teacherModelId';"
Assert-True -Condition ($safeFinalIdentity[0].entra_object_id -eq $replacementEntraObjectId) -Message 'Identidade não pôde ser atualizada depois de desligar sync.'
Assert-True -Condition ($safeFinalIdentity[0].status -eq 'inactive') -Message 'Professor não pôde ser inativado depois de desligar sync.'
Assert-True -Condition ([int]$safeFinalIdentity[0].sync_enabled -eq 0) -Message 'Smoke deve terminar com sync desligado.'
Write-Host 'PASS: identidade e status ficam bloqueados durante sync; estado final permanece sync_enabled=0'

Invoke-D1 -Sql "INSERT INTO data_sources (id, school_year_id, type, name, description, created_by) VALUES ('$sourceId', '$primaryYearId', 'legacy_import', 'SMOKE source $runToken', 'Dado sintético de homologação', 'smoke-remote');" | Out-Null

$defaults = Get-D1Rows -Sql "SELECT environment, migration_state, status FROM data_sources WHERE id = '$sourceId';"
Assert-True -Condition ($defaults[0].environment -eq 'homologation') -Message 'Data source não nasceu em homologation.'
Assert-True -Condition ($defaults[0].migration_state -eq 'not_started') -Message 'Migration state default inesperado.'
Assert-True -Condition ($defaults[0].status -eq 'active') -Message 'Status default inesperado.'
Write-Host 'PASS: defaults seguros da fonte'

Invoke-D1 -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, effective_from, operator_id, reason) VALUES ('$assignmentId', '$primaryYearId', '$sourceId', 'school_year_default', '$primaryYear-01-01', 'smoke-remote', 'Smoke de autoridade');" | Out-Null
$authority = Get-D1Rows -Sql "SELECT authority, sync_enabled, status FROM source_assignments WHERE id = '$assignmentId';"
Assert-True -Condition ($authority[0].authority -eq 'authoritative') -Message 'Authority default inesperado.'
Assert-True -Condition ([int]$authority[0].sync_enabled -eq 0) -Message 'sync_enabled deve nascer desligado.'
Assert-True -Condition ($authority[0].status -eq 'active') -Message 'Source assignment não nasceu ativo.'
Write-Host 'PASS: authority e sync default'

Assert-D1Failure -Label 'overlap authoritative' -ExpectedMessage 'authoritative source assignment overlap' -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, effective_from, operator_id, reason) VALUES ('$overlapAssignmentId', '$primaryYearId', '$sourceId', 'school_year_default', '$primaryYear-06-01', 'smoke-remote', 'Overlap sintético');"

Invoke-D1 -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason) VALUES ('$referenceAssignmentId', '$primaryYearId', '$sourceId', 'school_year_default', 'reference_only', '$primaryYear-06-01', 'smoke-remote', 'Referência sintética permitida');" | Out-Null
Write-Host 'PASS: reference_only pode coexistir sem tomar autoridade'

Assert-D1Failure -Label 'cross-year source assignment' -ExpectedMessage 'source assignment year mismatch' -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, effective_from, operator_id, reason) VALUES ('$crossYearAssignmentId', '$secondaryYearId', '$sourceId', 'school_year_default', '$secondaryYear-01-01', 'smoke-remote', 'Cross-year deve falhar');"

Invoke-D1 -Sql "INSERT INTO import_jobs (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by) VALUES ('$jobId', '$primaryYearId', '$teacherId', '$sourceId', '$prefix-idempotency', '$sourceHash', json_object('sourceFormat','xlsx','smoke',1), 'smoke-remote');" | Out-Null

Assert-D1Failure -Label 'state jump draft to generated' -ExpectedMessage 'invalid import job state transition' -Sql "UPDATE import_jobs SET state = 'generated' WHERE id = '$jobId';"
Assert-D1Failure -Label 'analyzed without persisted analysis' -ExpectedMessage 'import job analysis artifact required' -Sql "UPDATE import_jobs SET state = 'analyzed' WHERE id = '$jobId';"
Assert-D1Failure -Label 'analysis provenance mismatch' -ExpectedMessage 'import analysis provenance mismatch' -Sql "INSERT INTO import_analyses (id, import_job_id, analyzer_id, analysis_version, source_hash, source_format, school_year, model_json, created_by) VALUES ('$analysisId-bad', '$jobId', 'smoke-xlsx-analyzer', 'smoke-1', '$wrongHash', 'xlsx', $primaryYear, json_object('schemaVersion',1,'smoke',1), 'smoke-remote');"

Invoke-D1 -Sql "INSERT INTO import_analyses (id, import_job_id, analyzer_id, analysis_version, source_hash, source_format, school_year, model_json, created_by) VALUES ('$analysisId', '$jobId', 'smoke-xlsx-analyzer', 'smoke-1', '$sourceHash', 'xlsx', $primaryYear, json_object('schemaVersion',1,'smoke',1), 'smoke-remote');" | Out-Null
Invoke-D1 -Sql "UPDATE import_jobs SET state = 'analyzed' WHERE id = '$jobId';" | Out-Null
$analyzed = Get-D1Rows -Sql "SELECT state FROM import_jobs WHERE id = '$jobId'; SELECT COUNT(*) AS total FROM import_analyses WHERE import_job_id = '$jobId';"
Assert-True -Condition ($analyzed[0].state -eq 'analyzed') -Message 'Job não alcançou analyzed após análise válida.'
Assert-True -Condition ([int]$analyzed[1].total -eq 1) -Message 'Artefato de análise não foi persistido exatamente uma vez.'
Write-Host 'PASS: análise persistente habilita analyzed'

Assert-D1Failure -Label 'analysis append-only update' -ExpectedMessage 'import_analyses are append-only' -Sql "UPDATE import_analyses SET analyzer_id = 'tampered' WHERE id = '$analysisId';"
Assert-D1Failure -Label 'analysis append-only delete' -ExpectedMessage 'import_analyses are append-only' -Sql "DELETE FROM import_analyses WHERE id = '$analysisId';"
Assert-D1Failure -Label 'state re-entry' -ExpectedMessage 'import job state re-entry is not allowed' -Sql "UPDATE import_jobs SET state = 'analyzed' WHERE id = '$jobId';"

Invoke-D1 -Sql "INSERT INTO import_findings (id, import_job_id, severity, code, location_json, details_json) VALUES ('$findingId', '$jobId', 'warning', 'smoke_warning', json_object('smoke',1), json_object('message','finding sintético'));" | Out-Null
Invoke-D1 -Sql "INSERT INTO import_finding_resolutions (id, import_finding_id, resolved_by, reason, resolved_at) VALUES ('$resolutionId', '$findingId', 'smoke-remote', 'Resolução sintética', '$(Get-Date -AsUTC -Format 'yyyy-MM-ddTHH:mm:ss.fffZ')');" | Out-Null
Assert-D1Failure -Label 'finding resolution append-only' -ExpectedMessage 'import_finding_resolutions are append-only' -Sql "UPDATE import_finding_resolutions SET reason = 'tampered' WHERE id = '$resolutionId';"
Assert-D1Failure -Label 'finding append-only' -ExpectedMessage 'import_findings are append-only' -Sql "UPDATE import_findings SET code = 'tampered' WHERE id = '$findingId';"
Write-Host 'PASS: finding e resolução preservam histórico append-only'

Invoke-D1 -Sql "DELETE FROM source_assignments WHERE id IN ('$assignmentId', '$referenceAssignmentId');" | Out-Null
Invoke-D1 -Sql "DELETE FROM school_years WHERE id = '$secondaryYearId';" | Out-Null

Write-Host ''
Write-Host 'SMOKE REMOTO CONCLUÍDO.'
Write-Host "Run token: $runToken"
Write-Host "Job sintético preservado como evidência append-only: $jobId"
Write-Host 'Este script não provisiona D1, não aplica migrations, não toca produção e não habilita sync.'
