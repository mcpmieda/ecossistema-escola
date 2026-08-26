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
  throw 'Smoke remoto recusado: use -ConfirmSyntheticWrites para autorizar somente dados sintéticos de homologação.'
}
if (-not (Test-Path -LiteralPath $generatedConfig)) {
  throw 'Configuração local de homologação ausente. Este smoke não provisiona D1 nem cria configuração.'
}

$config = Get-Content -LiteralPath $generatedConfig -Raw | ConvertFrom-Json
$database = @($config.d1_databases) |
  Where-Object { $_.binding -eq $databaseBinding } |
  Select-Object -First 1
if (-not $database) {
  throw "Binding $databaseBinding não encontrado na configuração de homologação."
}
if ($database.database_name -ne $expectedDatabaseName) {
  throw "Smoke recusado: database_name deve ser exatamente $expectedDatabaseName."
}

function Invoke-D1 {
  param([Parameter(Mandatory)][string]$Sql)

  $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) "banco-notas-profile-smoke-$([guid]::NewGuid()).stderr"
  try {
    $stdout = & npx wrangler d1 execute $databaseBinding --remote --config $generatedConfig --command $Sql --json 2> $stderrPath | Out-String
    $exitCode = $LASTEXITCODE
    $stderr = if (Test-Path -LiteralPath $stderrPath) {
      Get-Content -LiteralPath $stderrPath -Raw
    }
    else {
      ''
    }
    return [pscustomobject]@{
      ExitCode = $exitCode
      Stdout = $stdout
      Stderr = $stderr
      Combined = "$stdout`n$stderr"
    }
  }
  finally {
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Get-D1Rows {
  param([Parameter(Mandatory)][string]$Sql)

  $result = Invoke-D1 -Sql $Sql
  if ($result.ExitCode -ne 0) { throw $result.Combined }
  $payload = $result.Stdout | ConvertFrom-Json
  $rows = @()
  foreach ($entry in @($payload)) {
    if ($entry.results) { $rows += @($entry.results) }
  }
  return $rows
}

function Assert-True {
  param(
    [Parameter(Mandatory)][bool]$Condition,
    [Parameter(Mandatory)][string]$Message
  )

  if (-not $Condition) { throw $Message }
}

function Assert-D1Failure {
  param(
    [Parameter(Mandatory)][string]$Sql,
    [Parameter(Mandatory)][string]$ExpectedMessage
  )

  $result = Invoke-D1 -Sql $Sql
  Assert-True ($result.ExitCode -ne 0) "A operação deveria falhar: $ExpectedMessage"
  Assert-True ($result.Combined -match [regex]::Escape($ExpectedMessage)) "Falha remota não contém '$ExpectedMessage'."
}

function Get-Sha256Hex {
  param([Parameter(Mandatory)][string]$Value)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

$migration = Get-D1Rows -Sql "SELECT COUNT(*) AS total FROM d1_migrations WHERE name LIKE '0006_banco_notas_import_analysis_profiles%';"
Assert-True ([int]$migration[0].total -eq 1) 'Migration 0006 não está aplicada no D1 remoto de homologação.'
$tables = Get-D1Rows -Sql "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('import_analysis_profiles', 'import_job_analysis_profiles');"
Assert-True ([int]$tables[0].total -eq 2) 'Tabelas da migration 0006 não estão disponíveis.'

$availableYear = Get-D1Rows -Sql "WITH RECURSIVE years(year) AS (SELECT 2200 UNION ALL SELECT year - 1 FROM years WHERE year > 2000) SELECT year FROM years WHERE NOT EXISTS (SELECT 1 FROM school_years current WHERE current.year = years.year) LIMIT 1;"
Assert-True ($availableYear.Count -eq 1) 'Nenhum ano sintético livre disponível para o smoke.'
$year = [int]$availableYear[0].year
$runToken = "$(Get-Date -AsUTC -Format 'yyyyMMddHHmmss')-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$prefix = "smoke-profile-$runToken"
$yearId = "$prefix-year"
$teacherId = "$prefix-teacher"
$legacySourceId = "$prefix-legacy-source"
$linkedSourceId = "$prefix-linked-source"
$xlsxJobId = "$prefix-xlsx-job"
$xlsbJobId = "$prefix-xlsb-job"
$profileId = "$prefix-profile"
$profileKey = 'remote-smoke-v1'
$analysisVersion = 'remote-smoke-v1'
$xlsxHash = Get-Sha256Hex "$prefix-xlsx"
$xlsbHash = Get-Sha256Hex "$prefix-xlsb"
$profileJson = '{"schemaVersion":1,"profileId":"remote-smoke-v1","analysisVersion":"remote-smoke-v1","worksheetRules":[{"ruleId":"class-component","sheetNamePattern":"^(?<class>.+?) - (?<component>.+)$","caseInsensitive":false,"studentNameColumn":"A","firstStudentRow":2,"maxStudentRows":100,"gradeColumns":[{"field":"NotaT1","column":"B"}]}]}'
$profileHash = Get-Sha256Hex $profileJson

$setupSql = @"
INSERT INTO school_years (id, year, name, starts_on, ends_on)
VALUES ('$yearId', $year, 'Smoke perfis $year', '$year-01-01', '$year-12-31');
INSERT INTO teachers (id, display_name)
VALUES ('$teacherId', 'Pessoa sintética smoke profile');
INSERT INTO data_sources (id, school_year_id, type, name, description, created_by)
VALUES ('$legacySourceId', '$yearId', 'legacy_import', '$prefix legado', '', 'smoke-remote');
INSERT INTO data_sources (id, school_year_id, type, name, description, created_by)
VALUES ('$linkedSourceId', '$yearId', 'linked_teacher_model', '$prefix vinculado', '', 'smoke-remote');
INSERT INTO import_jobs
  (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by)
VALUES
  ('$xlsxJobId', '$yearId', '$teacherId', '$legacySourceId', '$prefix-xlsx-idem', '$xlsxHash', '{"sourceFormat":"xlsx","smoke":true}', 'smoke-remote');
INSERT INTO import_jobs
  (id, school_year_id, teacher_id, data_source_id, idempotency_key, source_hash, provenance_json, requested_by)
VALUES
  ('$xlsbJobId', '$yearId', '$teacherId', '$legacySourceId', '$prefix-xlsb-idem', '$xlsbHash', '{"sourceFormat":"xlsb","smoke":true}', 'smoke-remote');
"@
$setup = Invoke-D1 -Sql $setupSql
if ($setup.ExitCode -ne 0) { throw $setup.Combined }

$insertProfile = Invoke-D1 -Sql @"
INSERT INTO import_analysis_profiles
  (id, school_year_id, data_source_id, profile_id, analysis_version, profile_hash, profile_json, created_by, reason)
VALUES
  ('$profileId', '$yearId', '$legacySourceId', '$profileKey', '$analysisVersion', '$profileHash', '$profileJson', 'smoke-remote', 'smoke remoto de perfil XLSX');
"@
if ($insertProfile.ExitCode -ne 0) { throw $insertProfile.Combined }

$profile = Get-D1Rows -Sql "SELECT source_format FROM import_analysis_profiles WHERE id = '$profileId';"
Assert-True ($profile.Count -eq 1 -and $profile[0].source_format -eq 'xlsx') 'Perfil remoto não preservou source_format=xlsx.'

Assert-D1Failure -ExpectedMessage 'import analysis profile source mismatch' -Sql @"
INSERT INTO import_analysis_profiles
  (id, school_year_id, data_source_id, profile_id, analysis_version, profile_hash, profile_json, created_by, reason)
VALUES
  ('$prefix-invalid-source-profile', '$yearId', '$linkedSourceId', 'invalid-source', 'v1', '$(Get-Sha256Hex "$prefix-invalid-source")', '$profileJson', 'smoke-remote', 'deve falhar');
"@
Assert-D1Failure -ExpectedMessage 'import_analysis_profiles are append-only' -Sql "UPDATE import_analysis_profiles SET reason = 'mutação proibida' WHERE id = '$profileId';"
Assert-D1Failure -ExpectedMessage 'import_analysis_profiles are append-only' -Sql "DELETE FROM import_analysis_profiles WHERE id = '$profileId';"

$link = Invoke-D1 -Sql @"
INSERT INTO import_job_analysis_profiles
  (import_job_id, analysis_profile_id, attached_by, reason)
VALUES
  ('$xlsxJobId', '$profileId', 'smoke-remote', 'vínculo sintético de homologação');
"@
if ($link.ExitCode -ne 0) { throw $link.Combined }

$linkCount = Get-D1Rows -Sql "SELECT COUNT(*) AS total FROM import_job_analysis_profiles WHERE import_job_id = '$xlsxJobId' AND analysis_profile_id = '$profileId';"
Assert-True ([int]$linkCount[0].total -eq 1) 'Vínculo XLSX válido não foi persistido exatamente uma vez.'

Assert-D1Failure -ExpectedMessage 'import_job_analysis_profiles are append-only' -Sql "UPDATE import_job_analysis_profiles SET reason = 'mutação proibida' WHERE import_job_id = '$xlsxJobId';"
Assert-D1Failure -ExpectedMessage 'import_job_analysis_profiles are append-only' -Sql "DELETE FROM import_job_analysis_profiles WHERE import_job_id = '$xlsxJobId';"
Assert-D1Failure -ExpectedMessage 'import analysis profile job mismatch' -Sql @"
INSERT INTO import_job_analysis_profiles
  (import_job_id, analysis_profile_id, attached_by, reason)
VALUES
  ('$xlsbJobId', '$profileId', 'smoke-remote', 'XLSB deve permanecer fail closed');
"@

Write-Host "Smoke migration 0006 concluído no D1 $expectedDatabaseName com dados sintéticos $prefix."
Write-Host 'Este script não provisiona D1, não aplica migrations, não faz deploy e não habilita sync.'
