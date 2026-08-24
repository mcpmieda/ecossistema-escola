[CmdletBinding()]
param(
    [string] $TenantId = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
    [string] $OwnerObjectId = '5855a8db-ce2a-4cd6-b7a6-46d430bf359b',
    [string] $BackendApplicationObjectId = '2d04bd2b-3ef5-4ac6-bd2e-11885a5b3401',
    [string] $Repository = 'mcpmieda/ecossistema-escola',
    [string] $Environment = 'production'
)

$ErrorActionPreference = 'Stop'
$GraphRoot = 'https://graph.microsoft.com/v1.0'
$GraphAppId = '00000003-0000-0000-c000-000000000000'
$ApplicationReadWriteOwnedBy = '18a4783c-866b-4cc7-a460-3d5e5662c884'
$DisplayName = 'Ecossistema Escolar - Manutenção OIDC'

function Invoke-Graph([string] $Method, [string] $Path, $Body = $null) {
    $parameters = @{
        Method = $Method
        Uri = "$GraphRoot$Path"
        Headers = $script:Headers
    }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    Invoke-RestMethod @parameters
}

$tokenObject = Get-AzAccessToken -TenantId $TenantId -ResourceUrl 'https://graph.microsoft.com'
$token = if ($tokenObject.Token -is [securestring]) {
    [Net.NetworkCredential]::new('', $tokenObject.Token).Password
} else { $tokenObject.Token }
$script:Headers = @{ Authorization = "Bearer $token" }

$encodedName = [Uri]::EscapeDataString("displayName eq '$DisplayName'")
$application = (Invoke-Graph GET "/applications?`$filter=$encodedName&`$select=id,appId,displayName,requiredResourceAccess").value | Select-Object -First 1
if (-not $application) {
    $application = Invoke-Graph POST '/applications' @{
        displayName = $DisplayName
        signInAudience = 'AzureADMyOrg'
        requiredResourceAccess = @(@{
            resourceAppId = $GraphAppId
            resourceAccess = @(@{ id = $ApplicationReadWriteOwnedBy; type = 'Role' })
        })
    }
}

$servicePrincipal = (Invoke-Graph GET "/servicePrincipals?`$filter=appId%20eq%20'$($application.appId)'&`$select=id,appId,displayName").value | Select-Object -First 1
if (-not $servicePrincipal) {
    $servicePrincipal = Invoke-Graph POST '/servicePrincipals' @{ appId = $application.appId }
}

$owners = (Invoke-Graph GET "/applications/$($application.id)/owners?`$select=id").value
if ($owners.id -notcontains $OwnerObjectId) {
    Invoke-Graph POST "/applications/$($application.id)/owners/`$ref" @{
        '@odata.id' = "$GraphRoot/directoryObjects/$OwnerObjectId"
    } | Out-Null
}

$targetOwners = (Invoke-Graph GET "/applications/$BackendApplicationObjectId/owners?`$select=id").value
if ($targetOwners.id -notcontains $servicePrincipal.id) {
    Invoke-Graph POST "/applications/$BackendApplicationObjectId/owners/`$ref" @{
        '@odata.id' = "$GraphRoot/directoryObjects/$($servicePrincipal.id)"
    } | Out-Null
}

$credentialName = 'github-production-environment'
$credentials = (Invoke-Graph GET "/applications/$($application.id)/federatedIdentityCredentials").value
if ($credentials.name -notcontains $credentialName) {
    Invoke-Graph POST "/applications/$($application.id)/federatedIdentityCredentials" @{
        name = $credentialName
        description = 'GitHub Actions production environment; secretless maintenance identity'
        issuer = 'https://token.actions.githubusercontent.com'
        subject = "repo:${Repository}:environment:${Environment}"
        audiences = @('api://AzureADTokenExchange')
    } | Out-Null
}

$graphServicePrincipal = (Invoke-Graph GET "/servicePrincipals?`$filter=appId%20eq%20'$GraphAppId'&`$select=id").value | Select-Object -First 1
$assignments = (Invoke-Graph GET "/servicePrincipals/$($servicePrincipal.id)/appRoleAssignments").value
if ($assignments.appRoleId -notcontains $ApplicationReadWriteOwnedBy) {
    Invoke-Graph POST "/servicePrincipals/$($servicePrincipal.id)/appRoleAssignments" @{
        principalId = $servicePrincipal.id
        resourceId = $graphServicePrincipal.id
        appRoleId = $ApplicationReadWriteOwnedBy
    } | Out-Null
}

[pscustomobject]@{
    TenantId = $TenantId
    ApplicationObjectId = $application.id
    ClientId = $application.appId
    ServicePrincipalObjectId = $servicePrincipal.id
    FederatedSubject = "repo:${Repository}:environment:${Environment}"
    Permission = 'Application.ReadWrite.OwnedBy'
    TargetOwned = $BackendApplicationObjectId
} | ConvertTo-Json -Compress
