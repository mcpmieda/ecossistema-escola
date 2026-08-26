[CmdletBinding()]
param(
    [string] $TenantId = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
    [string] $DisplayName = 'Ecossistema Escola - GitHub M365 Operations',
    [string] $MaintenanceClientId = 'ccaa876c-a453-4eba-b998-cffcd25a4996',
    [string] $SiteId = 'eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56',
    [string] $Repository = 'mcpmieda/ecossistema-escola'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$GraphRoot = 'https://graph.microsoft.com/v1.0'
$GraphAppId = '00000003-0000-0000-c000-000000000000'
$SitesSelectedRoleId = '883ea226-0bf2-4a8f-9f9d-92c9162a727d'
$FederatedCredentialName = 'github-m365-operations-production'
$ExpectedIssuer = 'https://token.actions.githubusercontent.com'
$ExpectedSubject = 'repo:mcpmieda@268288370/ecossistema-escola@1345061518:environment:production'
$ExpectedAudience = 'api://AzureADTokenExchange'

function Ensure-MicrosoftGraphAuthentication {
    if (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication) {
        return
    }

    Write-Host ''
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
        [ValidateSet('GET', 'POST', 'PATCH', 'DELETE')]
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
        $parameters.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }

    $response = Invoke-MgGraphRequest @parameters

    if ($null -eq $response -or [string]::IsNullOrWhiteSpace([string] $response)) {
        return $null
    }

    return $response | ConvertFrom-Json -Depth 100
}

function Get-SingleApplication {
    $filter = [Uri]::EscapeDataString("displayName eq '$DisplayName'")
    $result = Invoke-Graph `
        -Method GET `
        -Path "/applications?`$filter=$filter&`$select=id,appId,displayName,requiredResourceAccess"

    $applications = @($result.value)

    if ($applications.Count -eq 0) {
        throw 'Aplicação operacional não encontrada. Execute primeiro: pwsh ./infra/ops/ecossistema.ps1 -Acao m365-bootstrap'
    }

    if ($applications.Count -gt 1) {
        throw "Mais de uma aplicação encontrada com o nome '$DisplayName'."
    }

    return $applications[0]
}

function Get-ServicePrincipalByAppId {
    param(
        [Parameter(Mandatory)]
        [string] $AppId,

        [switch] $IncludeAppRoles
    )

    $filter = [Uri]::EscapeDataString("appId eq '$AppId'")
    $select = if ($IncludeAppRoles) {
        'id,appId,displayName,appRoles'
    }
    else {
        'id,appId,displayName'
    }

    $result = Invoke-Graph `
        -Method GET `
        -Path "/servicePrincipals?`$filter=$filter&`$select=$select"

    $items = @($result.value)

    if ($items.Count -gt 1) {
        throw "Mais de um service principal encontrado para appId $AppId."
    }

    if ($items.Count -eq 0) {
        return $null
    }

    return $items[0]
}

function Test-PermissionTargetsApplication {
    param(
        [Parameter(Mandatory)]
        $Permission,

        [Parameter(Mandatory)]
        [string] $ApplicationId
    )

    $identitySets = [System.Collections.Generic.List[object]]::new()

    foreach ($propertyName in @(
        'grantedToIdentities',
        'grantedToIdentitiesV2'
    )) {
        $property = $Permission.PSObject.Properties[$propertyName]
        if ($null -ne $property -and $null -ne $property.Value) {
            foreach ($identitySet in @($property.Value)) {
                $identitySets.Add($identitySet)
            }
        }
    }

    foreach ($propertyName in @(
        'grantedTo',
        'grantedToV2'
    )) {
        $property = $Permission.PSObject.Properties[$propertyName]
        if ($null -ne $property -and $null -ne $property.Value) {
            $identitySets.Add($property.Value)
        }
    }

    foreach ($identitySet in $identitySets) {
        $applicationProperty = $identitySet.PSObject.Properties['application']
        if ($null -eq $applicationProperty -or $null -eq $applicationProperty.Value) {
            continue
        }

        if ([string]$applicationProperty.Value.id -eq $ApplicationId) {
            return $true
        }
    }

    return $false
}

function Get-OwnerIds {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [object[]] $Owners
    )

    $ids = [System.Collections.Generic.List[string]]::new()

    foreach ($owner in $Owners) {
        if ($null -eq $owner) {
            continue
        }

        $idProperty = $owner.PSObject.Properties['id']
        if ($null -eq $idProperty) {
            continue
        }

        $id = [string] $idProperty.Value
        if (-not [string]::IsNullOrWhiteSpace($id)) {
            $ids.Add($id)
        }
    }

    return @($ids)
}

function Ensure-Owner {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('applications', 'servicePrincipals')]
        [string] $Collection,

        [Parameter(Mandatory)]
        [string] $ObjectId,

        [Parameter(Mandatory)]
        [string] $OwnerObjectId
    )

    $owners = @(
        (Invoke-Graph `
            -Method GET `
            -Path "/$Collection/$ObjectId/owners?`$select=id").value
    )
    $ownerIds = @(Get-OwnerIds -Owners $owners)

    if ($ownerIds -contains $OwnerObjectId) {
        return
    }

    Invoke-Graph `
        -Method POST `
        -Path "/$Collection/$ObjectId/owners/`$ref" `
        -Body @{
            '@odata.id' = "$GraphRoot/directoryObjects/$OwnerObjectId"
        } | Out-Null
}

function Remove-OwnerIfPresent {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('applications', 'servicePrincipals')]
        [string] $Collection,

        [Parameter(Mandatory)]
        [string] $ObjectId,

        [Parameter(Mandatory)]
        [string] $OwnerObjectId
    )

    $owners = @(
        (Invoke-Graph `
            -Method GET `
            -Path "/$Collection/$ObjectId/owners?`$select=id").value
    )
    $ownerIds = @(Get-OwnerIds -Owners $owners)

    if ($ownerIds -notcontains $OwnerObjectId) {
        return
    }

    Invoke-Graph `
        -Method DELETE `
        -Path "/$Collection/$ObjectId/owners/$OwnerObjectId/`$ref" | Out-Null
}

Ensure-MicrosoftGraphAuthentication
Import-Module Microsoft.Graph.Authentication

$Scopes = @(
    'User.Read',
    'Application.Read.All',
    'Application.ReadWrite.All',
    'AppRoleAssignment.ReadWrite.All',
    'Directory.Read.All',
    'Sites.FullControl.All'
)

Write-Host ''
Write-Host '=== AUTORIZAÇÃO ADMINISTRATIVA ÚNICA M365 ==='
Write-Host ''
Write-Host 'Será aberto o login Microsoft do tenant.'
Write-Host 'Essas permissões são delegadas ao usuário somente para concluir esta configuração administrativa.'
Write-Host 'A identidade operacional permanente continuará limitada a Sites.Selected.'
Write-Host ''

Connect-MgGraph `
    -TenantId $TenantId `
    -Scopes $Scopes `
    -ContextScope Process `
    -NoWelcome

try {
    $me = Invoke-Graph `
        -Method GET `
        -Path '/me?$select=id,displayName,userPrincipalName'

    if (-not $me -or [string]::IsNullOrWhiteSpace([string] $me.id)) {
        throw 'Microsoft Graph não retornou o Object ID do administrador autenticado.'
    }

    $application = Get-SingleApplication

    $credentials = @(
        (Invoke-Graph `
            -Method GET `
            -Path "/applications/$($application.id)/federatedIdentityCredentials?`$select=id,name,issuer,subject,audiences").value
    )

    $credential = $credentials |
        Where-Object name -eq $FederatedCredentialName |
        Select-Object -First 1

    if (-not $credential) {
        Invoke-Graph `
            -Method POST `
            -Path "/applications/$($application.id)/federatedIdentityCredentials" `
            -Body @{
                name        = $FederatedCredentialName
                issuer      = $ExpectedIssuer
                subject     = $ExpectedSubject
                audiences   = @($ExpectedAudience)
                description = 'GitHub Actions production environment for M365 Control Plane operations'
            } | Out-Null
    }
    else {
        $audiences = @($credential.audiences)
        if (
            $credential.issuer -ne $ExpectedIssuer -or
            $credential.subject -ne $ExpectedSubject -or
            $audiences.Count -ne 1 -or
            $audiences[0] -ne $ExpectedAudience
        ) {
            throw 'A credencial federada existente não corresponde ao subject OIDC imutável esperado.'
        }
    }

    $servicePrincipal = Get-ServicePrincipalByAppId `
        -AppId $application.appId

    $servicePrincipalCreated = $false

    if (-not $servicePrincipal) {
        $servicePrincipal = Invoke-Graph `
            -Method POST `
            -Path '/servicePrincipals' `
            -Body @{
                appId = $application.appId
            }

        $servicePrincipalCreated = $true
    }

    if (-not $servicePrincipal -or [string]::IsNullOrWhiteSpace([string] $servicePrincipal.id)) {
        throw 'Microsoft Graph não retornou o Object ID do service principal operacional.'
    }

    Ensure-Owner `
        -Collection applications `
        -ObjectId $application.id `
        -OwnerObjectId $me.id

    Ensure-Owner `
        -Collection servicePrincipals `
        -ObjectId $servicePrincipal.id `
        -OwnerObjectId $me.id

    $graphServicePrincipal = Get-ServicePrincipalByAppId `
        -AppId $GraphAppId `
        -IncludeAppRoles

    if (-not $graphServicePrincipal) {
        throw 'Microsoft Graph service principal não encontrado no tenant.'
    }

    $sitesSelectedRole = @($graphServicePrincipal.appRoles) |
        Where-Object {
            $_.id -eq $SitesSelectedRoleId -and
            $_.value -eq 'Sites.Selected'
        } |
        Select-Object -First 1

    if (-not $sitesSelectedRole) {
        throw 'App role Sites.Selected não encontrado no Microsoft Graph service principal.'
    }

    $assignments = @(
        (Invoke-Graph `
            -Method GET `
            -Path "/servicePrincipals/$($servicePrincipal.id)/appRoleAssignments?`$select=id,appRoleId,resourceId,principalId").value
    )

    $sitesSelectedAssignment = $assignments |
        Where-Object {
            $_.appRoleId -eq $SitesSelectedRoleId -and
            $_.resourceId -eq $graphServicePrincipal.id
        } |
        Select-Object -First 1

    if (-not $sitesSelectedAssignment) {
        Invoke-Graph `
            -Method POST `
            -Path "/servicePrincipals/$($servicePrincipal.id)/appRoleAssignments" `
            -Body @{
                principalId = $servicePrincipal.id
                resourceId  = $graphServicePrincipal.id
                appRoleId   = $SitesSelectedRoleId
            } | Out-Null
    }

    $encodedSiteId = [Uri]::EscapeDataString($SiteId)
    $site = Invoke-Graph `
        -Method GET `
        -Path "/sites/$encodedSiteId?`$select=id,displayName,webUrl"

    $sitePermissions = @(
        (Invoke-Graph `
            -Method GET `
            -Path "/sites/$encodedSiteId/permissions").value
    )

    $existingSitePermission = $sitePermissions |
        Where-Object {
            Test-PermissionTargetsApplication `
                -Permission $_ `
                -ApplicationId $application.appId
        } |
        Select-Object -First 1

    if ($existingSitePermission) {
        $roles = @($existingSitePermission.roles)
        if (
            $roles -notcontains 'write' -and
            $roles -notcontains 'fullcontrol'
        ) {
            throw "A aplicação já possui uma concessão no site, mas sem write/fullcontrol. Roles: $($roles -join ', ')"
        }
    }
    else {
        Invoke-Graph `
            -Method POST `
            -Path "/sites/$encodedSiteId/permissions" `
            -Body @{
                roles = @('write')
                grantedToIdentities = @(
                    @{
                        application = @{
                            id          = $application.appId
                            displayName = $DisplayName
                        }
                    }
                )
            } | Out-Null
    }

    $maintenanceServicePrincipal = Get-ServicePrincipalByAppId `
        -AppId $MaintenanceClientId

    if ($maintenanceServicePrincipal) {
        Remove-OwnerIfPresent `
            -Collection applications `
            -ObjectId $application.id `
            -OwnerObjectId $maintenanceServicePrincipal.id

        Remove-OwnerIfPresent `
            -Collection servicePrincipals `
            -ObjectId $servicePrincipal.id `
            -OwnerObjectId $maintenanceServicePrincipal.id
    }

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) não encontrado para registrar ENTRA_OPERATIONS_CLIENT_ID.'
    }

    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub CLI não autenticado. Execute: gh auth login --web'
    }

    & gh variable set `
        ENTRA_OPERATIONS_CLIENT_ID `
        --repo $Repository `
        --body $application.appId

    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao registrar ENTRA_OPERATIONS_CLIENT_ID no GitHub.'
    }

    Write-Host ''
    Write-Host '============================================'
    Write-Host 'AUTORIZAÇÃO M365 CONCLUÍDA'
    Write-Host "Aplicação: $($application.appId)"
    Write-Host "Service principal: $($servicePrincipal.id)"
    Write-Host 'Sites.Selected: CONCEDIDO'
    Write-Host "Site: $($site.webUrl)"
    Write-Host 'Papel no site: write'
    Write-Host 'Identidade de manutenção como owner: REMOVIDA'
    Write-Host 'GitHub ENTRA_OPERATIONS_CLIENT_ID: CONFIGURADO'
    Write-Host '============================================'

    [pscustomobject]@{
        Status                       = 'AUTHORIZED'
        ApplicationClientId          = $application.appId
        ApplicationObjectId          = $application.id
        ServicePrincipalObjectId     = $servicePrincipal.id
        ServicePrincipalCreated      = $servicePrincipalCreated
        Permission                   = 'Sites.Selected'
        SiteId                       = $site.id
        SiteUrl                      = $site.webUrl
        SiteRole                     = 'write'
        MaintenanceOwnerRemoved      = $true
        GitHubOperationsVariableSet  = $true
        AuthorizedBy                 = $me.userPrincipalName
    }
}
finally {
    # ContextScope Process keeps this one-shot admin login isolated to this pwsh process.
}
