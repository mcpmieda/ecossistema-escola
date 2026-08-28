[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $SiteId,
    [Parameter(Mandatory)] [string] $BackendClientId,
    [Parameter(Mandatory)] [string] $OwnerObjectId,
    [datetime] $WebCredentialExpiresUtc,
    [datetime] $BackendCredentialExpiresUtc,
    [datetime] $SessionCredentialExpiresUtc
)

$ErrorActionPreference = 'Stop'
$GraphRoot = 'https://graph.microsoft.com/v1.0'
$TempName = 'Ecossistema Escolar - Provisionamento Temporario'

function Convert-TokenToPlainText([object] $Token) {
    if ($Token -is [securestring]) {
        return [Net.NetworkCredential]::new('', $Token).Password
    }
    return [string] $Token
}

function ConvertTo-Base64Url([byte[]] $Bytes) {
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-ClientAssertion {
    param(
        [Parameter(Mandatory)] [string] $ClientId,
        [Parameter(Mandatory)] [string] $Audience,
        [Parameter(Mandatory)] [System.Security.Cryptography.X509Certificates.X509Certificate2] $Certificate,
        [Parameter(Mandatory)] [System.Security.Cryptography.RSA] $PrivateKey
    )
    $now = [DateTimeOffset]::UtcNow
    $header = @{ alg = 'RS256'; typ = 'JWT'; x5t = (ConvertTo-Base64Url $Certificate.GetCertHash()) }
    $payload = @{
        aud = $Audience; iss = $ClientId; sub = $ClientId; jti = [guid]::NewGuid().ToString()
        nbf = $now.AddMinutes(-1).ToUnixTimeSeconds(); exp = $now.AddMinutes(5).ToUnixTimeSeconds()
    }
    $headerPart = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes(($header | ConvertTo-Json -Compress)))
    $payloadPart = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress)))
    $unsigned = "$headerPart.$payloadPart"
    $signature = $PrivateKey.SignData(
        [Text.Encoding]::UTF8.GetBytes($unsigned),
        [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    return "$unsigned.$(ConvertTo-Base64Url $signature)"
}

function Invoke-Graph {
    param(
        [Parameter(Mandatory)] [ValidateSet('GET','POST','PATCH','DELETE')] [string] $Method,
        [Parameter(Mandatory)] [string] $Uri,
        [Parameter(Mandatory)] [string] $AccessToken,
        [object] $Body,
        [int] $MaxAttempts = 6
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            $args = @{
                Method = $Method
                Uri = $Uri
                Headers = @{ Authorization = "Bearer $AccessToken" }
            }
            if ($null -ne $Body) {
                $args.ContentType = 'application/json'
                $args.Body = $Body | ConvertTo-Json -Depth 30 -Compress
            }
            return Invoke-RestMethod @args
        }
        catch {
            $status = [int] $_.Exception.Response.StatusCode
            if ($attempt -eq $MaxAttempts -or $status -notin @(429, 500, 502, 503, 504)) { throw }
            $retryAfter = $_.Exception.Response.Headers.RetryAfter.Delta.TotalSeconds
            if (-not $retryAfter) { $retryAfter = [Math]::Min(16, [Math]::Pow(2, $attempt - 1)) }
            Start-Sleep -Seconds ([int] $retryAfter)
        }
    }
}

function New-TextColumn([string] $Name, [bool] $Multiline = $false, [bool] $Indexed = $false) {
    $text = @{ allowMultipleLines = $Multiline }
    if ($Multiline) { $text.linesForEditing = 6 }
    return @{ name = $Name; displayName = $Name; indexed = $Indexed; text = $text }
}

function New-DateColumn([string] $Name) {
    return @{ name = $Name; displayName = $Name; dateTime = @{ format = 'dateTime'; displayAs = 'default' } }
}

function New-BoolColumn([string] $Name, [bool] $Indexed = $false) {
    return @{ name = $Name; displayName = $Name; indexed = $Indexed; boolean = @{} }
}

function New-NumberColumn([string] $Name) {
    return @{ name = $Name; displayName = $Name; number = @{ decimalPlaces = 'none' } }
}

function New-ChoiceColumn([string] $Name, [string[]] $Choices) {
    return @{ name = $Name; displayName = $Name; choice = @{ choices = $Choices; allowTextEntry = $false; displayAs = 'dropDownMenu' } }
}

function Ensure-List {
    param(
        [Parameter(Mandatory)] [string] $DisplayName,
        [Parameter(Mandatory)] [string] $Description,
        [Parameter(Mandatory)] [string] $Template,
        [Parameter(Mandatory)] [array] $Columns,
        [Parameter(Mandatory)] [string] $AccessToken
    )

    Write-Host "Ensure list: $DisplayName"
    $encodedName = [uri]::EscapeDataString("displayName eq '$DisplayName'")
    $query = Invoke-Graph GET "$GraphRoot/sites/$SiteId/lists?`$filter=$encodedName&`$select=id,displayName,list" $AccessToken
    $list = $query.value | Select-Object -First 1
    if (-not $list) {
        $list = Invoke-Graph POST "$GraphRoot/sites/$SiteId/lists" $AccessToken @{
            displayName = $DisplayName
            description = $Description
            list = @{ template = $Template }
        }
    }

    $existing = Invoke-Graph GET "$GraphRoot/sites/$SiteId/lists/$($list.id)/columns?`$select=id,name,displayName" $AccessToken
    $names = @($existing.value.name)
    foreach ($column in $Columns) {
        if ($names -notcontains $column.name) {
            Write-Host "  Ensure column: $($column.name)"
            try {
                Invoke-Graph POST "$GraphRoot/sites/$SiteId/lists/$($list.id)/columns" $AccessToken $column | Out-Null
            }
            catch {
                throw "Failed to create column '$($column.name)' on '$DisplayName': $($_.Exception.Message)"
            }
        }
    }

    [pscustomobject]@{ Name = $DisplayName; Id = $list.id; Template = $Template }
}

$adminToken = Convert-TokenToPlainText (Get-AzAccessToken -ResourceUrl 'https://graph.microsoft.com').Token
$adminHeaders = @{ Authorization = "Bearer $adminToken"; 'Content-Type' = 'application/json' }
$tempApplication = $null
$tempServicePrincipal = $null
$rsa = $null
$certificate = $null

try {
    $rsa = [Security.Cryptography.RSA]::Create(2048)
    $certificateRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
        "CN=$TempName",
        $rsa,
        [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    $notBefore = [DateTimeOffset]::UtcNow.AddMinutes(-5)
    # Entra rejects very short X.509 lifetimes; the application is deleted in finally.
    $notAfter = [DateTimeOffset]::UtcNow.AddDays(7)
    $certificate = $certificateRequest.CreateSelfSigned($notBefore, $notAfter)
    $keyId = [guid]::NewGuid()
    $tempApplication = Invoke-Graph POST "$GraphRoot/applications" $adminToken @{
        displayName = $TempName
        signInAudience = 'AzureADMyOrg'
        keyCredentials = @(@{
            customKeyIdentifier = [Convert]::ToBase64String($certificate.GetCertHash())
            displayName = 'bootstrap-ephemeral-certificate'
            endDateTime = $certificate.NotAfter.ToUniversalTime().AddMinutes(-1).ToString('o')
            key = [Convert]::ToBase64String($certificate.RawData)
            keyId = $keyId
            startDateTime = $certificate.NotBefore.ToUniversalTime().AddMinutes(1).ToString('o')
            type = 'AsymmetricX509Cert'
            usage = 'Verify'
        })
    }
    Invoke-Graph POST "$GraphRoot/applications/$($tempApplication.id)/owners/`$ref" $adminToken @{
        '@odata.id' = "$GraphRoot/directoryObjects/$OwnerObjectId"
    } | Out-Null
    $tempServicePrincipal = Invoke-Graph POST "$GraphRoot/servicePrincipals" $adminToken @{ appId = $tempApplication.appId }

    $graphSp = (Invoke-Graph GET "$GraphRoot/servicePrincipals?`$filter=appId%20eq%20'00000003-0000-0000-c000-000000000000'&`$select=id,appRoles" $adminToken).value[0]
    $fullControlRole = $graphSp.appRoles | Where-Object {
        $_.value -eq 'Sites.FullControl.All' -and $_.allowedMemberTypes -contains 'Application'
    }
    Invoke-Graph POST "$GraphRoot/servicePrincipals/$($tempServicePrincipal.id)/appRoleAssignments" $adminToken @{
        principalId = $tempServicePrincipal.id
        resourceId = $graphSp.id
        appRoleId = $fullControlRole.id
    } | Out-Null

    # SharePoint's authorization cache trails the Entra app-role assignment.
    Start-Sleep -Seconds 20

    $appToken = $null
    $tokenEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    for ($tokenAttempt = 1; $tokenAttempt -le 8; $tokenAttempt++) {
        try {
            $assertion = New-ClientAssertion -ClientId $tempApplication.appId -Audience $tokenEndpoint -Certificate $certificate -PrivateKey $rsa
            $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenEndpoint -ContentType 'application/x-www-form-urlencoded' -Body @{
                client_id = $tempApplication.appId
                client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
                client_assertion = $assertion
                scope = 'https://graph.microsoft.com/.default'
                grant_type = 'client_credentials'
            }
            $appToken = $tokenResponse.access_token
            break
        }
        catch {
            if ($tokenAttempt -eq 8) { throw }
            Start-Sleep -Seconds ([Math]::Min(16, [Math]::Pow(2, $tokenAttempt - 1)))
        }
    }
    $assertion = $null

    $site = Invoke-Graph GET "$GraphRoot/sites/eduieda.sharepoint.com:/sites/CENTROADMIN?`$select=id,displayName,webUrl" $appToken
    if ($site.webUrl -ne 'https://eduieda.sharepoint.com/sites/CENTROADMIN') {
        throw "Resolved an unexpected SharePoint site: $($site.webUrl)"
    }
    $SiteId = $site.id

    $listDefinitions = @(
        @{
            Name='PLATAFORMA_CONFIGURACOES'; Description='Configurações versionadas e feature flags da plataforma.'; Template='genericList'; Columns=@(
                (New-TextColumn 'Chave' $false $true), (New-TextColumn 'Escopo' $false $true),
                (New-ChoiceColumn 'TipoValor' @('string','number','boolean','json','dateTime')),
                (New-TextColumn 'ValorJson' $true), (New-TextColumn 'Versao'),
                (New-DateColumn 'VigenciaInicioUTC'), (New-DateColumn 'VigenciaFimUTC'),
                (New-BoolColumn 'Ativo' $true), (New-DateColumn 'AtualizadoEmUTC'),
                (New-TextColumn 'AtualizadoPorObjectId')
            )
        },
        @{
            Name='PLATAFORMA_MODULOS'; Description='Registro de módulos instalados na plataforma.'; Template='genericList'; Columns=@(
                (New-TextColumn 'Chave' $false $true), (New-TextColumn 'Nome'), (New-TextColumn 'RotaBase'),
                (New-TextColumn 'Versao'), (New-ChoiceColumn 'Status' @('instalado','desabilitado','depreciado')),
                (New-NumberColumn 'Ordem'), (New-TextColumn 'RolesJson' $true), (New-TextColumn 'HealthEndpoint'),
                (New-DateColumn 'InstaladoEmUTC'), (New-DateColumn 'AtualizadoEmUTC')
            )
        },
        @{
            Name='PLATAFORMA_AUDITORIA'; Description='Trilha operacional da plataforma; não é armazenamento WORM.'; Template='genericList'; Columns=@(
                (New-TextColumn 'EventoId' $false $true), (New-DateColumn 'DataHoraUTC'), (New-TextColumn 'UsuarioObjectId'),
                (New-TextColumn 'Modulo'), (New-TextColumn 'Acao'), (New-TextColumn 'EntidadeTipo'),
                (New-TextColumn 'EntidadeId'), (New-TextColumn 'CorrelationId' $false $true),
                (New-ChoiceColumn 'Resultado' @('sucesso','falha','negado')), (New-TextColumn 'DetalhesJson' $true)
            )
        },
        @{
            Name='PLATAFORMA_MIGRACOES'; Description='Histórico idempotente de migrations.'; Template='genericList'; Columns=@(
                (New-TextColumn 'Versao' $false $true), (New-TextColumn 'Modulo'), (New-DateColumn 'AplicadaEmUTC'),
                (New-ChoiceColumn 'Resultado' @('sucesso','falha','ignorada')), (New-TextColumn 'CorrelationId'),
                (New-TextColumn 'Checksum'), (New-TextColumn 'Detalhes' $true)
            )
        },
        @{
            Name='PLATAFORMA_CREDENCIAIS'; Description='Metadados de validade de credenciais; nunca armazena segredos.'; Template='genericList'; Columns=@(
                (New-TextColumn 'Nome' $false $true), (New-ChoiceColumn 'Tipo' @('entra-client-secret','session-secret','outro')),
                (New-TextColumn 'AppClientId'), (New-DateColumn 'CriadaEmUTC'), (New-DateColumn 'ExpiraEmUTC'),
                (New-TextColumn 'Responsavel'), (New-BoolColumn 'Ativo' $true),
                (New-ChoiceColumn 'UltimoNivelAlerta' @('nenhum','60d','30d','7d','expirado')),
                (New-DateColumn 'UltimoAlertaEmUTC')
            )
        },
        @{
            Name='PLATAFORMA_AUTOMACOES'; Description='Contratos declarativos de automação; não aceita código arbitrário.'; Template='genericList'; Columns=@(
                (New-TextColumn 'AutomacaoId' $false $true), (New-TextColumn 'Nome'), (New-TextColumn 'Descricao' $true),
                (New-ChoiceColumn 'Status' @('rascunho','ativa','pausada','desabilitada')),
                (New-ChoiceColumn 'GatilhoTipo' @('manual','schedule','event','condition')),
                (New-TextColumn 'GatilhoJson' $true), (New-TextColumn 'CondicoesJson' $true),
                (New-TextColumn 'AcoesJson' $true), (New-TextColumn 'Versao'), (New-TextColumn 'AllowlistVersion'),
                (New-TextColumn 'CriadaPorObjectId'), (New-DateColumn 'CriadaEmUTC'), (New-DateColumn 'AtualizadaEmUTC'),
                (New-DateColumn 'ProximaExecucaoUTC'), (New-DateColumn 'UltimaExecucaoUTC')
            )
        },
        @{
            Name='PLATAFORMA_EXECUCOES_AUTOMACAO'; Description='Execuções auditáveis das automações declarativas.'; Template='genericList'; Columns=@(
                (New-TextColumn 'ExecucaoId' $false $true), (New-TextColumn 'AutomacaoId' $false $true),
                (New-DateColumn 'IniciadaEmUTC'), (New-DateColumn 'FinalizadaEmUTC'),
                (New-ChoiceColumn 'Status' @('iniciada','sucesso','falha','cancelada','ignorada')),
                (New-TextColumn 'CorrelationId' $false $true), (New-NumberColumn 'Tentativa'),
                (New-TextColumn 'ResumoJson' $true), (New-TextColumn 'ErroCodigo'), (New-TextColumn 'ErroResumo' $true)
            )
        },
        @{
            Name='ARQUIVOS_PLATAFORMA'; Description='Arquivos operacionais controlados da plataforma.'; Template='documentLibrary'; Columns=@(
                (New-TextColumn 'Modulo' $false $true), (New-TextColumn 'CorrelationId'), (New-DateColumn 'DataReferenciaUTC')
            )
        },
        @{
            Name='SNAPSHOTS_PLATAFORMA'; Description='Snapshots técnicos controlados da plataforma.'; Template='documentLibrary'; Columns=@(
                (New-TextColumn 'Modulo' $false $true), (New-TextColumn 'CorrelationId'), (New-DateColumn 'DataReferenciaUTC')
            )
        },
        @{
            Name='RELATORIOS_PLATAFORMA'; Description='Relatórios técnicos e de auditoria da plataforma.'; Template='documentLibrary'; Columns=@(
                (New-TextColumn 'Modulo' $false $true), (New-TextColumn 'CorrelationId'), (New-DateColumn 'DataReferenciaUTC')
            )
        }
    )

    $created = @()
    foreach ($definition in $listDefinitions) {
        $created += Ensure-List -DisplayName $definition.Name -Description $definition.Description -Template $definition.Template -Columns $definition.Columns -AccessToken $appToken
    }

    $modules = $created | Where-Object Name -eq 'PLATAFORMA_MODULOS'
    $moduleItems = Invoke-Graph GET "$GraphRoot/sites/$SiteId/lists/$($modules.Id)/items?expand=fields(`$select=Chave)&`$top=200" $appToken
    if (-not ($moduleItems.value.fields.Chave -contains 'plataforma-base')) {
        $now = (Get-Date).ToUniversalTime().ToString('o')
        Invoke-Graph POST "$GraphRoot/sites/$SiteId/lists/$($modules.Id)/items" $appToken @{
            fields = @{
                Title='plataforma-base'; Chave='plataforma-base'; Nome='Plataforma Base'; RotaBase='/';
                Versao='1.0.0'; Status='instalado'; Ordem=0; RolesJson='["ADMINISTRADOR","PROFESSOR","ALUNO","APOIO","VISITANTE"]';
                HealthEndpoint='/api/health'; InstaladoEmUTC=$now; AtualizadoEmUTC=$now
            }
        } | Out-Null
    }

    $credentialList = $created | Where-Object Name -eq 'PLATAFORMA_CREDENCIAIS'
    $credentialItems = Invoke-Graph GET "$GraphRoot/sites/$SiteId/lists/$($credentialList.Id)/items?expand=fields(`$select=Nome)&`$top=200" $appToken
    $existingCredentialNames = @($credentialItems.value.fields.Nome)
    $createdUtc = (Get-Date).ToUniversalTime().ToString('o')
    $credentialMetadata = @(
        @{ Nome='Ecossistema Escolar - Web (certificado)'; Tipo='outro'; AppClientId='78185e20-c824-4acc-9ccd-41b9f7509a6f'; ExpiraEmUTC=$WebCredentialExpiresUtc },
        @{ Nome='Ecossistema Escolar - Graph Backend (certificado)'; Tipo='outro'; AppClientId=$BackendClientId; ExpiraEmUTC=$BackendCredentialExpiresUtc },
        @{ Nome='Cloudflare SESSION_SECRET'; Tipo='session-secret'; AppClientId=''; ExpiraEmUTC=$SessionCredentialExpiresUtc }
    )
    foreach ($metadata in $credentialMetadata) {
        if ($metadata.ExpiraEmUTC -and $existingCredentialNames -notcontains $metadata.Nome) {
            Invoke-Graph POST "$GraphRoot/sites/$SiteId/lists/$($credentialList.Id)/items" $appToken @{
                fields = @{
                    Title=$metadata.Nome; Nome=$metadata.Nome; Tipo=$metadata.Tipo; AppClientId=$metadata.AppClientId;
                    CriadaEmUTC=$createdUtc; ExpiraEmUTC=$metadata.ExpiraEmUTC.ToUniversalTime().ToString('o');
                    Responsavel='GRUPO DA SECRETARIA - ARQUIVO DIGITAL'; Ativo=$true; UltimoNivelAlerta='nenhum'
                }
            } | Out-Null
        }
    }

    $permissions = Invoke-Graph GET "$GraphRoot/sites/$SiteId/permissions" $appToken
    $hasBackendGrant = $false
    foreach ($permission in $permissions.value) {
        foreach ($identity in @($permission.grantedToIdentitiesV2) + @($permission.grantedToIdentities)) {
            if ($identity.application.id -eq $BackendClientId -and $permission.roles -contains 'write') {
                $hasBackendGrant = $true
            }
        }
    }
    if (-not $hasBackendGrant) {
        Invoke-Graph POST "$GraphRoot/sites/$SiteId/permissions" $appToken @{
            roles = @('write')
            grantedToIdentities = @(@{ application = @{ id = $BackendClientId; displayName = 'Ecossistema Escolar - Graph Backend' } })
        } | Out-Null
    }

    [pscustomobject]@{
        SiteId = $site.id
        SiteUrl = $site.webUrl
        Resources = $created
        BackendGrant = 'write'
        TemporaryProvisionerRemoved = $true
    } | ConvertTo-Json -Depth 8
}
finally {
    $assertion = $null
    if ($tempApplication) {
        try { Invoke-Graph DELETE "$GraphRoot/applications/$($tempApplication.id)" $adminToken | Out-Null } catch { Write-Warning "Falha ao remover o aplicativo temporário: $($_.Exception.Message)" }
    }
    if ($certificate) { $certificate.Dispose() }
    if ($rsa) { $rsa.Dispose() }
}
