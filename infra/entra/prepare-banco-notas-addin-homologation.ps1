[CmdletBinding()]
param(
    [string] $TenantId = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
    [string] $ContractPath = (Join-Path $PSScriptRoot '../../specs/banco-notas/addin-entra-registration.json'),
    [string] $EvidencePath = 'banco-notas-addin-entra-plan.json',
    [switch] $Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$GraphRoot = 'https://graph.microsoft.com/v1.0'

function Ensure-MicrosoftGraphAuthentication {
    if (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication) {
        return
    }

    Write-Host 'Instalando Microsoft.Graph.Authentication para o usuário atual...'
    Install-Module `
        -Name Microsoft.Graph.Authentication `
        -Scope CurrentUser `
        -Force `
        -AllowClobber
}

function Invoke-Graph {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('GET', 'POST', 'PATCH')]
        [string] $Method,

        [Parameter(Mandatory)]
        [string] $Path,

        $Body = $null
    )

    $parameters = @{
        Method     = $Method
        Uri        = "$GraphRoot$Path"
        OutputType = 'Json'
    }

    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 30 -Compress
    }

    $response = Invoke-MgGraphRequest @parameters
    if ($null -eq $response -or [string]::IsNullOrWhiteSpace([string] $response)) {
        return $null
    }

    return $response | ConvertFrom-Json -Depth 100
}

function Get-SingleApplication {
    param(
        [Parameter(Mandatory)]
        [string] $DisplayName
    )

    $filter = [Uri]::EscapeDataString("displayName eq '$DisplayName'")
    $select = 'id,appId,displayName,signInAudience,identifierUris,spa,api,isFallbackPublicClient,requiredResourceAccess,passwordCredentials,keyCredentials'
    $result = Invoke-Graph `
        -Method GET `
        -Path "/applications?`$filter=$filter&`$select=$select"
    $applications = @($result.value)

    if ($applications.Count -gt 1) {
        throw "Mais de uma aplicação encontrada com o nome '$DisplayName'."
    }

    if ($applications.Count -eq 0) {
        return $null
    }

    return $applications[0]
}

function Assert-ExactSet {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [AllowEmptyCollection()]
        [object[]] $Actual,

        [AllowEmptyCollection()]
        [object[]] $Expected,

        [switch] $AllowEmptyActual
    )

    $actualValues = @($Actual | ForEach-Object { [string] $_ } | Sort-Object -Unique)
    $expectedValues = @($Expected | ForEach-Object { [string] $_ } | Sort-Object -Unique)

    if ($AllowEmptyActual -and $actualValues.Count -eq 0) {
        return
    }

    if (($actualValues -join "`n") -ne ($expectedValues -join "`n")) {
        throw "$Name diverge do contrato. Atual: [$($actualValues -join ', ')]; esperado: [$($expectedValues -join ', ')]."
    }
}

function Test-SelfRequiredResourceAccess {
    param(
        [Parameter(Mandatory)] $Application,
        [Parameter(Mandatory)] [string] $ScopeId
    )

    $resources = @($Application.requiredResourceAccess)
    if ($resources.Count -ne 1 -or $resources[0].resourceAppId -ne $Application.appId) {
        return $false
    }
    $permissions = @($resources[0].resourceAccess)
    return (
        $permissions.Count -eq 1 -and
        $permissions[0].type -eq 'Scope' -and
        [string] $permissions[0].id -eq $ScopeId
    )
}

function Assert-Contract {
    param(
        [Parameter(Mandatory)]
        $Contract
    )

    if ($Contract.schemaVersion -ne 1) {
        throw 'Contrato Entra do add-in com schemaVersion inesperada.'
    }
    if ($Contract.environment -ne 'homologation') {
        throw 'O script aceita somente contrato de homologação.'
    }
    if ($Contract.signInAudience -ne 'AzureADMyOrg') {
        throw 'O add-in do Banco de Notas deve permanecer single-tenant.'
    }
    if ($Contract.identifierUriTemplate -ne 'api://{applicationClientId}') {
        throw 'identifierUriTemplate inesperado.'
    }
    if ($Contract.requestedAccessTokenVersion -ne 2) {
        throw 'O add-in exige access tokens v2.'
    }
    if ($Contract.delegatedScope.type -ne 'Admin') {
        throw 'O delegated scope deve exigir consentimento administrativo.'
    }
    if (-not $Contract.delegatedScope.isEnabled) {
        throw 'O delegated scope deve estar habilitado no contrato.'
    }
    if (-not $Contract.preAuthorizeSelf) {
        throw 'A app NAA deve preautorizar o próprio client ID para o scope do backend.'
    }
    if (
        $Contract.requiredResourceAccess.mode -ne 'self-delegated-scope' -or
        $Contract.requiredResourceAccess.resourceAppIdTemplate -ne '{applicationClientId}' -or
        $Contract.requiredResourceAccess.delegatedPermissionValue -ne $Contract.delegatedScope.value -or
        $Contract.requiredResourceAccess.type -ne 'Scope'
    ) {
        throw 'requiredResourceAccess deve declarar somente o delegated scope da própria API.'
    }
    if ($Contract.allowPublicClientFlows) {
        throw 'Public client flows legados devem permanecer desligados.'
    }
    if ($Contract.credentials -ne 'none') {
        throw 'A app SPA/NAA não deve criar client secret ou certificado.'
    }
    if ($Contract.publicRouteEnabled -or $Contract.syncEnabled) {
        throw 'Contrato não pode liberar rota pública nem sync.'
    }

    $redirects = @($Contract.spaRedirectUriTemplates)
    if ($redirects.Count -lt 2) {
        throw 'O contrato precisa de redirect NAA broker e redirect HTTPS do taskpane.'
    }
    if (-not ($redirects | Where-Object { $_ -like 'brk-multihub://*' })) {
        throw 'Redirect brk-multihub obrigatório ausente.'
    }
    if (-not ($redirects | Where-Object { $_ -like 'https://*' })) {
        throw 'Redirect HTTPS dedicado de autenticação obrigatório ausente.'
    }
}

function Assert-ExistingApplicationBoundary {
    param(
        [Parameter(Mandatory)]
        $Application,

        [Parameter(Mandatory)]
        $Contract,

        [Parameter(Mandatory)]
        [string] $ResourceApplicationIdUri
    )

    if ($Application.signInAudience -ne $Contract.signInAudience) {
        throw 'Aplicação existente usa signInAudience incompatível.'
    }
    if (@($Application.passwordCredentials).Count -ne 0 -or @($Application.keyCredentials).Count -ne 0) {
        throw 'Aplicação existente possui credencial; o add-in SPA/NAA deve ser credential-free.'
    }
    if ($Application.isFallbackPublicClient) {
        throw 'Aplicação existente habilita public client flow legado.'
    }

    Assert-ExactSet `
        -Name 'identifierUris' `
        -Actual @($Application.identifierUris) `
        -Expected @($ResourceApplicationIdUri) `
        -AllowEmptyActual

    Assert-ExactSet `
        -Name 'SPA redirect URIs' `
        -Actual @($Application.spa.redirectUris) `
        -Expected @($Contract.spaRedirectUriTemplates) `
        -AllowEmptyActual

    $scopes = @($Application.api.oauth2PermissionScopes)
    $unexpectedScopes = @($scopes | Where-Object { $_.value -ne $Contract.delegatedScope.value })
    if ($unexpectedScopes.Count -ne 0) {
        throw "Aplicação existente possui scopes adicionais: $($unexpectedScopes.value -join ', ')."
    }

    $matchingScopes = @($scopes | Where-Object { $_.value -eq $Contract.delegatedScope.value })
    if ($matchingScopes.Count -gt 1) {
        throw 'Delegated scope duplicado na aplicação existente.'
    }
    if ($matchingScopes.Count -eq 1) {
        $scope = $matchingScopes[0]
        if (
            $scope.type -ne $Contract.delegatedScope.type -or
            -not $scope.isEnabled -or
            $scope.adminConsentDisplayName -ne $Contract.delegatedScope.adminConsentDisplayName -or
            $scope.adminConsentDescription -ne $Contract.delegatedScope.adminConsentDescription
        ) {
            throw 'Delegated scope existente diverge do contrato fail-closed.'
        }
        if (
            @($Application.requiredResourceAccess).Count -ne 0 -and
            -not (Test-SelfRequiredResourceAccess -Application $Application -ScopeId ([string] $scope.id))
        ) {
            throw 'Aplicação existente possui requiredResourceAccess diferente do próprio delegated scope.'
        }
    }
    elseif (@($Application.requiredResourceAccess).Count -ne 0) {
        throw 'Aplicação sem delegated scope não pode possuir requiredResourceAccess.'
    }

    $preAuthorized = @($Application.api.preAuthorizedApplications)
    $unexpectedPreAuthorized = @(
        $preAuthorized |
            Where-Object { $_.appId -ne $Application.appId }
    )
    if ($unexpectedPreAuthorized.Count -ne 0) {
        throw 'Aplicação existente preautoriza client IDs externos inesperados.'
    }
}

$resolvedContractPath = [IO.Path]::GetFullPath($ContractPath)
if (-not (Test-Path -LiteralPath $resolvedContractPath -PathType Leaf)) {
    throw "Contrato Entra não encontrado: $resolvedContractPath"
}

$contract = Get-Content -LiteralPath $resolvedContractPath -Raw | ConvertFrom-Json -Depth 100
Assert-Contract -Contract $contract

Ensure-MicrosoftGraphAuthentication
Import-Module Microsoft.Graph.Authentication

$scopes = if ($Apply) {
    @('Application.ReadWrite.All')
}
else {
    @('Application.Read.All')
}

Write-Host ''
Write-Host '=== BANCO DE NOTAS — ENTRA ADD-IN HOMOLOGATION ==='
Write-Host "Modo: $(if ($Apply) { 'APPLY' } else { 'PLAN-ONLY' })"
Write-Host 'Nenhum secret/certificado será criado.'
Write-Host 'Nenhuma permissão Microsoft Graph será solicitada para a app do add-in.'
Write-Host 'A rota pública e o sync permanecerão desligados.'
Write-Host ''

Connect-MgGraph `
    -TenantId $TenantId `
    -Scopes $scopes `
    -ContextScope Process `
    -NoWelcome

try {
    $application = Get-SingleApplication -DisplayName $contract.displayName
    $changes = [System.Collections.Generic.List[string]]::new()
    $applicationCreated = $false

    if (-not $application) {
        $changes.Add('create_application')
        if ($Apply) {
            $application = Invoke-Graph `
                -Method POST `
                -Path '/applications' `
                -Body @{
                    displayName      = $contract.displayName
                    signInAudience   = $contract.signInAudience
                    requiredResourceAccess = @()
                    isFallbackPublicClient = $false
                }
            $applicationCreated = $true
        }
    }

    if (-not $application) {
        $plan = [ordered]@{
            status                           = 'plan-ready-application-missing'
            apply                            = $false
            tenantId                         = $TenantId
            displayName                      = $contract.displayName
            applicationClientId              = $null
            resourceApplicationIdUriTemplate = $contract.identifierUriTemplate
            tokenAudience                    = $null
            authorizedParty                  = $null
            delegatedScopeValue              = $contract.delegatedScope.value
            requestedScopeTemplate           = "$($contract.identifierUriTemplate)/$($contract.delegatedScope.value)"
            spaRedirectUris                  = @($contract.spaRedirectUriTemplates)
            changes                          = @($changes)
            credentialsCreated               = $false
            graphPermissionsRequested        = @()
            publicRouteEnabled               = $false
            syncEnabled                      = $false
        }
        $plan | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
        $plan
        return
    }

    $application = Get-SingleApplication -DisplayName $contract.displayName
    if (-not $application -or [string]::IsNullOrWhiteSpace([string] $application.appId)) {
        throw 'Microsoft Graph não retornou um appId válido.'
    }

    $resourceApplicationIdUri = $contract.identifierUriTemplate.Replace('{applicationClientId}', $application.appId)
    $tokenAudience = [string] $application.appId
    $authorizedParty = [string] $application.appId
    Assert-ExistingApplicationBoundary `
        -Application $application `
        -Contract $contract `
        -ResourceApplicationIdUri $resourceApplicationIdUri

    $scope = @($application.api.oauth2PermissionScopes) |
        Where-Object { $_.value -eq $contract.delegatedScope.value } |
        Select-Object -First 1
    $scopeId = if ($scope) { [string] $scope.id } else { [guid]::NewGuid().ToString() }

    if (@($application.identifierUris).Count -eq 0) {
        $changes.Add('set_identifier_uri')
    }
    if (@($application.spa.redirectUris).Count -eq 0) {
        $changes.Add('set_spa_redirects')
    }
    if (-not $scope) {
        $changes.Add('create_delegated_scope')
    }

    $preAuthorized = @($application.api.preAuthorizedApplications)
    $selfPreAuthorized = $preAuthorized |
        Where-Object {
            $_.appId -eq $application.appId -and
            @($_.delegatedPermissionIds) -contains $scopeId
        } |
        Select-Object -First 1
    if (-not $selfPreAuthorized) {
        $changes.Add('preauthorize_self')
    }
    if ($application.api.requestedAccessTokenVersion -ne 2) {
        $changes.Add('set_access_token_version_2')
    }
    if (-not (Test-SelfRequiredResourceAccess -Application $application -ScopeId $scopeId)) {
        $changes.Add('set_self_delegated_resource_access')
    }

    if ($Apply -and $changes.Count -gt 0) {
        Invoke-Graph `
            -Method PATCH `
            -Path "/applications/$($application.id)" `
            -Body @{
                identifierUris = @($resourceApplicationIdUri)
                spa = @{
                    redirectUris = @($contract.spaRedirectUriTemplates)
                }
                api = @{
                    requestedAccessTokenVersion = 2
                    oauth2PermissionScopes = @(
                        @{
                            id                      = $scopeId
                            value                   = $contract.delegatedScope.value
                            type                    = $contract.delegatedScope.type
                            isEnabled               = $true
                            adminConsentDisplayName = $contract.delegatedScope.adminConsentDisplayName
                            adminConsentDescription = $contract.delegatedScope.adminConsentDescription
                            userConsentDisplayName  = $null
                            userConsentDescription  = $null
                        }
                    )
                    preAuthorizedApplications = @(
                        @{
                            appId                  = $application.appId
                            delegatedPermissionIds = @($scopeId)
                        }
                    )
                }
                requiredResourceAccess = @(
                    @{
                        resourceAppId = $application.appId
                        resourceAccess = @(
                            @{
                                id   = $scopeId
                                type = 'Scope'
                            }
                        )
                    }
                )
                isFallbackPublicClient = $false
            } | Out-Null

        $application = Get-SingleApplication -DisplayName $contract.displayName
        Assert-ExistingApplicationBoundary `
            -Application $application `
            -Contract $contract `
            -ResourceApplicationIdUri $resourceApplicationIdUri

        $verifiedScope = @($application.api.oauth2PermissionScopes) |
            Where-Object { $_.value -eq $contract.delegatedScope.value } |
            Select-Object -First 1
        if (-not $verifiedScope) {
            throw 'Delegated scope não foi confirmado após o apply.'
        }
        $verifiedSelf = @($application.api.preAuthorizedApplications) |
            Where-Object {
                $_.appId -eq $application.appId -and
                @($_.delegatedPermissionIds) -contains $verifiedScope.id
            } |
            Select-Object -First 1
        if (-not $verifiedSelf) {
            throw 'Preautorização self não foi confirmada após o apply.'
        }
        if (-not (Test-SelfRequiredResourceAccess -Application $application -ScopeId ([string] $verifiedScope.id))) {
            throw 'requiredResourceAccess self delegated não foi confirmado após o apply.'
        }
    }

    $result = [ordered]@{
        status                       = if ($Apply) { 'applied-or-already-ready' } else { 'plan-ready' }
        apply                        = [bool] $Apply
        tenantId                     = $TenantId
        displayName                  = $contract.displayName
        applicationCreated           = $applicationCreated
        applicationClientId          = $application.appId
        resourceApplicationIdUri     = $resourceApplicationIdUri
        tokenAudience                = $tokenAudience
        authorizedParty              = $authorizedParty
        delegatedScopeValue          = $contract.delegatedScope.value
        requestedScope               = "$resourceApplicationIdUri/$($contract.delegatedScope.value)"
        consentType                  = $contract.delegatedScope.type
        spaRedirectUris              = @($contract.spaRedirectUriTemplates)
        changes                      = @($changes)
        credentialsCreated           = $false
        graphPermissionsRequested    = @()
        selfDelegatedPermission      = $true
        publicRouteEnabled           = $false
        syncEnabled                  = $false
        nextGate                     = 'configure homologation env and validate a real delegated token before public routing'
    }

    $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
    $result
}
finally {
    Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
}
