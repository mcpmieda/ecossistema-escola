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
