[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$generatedConfig = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$databaseName = 'banco-notas-homologation'

if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw 'CLOUDFLARE_API_TOKEN não está disponível para provisionar o D1 de homologação.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID)) {
  throw 'CLOUDFLARE_ACCOUNT_ID não está disponível para provisionar o D1 de homologação.'
}

$accountId = $env:CLOUDFLARE_ACCOUNT_ID
$headers = @{
  Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN"
  'Content-Type' = 'application/json'
}
$databaseEndpoint = "https://api.cloudflare.com/client/v4/accounts/$accountId/d1/database"
$listUri = "${databaseEndpoint}?name=$([uri]::EscapeDataString($databaseName))&per_page=10"

$listed = Invoke-RestMethod -Method Get -Uri $listUri -Headers $headers
if (-not $listed.success) {
  throw 'Cloudflare não retornou a lista de databases D1 com sucesso.'
}

$existing = @($listed.result) |
  Where-Object { $_.name -eq $databaseName } |
  Select-Object -First 1

if ($existing) {
  $databaseId = [string]$existing.uuid
  Write-Host "Reutilizando D1 de homologação existente: $databaseName"
}
else {
  $body = @{ name = $databaseName } | ConvertTo-Json -Compress
  $created = Invoke-RestMethod -Method Post -Uri $databaseEndpoint -Headers $headers -Body $body
  if (-not $created.success -or -not $created.result) {
    throw 'Cloudflare não criou o D1 de homologação com sucesso.'
  }
  $databaseId = [string]$created.result.uuid
  Write-Host "D1 de homologação criado: $databaseName"
}

if ([string]::IsNullOrWhiteSpace($databaseId)) {
  throw 'Cloudflare não retornou o UUID do D1 de homologação.'
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

Write-Host "D1 de homologação provisionado e migrado: $databaseName"
