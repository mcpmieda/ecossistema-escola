[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet(
        'status',
        'validar',
        'recuperacao',
        'rotacionar',
        'm365-bootstrap',
        'm365',
        'logs',
        'artefatos'
    )]
    [string] $Acao,

    [ValidateSet(
        'identity-check',
        'sharepoint-health',
        'banco-notas-readiness'
    )]
    [string] $OperacaoM365 = 'identity-check',

    [long] $RunId,

    [switch] $ForcarRotacao,

    [switch] $SimularFalha,

    [string] $Destino = (Join-Path $PWD 'artifacts')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = 'mcpmieda/ecossistema-escola'
$MainRef = 'main'

function Assert-GitHubCli {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) não encontrado.'
    }

    & gh auth status *> $null

    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub CLI não está autenticado. Execute: gh auth login --web'
    }
}

function Invoke-GitHubWorkflow {
    param(
        [Parameter(Mandatory)]
        [string] $Workflow,

        [hashtable] $Fields = @{},

        [string] $Ref = 'main'
    )

    $ghArgs = @(
        'workflow',
        'run',
        $Workflow,
        '--repo',
        $Repo,
        '--ref',
        $Ref
    )

    foreach ($entry in ($Fields.GetEnumerator() | Sort-Object Name)) {
        $ghArgs += @(
            '--raw-field',
            "$($entry.Key)=$($entry.Value)"
        )
    }

    Write-Host ""
    Write-Host "Disparando workflow: $Workflow"
    Write-Host "Ref: $Ref"
    Write-Host ""

    $dispatchOutput = @(& gh @ghArgs 2>&1)

    if ($LASTEXITCODE -ne 0) {
        throw ($dispatchOutput -join [Environment]::NewLine)
    }

    $runIdFound = $null

    foreach ($line in $dispatchOutput) {
        if ([string]$line -match '/actions/runs/([0-9]+)') {
            $runIdFound = [long]$Matches[1]
        }
    }

    if (-not $runIdFound) {
        Start-Sleep -Seconds 3

        $runsJson = & gh run list `
            --repo $Repo `
            --workflow $Workflow `
            --event workflow_dispatch `
            --branch $Ref `
            --limit 1 `
            --json databaseId,url,status,conclusion,createdAt

        if ($LASTEXITCODE -ne 0) {
            throw "Workflow disparado, mas não foi possível localizar a execução."
        }

        $runs = @($runsJson | ConvertFrom-Json)

        if ($runs.Count -gt 0) {
            $runIdFound = [long]$runs[0].databaseId
        }
    }

    if (-not $runIdFound) {
        throw "Não foi possível identificar o GitHub Actions run."
    }

    Write-Host ""
    Write-Host "GitHub Actions run: $runIdFound"
    Write-Host ""

    & gh run watch $runIdFound `
        --repo $Repo `
        --exit-status

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Etapas que falharam:"
        & gh run view $runIdFound `
            --repo $Repo `
            --log-failed

        throw "GitHub Actions run $runIdFound falhou."
    }

    Write-Host ""
    Write-Host "Execução concluída com sucesso: $runIdFound"

    return $runIdFound
}

Assert-GitHubCli

switch ($Acao) {

    'status' {
        Write-Host ""
        Write-Host "=== WORKFLOWS ==="
        & gh workflow list --repo $Repo

        Write-Host ""
        Write-Host "=== ÚLTIMAS EXECUÇÕES ==="
        & gh run list `
            --repo $Repo `
            --limit 15
    }

    'validar' {
        Invoke-GitHubWorkflow `
            -Workflow 'ci.yml' `
            -Ref $MainRef
    }

    'recuperacao' {
        Invoke-GitHubWorkflow `
            -Workflow 'verify-recovery.yml' `
            -Ref $MainRef
    }

    'rotacionar' {
        $fields = @{
            force_rotation  = $ForcarRotacao.IsPresent.ToString().ToLowerInvariant()
            simulate_failure = $SimularFalha.IsPresent.ToString().ToLowerInvariant()
        }

        Invoke-GitHubWorkflow `
            -Workflow 'rotate-technical-identity.yml' `
            -Fields $fields `
            -Ref $MainRef
    }

    'm365-bootstrap' {
        Invoke-GitHubWorkflow `
            -Workflow 'bootstrap-m365-operations-identity.yml' `
            -Ref $MainRef
    }

    'm365' {
        $fields = @{
            operation = $OperacaoM365
        }

        Invoke-GitHubWorkflow `
            -Workflow 'm365-operations.yml' `
            -Fields $fields `
            -Ref $MainRef
    }

    'logs' {
        if ($RunId -le 0) {
            throw 'Informe -RunId.'
        }

        & gh run view $RunId `
            --repo $Repo `
            --log

        if ($LASTEXITCODE -ne 0) {
            throw "Não foi possível consultar os logs do run $RunId."
        }
    }

    'artefatos' {
        if ($RunId -le 0) {
            throw 'Informe -RunId.'
        }

        New-Item `
            -ItemType Directory `
            -Path $Destino `
            -Force | Out-Null

        & gh run download $RunId `
            --repo $Repo `
            --dir $Destino

        if ($LASTEXITCODE -ne 0) {
            throw "Não foi possível baixar os artifacts do run $RunId."
        }

        Write-Host "Artifacts: $Destino"
    }
}
