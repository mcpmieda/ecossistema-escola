[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InfraRoot = [IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..')
)

$Failures = [System.Collections.Generic.List[string]]::new()

$PowerShellFiles = Get-ChildItem `
    -Path $InfraRoot `
    -Recurse `
    -File `
    -Filter '*.ps1'

foreach ($file in $PowerShellFiles) {
    $tokens = $null
    $parseErrors = $null

    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $file.FullName,
        [ref] $tokens,
        [ref] $parseErrors
    )

    foreach ($parseError in @($parseErrors)) {
        $relativePath = [IO.Path]::GetRelativePath(
            $InfraRoot,
            $file.FullName
        )

        $Failures.Add(
            "${relativePath}:$($parseError.Extent.StartLineNumber):$($parseError.Extent.StartColumnNumber) $($parseError.Message)"
        )
    }
}

if ($Failures.Count -gt 0) {
    Write-Host ''
    Write-Host 'Falhas de sintaxe PowerShell:'
    Write-Host ''

    foreach ($failure in $Failures) {
        Write-Host " - $failure"
    }

    throw "PowerShell syntax validation falhou com $($Failures.Count) ocorrência(s)."
}

Write-Host "PowerShell syntax: OK ($($PowerShellFiles.Count) arquivo(s))"
