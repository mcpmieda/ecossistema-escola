[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('snapshot', 'deploy-read-only')]
  [string]$Operation,

  [Parameter(Mandatory)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedReleaseSha,

  [string]$ExpectedDeploymentId = '',
  [string]$Confirmation = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$projectName = 'ecossistema-escola'
$databaseName = 'banco-notas-production'
$bindingName = 'BANCO_NOTAS_DB'
$evidencePath = Join-Path $repositoryRoot 'banco-notas-production-evidence.json'
$backupPath = Join-Path $repositoryRoot 'banco-notas-production-pre-migration.sql'
$workingDirectory = Join-Path $repositoryRoot '.wrangler\banco-notas-production'
$migrationDirectory = Join-Path $workingDirectory 'migrations'
$configPath = Join-Path $workingDirectory 'wrangler.jsonc'
$sourceMigrationDirectory = Join-Path $repositoryRoot 'infra\banco-notas\d1\migrations'
$apiBase = "https://api.cloudflare.com/client/v4/accounts/$($env:CLOUDFLARE_ACCOUNT_ID)"

function Assert-Environment {
  foreach ($name in @('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_API_TOKEN', 'CLOUDFLARE_D1_API_TOKEN', 'GITHUB_SHA')) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
      throw "$name não está disponível."
    }
  }
  if ($env:CLOUDFLARE_ACCOUNT_ID -notmatch '^[0-9a-fA-F]{32}$') {
    throw 'CLOUDFLARE_ACCOUNT_ID inválido.'
  }
  if ($env:GITHUB_SHA -ne $ExpectedReleaseSha) {
    throw "O checkout $($env:GITHUB_SHA) não corresponde ao RC esperado $ExpectedReleaseSha."
  }
}

function Invoke-CloudflareGet {
  param([Parameter(Mandatory)][string]$Path)
  $headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_PAGES_API_TOKEN)" }
  $response = Invoke-RestMethod -Method Get -Uri "$apiBase$Path" -Headers $headers
  if (-not $response.success) {
    throw "Cloudflare GET falhou em $Path."
  }
  return $response.result
}

function Invoke-WranglerJson {
  param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string[]]$Arguments
  )
  $previousToken = $env:CLOUDFLARE_API_TOKEN
  try {
    $env:CLOUDFLARE_API_TOKEN = $Token
    $raw = @(& npx wrangler @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "Wrangler falhou: $($raw -join [Environment]::NewLine)"
    }
    return (($raw -join [Environment]::NewLine).Trim() | ConvertFrom-Json)
  }
  finally {
    $env:CLOUDFLARE_API_TOKEN = $previousToken
  }
}

function Get-Databases {
  return @(Invoke-WranglerJson -Token $env:CLOUDFLARE_D1_API_TOKEN -Arguments @('d1', 'list', '--json'))
}

function Get-Deployments {
  return @(Invoke-WranglerJson -Token $env:CLOUDFLARE_PAGES_API_TOKEN -Arguments @(
      'pages', 'deployment', 'list', '--project-name', $projectName, '--environment', 'production', '--json'
    ))
}

function Get-CurrentDeployment {
  $deployments = @(Get-Deployments)
  if ($deployments.Count -eq 0) {
    throw 'Nenhum deployment Pages de produção foi encontrado.'
  }
  return $deployments[0]
}

function Get-PropertyMap {
  param([AllowNull()][object]$Value)
  $result = [ordered]@{}
  if ($null -eq $Value) { return $result }
  foreach ($property in $Value.PSObject.Properties) {
    $result[$property.Name] = $property.Value
  }
  return $result
}

function Get-NamedProperty {
  param(
    [AllowNull()][object]$Value,
    [Parameter(Mandatory)][string]$Name
  )
  if ($null -eq $Value) { return $null }
  $property = $Value.PSObject.Properties[$Name]
  return $(if ($null -eq $property) { $null } else { $property.Value })
}

function Get-SanitizedProject {
  param([Parameter(Mandatory)][object]$Project)
  $production = $Project.deployment_configs.production
  $bindingGroups = [ordered]@{}
  foreach ($name in @(
      'd1_databases', 'kv_namespaces', 'r2_buckets', 'durable_object_namespaces',
      'services', 'analytics_engine_datasets', 'queue_producers', 'hyperdrive_bindings'
    )) {
    $map = Get-PropertyMap (Get-NamedProperty -Value $production -Name $name)
    $bindingGroups[$name] = @($map.Keys | Sort-Object)
  }
  $environmentVariables = [ordered]@{}
  $envMap = Get-PropertyMap (Get-NamedProperty -Value $production -Name 'env_vars')
  foreach ($name in @($envMap.Keys | Sort-Object)) {
    $environmentVariables[$name] = [string]$envMap[$name].type
  }
  return [ordered]@{
    compatibilityDate = [string]$production.compatibility_date
    compatibilityFlags = @($production.compatibility_flags)
    bindings = $bindingGroups
    environmentVariables = $environmentVariables
  }
}

function New-Evidence {
  param(
    [Parameter(Mandatory)][object]$Project,
    [Parameter(Mandatory)][object]$CurrentDeployment,
    [Parameter(Mandatory)][object[]]$Databases,
    [string]$Status,
    [AllowNull()][object]$ProductionDatabase = $null,
    [AllowNull()][object]$NewDeployment = $null,
    [AllowNull()][object]$Verification = $null
  )
  $databaseInventory = @($Databases | ForEach-Object {
      [ordered]@{
        name = [string]$_.name
        uuid = [string]$_.uuid
        createdAt = [string]$_.created_at
      }
    })
  $evidence = [ordered]@{
    schemaVersion = 1
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    status = $Status
    releaseSha = $ExpectedReleaseSha
    pagesProject = $projectName
    previousDeployment = [ordered]@{
      id = [string]$CurrentDeployment.Id
      url = [string]$CurrentDeployment.Deployment
      branch = [string]$CurrentDeployment.Branch
    }
    productionConfiguration = Get-SanitizedProject $Project
    d1Inventory = $databaseInventory
    productionDatabase = $ProductionDatabase
    newDeployment = $NewDeployment
    verification = $Verification
    secretsIncluded = $false
    rawEnvironmentValuesIncluded = $false
  }
  [IO.File]::WriteAllText(
    $evidencePath,
    ($evidence | ConvertTo-Json -Depth 20),
    [Text.UTF8Encoding]::new($false)
  )
}

function Assert-ReadOnlyDeployInput {
  param([Parameter(Mandatory)][object]$CurrentDeployment)
  if ($Confirmation -cne 'DEPLOY_BANCO_NOTAS_READ_ONLY') {
    throw 'Confirmação exata DEPLOY_BANCO_NOTAS_READ_ONLY ausente.'
  }
  if ($ExpectedDeploymentId -notmatch '^[0-9a-fA-F-]{36}$') {
    throw 'expected_deployment_id deve ser um UUID Cloudflare explícito.'
  }
  if ([string]$CurrentDeployment.Id -ne $ExpectedDeploymentId) {
    throw "Deployment atual mudou: esperado $ExpectedDeploymentId, encontrado $($CurrentDeployment.Id)."
  }
}

function Assert-NoUnexpectedResourceBindings {
  param([Parameter(Mandatory)][object]$Project)
  $production = $Project.deployment_configs.production
  foreach ($name in @(
      'kv_namespaces', 'r2_buckets', 'durable_object_namespaces', 'services',
      'analytics_engine_datasets', 'queue_producers', 'hyperdrive_bindings'
    )) {
    $keys = @((Get-PropertyMap (Get-NamedProperty -Value $production -Name $name)).Keys)
    if ($keys.Count -gt 0) {
      throw "Binding de produção inesperado em ${name}: $($keys -join ', ')."
    }
  }
  $d1Map = Get-PropertyMap (Get-NamedProperty -Value $production -Name 'd1_databases')
  $d1Keys = @($d1Map.Keys)
  if ($d1Keys.Count -gt 0 -and ($d1Keys.Count -ne 1 -or $d1Keys[0] -ne $bindingName)) {
    throw "Binding D1 de produção inesperado: $($d1Keys -join ', ')."
  }
}

function Resolve-ProductionDatabase {
  $matches = @(Get-Databases | Where-Object { [string]$_.name -eq $databaseName })
  if ($matches.Count -gt 1) {
    throw "Mais de um D1 chamado $databaseName foi encontrado."
  }
  if ($matches.Count -eq 0) {
    $previousToken = $env:CLOUDFLARE_API_TOKEN
    try {
      $env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_D1_API_TOKEN
      $output = @(& npx wrangler d1 create $databaseName --location enam 2>&1)
      if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar ${databaseName}: $($output -join [Environment]::NewLine)"
      }
    }
    finally {
      $env:CLOUDFLARE_API_TOKEN = $previousToken
    }
    $matches = @(Get-Databases | Where-Object { [string]$_.name -eq $databaseName })
  }
  if ($matches.Count -ne 1 -or [string]$matches[0].uuid -notmatch '^[0-9a-fA-F-]{36}$') {
    throw 'O D1 de produção não pôde ser resolvido de forma inequívoca.'
  }
  return $matches[0]
}

function New-ProductionConfig {
  param(
    [Parameter(Mandatory)][object]$Project,
    [Parameter(Mandatory)][object]$Database
  )
  if (Test-Path -LiteralPath $workingDirectory) {
    Remove-Item -LiteralPath $workingDirectory -Recurse -Force
  }
  New-Item -ItemType Directory -Path $migrationDirectory -Force | Out-Null
  $expectedMigrations = @(
    '0001_banco_notas_foundation.sql',
    '0002_banco_notas_cross_year_integrity.sql',
    '0003_banco_notas_import_job_state_machine.sql',
    '0004_banco_notas_import_finding_resolution.sql',
    '0005_banco_notas_import_analysis.sql',
    '0006_banco_notas_import_analysis_profiles.sql',
    '0007_banco_notas_teacher_entra_identity.sql',
    '0008_banco_notas_sync_v1.sql'
  )
  $migrationFiles = @(Get-ChildItem -LiteralPath $sourceMigrationDirectory -Filter '*.sql' -File | Sort-Object Name)
  if ((@($migrationFiles.Name) -join '|') -ne ($expectedMigrations -join '|')) {
    throw "Conjunto de migrations inesperado: $(@($migrationFiles.Name) -join ', ')."
  }
  foreach ($migrationFile in $migrationFiles) {
    $sql = (Get-Content -LiteralPath $migrationFile.FullName -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
    $sql = [regex]::Replace(
      $sql,
      'SELECT CASE(?<caseBody>[\s\S]*?)END;',
      { param($match) "SELECT (CASE$($match.Groups['caseBody'].Value)END);" }
    )
    [IO.File]::WriteAllText(
      (Join-Path $migrationDirectory $migrationFile.Name),
      $sql,
      [Text.UTF8Encoding]::new($false)
    )
  }

  $production = $Project.deployment_configs.production
  $compatibilityDate = [string]$production.compatibility_date
  if ($compatibilityDate -match '^(\d{4}-\d{2}-\d{2})') {
    $compatibilityDate = $Matches[1]
  }
  else {
    $compatibilityDate = '2026-08-30'
  }
  $config = [ordered]@{
    '$schema' = '../../node_modules/wrangler/config-schema.json'
    name = $projectName
    pages_build_output_dir = '../../dist'
    compatibility_date = $compatibilityDate
    compatibility_flags = @(Get-NamedProperty -Value $production -Name 'compatibility_flags')
    keep_vars = $true
    d1_databases = @(
      [ordered]@{
        binding = $bindingName
        database_name = $databaseName
        database_id = [string]$Database.uuid
        migrations_dir = 'migrations'
      }
    )
    vars = [ordered]@{
      RUNTIME_ENVIRONMENT = 'production'
      BANCO_NOTAS_ADDIN_AUDIENCE = '73ab83d3-00ba-494a-a1f8-586d250d420a'
      BANCO_NOTAS_ADDIN_SCOPE = 'BancoNotas.Sync'
      BANCO_NOTAS_ADDIN_CONTEXT_ENABLED = '1'
    }
  }
  [IO.File]::WriteAllText(
    $configPath,
    ($config | ConvertTo-Json -Depth 20),
    [Text.UTF8Encoding]::new($false)
  )
}

function Invoke-Wrangler {
  param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string[]]$Arguments
  )
  $previousToken = $env:CLOUDFLARE_API_TOKEN
  try {
    $env:CLOUDFLARE_API_TOKEN = $Token
    & npx wrangler @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Wrangler falhou: npx wrangler $($Arguments -join ' ')"
    }
  }
  finally {
    $env:CLOUDFLARE_API_TOKEN = $previousToken
  }
}

function Get-D1Verification {
  $result = Invoke-WranglerJson -Token $env:CLOUDFLARE_D1_API_TOKEN -Arguments @(
    'd1', 'execute', $bindingName, '--remote', '--config', $configPath, '--json', '--command',
    "SELECT sync_enabled,commit_route_enabled,(SELECT COUNT(*) FROM sync_pilot_eligibility WHERE enabled=1) AS pilot_count,(SELECT COUNT(*) FROM d1_migrations) AS migration_count FROM sync_configuration WHERE id='global'"
  )
  $row = @($result)[0].results[0]
  if ([int]$row.sync_enabled -ne 0 -or [int]$row.commit_route_enabled -ne 0 -or [int]$row.pilot_count -ne 0) {
    throw 'As flags de produção não permaneceram em zero após a migration.'
  }
  if ([int]$row.migration_count -ne 8) {
    throw "Esperadas 8 migrations; encontrado $($row.migration_count)."
  }
  return [ordered]@{
    syncEnabled = [int]$row.sync_enabled
    commitRouteEnabled = [int]$row.commit_route_enabled
    enabledPilotCount = [int]$row.pilot_count
    migrationCount = [int]$row.migration_count
  }
}

Assert-Environment
$project = Invoke-CloudflareGet -Path "/pages/projects/$projectName"
$currentDeployment = Get-CurrentDeployment
$databases = @(Get-Databases)

if ($Operation -eq 'snapshot') {
  New-Evidence -Project $project -CurrentDeployment $currentDeployment -Databases $databases -Status 'BANCO_NOTAS_PRODUCTION_SNAPSHOT_PASSED'
  Write-Host 'BANCO_NOTAS_PRODUCTION_SNAPSHOT_PASSED'
  exit 0
}

Assert-ReadOnlyDeployInput -CurrentDeployment $currentDeployment
Assert-NoUnexpectedResourceBindings -Project $project
$database = Resolve-ProductionDatabase
$existingD1Map = Get-PropertyMap (Get-NamedProperty -Value $project.deployment_configs.production -Name 'd1_databases')
if ($existingD1Map.Count -eq 1 -and [string]$existingD1Map[$bindingName].id -ne [string]$database.uuid) {
  throw 'BANCO_NOTAS_DB já existe, mas aponta para outro D1. Deploy recusado.'
}
New-ProductionConfig -Project $project -Database $database

Invoke-Wrangler -Token $env:CLOUDFLARE_D1_API_TOKEN -Arguments @(
  'd1', 'export', $bindingName, '--remote', '--config', $configPath, '--output', $backupPath
)
$backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()

Invoke-Wrangler -Token $env:CLOUDFLARE_D1_API_TOKEN -Arguments @(
  'd1', 'migrations', 'apply', $bindingName, '--remote', '--config', $configPath
)
$verification = Get-D1Verification
$verification['preMigrationBackupSha256'] = $backupHash
$verification['preMigrationBackupBytes'] = (Get-Item -LiteralPath $backupPath).Length

$env:VITE_BANCO_NOTAS_ADDIN_CLIENT_ID = '73ab83d3-00ba-494a-a1f8-586d250d420a'
$env:VITE_TENANT_ID = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188'
$env:VITE_BANCO_NOTAS_RUNTIME_HOMOLOGATION = '0'
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build do RC falhou.' }

Invoke-Wrangler -Token $env:CLOUDFLARE_PAGES_API_TOKEN -Arguments @(
  'pages', 'deploy', '../../dist', '--cwd', $workingDirectory, '--project-name', $projectName,
  '--branch', 'main', '--commit-hash', $ExpectedReleaseSha, '--commit-dirty=true'
)

$newDeployment = Get-CurrentDeployment
if ([string]$newDeployment.Id -eq [string]$currentDeployment.Id) {
  throw 'O deploy terminou sem produzir um novo deployment identificável.'
}
$verification = Get-D1Verification
$verification['preMigrationBackupSha256'] = $backupHash
$verification['preMigrationBackupBytes'] = (Get-Item -LiteralPath $backupPath).Length

New-Evidence `
  -Project (Invoke-CloudflareGet -Path "/pages/projects/$projectName") `
  -CurrentDeployment $currentDeployment `
  -Databases @(Get-Databases) `
  -Status 'BANCO_NOTAS_PRODUCTION_READ_ONLY_DEPLOYED' `
  -ProductionDatabase ([ordered]@{ name = $databaseName; uuid = [string]$database.uuid }) `
  -NewDeployment ([ordered]@{ id = [string]$newDeployment.Id; url = [string]$newDeployment.Deployment }) `
  -Verification $verification

Write-Host 'BANCO_NOTAS_PRODUCTION_READ_ONLY_DEPLOYED'
