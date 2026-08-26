[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$generatedConfig = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$sourceMigrationDirectory = Join-Path $repositoryRoot 'infra\banco-notas\d1\migrations'
$remoteMigrationDirectory = Join-Path $repositoryRoot '.wrangler\banco-notas-remote-migrations'
$databaseName = 'banco-notas-homologation'

if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw 'CLOUDFLARE_API_TOKEN não está disponível para provisionar o D1 de homologação.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID)) {
  throw 'CLOUDFLARE_ACCOUNT_ID não está disponível para provisionar o D1 de homologação.'
}

$accountId = $env:CLOUDFLARE_ACCOUNT_ID.Trim()
$apiToken = $env:CLOUDFLARE_API_TOKEN.Trim()
if ($accountId -notmatch '^[0-9a-fA-F]{32}$') {
  throw 'CLOUDFLARE_ACCOUNT_ID inválido: esperado identificador Cloudflare de 32 caracteres hexadecimais.'
}
if ([string]::IsNullOrWhiteSpace($apiToken)) {
  throw 'CLOUDFLARE_API_TOKEN ficou vazio após normalização.'
}
$env:CLOUDFLARE_ACCOUNT_ID = $accountId
$env:CLOUDFLARE_API_TOKEN = $apiToken

function Get-D1Databases {
  $raw = & npx wrangler d1 list --json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler falhou ao listar os databases D1: $($raw -join [Environment]::NewLine)"
  }

  $text = ($raw -join [Environment]::NewLine).Trim()
  try {
    $parsed = $text | ConvertFrom-Json
  }
  catch {
    throw 'Wrangler não retornou JSON válido ao listar os databases D1.'
  }

  return @($parsed)
}

function Resolve-HomologationDatabase {
  $matches = @(Get-D1Databases | Where-Object { [string]$_.name -eq $databaseName })
  if ($matches.Count -gt 1) {
    throw "Mais de um D1 chamado $databaseName foi encontrado. Provisionamento recusado por segurança."
  }
  if ($matches.Count -eq 1) {
    return $matches[0]
  }
  return $null
}

$database = Resolve-HomologationDatabase
if ($database) {
  Write-Host "Reutilizando D1 de homologação existente: $databaseName"
}
else {
  $createOutput = & npx wrangler d1 create $databaseName 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler falhou ao criar o D1 de homologação: $($createOutput -join [Environment]::NewLine)"
  }
  Write-Host "D1 de homologação criado: $databaseName"

  $database = Resolve-HomologationDatabase
  if (-not $database) {
    throw "Wrangler criou o D1, mas $databaseName não apareceu na listagem posterior."
  }
}

$databaseId = [string]$database.uuid
if ([string]::IsNullOrWhiteSpace($databaseId)) {
  $databaseId = [string]$database.database_id
}
$parsedDatabaseId = [guid]::Empty
if ([string]::IsNullOrWhiteSpace($databaseId) -or -not [guid]::TryParse($databaseId, [ref]$parsedDatabaseId)) {
  throw 'Wrangler não retornou um UUID válido para o D1 de homologação.'
}
$databaseId = $parsedDatabaseId.ToString()

# Wrangler/D1 remoto possui casos em que o parser de migrations interpreta o
# END de um CASE dentro de CREATE TRIGGER como o fim do trigger. A forma
# parentetizada é SQLite-equivalente. Geramos somente uma cópia efêmera usada
# pela homologação; os arquivos fonte continuam sendo a fonte de verdade.
if (Test-Path -LiteralPath $remoteMigrationDirectory) {
  Remove-Item -LiteralPath $remoteMigrationDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $remoteMigrationDirectory -Force | Out-Null

$migrationFiles = @(Get-ChildItem -LiteralPath $sourceMigrationDirectory -Filter '*.sql' -File | Sort-Object Name)
$expectedMigrations = @(
  '0001_banco_notas_foundation.sql',
  '0002_banco_notas_cross_year_integrity.sql',
  '0003_banco_notas_import_job_state_machine.sql',
  '0004_banco_notas_import_finding_resolution.sql',
  '0005_banco_notas_import_analysis.sql',
  '0006_banco_notas_import_analysis_profiles.sql'
)
$actualMigrations = @($migrationFiles | ForEach-Object { $_.Name })
if (($actualMigrations -join '|') -ne ($expectedMigrations -join '|')) {
  throw "Conjunto de migrations de homologação inesperado. Esperado exatamente 0001 até 0006; encontrado: $($actualMigrations -join ', ')."
}

foreach ($migrationFile in $migrationFiles) {
  $sql = Get-Content -LiteralPath $migrationFile.FullName -Raw
  $sql = $sql.Replace("`r`n", "`n").Replace("`r", "`n")
  $sql = [regex]::Replace(
    $sql,
    'SELECT CASE(?<caseBody>[\s\S]*?)END;',
    { param($match) "SELECT (CASE$($match.Groups['caseBody'].Value)END);" }
  )
  $target = Join-Path $remoteMigrationDirectory $migrationFile.Name
  [IO.File]::WriteAllText($target, $sql, [Text.UTF8Encoding]::new($false))
}

$config = @"
{
  "`$schema": "node_modules/wrangler/config-schema.json",
  "name": "ecossistema-escola-banco-notas-homologation",
  "compatibility_date": "2026-08-24",
  "compatibility_flags": ["nodejs_compat"],
  "pages_build_output_dir": "./dist",
  "d1_databases": [
    {
      "binding": "BANCO_NOTAS_DB",
      "database_name": "$databaseName",
      "database_id": "$databaseId",
      "migrations_dir": ".wrangler/banco-notas-remote-migrations"
    }
  ]
}
"@

Set-Content -LiteralPath $generatedConfig -Value $config -Encoding utf8NoBOM
npx wrangler d1 migrations apply BANCO_NOTAS_DB --remote --config $generatedConfig
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao aplicar migrations no D1 de homologação.'
}

Write-Host "D1 de homologação provisionado e migrado: $databaseName"
