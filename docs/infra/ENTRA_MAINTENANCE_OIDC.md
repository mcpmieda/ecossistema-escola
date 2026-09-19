# Entra Maintenance via GitHub OIDC

## Objetivo

A identidade **Ecossistema Maintenance - GitHub OIDC** é separada de Operations e existe somente para manutenção delimitada dos dois App Registrations técnicos do Ecossistema.

A fase A é um **dry-run sem mutação**. Ela não cria, altera ou remove certificados, owners, permissões ou applications.

## Menor privilégio

Permissão Microsoft Graph **Application** permitida:

- `Application.ReadWrite.OwnedBy`
- ID: `18a4783c-866b-4cc7-a460-3d5e5662c884`

Não conceder:

- `Application.ReadWrite.All`;
- `Directory.ReadWrite.All`;
- `Directory.Read.All`;
- permissões de administração de app-role assignments.

O dry-run lê os app-role assignments da própria identidade e falha fechado se houver qualquer application permission além de `Application.ReadWrite.OwnedBy`.

## Ownership permitido

O service principal Maintenance deve ser owner **somente** destes application objects:

- Web: `0fcc9402-26bb-4c9d-9ccd-eb4f625cf278`;
- Graph: `2d04bd2b-3ef5-4ac6-bd2e-11885a5b3401`.

O dry-run consulta `ownedObjects` e exige exatamente esses dois IDs. Ownership ausente ou adicional é erro.

## GitHub OIDC

Não criar client secret.

Issuer:

`https://token.actions.githubusercontent.com`

Audience:

`api://AzureADTokenExchange`

O job usa o GitHub Environment `maintenance`. Para este repositório, o subject imutável esperado é:

`repo:mcpmieda@268288370/ecossistema-escola@1345061518:environment:maintenance`

O workflow também falha se não estiver executando sobre `refs/heads/main`.

## GitHub Environment

Criar o environment `maintenance` antes da primeira execução real.

Configuração esperada:

- permitir deploy somente da branch `main`;
- exigir revisão manual para a execução de Maintenance quando o plano permitir;
- não armazenar private key de certificado como secret permanente do job.

Repository Variable adicional:

- `ENTRA_MAINTENANCE_CLIENT_ID` = Client ID do App Registration Maintenance.

As variáveis `ENTRA_TENANT_ID`, `WEB_APPLICATION_OBJECT_ID` e `GRAPH_APPLICATION_OBJECT_ID` já são reutilizadas.

## Fase A — dry-run

O workflow `.github/workflows/entra-maintenance.yml` é manual e:

1. obtém assertion OIDC do GitHub;
2. troca por token Graph de curta duração;
3. confirma que a identidade tem somente `Application.ReadWrite.OwnedBy`;
4. confirma ownership exatamente de Web e Graph;
5. inventaria certificados atuais sem publicar bytes do certificado ou private keys;
6. publica apenas contagens e status sanitizados.

Nenhum método Graph de escrita é usado pelo planner.

## Fase B — rotação A/B

Somente depois de um dry-run real verde.

O runtime existente será reutilizado:

- `WEB_CREDENTIAL_A` / `WEB_CREDENTIAL_B`;
- `GRAPH_CREDENTIAL_A` / `GRAPH_CREDENTIAL_B`;
- seleção do slot mais novo por `createdAt`;
- validação de Web por slot exato;
- validação de Graph por slot exato.

A implementação de apply deve gerar a nova chave somente no job protegido, adicionar o certificado público preservando certificados válidos existentes, gravar a credencial privada no slot inativo do runtime, provar o slot exato sem fallback e manter o certificado anterior durante a janela de rollback.
