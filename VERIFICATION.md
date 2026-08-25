# VERIFICATION — Centro de Administração v0.8

## Escopo

Registro dos gates finais da candidata v0.8 do Centro de Administração.

Release state: `validation`. Nenhuma evidência deste documento autoriza produção oficial.

## Candidata publicada

`main@03d6a9ca3107174af63d84a638301aebcdf6bfe4`

Domínio:

`https://admin.escolaieda.com`

## Pipeline final da main

Workflow `CI and deploy`, run `32792263791`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- Deploy production: **success**;
- Verify recovery after deploy: **success**.

Gates observados:

- `npm ci`: **pass**, 0 vulnerabilidades reportadas no install;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 14 arquivos de teste / **104 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**.

Fingerprint semântico:

`3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`

## Recovery pós-deploy

A prova automática só executa depois do deploy bem-sucedido da mesma `main`.

Execução final:

- run: `32792263791`;
- job: `97636412171`;
- sourceCommit: `03d6a9ca3107174af63d84a638301aebcdf6bfe4`;
- status: `verified`;
- scope: `sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip`;
- verifiedAt: `2026-08-25T00:08:57.882Z`;
- backupChecksum: `097386b0c0fee7dd65a07902979416ac4fb4e104018666a32afef34abd8692f3`;
- restoredChecksum: `097386b0c0fee7dd65a07902979416ac4fb4e104018666a32afef34abd8692f3`;
- restoreMatched: `true`;
- cleanup: `deleted`;
- artifact: `9543575179`.

A primeira evidência versionada no snapshot continua apontando para a prova anterior igualmente válida, run `32791663369`, artifact `9543382224`.

## Limite da prova de recovery

O self-test usa exclusivamente recurso descartável `RECOVERY_VERIFY_*` dentro da biblioteca técnica `SNAPSHOTS_PLATAFORMA`.

Ele não prova:

- restauração integral do site SharePoint;
- restauração de todas as listas institucionais;
- recuperação de dados operacionais reais;
- recuperação do tenant Microsoft 365;
- continuidade integral de todos os serviços externos.

Nenhum privilégio Graph adicional foi concedido. O backend permanece em `Sites.Selected`/`write` no `CENTROADMIN`.

## Smoke externo independente

PR temporário #31, fechado sem merge.

Run `32793171050`, job `97638865311`: **success**.

HTTP real confirmou:

- raiz do domínio disponível;
- bundle atual do Centro servido;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão.

Chrome real do runner confirmou:

- login institucional renderizado em desktop `1440×900`;
- login institucional renderizado em mobile `390×844`;
- link `Entrar com conta institucional` aponta para `/auth/login`;
- acesso anônimo a `/#/sistemas` continua apresentando login em vez do shell protegido.

Evidência:

- artifact: `9543850730`;
- SHA-256: `19859a60f1f6e6c9005536979c3af7a3ef003ddb3c1474e54b0839d64e2d4fdf`;
- contém DOMs renderizados e screenshots desktop/mobile.

As duas capturas foram inspecionadas e não mostraram cortes ou quebras visuais evidentes.

## Higiene final

Auditoria da `main` encontrou:

- zero ocorrências pesquisadas de `TODO`, `FIXME`, `HACK` ou `TEMPORARY`;
- zero resíduo pesquisado de Playwright;
- zero harness temporário pesquisado de `domain-smoke`, `cleanup`, `formatter` ou repair-loop na fonte ativa;
- nenhum PR aberto após encerramento do PR histórico #3;
- PR #31 de browser/smoke fechado sem merge;
- branch do smoke final resetado para `main`;
- branches históricos identificados de desenvolvimento/teste/documentação convergidos para a `main` atual.

## Fundação preservada

Permanecem intactos:

- Microsoft Entra ID;
- BFF e sessão;
- grupos e roles institucionais;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- rotação automática de identidade técnica;
- automação cargo → grupos;
- contrato modular;
- `releaseState = validation`.

## Gate humano

A validação externa automatizada cobre o domínio, o login anônimo e as fronteiras de autorização sem sessão.

A inspeção visual autenticada das telas internas com uma sessão real de `ADMINISTRADOR` continua sendo um gate humano. Não será criado bypass, sessão falsa ou enfraquecimento de autenticação para automatizá-lo.

Consequentemente, a frase de fechamento de 100% desta fase só deve ser registrada depois dessa inspeção humana satisfatória.

A produção oficial continua bloqueada até o comando exato:

`APROVADO PARA PRODUÇÃO`
