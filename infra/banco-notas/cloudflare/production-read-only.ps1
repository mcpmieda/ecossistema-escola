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
$deployRedirectDirectory = Join-Path $repositoryRoot '.wrangler\deploy'
$deployRedirectPath = Join-Path $deployRedirectDirectory 'config.json'
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

function Get-CurrentDeployment {
  param([Parameter(Mandatory)][object]$Project)
  $canonical = Get-NamedProperty -Value $Project -Name 'canonical_deployment'
  $id = [string](Get-NamedProperty -Value $canonical -Name 'id')
  if ($id -notmatch '^[0-9a-fA-F-]{36}$') {
    throw 'Nenhum deployment Pages canônico de produção foi encontrado.'
  }
  return [pscustomobject]@{
    Id = $id
    Deployment = [string](Get-NamedProperty -Value $canonical -Name 'url')
    Branch = [string]$canonical.deployment_trigger.metadata.branch
  }
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
  foreach ($property in $production.PSObject.Properties) {
    if (
      $property.Name -eq 'mtls_certificates' -or
      $property.Name -match '(bindings|namespaces|buckets|databases|datasets|producers|services|browsers)$'
    ) {
      $map = Get-PropertyMap $property.Value
      $bindingGroups[$property.Name] = @($map.Keys | Sort-Object)
    }
  }
  $environmentVariables = [ordered]@{}
  $envMap = Get-PropertyMap (Get-NamedProperty -Value $production -Name 'env_vars')
  foreach ($name in @($envMap.Keys | Sort-Object)) {
    $type = Get-NamedProperty -Value $envMap[$name] -Name 'type'
    $environmentVariables[$name] = $(if ($type) { [string]$type } else { 'unknown' })
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
  $currentDetails = Invoke-CloudflareGet -Path "/pages/projects/$projectName/deployments/$($CurrentDeployment.Id)"
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
      commitSha = [string]$currentDetails.deployment_trigger.metadata.commit_hash
      stageStatus = [string]$currentDetails.latest_stage.status
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
  foreach ($property in $production.PSObject.Properties) {
    if (
      $property.Name -ne 'd1_databases' -and
      (
        $property.Name -eq 'mtls_certificates' -or
        $property.Name -match '(bindings|namespaces|buckets|databases|datasets|producers|services|browsers)$'
      )
    ) {
      $keys = @((Get-PropertyMap $property.Value).Keys)
      if ($keys.Count -gt 0) {
        throw "Binding de produção inesperado em $($property.Name): $($keys -join ', ')."
      }
    }
  }
  $d1Map = Get-PropertyMap (Get-NamedProperty -Value $production -Name 'd1_databases')
  $d1Keys = @($d1Map.Keys)
  if ($d1Keys.Count -gt 0 -and ($d1Keys.Count -ne 1 -or $d1Keys[0] -ne $bindingName)) {
    throw "Binding D1 de produção inesperado: $($d1Keys -join ', ')."
  }
}

function Resolve-ProductionDatabase {
  $databaseMatches = @(Get-Databases | Where-Object { [string]$_.name -eq $databaseName })
  if ($databaseMatches.Count -gt 1) {
    throw "Mais de um D1 chamado $databaseName foi encontrado."
  }
  if ($databaseMatches.Count -eq 0) {
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
    $databaseMatches = @(Get-Databases | Where-Object { [string]$_.name -eq $databaseName })
  }
  if (
    $databaseMatches.Count -ne 1 -or
    [string]$databaseMatches[0].uuid -notmatch '^[0-9a-fA-F-]{36}$'
  ) {
    throw 'O D1 de produção não pôde ser resolvido de forma inequívoca.'
  }
  return $databaseMatches[0]
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
  $productionVars = [ordered]@{}
  $environmentVariableMap = Get-PropertyMap (Get-NamedProperty -Value $production -Name 'env_vars')
  foreach ($variableName in @($environmentVariableMap.Keys | Sort-Object)) {
    $variable = $environmentVariableMap[$variableName]
    $variableType = [string](Get-NamedProperty -Value $variable -Name 'type')
    if ($variableType -eq 'plain_text') {
      $productionVars[$variableName] = [string](Get-NamedProperty -Value $variable -Name 'value')
      continue
    }
    if ($variableType -ne 'secret_text') {
      throw "Tipo inesperado para a variável de produção $variableName`: $variableType."
    }
  }
  $productionVars['RUNTIME_ENVIRONMENT'] = 'production'
  $productionVars['BANCO_NOTAS_ADDIN_AUDIENCE'] = '73ab83d3-00ba-494a-a1f8-586d250d420a'
  $productionVars['BANCO_NOTAS_ADDIN_SCOPE'] = 'BancoNotas.Sync'
  $productionVars['BANCO_NOTAS_ADDIN_CONTEXT_ENABLED'] = '1'
  $config = [ordered]@{
    '$schema' = '../../node_modules/wrangler/config-schema.json'
    name = $projectName
    pages_build_output_dir = '../../dist'
    compatibility_date = $compatibilityDate
    compatibility_flags = @(Get-NamedProperty -Value $production -Name 'compatibility_flags')
    d1_databases = @(
      [ordered]@{
        binding = $bindingName
        database_name = $databaseName
        database_id = [string]$Database.uuid
        migrations_dir = 'migrations'
      }
    )
    vars = $productionVars
  }
  [IO.File]::WriteAllText(
    $configPath,
    ($config | ConvertTo-Json -Depth 20),
    [Text.UTF8Encoding]::new($false)
  )
  New-Item -ItemType Directory -Path $deployRedirectDirectory -Force | Out-Null
  $redirect = [ordered]@{
    configPath = '../banco-notas-production/wrangler.jsonc'
  }
  [IO.File]::WriteAllText(
    $deployRedirectPath,
    ($redirect | ConvertTo-Json),
    [Text.UTF8Encoding]::new($false)
  )
}

function Invoke-Wrangler {
  param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$SuppressOutput
  )
  $previousToken = $env:CLOUDFLARE_API_TOKEN
  try {
    $env:CLOUDFLARE_API_TOKEN = $Token
    $output = @(& npx wrangler @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
      $details = $(if ($SuppressOutput) { 'saída suprimida' } else { $output -join [Environment]::NewLine })
      throw "Wrangler falhou: npx wrangler $($Arguments -join ' ')`n$details"
    }
    if (-not $SuppressOutput) {
      $output | ForEach-Object { Write-Host $_ }
    }
  }
  finally {
    $env:CLOUDFLARE_API_TOKEN = $previousToken
  }
}

function Get-D1TimeTravelBookmark {
  param([Parameter(Mandatory)][object]$Database)
  $databaseId = [string]$Database.uuid
  if ($databaseId -notmatch '^[0-9a-fA-F-]{36}$') {
    throw 'UUID do D1 inválido para obter o bookmark de Time Travel.'
  }
  $headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_D1_API_TOKEN)" }
  $response = Invoke-RestMethod `
    -Method Get `
    -Uri "$apiBase/d1/database/$databaseId/time_travel/bookmark" `
    -Headers $headers
  $bookmark = [string]$response.result.bookmark
  if (-not $response.success -or [string]::IsNullOrWhiteSpace($bookmark)) {
    throw 'O D1 não forneceu um bookmark de Time Travel pré-migration.'
  }
  return $bookmark
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
$currentDeployment = Get-CurrentDeployment -Project $project
$databases = @(Get-Databases)

if ($Operation -eq 'snapshot') {
  New-Evidence -Project $project -CurrentDeployment $currentDeployment -Databases $databases -Status 'BANCO_NOTAS_PRODUCTION_SNAPSHOT_PASSED'
  Write-Host 'BANCO_NOTAS_PRODUCTION_SNAPSHOT_PASSED'
  exit 0
}

Assert-ReadOnlyDeployInput -CurrentDeployment $currentDeployment
Assert-NoUnexpectedResourceBindings -Project $project
New-Evidence `
  -Project $project `
  -CurrentDeployment $currentDeployment `
  -Databases $databases `
  -Status 'BANCO_NOTAS_PRODUCTION_PRE_MUTATION_SNAPSHOT_PASSED'
$database = Resolve-ProductionDatabase
$existingD1Map = Get-PropertyMap (Get-NamedProperty -Value $project.deployment_configs.production -Name 'd1_databases')
if ($existingD1Map.Count -eq 1 -and [string]$existingD1Map[$bindingName].id -ne [string]$database.uuid) {
  throw 'BANCO_NOTAS_DB já existe, mas aponta para outro D1. Deploy recusado.'
}
New-ProductionConfig -Project $project -Database $database

$backupBookmark = Get-D1TimeTravelBookmark -Database $database
$backupHash = ''
$backupBytes = 0
try {
  Invoke-Wrangler -Token $env:CLOUDFLARE_D1_API_TOKEN -Arguments @(
    'd1', 'export', $bindingName, '--remote', '--skip-confirmation', '--config', $configPath, '--output', $backupPath
  ) -SuppressOutput
  $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $backupBytes = (Get-Item -LiteralPath $backupPath).Length
}
finally {
  if (Test-Path -LiteralPath $backupPath) {
    Remove-Item -LiteralPath $backupPath -Force
  }
}
$backupEvidence = [ordered]@{
  preMigrationBackupSha256 = $backupHash
  preMigrationBackupBytes = $backupBytes
  preMigrationRestore = [ordered]@{
    mechanism = 'cloudflare-d1-time-travel'
    bookmark = $backupBookmark
    databaseUuid = [string]$database.uuid
  }
}
New-Evidence `
  -Project $project `
  -CurrentDeployment $currentDeployment `
  -Databases @(Get-Databases) `
  -Status 'BANCO_NOTAS_PRODUCTION_PRE_MIGRATION_BACKUP_PASSED' `
  -ProductionDatabase ([ordered]@{ name = $databaseName; uuid = [string]$database.uuid }) `
  -Verification $backupEvidence

Invoke-Wrangler -Token $env:CLOUDFLARE_D1_API_TOKEN -Arguments @(
  'd1', 'migrations', 'apply', $bindingName, '--remote', '--config', $configPath
)
$verification = Get-D1Verification
$verification['preMigrationBackupSha256'] = $backupHash
$verification['preMigrationBackupBytes'] = $backupBytes
$verification['preMigrationRestore'] = [ordered]@{
  mechanism = 'cloudflare-d1-time-travel'
  bookmark = $backupBookmark
  databaseUuid = [string]$database.uuid
}

$env:VITE_BANCO_NOTAS_ADDIN_CLIENT_ID = '73ab83d3-00ba-494a-a1f8-586d250d420a'
$env:VITE_TENANT_ID = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188'
$env:VITE_BANCO_NOTAS_RUNTIME_HOMOLOGATION = '0'
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build do RC falhou.' }

Invoke-Wrangler -Token $env:CLOUDFLARE_PAGES_API_TOKEN -Arguments @(
  'pages', 'deploy', 'dist', '--project-name', $projectName,
  '--branch', 'main', '--commit-hash', $ExpectedReleaseSha, '--commit-dirty=true'
)

$newProject = Invoke-CloudflareGet -Path "/pages/projects/$projectName"
$newDeployment = Get-CurrentDeployment -Project $newProject
if ([string]$newDeployment.Id -eq [string]$currentDeployment.Id) {
  throw 'O deploy terminou sem produzir um novo deployment identificável.'
}
$newDeploymentDetails = Invoke-CloudflareGet -Path "/pages/projects/$projectName/deployments/$($newDeployment.Id)"
if (
  [string]$newDeploymentDetails.environment -ne 'production' -or
  [string]$newDeploymentDetails.deployment_trigger.metadata.branch -ne 'main' -or
  [string]$newDeploymentDetails.deployment_trigger.metadata.commit_hash -ne $ExpectedReleaseSha -or
  [string]$newDeploymentDetails.latest_stage.status -ne 'success'
) {
  throw 'O novo deployment não comprovou ambiente, branch, SHA e status esperados.'
}
$verification = Get-D1Verification
$verification['preMigrationBackupSha256'] = $backupHash
$verification['preMigrationBackupBytes'] = $backupBytes
$verification['preMigrationRestore'] = [ordered]@{
  mechanism = 'cloudflare-d1-time-travel'
  bookmark = $backupBookmark
  databaseUuid = [string]$database.uuid
}

New-Evidence `
  -Project (Invoke-CloudflareGet -Path "/pages/projects/$projectName") `
  -CurrentDeployment $currentDeployment `
  -Databases @(Get-Databases) `
  -Status 'BANCO_NOTAS_PRODUCTION_READ_ONLY_DEPLOYED' `
  -ProductionDatabase ([ordered]@{ name = $databaseName; uuid = [string]$database.uuid }) `
  -NewDeployment ([ordered]@{
    id = [string]$newDeployment.Id
    url = [string]$newDeploymentDetails.url
    commitSha = [string]$newDeploymentDetails.deployment_trigger.metadata.commit_hash
    stageStatus = [string]$newDeploymentDetails.latest_stage.status
  }) `
  -Verification $verification

Write-Host 'BANCO_NOTAS_PRODUCTION_READ_ONLY_DEPLOYED'
