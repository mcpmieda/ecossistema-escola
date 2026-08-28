[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $Organization,

    [string] $ProjectKey = '',

    [string] $ProjectName = '',

    [ValidateSet('public', 'private')]
    [string] $ProjectVisibility = 'public',

    [ValidateNotNullOrEmpty()]
    [string] $Repository = 'mcpmieda/ecossistema-escola',

    [ValidateRange(1, 2147483647)]
    [int] $HomologationPr = 126,

    [switch] $SkipBaseline,

    [switch] $SkipHomologation,

    [switch] $SkipFactoryCi
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

function Invoke-SonarApi {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Get', 'Post')]
        [string] $Method,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string] $Path,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string] $Token,

        [hashtable] $Parameters = @{}
    )

    $headers = @{
        Authorization = "Bearer $Token"
        Accept = 'application/json'
    }
    $uri = "https://sonarcloud.io$Path"

    if ($Method -eq 'Get' -and $Parameters.Count -gt 0) {
        $query = @(
            foreach ($entry in $Parameters.GetEnumerator()) {
                $key = [Uri]::EscapeDataString([string] $entry.Key)
                $value = [Uri]::EscapeDataString([string] $entry.Value)
                "$key=$value"
            }
        ) -join '&'
        $uri = "$uri?$query"
    }

    if ($Method -eq 'Post') {
        return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/x-www-form-urlencoded' -Body $Parameters
    }

    return Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
}

function Ensure-SonarProject {
    param(
        [Parameter(Mandatory)]
        [string] $Token,

        [Parameter(Mandatory)]
        [string] $SonarOrganization,

        [Parameter(Mandatory)]
        [string] $SonarProjectKey,

        [Parameter(Mandatory)]
        [string] $SonarProjectName,

        [Parameter(Mandatory)]
        [ValidateSet('public', 'private')]
        [string] $Visibility
    )

    Write-Host "Validando projeto SonarQube Cloud '$SonarProjectKey'..."
    $search = Invoke-SonarApi -Method Get -Path '/api/projects/search' -Token $Token -Parameters @{
        organization = $SonarOrganization
        projects = $SonarProjectKey
    }
    $projects = @($search.components)

    if ($projects.Count -eq 0) {
        Write-Host 'Projeto ainda não existe; criando via Web API oficial...'
        $null = Invoke-SonarApi -Method Post -Path '/api/projects/create' -Token $Token -Parameters @{
            organization = $SonarOrganization
            project = $SonarProjectKey
            name = $SonarProjectName
            visibility = $Visibility
        }
    }
    elseif ($projects.Count -gt 1) {
        throw "A busca Sonar retornou mais de um projeto para a chave '$SonarProjectKey'."
    }

    $branches = Invoke-SonarApi -Method Get -Path '/api/project_branches/list' -Token $Token -Parameters @{
        project = $SonarProjectKey
    }
    $mainBranch = @($branches.branches | Where-Object { $_.isMain }) | Select-Object -First 1

    if ($null -ne $mainBranch -and $mainBranch.name -ne 'main') {
        Write-Host "Renomeando branch principal Sonar '$($mainBranch.name)' para 'main'..."
        $null = Invoke-SonarApi -Method Post -Path '/api/project_branches/rename' -Token $Token -Parameters @{
            project = $SonarProjectKey
            name = 'main'
        }
    }
}

function Set-SonarGitHubConfiguration {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [string] $SonarOrganization,

        [Parameter(Mandatory)]
        [string] $SonarProjectKey,

        [Parameter(Mandatory)]
        [string] $Token
    )

    Invoke-Gh -Arguments @(
        'variable', 'set', 'SONAR_PROJECT_KEY',
        '--repo', $Repo,
        '--body', $SonarProjectKey
    ) | Out-Null

    Invoke-Gh -Arguments @(
        'variable', 'set', 'SONAR_ORGANIZATION',
        '--repo', $Repo,
        '--body', $SonarOrganization
    ) | Out-Null

    $Token | & gh secret set 'SONAR_TOKEN' --repo $Repo

    if ($LASTEXITCODE -ne 0) {
        throw 'Não foi possível gravar o secret SONAR_TOKEN.'
    }

    $storedProjectKey = (Invoke-Gh -Arguments @(
            'variable', 'get', 'SONAR_PROJECT_KEY',
            '--repo', $Repo
        ) | Select-Object -First 1).Trim()
    $storedOrganization = (Invoke-Gh -Arguments @(
            'variable', 'get', 'SONAR_ORGANIZATION',
            '--repo', $Repo
        ) | Select-Object -First 1).Trim()

    if ($storedProjectKey -ne $SonarProjectKey -or $storedOrganization -ne $SonarOrganization) {
        throw 'As repository variables Sonar não foram persistidas com os valores esperados.'
    }

    $secretNames = Invoke-Gh -Arguments @(
        'secret', 'list',
        '--repo', $Repo,
        '--json', 'name',
        '--jq', '.[].name'
    )

    if ($secretNames -notcontains 'SONAR_TOKEN') {
        throw 'SONAR_TOKEN não aparece na lista de secrets do repositório após a gravação.'
    }
}

function Wait-GitHubRun {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [long] $RunId,

        [Parameter(Mandatory)]
        [string] $Label
    )

    Write-Host "$Label — GitHub Actions run: $RunId"
    & gh run watch $RunId --repo $Repo --exit-status

    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host "$Label — etapas que falharam:"
        & gh run view $RunId --repo $Repo --log-failed
        throw "$Label falhou no run $RunId."
    }
}

function Find-WorkflowRunByTitle {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [string] $Workflow,

        [Parameter(Mandatory)]
        [string] $ExpectedTitle
    )

    for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
        Start-Sleep -Seconds 2
        $runsJson = Invoke-Gh -Arguments @(
            'run', 'list',
            '--repo', $Repo,
            '--workflow', $Workflow,
            '--event', 'workflow_dispatch',
            '--limit', '20',
            '--json', 'databaseId,displayTitle,status,conclusion,headSha,headBranch'
        )
        $runs = @($runsJson -join [Environment]::NewLine | ConvertFrom-Json)
        $match = $runs | Where-Object { $_.displayTitle -eq $ExpectedTitle } | Select-Object -First 1

        if ($match) {
            return [long] $match.databaseId
        }
    }

    throw "Workflow '$Workflow' foi disparado, mas a execução '$ExpectedTitle' não foi localizada."
}

function Get-MainSha {
    param(
        [Parameter(Mandatory)]
        [string] $Repo
    )

    $sha = (Invoke-Gh -Arguments @(
            'api', "repos/$Repo/git/ref/heads/main",
            '--jq', '.object.sha'
        ) | Select-Object -First 1).Trim()

    if ($sha -notmatch '^[0-9a-f]{40}$') {
        throw "main não retornou um SHA válido: $sha"
    }

    return $sha
}

function Start-SonarMainBaseline {
    param(
        [Parameter(Mandatory)]
        [string] $Repo
    )

    $mainSha = Get-MainSha -Repo $Repo
    Write-Host ''
    Write-Host "Disparando baseline Sonar de main @ $mainSha"
    Invoke-Gh -Arguments @(
        'workflow', 'run', 'sonar-main-baseline.yml',
        '--repo', $Repo,
        '--ref', 'main',
        '--raw-field', "expected_sha=$mainSha"
    ) | Out-Null

    $title = "Sonar Main @ $mainSha"
    $runId = Find-WorkflowRunByTitle -Repo $Repo -Workflow 'sonar-main-baseline.yml' -ExpectedTitle $title
    Wait-GitHubRun -Repo $Repo -RunId $runId -Label 'Baseline Sonar de main'
    Write-Host "Baseline Sonar concluída para main @ $mainSha."
}

function Get-WorkerPrState {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [int] $PrNumber
    )

    $json = Invoke-Gh -Arguments @(
        'pr', 'view', [string] $PrNumber,
        '--repo', $Repo,
        '--json', 'headRefOid,headRefName,baseRefName,state'
    )
    $pr = $json -join [Environment]::NewLine | ConvertFrom-Json

    if ($pr.state -ne 'OPEN') {
        throw "PR #$PrNumber precisa permanecer aberto durante a homologação."
    }

    if ($pr.headRefOid -notmatch '^[0-9a-f]{40}$') {
        throw "PR #$PrNumber não retornou um head SHA válido: $($pr.headRefOid)"
    }

    if ($pr.baseRefName -notlike 'factory/*') {
        throw "PR #$PrNumber não aponta para uma integration branch Factory: $($pr.baseRefName)"
    }

    return $pr
}

function Start-SonarHomologation {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [int] $PrNumber
    )

    $pr = Get-WorkerPrState -Repo $Repo -PrNumber $PrNumber
    $headSha = [string] $pr.headRefOid

    Write-Host ''
    Write-Host "Disparando Sonar para PR #$PrNumber @ $headSha"
    Invoke-Gh -Arguments @(
        'workflow', 'run', 'merge-train-sonar.yml',
        '--repo', $Repo,
        '--ref', 'main',
        '--raw-field', "expected_sha=$headSha",
        '--raw-field', "pr_number=$PrNumber"
    ) | Out-Null

    $title = "Sonar PR $PrNumber @ $headSha"
    $runId = Find-WorkflowRunByTitle -Repo $Repo -Workflow 'merge-train-sonar.yml' -ExpectedTitle $title
    Wait-GitHubRun -Repo $Repo -RunId $runId -Label "Sonar do PR #$PrNumber"
    Write-Host "Sonar homologado com sucesso no PR #$PrNumber @ $headSha."

    return [PSCustomObject] @{
        HeadSha = $headSha
        HeadBranch = [string] $pr.headRefName
        SonarRunId = $runId
    }
}

function Start-FactoryCi {
    param(
        [Parameter(Mandatory)]
        [string] $Repo,

        [Parameter(Mandatory)]
        [int] $PrNumber,

        [Parameter(Mandatory)]
        [string] $ExpectedHeadSha,

        [Parameter(Mandatory)]
        [string] $ExpectedHeadBranch
    )

    $current = Get-WorkerPrState -Repo $Repo -PrNumber $PrNumber

    if ($current.headRefOid -ne $ExpectedHeadSha -or $current.headRefName -ne $ExpectedHeadBranch) {
        throw "PR #$PrNumber mudou depois da prova Sonar. Execute o bootstrap novamente para o novo head."
    }

    Write-Host ''
    Write-Host "Disparando CI/Factory Merge Train para $ExpectedHeadBranch @ $ExpectedHeadSha"
    Invoke-Gh -Arguments @(
        'workflow', 'run', 'ci.yml',
        '--repo', $Repo,
        '--ref', $ExpectedHeadBranch
    ) | Out-Null

    $runId = $null

    for ($attempt = 0; $attempt -lt 15 -and -not $runId; $attempt += 1) {
        Start-Sleep -Seconds 2
        $runsJson = Invoke-Gh -Arguments @(
            'run', 'list',
            '--repo', $Repo,
            '--workflow', 'ci.yml',
            '--event', 'workflow_dispatch',
            '--branch', $ExpectedHeadBranch,
            '--limit', '20',
            '--json', 'databaseId,displayTitle,status,conclusion,headSha,headBranch'
        )
        $runs = @($runsJson -join [Environment]::NewLine | ConvertFrom-Json)
        $match = $runs | Where-Object {
            $_.headSha -eq $ExpectedHeadSha -and $_.headBranch -eq $ExpectedHeadBranch
        } | Select-Object -First 1

        if ($match) {
            $runId = [long] $match.databaseId
        }
    }

    if (-not $runId) {
        throw "CI foi disparada, mas o workflow_dispatch exato de $ExpectedHeadSha não foi localizado."
    }

    Wait-GitHubRun -Repo $Repo -RunId $runId -Label 'Factory Merge Train completo'

    $markerText = "Merge Train passed for exact worker SHA ``$ExpectedHeadSha``."
    $jqFilter = '.[] | select(.user.login == "github-actions[bot]" and (.body | contains("{0}"))) | .id' -f $markerText
    $markerIds = Invoke-Gh -Arguments @(
        'api', '--paginate', "repos/$Repo/issues/$PrNumber/comments",
        '--jq', $jqFilter
    )

    if ($markerIds.Count -eq 0) {
        throw "CI terminou verde, mas o marker FACTORY_MERGE_TRAIN exato não foi encontrado no PR #$PrNumber."
    }

    Write-Host "Factory Merge Train homologado no PR #$PrNumber @ $ExpectedHeadSha."
}

Assert-GitHubCli

$repoParts = $Repository -split '/', 2

if ($repoParts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($repoParts[0]) -or [string]::IsNullOrWhiteSpace($repoParts[1])) {
    throw 'Repository deve estar no formato owner/repo.'
}

if ([string]::IsNullOrWhiteSpace($ProjectKey)) {
    $ProjectKey = "$($repoParts[0])_$($repoParts[1])"
}

if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    $ProjectName = $repoParts[1]
}

Write-Host 'Configurando Factory Merge Train / SonarQube Cloud...'
Write-Host "Organization: $Organization"
Write-Host "Project key: $ProjectKey"
Write-Host "Project name: $ProjectName"

$secureToken = Read-Host 'Cole o SONAR_TOKEN (o valor não será exibido)' -AsSecureString
$tokenPointer = [IntPtr]::Zero
$plainToken = $null

try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)

    if ([string]::IsNullOrWhiteSpace($plainToken)) {
        throw 'SONAR_TOKEN não pode ser vazio.'
    }

    Ensure-SonarProject -Token $plainToken -SonarOrganization $Organization -SonarProjectKey $ProjectKey -SonarProjectName $ProjectName -Visibility $ProjectVisibility
    Set-SonarGitHubConfiguration -Repo $Repository -SonarOrganization $Organization -SonarProjectKey $ProjectKey -Token $plainToken
}
finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }

    $plainToken = $null
    $secureToken.Dispose()
}

Write-Host 'Projeto Sonar e configuração GitHub validados; token local descartado da memória gerenciada.'

if (-not $SkipBaseline) {
    Start-SonarMainBaseline -Repo $Repository
}

$workerEvidence = $null

if (-not $SkipHomologation) {
    $workerEvidence = Start-SonarHomologation -Repo $Repository -PrNumber $HomologationPr
}

if (-not $SkipFactoryCi) {
    if ($null -eq $workerEvidence) {
        $pr = Get-WorkerPrState -Repo $Repository -PrNumber $HomologationPr
        $workerEvidence = [PSCustomObject] @{
            HeadSha = [string] $pr.headRefOid
            HeadBranch = [string] $pr.headRefName
        }
    }

    Start-FactoryCi -Repo $Repository -PrNumber $HomologationPr -ExpectedHeadSha $workerEvidence.HeadSha -ExpectedHeadBranch $workerEvidence.HeadBranch
}

Write-Host ''
Write-Host 'Bootstrap Sonar/Factory concluído.'
