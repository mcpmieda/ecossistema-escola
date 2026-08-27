[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$d1ConfigPath = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$runtimeConfigPath = Join-Path $repositoryRoot 'wrangler.banco-notas.runtime-homologation.jsonc'
$deploymentEvidencePath = Join-Path $repositoryRoot 'runtime-homologation-deploy.json'
$projectName = 'ecossistema-escola-banco-notas-runtime-homologation'
$previewBranch = 'runtime-homologation'
$databaseName = 'banco-notas-homologation'

if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw 'CLOUDFLARE_API_TOKEN não está disponível para o Worker de homologação.'
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID)) {
  throw 'CLOUDFLARE_ACCOUNT_ID não está disponível para o Worker de homologação.'
}
if (-not (Test-Path -LiteralPath $d1ConfigPath)) {
  throw 'Config D1 de homologação ausente. Execute provision-homologation.ps1 primeiro.'
}

$d1Config = Get-Content -LiteralPath $d1ConfigPath -Raw | ConvertFrom-Json
$database = @($d1Config.d1_databases) |
  Where-Object { $_.binding -eq 'BANCO_NOTAS_DB' -and $_.database_name -eq $databaseName } |
  Select-Object -First 1
if (-not $database -or [string]::IsNullOrWhiteSpace([string]$database.database_id)) {
  throw 'Binding exclusivo banco-notas-homologation não foi confirmado.'
}

$env:VITE_BANCO_NOTAS_ADDIN_CLIENT_ID = '73ab83d3-00ba-494a-a1f8-586d250d420a'
$env:VITE_TENANT_ID = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188'
$env:VITE_BANCO_NOTAS_RUNTIME_HOMOLOGATION = '1'
& npx vite build --config vite.addin.config.ts
if ($LASTEXITCODE -ne 0) {
  throw 'Build do add-in de homologação falhou.'
}
& npx vite build --config vite.runtime-homologation.config.ts
if ($LASTEXITCODE -ne 0) {
  throw 'Build do runtime Pages de homologação falhou.'
}

$config = [ordered]@{
  '$schema' = 'node_modules/wrangler/config-schema.json'
  name = $projectName
  pages_build_output_dir = './dist'
  compatibility_date = '2026-08-27'
  compatibility_flags = @('nodejs_compat')
  d1_databases = @(
    [ordered]@{
      binding = 'BANCO_NOTAS_DB'
      database_name = $databaseName
      database_id = [string]$database.database_id
    }
  )
  vars = [ordered]@{
    RUNTIME_ENVIRONMENT = 'homologation'
    TENANT_ID = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188'
    BANCO_NOTAS_ADDIN_AUDIENCE = '73ab83d3-00ba-494a-a1f8-586d250d420a'
    BANCO_NOTAS_ADDIN_SCOPE = 'BancoNotas.Sync'
  }
}
[IO.File]::WriteAllText(
  $runtimeConfigPath,
  ($config | ConvertTo-Json -Depth 10),
  [Text.UTF8Encoding]::new($false)
)

$projectsJson = @(& npx wrangler pages project list --json 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw 'Não foi possível listar os projetos Pages de homologação.'
}
$projects = ($projectsJson -join "`n") | ConvertFrom-Json
$projectExists = @($projects) | Where-Object { $_.name -eq $projectName } | Select-Object -First 1
if (-not $projectExists) {
  & npx wrangler pages project create $projectName `
    --production-branch runtime-homologation-never `
    --compatibility-date 2026-08-27 `
    --compatibility-flag nodejs_compat
  if ($LASTEXITCODE -ne 0) {
    throw 'Criação do projeto Pages isolado de homologação falhou.'
  }
}

$deployOutput = @(
  & npx wrangler pages deploy dist `
    --project-name $projectName `
    --branch $previewBranch `
    --commit-dirty=true `
    --config $runtimeConfigPath 2>&1
)
$deployOutput | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  & npx wrangler pages project delete $projectName --yes
  throw 'Deploy do Pages isolado de homologação falhou e o projeto temporário foi removido.'
}
$deploymentUrl = [regex]::Match(($deployOutput -join "`n"), 'https://[^\s]+\.pages\.dev').Value.TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($deploymentUrl)) {
  & npx wrangler pages project delete $projectName --yes
  throw 'Wrangler concluiu o deploy, mas a URL pages.dev não foi identificada; o projeto temporário foi removido.'
}

$evidence = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  status = 'RUNTIME_HOMOLOGATION_PAGES_DEPLOYED'
  environment = 'homologation'
  pagesProjectName = $projectName
  deploymentUrl = $deploymentUrl
  previewBranch = $previewBranch
  database = $databaseName
  binding = 'BANCO_NOTAS_DB'
  productionRoutesConfigured = $false
  isolatedPagesProjectCreated = $true
  existingPagesProjectChanged = $false
  accountIdIncluded = $false
  secretIncluded = $false
}
[IO.File]::WriteAllText(
  $deploymentEvidencePath,
  ($evidence | ConvertTo-Json -Depth 10),
  [Text.UTF8Encoding]::new($false)
)
Write-Host 'RUNTIME_HOMOLOGATION_PAGES_DEPLOYED'
