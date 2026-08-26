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

# Aceita:
# id-token: write
# id-token: "write"
# "id-token": write
# "id-token": "write"
$IdTokenWritePattern = '(?mi)^\s*[''"]?id-token[''"]?\s*:\s*[''"]?write[''"]?\s*(?:#.*)?$'

function Get-WorkflowJobBlocks {
    param(
        [Parameter(Mandatory)]
        [string] $Content
    )

    $lines = @($Content -split '\r?\n')
    $jobsIndex = -1

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^jobs:\s*(?:#.*)?$') {
            $jobsIndex = $i
            break
        }
    }

    if ($jobsIndex -lt 0) {
        return @()
    }

    $jobsEnd = $lines.Count - 1

    for ($i = $jobsIndex + 1; $i -lt $lines.Count; $i++) {
        if (
            $lines[$i] -match '^[A-Za-z_][A-Za-z0-9_-]*:\s*' -and
            $lines[$i] -notmatch '^\s'
        ) {
            $jobsEnd = $i - 1
            break
        }
    }

    $starts = [System.Collections.Generic.List[object]]::new()

    for ($i = $jobsIndex + 1; $i -le $jobsEnd; $i++) {
        if ($lines[$i] -match '^  (?<Name>[A-Za-z0-9_-]+):\s*(?:#.*)?$') {
            $starts.Add(
                [pscustomobject]@{
                    Name  = $Matches.Name
                    Start = $i
                }
            )
        }
    }

    $blocks = [System.Collections.Generic.List[object]]::new()

    for ($i = 0; $i -lt $starts.Count; $i++) {

        $start = $starts[$i].Start

        if ($i + 1 -lt $starts.Count) {
            $end = $starts[$i + 1].Start - 1
        }
        else {
            $end = $jobsEnd
        }

        $jobLines = @($lines[$start..$end])

        $blocks.Add(
            [pscustomobject]@{
                Name  = $starts[$i].Name
                Lines = $jobLines
                Text  = ($jobLines -join [Environment]::NewLine)
            }
        )
    }

    return @($blocks)
}

function Test-ProductionEnvironment {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [AllowEmptyCollection()]
        [string[]] $Lines
    )

    for ($i = 0; $i -lt $Lines.Count; $i++) {

        # environment: production
        if (
            $Lines[$i] -match
            '^    environment:\s*[''"]?production[''"]?\s*(?:#.*)?$'
        ) {
            return $true
        }

        # environment:
        #   name: production
        if ($Lines[$i] -match '^    environment:\s*(?:#.*)?$') {

            for ($j = $i + 1; $j -lt $Lines.Count; $j++) {

                if ([string]::IsNullOrWhiteSpace($Lines[$j])) {
                    continue
                }

                if ($Lines[$j] -match '^    [A-Za-z0-9_-]+:') {
                    break
                }

                if (
                    $Lines[$j] -match
                    '^      name:\s*[''"]?production[''"]?\s*(?:#.*)?$'
                ) {
                    return $true
                }
            }
        }
    }

    return $false
}

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

    $AllIdTokenMatches = @(
        [regex]::Matches(
            $content,
            $IdTokenWritePattern
        )
    )

    $Jobs = @(
        Get-WorkflowJobBlocks -Content $content
    )

    $JobScopedIdTokenCount = 0

    foreach ($job in $Jobs) {

        $JobIdTokenMatches = @(
            [regex]::Matches(
                $job.Text,
                $IdTokenWritePattern
            )
        )

        if ($JobIdTokenMatches.Count -eq 0) {
            continue
        }

        $JobScopedIdTokenCount += $JobIdTokenMatches.Count

        if ($AllowedIdTokenFiles -notcontains $file.Name) {
            $Errors.Add(
                "$($file.Name)/$($job.Name): id-token: write não está na allowlist."
            )
        }

        if (-not (Test-ProductionEnvironment -Lines $job.Lines)) {
            $Errors.Add(
                "$($file.Name)/$($job.Name): OIDC exige environment production no mesmo job."
            )
        }
    }

    # Proíbe OIDC em permissions global do workflow.
    if ($AllIdTokenMatches.Count -gt $JobScopedIdTokenCount) {
        $Errors.Add(
            "$($file.Name): id-token: write fora de um job específico é proibido."
        )
    }

    if (
        $content -match
        '(?mi)^\s*permissions:\s*[''"]?write-all[''"]?\s*(?:#.*)?$'
    ) {
        $Errors.Add(
            "$($file.Name): permissions: write-all é proibido."
        )
    }

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

    $usesMatches = [regex]::Matches(
        $content,
        '(?m)^\s*uses:\s*[''"]?([^\s#''"]+)[''"]?'
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

    throw "GitHub Control Plane policy falhou com $($Errors.Count) ocorrência(s)."
}

Write-Host "GitHub Control Plane policy: OK"