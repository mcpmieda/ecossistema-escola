[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$d1ConfigPath = Join-Path $repositoryRoot 'wrangler.banco-notas.homologation.jsonc'
$runtimeWorkingDirectory = Join-Path $repositoryRoot '.runtime-homologation'
$runtimeConfigPath = Join-Path $runtimeWorkingDirectory 'wrangler.jsonc'
$deploymentEvidencePath = Join-Path $repositoryRoot 'runtime-homologation-deploy.json'
$projectName = 'ecossistema-escola'
$previewBranch = 'banco-notas-runtime-homologation'
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

# The production asset bundle intentionally denies all framing. The isolated
# preview delegates CSP/X-Frame-Options to the temporary Worker so the add-in
# route can be framed by Office while every other asset remains denied.
$runtimeHeadersPath = Join-Path $repositoryRoot 'dist\_headers'
$runtimeHeaders = @'
/*
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Referrer-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff

/manifest.webmanifest
  Cache-Control: public, max-age=3600
'@
[IO.File]::WriteAllText(
  $runtimeHeadersPath,
  $runtimeHeaders,
  [Text.UTF8Encoding]::new($false)
)

$config = [ordered]@{
  '$schema' = '../node_modules/wrangler/config-schema.json'
  name = $projectName
  pages_build_output_dir = '../dist'
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
New-Item -ItemType Directory -Path $runtimeWorkingDirectory -Force | Out-Null
[IO.File]::WriteAllText(
  $runtimeConfigPath,
  ($config | ConvertTo-Json -Depth 10),
  [Text.UTF8Encoding]::new($false)
)

$existingDeploymentsJson = @(
  & npx wrangler pages deployment list `
    --project-name $projectName `
    --environment preview `
    --json 2>&1
)
if ($LASTEXITCODE -ne 0) {
  throw 'Não foi possível inventariar os previews Pages antes do deploy.'
}
$existingDeployments = ($existingDeploymentsJson -join "`n") | ConvertFrom-Json
$staleRuntimeDeployments = @($existingDeployments) |
  Where-Object { [string]$_.Branch -eq $previewBranch }
foreach ($staleDeployment in $staleRuntimeDeployments) {
  & npx wrangler pages deployment delete ([string]$staleDeployment.Id) `
    --project-name $projectName `
    --force
  if ($LASTEXITCODE -ne 0) {
    throw 'Um preview Pages anterior da branch temporária não pôde ser removido.'
  }
}

$deployOutput = @(
  & npx wrangler pages deploy ../dist `
    --project-name $projectName `
    --branch $previewBranch `
    --commit-dirty=true `
    --cwd $runtimeWorkingDirectory 2>&1
)
$deployOutput | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  throw 'Deploy do preview Pages isolado de homologação falhou.'
}
$deploymentUrl = [regex]::Match(
  ($deployOutput -join "`n"),
  'https://[A-Za-z0-9.-]+\.pages\.dev'
).Value.TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($deploymentUrl)) {
  throw 'Wrangler concluiu o deploy, mas a URL pages.dev não foi identificada.'
}

$deploymentsJson = @(
  & npx wrangler pages deployment list `
    --project-name $projectName `
    --environment preview `
    --json 2>&1
)
if ($LASTEXITCODE -ne 0) {
  throw 'O preview foi criado, mas não foi possível resolver seu ID exato para cleanup.'
}
$deployments = ($deploymentsJson -join "`n") | ConvertFrom-Json
$deployment = @($deployments) |
  Where-Object { ([string]$_.Deployment).TrimEnd('/') -eq $deploymentUrl } |
  Select-Object -First 1
if (-not $deployment -or [string]::IsNullOrWhiteSpace([string]$deployment.Id)) {
  throw 'O preview foi criado, mas seu ID exato não foi identificado para cleanup.'
}

$evidence = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  status = 'RUNTIME_HOMOLOGATION_PAGES_DEPLOYED'
  environment = 'homologation'
  pagesProjectName = $projectName
  pagesDeploymentId = [string]$deployment.Id
  deploymentUrl = $deploymentUrl
  previewBranch = $previewBranch
  database = $databaseName
  binding = 'BANCO_NOTAS_DB'
  productionRoutesConfigured = $false
  isolatedPreviewDeploymentCreated = $true
  previewConfigurationApplied = $true
  productionPagesProjectChanged = $false
  accountIdIncluded = $false
  secretIncluded = $false
}
[IO.File]::WriteAllText(
  $deploymentEvidencePath,
  ($evidence | ConvertTo-Json -Depth 10),
  [Text.UTF8Encoding]::new($false)
)
Write-Host 'RUNTIME_HOMOLOGATION_PAGES_DEPLOYED'
