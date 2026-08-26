# GitHub como plano de controle operacional

## Objetivo

O GitHub é o ponto central de controle das operações técnicas do Ecossistema Escolar.

A máquina administrativa pode iniciar operações usando PowerShell e GitHub CLI, mas operações relevantes devem ser executadas e auditadas no GitHub Actions.

## Princípio

PowerShell local -> GitHub Actions -> identidade técnica específica -> serviço alvo.

Não utilizar a estação administrativa como executor permanente de tarefas críticas.

## Operações iniciais

- status
- validação completa
- verificação de recuperação
- rotação de identidade técnica
- bootstrap da identidade operacional Microsoft 365
- operações Microsoft 365 tipadas e allowlisted
- consulta de logs
- recuperação de artifacts

## Produção

Não existe comando local de deploy.

Produção continua sendo consequência de alteração versionada, revisada e integrada à branch main.

O workflow de CI mantém o gate existente:

push main -> validações -> deploy -> verificação de recuperação.

workflow_dispatch do CI executa validação sob demanda, mas não faz deploy de produção.

Validações manuais usam grupo de concorrência separado do pipeline de produção. Um disparo manual nunca cancela um deploy ou uma verificação de recuperação em andamento. Pushes de produção são serializados em vez de cancelar uma execução de produção anterior.

## OIDC

Jobs que precisam de token OIDC devem:

1. possuir `id-token: write` apenas no job necessário;
2. utilizar environment `production`;
3. ser explicitamente permitidos pela política do repositório;
4. utilizar identidade Entra de privilégio mínimo;
5. nunca compartilhar uma identidade administrativa geral entre domínios diferentes.

A identidade de manutenção existente continua dedicada a Application.ReadWrite.OwnedBy.

Acesso do GitHub a SharePoint usa uma identidade operacional dedicada com `Sites.Selected` e site explicitamente autorizado.

Operações futuras de grupos, usuários, Banco de Notas ou outros módulos devem receber identidades separadas quando a necessidade real existir.

Não conceder Directory.ReadWrite.All como permissão genérica para o plano de controle.

## Microsoft 365 sem autenticação pelo Codex

Operações rotineiras do Microsoft 365 não dependem do Codex para autenticação.

O fluxo é:

PowerShell -> GitHub Actions -> GitHub OIDC -> Entra -> identidade operacional -> Graph -> recurso explicitamente permitido.

A identidade `Ecossistema Escola - GitHub M365 Operations` é separada da identidade de manutenção. O bootstrap pode ser feito pela identidade de manutenção porque ela possui apenas `Application.ReadWrite.OwnedBy`, mas a execução normal usa a identidade operacional.

A configuração e os limites completos estão em `docs/M365_CONTROL_PLANE.md`.

## Proibição de executor arbitrário

Nenhum workflow operacional pode receber inputs livres como:

- command
- script
- shell
- url
- endpoint
- graphPath

Novas operações devem ser implementadas como código versionado, revisável e incluído explicitamente na allowlist.

## Auditoria

O GitHub Actions deve manter:

- run ID;
- commit/ref executado;
- ator;
- início e término;
- resultado;
- logs técnicos redigidos;
- artifacts de evidência quando aplicável.

Tokens, cookies, certificados privados e segredos não devem entrar em logs ou artifacts.

## Evidência de validação pré-merge

A fundação do plano de controle foi validada em branch temporária com conteúdo idêntico ao PR #53 no GitHub Actions run `32988529244`.

Resultado:

- `Validate application`: success;
- `Validate GitHub Actions security`: success;
- `Deploy production`: skipped;
- `Verify recovery after deploy`: skipped.

Essa evidência confirma que o plano de controle e seus guardrails executam sem tocar produção antes do merge.

## Uso

Status:

    pwsh ./infra/ops/ecossistema.ps1 -Acao status

Validação:

    pwsh ./infra/ops/ecossistema.ps1 -Acao validar

Recovery:

    pwsh ./infra/ops/ecossistema.ps1 -Acao recuperacao

Rotação normal:

    pwsh ./infra/ops/ecossistema.ps1 -Acao rotacionar

Rotação forçada:

    pwsh ./infra/ops/ecossistema.ps1 -Acao rotacionar -ForcarRotacao

Teste controlado de falha:

    pwsh ./infra/ops/ecossistema.ps1 -Acao rotacionar -SimularFalha

Bootstrap da identidade operacional Microsoft 365:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365-bootstrap

Teste de autenticação Microsoft 365:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 identity-check

Saúde do SharePoint:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 sharepoint-health

Prontidão do Banco de Notas para armazenamento Microsoft 365:

    pwsh ./infra/ops/ecossistema.ps1 -Acao m365 -OperacaoM365 banco-notas-readiness

Logs:

    pwsh ./infra/ops/ecossistema.ps1 -Acao logs -RunId 123456789

Artifacts:

    pwsh ./infra/ops/ecossistema.ps1 -Acao artefatos -RunId 123456789
