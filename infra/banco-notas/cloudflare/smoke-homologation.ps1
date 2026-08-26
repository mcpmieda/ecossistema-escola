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

$config = Get-Content -LiteralPath $generatedConfig -Raw | ConvertFrom-Json
$database = @($config.d1_databases) | Where-Object { $_.binding -eq $databaseBinding } | Select-Object -First 1
if (-not $database) {
  throw "Binding $databaseBinding não encontrado na configuração de homologação."
}
if ($database.database_name -ne $expectedDatabaseName) {
  throw "Smoke recusado: database_name deve ser exatamente $expectedDatabaseName."
}

function Invoke-D1 {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [switch]$AllowFailure
  )

  $tempBase = Join-Path ([System.IO.Path]::GetTempPath()) "banco-notas-smoke-$([guid]::NewGuid().ToString('N'))"
  $sqlPath = "$tempBase.sql"
  $stderrPath = "$tempBase.stderr"
  try {
    [IO.File]::WriteAllText($sqlPath, $Sql, [Text.UTF8Encoding]::new($false))
    $stdout = & npx wrangler d1 execute $databaseBinding --remote --config $generatedConfig --file $sqlPath --json 2> $stderrPath | Out-String
    $exitCode = $LASTEXITCODE
    $stderr = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
    $combined = "$stdout`n$stderr"
    if (-not $AllowFailure -and $exitCode -ne 0) {
      throw "Wrangler D1 falhou (exit $exitCode): $combined"
    }
    return [pscustomobject]@{
      ExitCode = $exitCode
      Stdout = $stdout
      Stderr = $stderr
      Combined = $combined
    }
  }
  finally {
    Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Get-D1Rows {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $result = Invoke-D1 -Sql $Sql
  try {
    $jsonStart = $result.Stdout.IndexOf('[')
    if ($jsonStart -lt 0) {
      throw 'Payload JSON não encontrado na saída do Wrangler.'
    }
    $json = $result.Stdout.Substring($jsonStart)
    $parsed = $json | ConvertFrom-Json
  }
  catch {
    throw "Wrangler não retornou JSON válido para a consulta: $($result.Stdout)"
  }

  $rows = @()
  foreach ($entry in @($parsed)) {
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
Assert-True -Condition ([int]$tables[0].total -eq 6) -Message 'Tabelas esperadas das migrations 0001-0005 não estão completas.'

$migrations = Get-D1Rows -Sql "SELECT COUNT(*) AS total FROM d1_migrations WHERE name LIKE '000%'; SELECT COUNT(*) AS analysis_migration FROM d1_migrations WHERE name LIKE '0005_banco_notas_import_analysis%';"
Assert-True -Condition ([int]$migrations[0].total -ge 5) -Message 'Menos de cinco migrations Banco de Notas constam como aplicadas.'
Assert-True -Condition ([int]$migrations[1].analysis_migration -eq 1) -Message 'Migration 0005 não consta como aplicada.'
Write-Host 'PASS: schema e migrations 0001-0005'

$availableYears = Get-D1Rows -Sql "WITH RECURSIVE years(year) AS (SELECT 2200 UNION ALL SELECT year - 1 FROM years WHERE year > 2000) SELECT year FROM years WHERE NOT EXISTS (SELECT 1 FROM school_years current WHERE current.year = years.year) LIMIT 2;"
Assert-True -Condition ($availableYears.Count -eq 2) -Message 'Não há dois anos sintéticos livres para o smoke.'
$primaryYear = [int]$availableYears[0].year
$secondaryYear = [int]$availableYears[1].year

$runToken = "$(Get-Date -AsUTC -Format 'yyyyMMddHHmmss')-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$prefix = "smoke-$runToken"
$primaryYearId = "$prefix-year-primary"
$secondaryYearId = "$prefix-year-secondary"
$teacherId = "$prefix-teacher"
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

Invoke-D1 -Sql "INSERT INTO school_years (id, year, name, starts_on, ends_on) VALUES ('$primaryYearId', $primaryYear, 'SMOKE $runToken', '$primaryYear-01-01', '$primaryYear-12-31');"
Invoke-D1 -Sql "INSERT INTO school_years (id, year, name, starts_on, ends_on) VALUES ('$secondaryYearId', $secondaryYear, 'SMOKE secondary $runToken', '$secondaryYear-01-01', '$secondaryYear-12-31');"
Invoke-D1 -Sql "INSERT INTO teachers (id, display_name) VALUES ('$teacherId', 'Pessoa sintética smoke $runToken');"
Invoke-D1 -Sql "INSERT INTO data_sources (id, school_year_id, type, name, description, created_by) VALUES ('$sourceId', '$primaryYearId', 'legacy_import', 'SMOKE source $runToken', 'Dado sintético de homologação', 'smoke-remote');"

$defaults = Get-D1Rows -Sql "SELECT environment, migration_state, status FROM data_sources WHERE id = '$sourceId';"
Assert-True -Condition ($defaults[0].environment -eq 'homologation') -Message 'Data source não nasceu em homologation.'
Assert-True -Condition ($defaults[0].migration_state -eq 'not_started') -Message 'Migration state default inesperado.'
Assert-True -Condition ($defaults[0].status -eq 'active') -Message 'Status default inesperado.'
Write-Host 'PASS: defaults seguros da fonte'

Invoke-D1 -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, effective_from, operator_id, reason) VALUES ('$assignmentId', '$primaryYearId', '$sourceId', 'school_year_default', '$primaryYear-01-01', 'smoke-remote', 'Smoke de autoridade');"
$authority = Get-D1Rows -Sql "SELECT authority, sync_enabled, status FROM source_assignments WHERE id = '$assignmentId';"
Assert-True -Condition ($authority[0].authority -eq 'authoritative') -Message 'Authority default inesperado.'
Assert-True -Condition ([int]$authority[0].sync_enabled -eq 0) -Message 'sync_enabled deve nascer desligado.'
Assert-True -Condition ($authority[0].status -eq 'active') -Message 'Source assignment não nasceu ativo.'
Write-Host 'PASS: authority e sync default'

Assert-D1Failure -Label 'overlap authoritative' -ExpectedMessage 'authoritative source assignment overlap' -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, effective_from, operator_id, reason) VALUES ('$overlapAssignmentId', '$primaryYearId', '$sourceId', 'school_year_default', '$primaryYear-06-01', 'smoke-remote', 'Overlap sintético');"

Invoke-D1 -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, authority, effective_from, operator_id, reason) VALUES ('$referenceAssignmentId', '$primaryYearId', '$sourceId', 'school_year_default', 'reference_only', '$primaryYear-06-01', 'smoke-remote', 'Referência sintética permitida');"
Write-Host 'PASS: reference_only pode coexistir sem tomar autoridade'

Assert-D1Failure -Label 'cross-year source assignment' -ExpectedMessage 'source assignment year mismatch' -Sql "INSERT INTO source_assignments (id, school_year_id, data_source_id, scope, effective_from, operator_id, reason) VALUES ('$crossYearAssignmentId', '$secondaryYearId', '$sourceId', 'school_year_default', '$secondaryYear-01-01', 'smoke-remote', 'Cross-year deve falhar');"

Invoke-D1 -Sql "INSERT INTO import_jobs (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by) VALUES ('$jobId', '$primaryYearId', '$teacherId', '$sourceId', '$prefix-idempotency', '$sourceHash', '{\"sourceFormat\":\"xlsx\",\"smoke\":true}', 'smoke-remote');"

Assert-D1Failure -Label 'state jump draft to generated' -ExpectedMessage 'invalid import job state transition' -Sql "UPDATE import_jobs SET state = 'generated' WHERE id = '$jobId';"
Assert-D1Failure -Label 'analyzed without persisted analysis' -ExpectedMessage 'import job analysis artifact required' -Sql "UPDATE import_jobs SET state = 'analyzed' WHERE id = '$jobId';"
Assert-D1Failure -Label 'analysis provenance mismatch' -ExpectedMessage 'import analysis provenance mismatch' -Sql "INSERT INTO import_analyses (id, import_job_id, analyzer_id, analysis_version, source_hash, source_format, school_year, model_json, created_by) VALUES ('$analysisId-bad', '$jobId', 'smoke-xlsx-analyzer', 'smoke-1', '$wrongHash', 'xlsx', $primaryYear, '{\"schemaVersion\":1,\"smoke\":true}', 'smoke-remote');"

Invoke-D1 -Sql "INSERT INTO import_analyses (id, import_job_id, analyzer_id, analysis_version, source_hash, source_format, school_year, model_json, created_by) VALUES ('$analysisId', '$jobId', 'smoke-xlsx-analyzer', 'smoke-1', '$sourceHash', 'xlsx', $primaryYear, '{\"schemaVersion\":1,\"smoke\":true}', 'smoke-remote');"
Invoke-D1 -Sql "UPDATE import_jobs SET state = 'analyzed' WHERE id = '$jobId';"
$analyzed = Get-D1Rows -Sql "SELECT state FROM import_jobs WHERE id = '$jobId'; SELECT COUNT(*) AS total FROM import_analyses WHERE import_job_id = '$jobId';"
Assert-True -Condition ($analyzed[0].state -eq 'analyzed') -Message 'Job não alcançou analyzed após análise válida.'
Assert-True -Condition ([int]$analyzed[1].total -eq 1) -Message 'Artefato de análise não foi persistido exatamente uma vez.'
Write-Host 'PASS: análise persistente habilita analyzed'

Assert-D1Failure -Label 'analysis append-only update' -ExpectedMessage 'import_analyses are append-only' -Sql "UPDATE import_analyses SET analyzer_id = 'tampered' WHERE id = '$analysisId';"
Assert-D1Failure -Label 'analysis append-only delete' -ExpectedMessage 'import_analyses are append-only' -Sql "DELETE FROM import_analyses WHERE id = '$analysisId';"
Assert-D1Failure -Label 'state re-entry' -ExpectedMessage 'import job state re-entry is not allowed' -Sql "UPDATE import_jobs SET state = 'analyzed' WHERE id = '$jobId';"

Invoke-D1 -Sql "INSERT INTO import_findings (id, import_job_id, severity, code, location_json, details_json) VALUES ('$findingId', '$jobId', 'warning', 'smoke_warning', '{\"smoke\":true}', '{\"message\":\"finding sintético\"}');"
Invoke-D1 -Sql "INSERT INTO import_finding_resolutions (id, import_finding_id, resolved_by, reason, resolved_at) VALUES ('$resolutionId', '$findingId', 'smoke-remote', 'Resolução sintética', '$(Get-Date -AsUTC -Format 'yyyy-MM-ddTHH:mm:ss.fffZ')');"
Assert-D1Failure -Label 'finding resolution append-only' -ExpectedMessage 'import_finding_resolutions are append-only' -Sql "UPDATE import_finding_resolutions SET reason = 'tampered' WHERE id = '$resolutionId';"
Assert-D1Failure -Label 'finding append-only' -ExpectedMessage 'import_findings are append-only' -Sql "UPDATE import_findings SET code = 'tampered' WHERE id = '$findingId';"
Write-Host 'PASS: finding e resolução preservam histórico append-only'

Invoke-D1 -Sql "DELETE FROM source_assignments WHERE id IN ('$assignmentId', '$referenceAssignmentId');"
Invoke-D1 -Sql "DELETE FROM school_years WHERE id = '$secondaryYearId';"

Write-Host ''
Write-Host 'SMOKE REMOTO CONCLUÍDO.'
Write-Host "Run token: $runToken"
Write-Host "Job sintético preservado como evidência append-only: $jobId"
Write-Host 'Este script não provisiona D1, não aplica migrations, não toca produção e não testa/ativa sync.'
