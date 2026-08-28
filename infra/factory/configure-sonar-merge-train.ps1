[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $Organization,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $ProjectKey,

    [ValidateNotNullOrEmpty()]
    [string] $Repository = 'mcpmieda/ecossistema-escola',

    [ValidateRange(1, 2147483647)]
    [int] $HomologationPr = 126,

    [switch] $SkipHomologation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-GitHubCli {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) não encontrado. Instale o GitHub CLI e execute novamente.'
    }

    & gh auth status *> $null

    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub CLI não está autenticado. Execute: gh auth login --web'
    }
}

function Invoke-Gh {
    param(
        [Parameter(Mandatory)]
        [string[]] $Arguments
    )

    $output = @(& gh @Arguments 2>&1)

    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }

    return $output
}

function Set-SonarTokenSecret {
    param(
        [Parameter(Mandatory)]
        [string] $Repo
    )

    $secureToken = Read-Host 'Cole o SONAR_TOKEN (o valor não será exibido)' -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = $null

    try {
        $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)

        if ([string]::IsNullOrWhiteSpace($plainToken)) {
            throw 'SONAR_TOKEN não pode ser vazio.'
        }

        $plainToken | & gh secret set 'SONAR_TOKEN' --repo $Repo

        if ($LASTEXITCODE -ne 0) {
            throw 'Não foi possível gravar o secret SONAR_TOKEN.'
        }
    }
    finally {
        if ($tokenPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
        }

        $plainToken = $null
        $secureToken.Dispose()
    }
}

function Start-SonarHomologation {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [int] $PrNumber
    )

    $headSha = (Invoke-Gh -Arguments @(
            'pr', 'view', [string] $PrNumber,
            '--repo', $Repo,
            '--json', 'headRefOid',
            '--jq', '.headRefOid'
        ) | Select-Object -First 1).Trim()

    if ($headSha -notmatch '^[0-9a-f]{40}$') {
        throw "PR #$PrNumber não retornou um head SHA válido: $headSha"
    }

    Write-Host ''
    Write-Host "Disparando Sonar para PR #$PrNumber @ $headSha"

    Invoke-Gh -Arguments @(
        'workflow', 'run', 'merge-train-sonar.yml',
        '--repo', $Repo,
        '--ref', 'main',
        '--raw-field', "expected_sha=$headSha",
        '--raw-field', "pr_number=$PrNumber"
    ) | Out-Null

    $expectedTitle = "Sonar PR $PrNumber @ $headSha"
    $runId = $null

    for ($attempt = 0; $attempt -lt 12 -and -not $runId; $attempt += 1) {
        Start-Sleep -Seconds 2

        $runsJson = Invoke-Gh -Arguments @(
            'run', 'list',
            '--repo', $Repo,
            '--workflow', 'merge-train-sonar.yml',
            '--event', 'workflow_dispatch',
            '--limit', '10',
            '--json', 'databaseId,displayTitle,status,conclusion'
        )

        $runs = @($runsJson -join [Environment]::NewLine | ConvertFrom-Json)
        $match = $runs | Where-Object { $_.displayTitle -eq $expectedTitle } | Select-Object -First 1

        if ($match) {
            $runId = [long] $match.databaseId
        }
    }

    if (-not $runId) {
        throw "Workflow Sonar foi disparado, mas a execução '$expectedTitle' não foi localizada."
    }

    Write-Host "GitHub Actions run: $runId"
    & gh run watch $runId --repo $Repo --exit-status

    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host 'Etapas Sonar que falharam:'
        & gh run view $runId --repo $Repo --log-failed
        throw "Homologação Sonar falhou no run $runId."
    }

    Write-Host ''
    Write-Host "Sonar homologado com sucesso no PR #$PrNumber @ $headSha."
}

Assert-GitHubCli

Write-Host 'Configurando Factory Merge Train / SonarCloud...'

Invoke-Gh -Arguments @(
    'variable', 'set', 'SONAR_PROJECT_KEY',
    '--repo', $Repository,
    '--body', $ProjectKey
) | Out-Null

Invoke-Gh -Arguments @(
    'variable', 'set', 'SONAR_ORGANIZATION',
    '--repo', $Repository,
    '--body', $Organization
) | Out-Null

Set-SonarTokenSecret -Repo $Repository

$storedProjectKey = (Invoke-Gh -Arguments @(
        'variable', 'get', 'SONAR_PROJECT_KEY',
        '--repo', $Repository
    ) | Select-Object -First 1).Trim()
$storedOrganization = (Invoke-Gh -Arguments @(
        'variable', 'get', 'SONAR_ORGANIZATION',
        '--repo', $Repository
    ) | Select-Object -First 1).Trim()

if ($storedProjectKey -ne $ProjectKey -or $storedOrganization -ne $Organization) {
    throw 'As repository variables Sonar não foram persistidas com os valores esperados.'
}

$secretNames = Invoke-Gh -Arguments @(
    'secret', 'list',
    '--repo', $Repository,
    '--json', 'name',
    '--jq', '.[].name'
)

if ($secretNames -notcontains 'SONAR_TOKEN') {
    throw 'SONAR_TOKEN não aparece na lista de secrets do repositório após a gravação.'
}

Write-Host 'SONAR_PROJECT_KEY, SONAR_ORGANIZATION e SONAR_TOKEN configurados.'

if (-not $SkipHomologation) {
    Start-SonarHomologation -Repo $Repository -PrNumber $HomologationPr
}
