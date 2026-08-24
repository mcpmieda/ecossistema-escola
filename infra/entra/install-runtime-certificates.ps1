[CmdletBinding()]
param(
    [string] $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string] $TenantId = 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
    [string] $WebApplicationObjectId = '0fcc9402-26bb-4c9d-9ccd-eb4f625cf278',
    [string] $WebClientId = '78185e20-c824-4acc-9ccd-41b9f7509a6f',
    [string] $BackendApplicationObjectId = '2d04bd2b-3ef5-4ac6-bd2e-11885a5b3401',
    [string] $BackendClientId = '7d565352-1f77-4a7c-a4a4-4ae1b55b5c0c',
    [string] $SiteId = 'eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56'
)

$ErrorActionPreference = 'Stop'

function ConvertTo-Base64Url([byte[]] $Bytes) {
    [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-RuntimeCertificate([string] $Name) {
    $rsa = [Security.Cryptography.RSA]::Create(2048)
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
        "CN=$Name", $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    $start = [DateTimeOffset]::UtcNow.AddMinutes(-5)
    $end = [DateTimeOffset]::UtcNow.AddMonths(12)
    $certificate = $request.CreateSelfSigned($start, $end)
    [pscustomobject]@{ Rsa = $rsa; Certificate = $certificate; KeyId = [guid]::NewGuid() }
}

function ConvertTo-KeyCredential($RuntimeCertificate) {
    $certificate = $RuntimeCertificate.Certificate
    @{
        customKeyIdentifier = [Convert]::ToBase64String($certificate.GetCertHash())
        displayName = 'runtime-certificate-2026'
        endDateTime = $certificate.NotAfter.ToUniversalTime().AddMinutes(-1).ToString('o')
        key = [Convert]::ToBase64String($certificate.RawData)
        keyId = $RuntimeCertificate.KeyId
        startDateTime = $certificate.NotBefore.ToUniversalTime().AddMinutes(1).ToString('o')
        type = 'AsymmetricX509Cert'
        usage = 'Verify'
    }
}

function ConvertTo-PrivateKeyPem($RuntimeCertificate) {
    [Security.Cryptography.PemEncoding]::WriteString(
        'PRIVATE KEY', $RuntimeCertificate.Rsa.ExportPkcs8PrivateKey()
    )
}

function New-ClientAssertion($RuntimeCertificate, [string] $ClientId) {
    $endpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    $now = [DateTimeOffset]::UtcNow
    $header = @{ alg = 'RS256'; typ = 'JWT'; x5t = (ConvertTo-Base64Url $RuntimeCertificate.Certificate.GetCertHash()) } | ConvertTo-Json -Compress
    $payload = @{
        aud = $endpoint; iss = $ClientId; sub = $ClientId; jti = [guid]::NewGuid().ToString()
        nbf = $now.AddMinutes(-1).ToUnixTimeSeconds(); exp = $now.AddMinutes(5).ToUnixTimeSeconds()
    } | ConvertTo-Json -Compress
    $unsigned = "$(ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))).$(ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payload)))"
    $signature = $RuntimeCertificate.Rsa.SignData(
        [Text.Encoding]::UTF8.GetBytes($unsigned), [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    "$unsigned.$(ConvertTo-Base64Url $signature)"
}

function Set-PagesSecret([string] $Name, [string] $Value) {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = (Get-Command node).Source
    $startInfo.ArgumentList.Add((Join-Path $ProjectRoot 'node_modules\wrangler\bin\wrangler.js'))
    $startInfo.ArgumentList.Add('pages')
    $startInfo.ArgumentList.Add('secret')
    $startInfo.ArgumentList.Add('put')
    $startInfo.ArgumentList.Add($Name)
    $startInfo.ArgumentList.Add('--project-name')
    $startInfo.ArgumentList.Add('ecossistema-escola')
    $startInfo.WorkingDirectory = $ProjectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($startInfo)
    $process.StandardInput.Write($Value)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $errorOutput = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Cloudflare rejected secret '$Name': $errorOutput$output" }
}

$tokenObject = Get-AzAccessToken -ResourceUrl 'https://graph.microsoft.com'
$adminToken = if ($tokenObject.Token -is [securestring]) {
    [Net.NetworkCredential]::new('', $tokenObject.Token).Password
} else { $tokenObject.Token }
$headers = @{ Authorization = "Bearer $adminToken"; 'Content-Type' = 'application/json' }
$web = New-RuntimeCertificate 'Ecossistema Escolar Web'
$backend = New-RuntimeCertificate 'Ecossistema Escolar Graph Backend'
$sessionSecret = $null

try {
    Invoke-RestMethod -Method Patch -Uri "https://graph.microsoft.com/v1.0/applications/$WebApplicationObjectId" -Headers $headers -Body (@{ keyCredentials = @((ConvertTo-KeyCredential $web)) } | ConvertTo-Json -Depth 12 -Compress) | Out-Null
    Invoke-RestMethod -Method Patch -Uri "https://graph.microsoft.com/v1.0/applications/$BackendApplicationObjectId" -Headers $headers -Body (@{ keyCredentials = @((ConvertTo-KeyCredential $backend)) } | ConvertTo-Json -Depth 12 -Compress) | Out-Null

    Start-Sleep -Seconds 20
    $endpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    $tokenResponse = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/x-www-form-urlencoded' -Body @{
        client_id = $BackendClientId
        scope = 'https://graph.microsoft.com/.default'
        grant_type = 'client_credentials'
        client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
        client_assertion = (New-ClientAssertion $backend $BackendClientId)
    }
    $backendHeaders = @{ Authorization = "Bearer $($tokenResponse.access_token)" }
    $site = Invoke-RestMethod -Headers $backendHeaders -Uri "https://graph.microsoft.com/v1.0/sites/${SiteId}?`$select=id,webUrl"
    if ($site.webUrl -ne 'https://eduieda.sharepoint.com/sites/CENTROADMIN') {
        throw 'Backend Sites.Selected validation failed.'
    }

    $sessionBytes = [byte[]]::new(64)
    [Security.Cryptography.RandomNumberGenerator]::Fill($sessionBytes)
    $sessionSecret = ConvertTo-Base64Url $sessionBytes
    Set-PagesSecret 'WEB_PRIVATE_KEY_PKCS8' (ConvertTo-PrivateKeyPem $web)
    Set-PagesSecret 'WEB_CERT_THUMBPRINT' (ConvertTo-Base64Url $web.Certificate.GetCertHash())
    Set-PagesSecret 'GRAPH_PRIVATE_KEY_PKCS8' (ConvertTo-PrivateKeyPem $backend)
    Set-PagesSecret 'GRAPH_CERT_THUMBPRINT' (ConvertTo-Base64Url $backend.Certificate.GetCertHash())
    Set-PagesSecret 'SESSION_SECRET' $sessionSecret

    [pscustomobject]@{
        WebKeyId = $web.KeyId
        WebExpiresUTC = $web.Certificate.NotAfter.ToUniversalTime().ToString('o')
        BackendKeyId = $backend.KeyId
        BackendExpiresUTC = $backend.Certificate.NotAfter.ToUniversalTime().ToString('o')
        BackendSiteAccess = 'validated'
        SecretsStored = @('WEB_PRIVATE_KEY_PKCS8','WEB_CERT_THUMBPRINT','GRAPH_PRIVATE_KEY_PKCS8','GRAPH_CERT_THUMBPRINT','SESSION_SECRET')
    } | ConvertTo-Json -Compress
}
finally {
    $sessionSecret = $null
    $tokenResponse = $null
    $web.Rsa.Dispose(); $web.Certificate.Dispose()
    $backend.Rsa.Dispose(); $backend.Certificate.Dispose()
}
