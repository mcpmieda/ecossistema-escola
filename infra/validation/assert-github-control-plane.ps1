[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WorkflowRoot = Join-Path $PSScriptRoot '../../.github/workflows'
$WorkflowRoot = [IO.Path]::GetFullPath($WorkflowRoot)

$AllowedIdTokenFiles = @(
    'ci.yml',
    'verify-recovery.yml',
    'rotate-technical-identity.yml'
)

$Errors = [System.Collections.Generic.List[string]]::new()

$WorkflowFiles = Get-ChildItem `
    -Path $WorkflowRoot `
    -File |
    Where-Object {
        $_.Extension -in @('.yml', '.yaml')
    }

foreach ($file in $WorkflowFiles) {

    $content = Get-Content `
        -LiteralPath $file.FullName `
        -Raw

    # --------------------------------------------------------
    # OIDC privilegiado
    # --------------------------------------------------------

    if ($content -match '(?m)^\s*id-token:\s*write\s*(?:#.*)?$') {

        if ($AllowedIdTokenFiles -notcontains $file.Name) {
            $Errors.Add(
                "$($file.Name): id-token: write não está na allowlist."
            )
        }

        if ($content -notmatch '(?m)^\s*environment:\s*production\s*$') {
            $Errors.Add(
                "$($file.Name): OIDC privilegiado exige environment: production."
            )
        }
    }

    # --------------------------------------------------------
    # Não aceitar write-all
    # --------------------------------------------------------

    if ($content -match '(?m)^\s*permissions:\s*write-all\s*$') {
        $Errors.Add(
            "$($file.Name): permissions: write-all é proibido."
        )
    }

    # --------------------------------------------------------
    # Não aceitar inputs capazes de virar shell/API arbitrária
    # --------------------------------------------------------

    $DangerousInputPatterns = @(
        '\$\{\{\s*inputs\.command\s*\}\}',
        '\$\{\{\s*inputs\.script\s*\}\}',
        '\$\{\{\s*inputs\.shell\s*\}\}',
        '\$\{\{\s*inputs\.url\s*\}\}',
        '\$\{\{\s*inputs\.endpoint\s*\}\}',
        '\$\{\{\s*inputs\.graphPath\s*\}\}',
        '\$\{\{\s*inputs\.graph_path\s*\}\}'
    )

    foreach ($pattern in $DangerousInputPatterns) {
        if ($content -match $pattern) {
            $Errors.Add(
                "$($file.Name): input arbitrário proibido encontrado ($pattern)."
            )
        }
    }

    # --------------------------------------------------------
    # Actions externas precisam de SHA completo imutável
    # --------------------------------------------------------

    $usesMatches = [regex]::Matches(
        $content,
        '(?m)^\s*uses:\s*([^\s#]+)'
    )

    foreach ($match in $usesMatches) {

        $uses = $match.Groups[1].Value.Trim()

        if ($uses.StartsWith('./')) {
            continue
        }

        if ($uses.StartsWith('docker://')) {
            continue
        }

        if ($uses -notmatch '@[0-9a-fA-F]{40}$') {
            $Errors.Add(
                "$($file.Name): Action sem SHA imutável: $uses"
            )
        }
    }
}

if ($Errors.Count -gt 0) {

    Write-Host ""
    Write-Host "Falhas da política GitHub Control Plane:"
    Write-Host ""

    foreach ($errorMessage in $Errors) {
        Write-Host " - $errorMessage"
    }

    Write-Host ""

    throw "GitHub Control Plane policy falhou com $($Errors.Count) ocorrência(s)."
}

Write-Host "GitHub Control Plane policy: OK"
