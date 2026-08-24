# Comandos de auditoria somente leitura

Os comandos abaixo não alteram recursos. Execute em PowerShell autenticado apenas quando necessário; eles não exibem valores de secrets.

## DNS e HTTPS

```powershell
Resolve-DnsName admin.escolaieda.com -Type CNAME
```

Confirma o único CNAME novo.

```powershell
Resolve-DnsName escolaieda.com -Type A
Resolve-DnsName www.escolaieda.com -Type CNAME
Resolve-DnsName escolaieda.com -Type MX
```

Confirma que raiz, www e e-mail continuam nos destinos anteriores.

```powershell
Invoke-WebRequest https://admin.escolaieda.com/api/health -Method Get
Invoke-WebRequest https://ecossistema-escola.pages.dev/api/health -Method Get -SkipHttpErrorCheck
```

Espera 200 no domínio oficial e 421 no domínio alternativo.

## GitHub

```powershell
gh repo view mcpmieda/ecossistema-escola --json nameWithOwner,isPrivate,defaultBranchRef,url
gh run list --repo mcpmieda/ecossistema-escola --limit 10
gh variable list --repo mcpmieda/ecossistema-escola
gh secret list --repo mcpmieda/ecossistema-escola
```

Confirma repo privado, workflows e apenas nomes de variables/secrets.

## Cloudflare

```powershell
npx wrangler pages project list
npx wrangler pages deployment list --project-name ecossistema-escola
npx wrangler pages secret list --project-name ecossistema-escola
```

Lista projeto, deployments e nomes de secrets sem revelar valores.

## Entra e Graph

```powershell
Get-AzContext | Select-Object Account,Tenant
Get-AzADApplication -DisplayNameStartWith 'Ecossistema Escolar' | Select-Object DisplayName,AppId,Id
Get-AzADGroup -DisplayNameStartsWith 'ECO-' | Select-Object DisplayName,Id
```

Confirma tenant, apps e ausência de grupos paralelos.

```powershell
$tokenResult = Get-AzAccessToken -ResourceUrl 'https://graph.microsoft.com'
$graphToken = if ($tokenResult.Token -is [securestring]) { [Net.NetworkCredential]::new('', $tokenResult.Token).Password } else { [string]$tokenResult.Token }
$headers = @{ Authorization = "Bearer $graphToken" }
Invoke-RestMethod -Headers $headers -Uri 'https://graph.microsoft.com/v1.0/applications?$filter=startswith(displayName,%27Ecossistema%20Escolar%27)&$select=id,appId,displayName,keyCredentials'
```

Lê IDs e metadados de validade dos certificados; não retorna chaves privadas.

## SharePoint e Sites.Selected

```powershell
$siteId = 'eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56'
Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$siteId?`$select=id,displayName,webUrl"
Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions"
```

Confirma o site e a concessão explícita. A prova runtime de outro site 403 fica no artefato do workflow de rotação.

## Repositório local

```powershell
git status --short
npm run verify
git grep -nEi '(client_secret|private_key|password|bearer[[:space:]])' -- ':!package-lock.json' ':!docs/*'
```

Confirma árvore limpa, qualidade e ausência de padrões óbvios de segredo no código versionado; revise falsos positivos, sem imprimir arquivos de configuração local.

## GitHub Actions supply chain

```powershell
rg -n '^\s*uses:' .github/workflows
rg -n '^\s*(permissions:|environment:)|id-token|secrets\.' .github/workflows
```

Confirma pins completos, permissões, environments e referências a secrets sem exibir valores.

```powershell
gh api repos/mcpmieda/ecossistema-escola/actions/permissions
gh api repos/mcpmieda/ecossistema-escola/actions/permissions/workflow
gh api repos/mcpmieda/ecossistema-escola/environments/production
gh secret list --repo mcpmieda/ecossistema-escola
gh secret list --repo mcpmieda/ecossistema-escola --env production
```

Lê a política Actions, o environment e somente nomes/escopos de secrets.

```powershell
gh run list --repo mcpmieda/ecossistema-escola --workflow 'CI and deploy' --limit 10
gh pr list --repo mcpmieda/ecossistema-escola --author 'app/dependabot'
```

Mostra os gates recentes e PRs de atualização; não modifica workflows.

O actionlint reproduzível fica em `infra/validation/run-actionlint.sh`. O zizmor 1.29.0 executa no gate Linux `Validate GitHub Actions security`, porque a política de controle de aplicativos deste Windows bloqueia seu binário local.
