# Entra Operations via GitHub OIDC

## Objetivo

Preparar uma identidade **read-only** para GitHub Actions auditar os dois App Registrations usados pelo Ecossistema sem armazenar client secret no GitHub.

O auditor é `scripts/entra/operations-audit.ts`. Ele não cria nem altera recursos Microsoft.

## Entradas futuras do workflow

- `ENTRA_TENANT_ID`
- `ENTRA_OPERATIONS_CLIENT_ID`
- `WEB_APPLICATION_OBJECT_ID`
- `GRAPH_APPLICATION_OBJECT_ID`
- `GRAPH_ACCESS_TOKEN` temporário obtido pelo workflow via GitHub OIDC

O access token nunca é incluído na saída.

## O que o auditor lê

Somente os dois applications identificados pelos object IDs informados e os respectivos service principals encontrados pelo `appId`.

A saída sanitizada contém:

- object ID, app/client ID e display name;
- `signInAudience`;
- redirect URIs Web/SPA/Public Client;
- metadados de certificados (sem material de chave privada);
- metadados de password credentials (sem secretText/hint);
- `requiredResourceAccess`;
- estado básico do service principal.

Erros Graph retornam apenas estágio + status HTTP, sem corpo bruto do provider.

## Próxima etapa manual

Depois que o workflow OIDC for criado:

1. no App Registration correspondente a `ENTRA_OPERATIONS_CLIENT_ID`, adicionar a Federated Credential do repositório GitHub indicada pelo workflow;
2. conceder somente as permissões Microsoft Graph de leitura que o workflow documentar;
3. não criar client secret.

A identidade de Maintenance será tratada separadamente depois que Operations estiver comprovado.

## Workflow GitHub Actions

O workflow `.github/workflows/entra-operations-audit.yml` usa OIDC e não armazena client secret.

Execução real:
- somente `workflow_dispatch`;
- somente `main`;
- `id-token: write` existe apenas no job de auditoria;
- não depende de `azure/login` ou Azure CLI: o workflow solicita diretamente uma assertion OIDC ao GitHub e a troca no endpoint OAuth 2.0 do Entra;
- audience da assertion: `api://AzureADTokenExchange`;
- escopo do token final: `https://graph.microsoft.com/.default`;
- as assertions e o token Graph são temporários, mascarados e removidos do workspace após o auditor.

### Credencial federada a criar no Entra

Este repositório foi criado depois de 15/07/2026 e usa o formato OIDC imutável do GitHub.

- **Issuer:** `https://token.actions.githubusercontent.com`
- **Audience:** `api://AzureADTokenExchange`
- **Subject:** `repo:mcpmieda@268288370/ecossistema-escola@1345061518:ref:refs/heads/main`

Criar essa Federated Credential no App Registration cujo Client ID está em `ENTRA_OPERATIONS_CLIENT_ID`.

### Permissão Microsoft Graph

Conceder somente a permissão **Application**:

- `Application.Read.All` — ID `9a5d68dd-52b0-4cc2-bd40-abcf44ac3a30`

Essa permissão permite ler applications e service principals e requer admin consent. Não conceder `Directory.Read.All` nem permissões de escrita para esta identidade Operations.

Depois da federação e do consentimento, executar manualmente o workflow **Entra Operations audit**. O artefato gerado contém apenas metadados sanitizados.
