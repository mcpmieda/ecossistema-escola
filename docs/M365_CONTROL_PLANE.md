# Microsoft 365 pelo GitHub Control Plane

## Objetivo

Eliminar a dependência de Codex, login interativo e scripts administrativos ad hoc para operações rotineiras dentro do Microsoft 365.

O fluxo operacional é:

PowerShell local -> GitHub Actions -> GitHub OIDC -> Microsoft Entra -> identidade técnica específica -> Microsoft Graph -> recurso autorizado.

Codex continua sendo ferramenta de desenvolvimento e investigação. Não é parte da cadeia normal de autenticação ou execução.

## Identidades separadas

A identidade de manutenção existente continua restrita à manutenção dos aplicativos técnicos que ela possui.

Uma nova identidade `Ecossistema Escola - GitHub M365 Operations` é dedicada às operações Microsoft 365 do Control Plane.

A identidade operacional solicita somente `Sites.Selected`. Ela não recebe `Directory.ReadWrite.All`, `Sites.ReadWrite.All` ou permissão administrativa genérica sobre o tenant.

O acesso efetivo só existe depois de duas autorizações explícitas:

1. consentimento administrativo para a permissão de aplicação `Sites.Selected`;
2. concessão da identidade ao site SharePoint selecionado com o papel necessário.

## Bootstrap

O workflow `bootstrap-m365-operations-identity.yml` usa a identidade de manutenção por GitHub OIDC somente para:

- criar ou reutilizar a aplicação operacional dedicada;
- criar ou reutilizar o service principal;
- declarar `Sites.Selected` como permissão necessária;
- criar a credencial federada exata para `repo:mcpmieda/ecossistema-escola:environment:production`;
- publicar evidência com os IDs públicos necessários para a autorização administrativa.

O bootstrap não concede a si mesmo `Sites.Selected`, não concede acesso a site e não acessa arquivos do SharePoint.

## Autorização administrativa única

A Microsoft exige consentimento administrativo para `Sites.Selected`. A aplicação também precisa receber uma concessão explícita no site selecionado.

Esses dois atos são a fronteira administrativa inicial. Depois deles, a autenticação operacional usa tokens efêmeros e não exige client secret, certificado local, Codex ou login humano por execução.

O Client ID da identidade operacional deve ser registrado como variável GitHub `ENTRA_OPERATIONS_CLIENT_ID` depois do bootstrap.

## Operações iniciais

O workflow `m365-operations.yml` aceita somente escolhas fechadas:

- `identity-check`: comprova GitHub OIDC -> Entra e confirma a presença de `Sites.Selected` no token;
- `sharepoint-health`: confirma acesso ao site autorizado e contabiliza listas e bibliotecas sem ler conteúdo de documentos;
- `banco-notas-readiness`: confirma a fronteira de armazenamento SharePoint/OneDrive necessária ao Banco de Notas sem ativar sincronização nem executar escrita.

Não existe input de URL, endpoint, caminho Graph, comando, script ou shell.

## Banco de Notas

Esta fundação não altera o PR do Banco de Notas e não habilita `SyncEnabled`.

Quando a integração Graph/SharePoint do Banco de Notas for homologada, novas operações de escrita devem ser implementadas como ações tipadas e versionadas. Exemplos futuros:

- publicar uma versão de modelo docente;
- arquivar uma versão substituída;
- verificar divergência entre versão esperada e arquivo publicado;
- restaurar uma versão conhecida;
- sincronizar somente os artefatos explicitamente permitidos pelo contrato do Banco de Notas.

Cada operação de escrita deve ser idempotente, auditável e limitada ao site e recurso esperados.

## Uso

Bootstrap da identidade:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365-bootstrap

Teste da identidade:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 identity-check

Saúde do SharePoint:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 sharepoint-health

Prontidão do armazenamento do Banco de Notas:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 banco-notas-readiness

## Regra permanente

Nenhuma rotina operacional normal do ecossistema deve depender do Codex para autenticar em Microsoft 365.

Codex desenvolve. O GitHub Control Plane opera.
