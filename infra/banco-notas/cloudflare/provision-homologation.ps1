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

# Wrangler/D1 remoto possui casos conhecidos em que o parser de migrations
# interpreta o END de um CASE dentro de CREATE TRIGGER como o fim do trigger.
# A forma parentetizada é SQLite-equivalente e é aceita pelo caminho remoto.
# Geramos apenas a cópia efêmera usada pela homologação; os arquivos fonte
# continuam sendo a fonte de verdade e os nomes das migrations são preservados.
if (Test-Path -LiteralPath $remoteMigrationDirectory) {
  Remove-Item -LiteralPath $remoteMigrationDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $remoteMigrationDirectory -Force | Out-Null

$migrationFiles = Get-ChildItem -LiteralPath $sourceMigrationDirectory -Filter '*.sql' -File | Sort-Object Name
if (-not $migrationFiles) {
  throw 'Nenhuma migration do Banco de Notas foi encontrada.'
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
