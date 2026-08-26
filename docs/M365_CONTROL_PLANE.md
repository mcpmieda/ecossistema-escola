# Microsoft 365 pelo GitHub Control Plane

## Objetivo

Eliminar a dependência de Codex, login interativo e scripts administrativos ad hoc para operações rotineiras dentro do Microsoft 365.

O fluxo operacional normal é:

PowerShell local -> GitHub Actions -> GitHub OIDC -> Microsoft Entra -> identidade técnica específica -> Microsoft Graph -> recurso autorizado.

Codex continua sendo ferramenta de desenvolvimento e investigação. Não é parte da cadeia normal de autenticação ou execução.

## Identidades separadas

A identidade de manutenção existente continua restrita à manutenção dos aplicativos técnicos que ela possui.

Uma nova identidade `Ecossistema Escola - GitHub M365 Operations` é dedicada às operações Microsoft 365 do Control Plane.

A identidade operacional recebe somente `Sites.Selected`. Ela não recebe `Directory.ReadWrite.All`, `Sites.ReadWrite.All`, `Sites.FullControl.All` ou permissão administrativa genérica sobre o tenant.

O acesso efetivo só existe depois de duas autorizações explícitas:

1. consentimento administrativo para a permissão de aplicação `Sites.Selected`;
2. concessão da identidade ao site SharePoint selecionado com o papel necessário.

## Bootstrap do registro

O workflow `bootstrap-m365-operations-identity.yml` usa a identidade de manutenção por GitHub OIDC apenas para preparar o registro da identidade operacional. Ele pode:

- criar ou reutilizar a aplicação operacional dedicada;
- declarar `Sites.Selected` como permissão necessária;
- criar ou validar a credencial federada exata para `repo:mcpmieda@268288370/ecossistema-escola@1345061518:environment:production`;
- detectar se o service principal já existe;
- publicar evidência com os IDs públicos necessários para a autorização administrativa.

O bootstrap não cria obrigatoriamente o service principal, não concede consentimento, não concede acesso a site e não acessa arquivos do SharePoint.

A execução `32999892440` demonstrou que o tenant respondeu `403` ao `POST /servicePrincipals` quando chamado pela identidade de manutenção com `Application.ReadWrite.OwnedBy`. Apesar de a documentação do Microsoft Graph listar essa permissão como suficiente em condições suportadas, o Control Plane não amplia a identidade de manutenção para contornar a política efetiva do tenant.

## Autorização administrativa única

A etapa administrativa é executada uma única vez pelo script versionado:

    pwsh ./infra/entra/complete-m365-operations-authorization.ps1

O script usa autenticação interativa do administrador e solicita apenas para essa sessão as permissões delegadas necessárias para concluir o provisionamento. Ele:

1. reutiliza a aplicação preparada pelo bootstrap;
2. cria o service principal se ainda não existir;
3. garante a credencial federada OIDC esperada;
4. concede o app role `Sites.Selected` ao service principal;
5. concede `write` somente ao site `CENTROADMIN` configurado;
6. adiciona o administrador conectado como owner da aplicação e do service principal;
7. remove a identidade de manutenção como owner, quando presente;
8. registra o Client ID na variável GitHub `ENTRA_OPERATIONS_CLIENT_ID`.

A permissão delegada `Sites.FullControl.All` é usada somente pelo administrador para criar a concessão específica do site. Ela não é concedida à identidade operacional.

Depois dessa autorização única, as operações normais usam tokens efêmeros GitHub OIDC -> Entra e não exigem client secret, certificado local, Codex ou login humano por execução.

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

Preparar o registro:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365-bootstrap

Concluir a autorização administrativa única:

    pwsh ./infra/entra/complete-m365-operations-authorization.ps1

Teste da identidade:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 identity-check

Saúde do SharePoint:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 sharepoint-health

Prontidão do armazenamento do Banco de Notas:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 banco-notas-readiness

## Regra permanente

Nenhuma rotina operacional normal do ecossistema deve depender do Codex para autenticar em Microsoft 365.

Codex desenvolve. O GitHub Control Plane opera.
