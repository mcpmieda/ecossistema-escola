[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$generatedConfig = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$migrationDirectory = Join-Path $repositoryRoot 'infra\banco-notas\d1\migrations'
$databaseName = 'banco-notas-homologation'

$identity = npx wrangler whoami 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $identity -match 'not authenticated') {
  npx wrangler login
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível autenticar o Wrangler.' }
}

$listedOutput = npx wrangler d1 list --json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw $listedOutput }
$existing = @($listedOutput | ConvertFrom-Json) | Where-Object { $_.name -eq $databaseName } | Select-Object -First 1
if ($existing) {
  $databaseId = if ($existing.uuid) { $existing.uuid } else { $existing.database_id }
}
else {
  $createdOutput = npx wrangler d1 create $databaseName --json 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $createdOutput }
  $created = $createdOutput | ConvertFrom-Json
  $databaseId = if ($created.uuid) { $created.uuid } elseif ($created.database_id) { $created.database_id } else { $null }
}
if (-not $databaseId) {
  throw 'Wrangler não retornou o ID do D1 criado.'
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
      "migrations_dir": "infra/banco-notas/d1/migrations"
    }
  ]
}
"@

Set-Content -LiteralPath $generatedConfig -Value $config -Encoding utf8NoBOM
npx wrangler d1 migrations apply BANCO_NOTAS_DB --remote --config $generatedConfig
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao aplicar migrations no D1 de homologação.'
}

Write-Host "D1 de homologação criado e migrado: $databaseId"
