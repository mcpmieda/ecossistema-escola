# VERIFICATION — Centro de Administração v0.8

## Resultado da fase

**100% do escopo técnico definido para esta fase foi concluído.**

A candidata continua com `releaseState = validation`. Este fechamento técnico não autoriza produção oficial.

Itens explicitamente adiados por decisão de produto e fora do cálculo desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Notificações/pendências não foram artificialmente implementadas porque ainda não existe fonte autoritativa e regra institucional suficientes para produzir comportamento real sem inventar produto.

## Candidata e domínio

Implementação funcional consolidada:

`main@03d6a9ca3107174af63d84a638301aebcdf6bfe4`

Consolidação técnica/documental posteriormente revalidada:

`main@eeb2a6827edc5c09d38684e3165f38649a6ce81e`

Domínio de validação:

`https://admin.escolaieda.com`

## CI, segurança, deploy e recovery

### Candidata funcional

Workflow `32792263791`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- Deploy production: **success**;
- Verify recovery after deploy: **success**;
- `npm ci`: **pass**, 0 vulnerabilidades reportadas no install;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 14 arquivos / **104 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**.

Fingerprint semântico:

`3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`

### Consolidação final revalidada

Workflow `32793959939` sobre `main@eeb2a6827edc5c09d38684e3165f38649a6ce81e`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- Deploy production: **success**;
- Verify recovery after deploy: **success**.

Jobs observados:

- segurança: `97641263329`;
- aplicação: `97641263502`;
- deploy: `97641489188`;
- recovery pós-deploy: `97641635821`.

Evidência de recovery dessa revalidação:

- artifact: `9544190526`;
- artifact SHA-256: `682f84ac2ca6476b2ddf089ec5732557f31f95603df4491d84c2923187ed4f13`;
- artifact não expirado no momento da validação;
- source commit do run: `eeb2a6827edc5c09d38684e3165f38649a6ce81e`.

Isso confirma que a consolidação documental não ficou à frente de uma versão não implantada ou não submetida ao recovery.

## Recovery comprovado

A prova automática só executa depois do deploy bem-sucedido da mesma `main`.

O self-test usa exclusivamente recurso `RECOVERY_VERIFY_*` dentro da biblioteca técnica `SNAPSHOTS_PLATAFORMA` e executa backup, alteração destrutiva controlada, restore, checksum e cleanup.

Prova funcional detalhada em `32792263791` / job `97636412171`:

- status: `verified`;
- scope: `sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip`;
- verifiedAt: `2026-08-25T00:08:57.882Z`;
- backupChecksum: `097386b0c0fee7dd65a07902979416ac4fb4e104018666a32afef34abd8692f3`;
- restoredChecksum: `097386b0c0fee7dd65a07902979416ac4fb4e104018666a32afef34abd8692f3`;
- restoreMatched: `true`;
- cleanup: `deleted`;
- artifact: `9543575179`.

A prova não significa disaster recovery completo. Não declara como testados restore integral do site SharePoint, todas as listas institucionais, tenant Microsoft 365 ou todos os serviços externos.

Nenhuma permissão Graph adicional foi concedida. O backend permanece em `Sites.Selected`/`write` no `CENTROADMIN`.

## Smoke externo e Chrome real

Harness descartável externo ao pipeline:

- PR #31: fechado sem merge;
- run `32793171050`;
- job `97638865311`: **success**;
- artifact `9543850730`;
- SHA-256 `19859a60f1f6e6c9005536979c3af7a3ef003ddb3c1474e54b0839d64e2d4fdf`.

HTTP real confirmou:

- raiz do domínio disponível;
- bundle atual do Centro servido;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão.

Chrome real do runner confirmou:

- login institucional desktop `1440×900`;
- login institucional mobile `390×844`;
- `Entrar com conta institucional` aponta para `/auth/login`;
- `/#/sistemas` sem sessão permanece no login e não vaza shell protegido;
- screenshots desktop/mobile sem cortes ou quebras visuais evidentes.

O harness não permaneceu na `main`.

## Autorização e fronteiras

A fase mantém:

- Entra ID como identidade institucional;
- grupos/roles apenas como entrada de identidade;
- capabilities como autorização efetiva do Centro;
- grants administrativos fail closed;
- recorte server-side do snapshot;
- endpoints administrativos negados anonimamente;
- módulos integrados disponíveis apenas com contrato compatível e capabilities suficientes;
- `RolesJson` legado fora do caminho de autorização.

## Higiene final

Auditoria da fonte ativa:

- zero `TODO`, `FIXME`, `HACK` e `TEMPORARY` residuais pesquisados;
- zero Playwright permanente na aplicação;
- zero workflow temporário de smoke/formatter/cleanup/repair na `main`;
- nenhum PR de desenvolvimento aberto;
- PR histórico #3 encerrado sem merge por estar superado;
- harnesses temporários encerrados sem merge;
- branches históricas sem código divergente da candidata válida.

## Fundação preservada

Permanecem intactos:

- Microsoft Entra ID;
- BFF e sessão;
- grupos e roles institucionais;
- automação cargo → grupos;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática de identidade técnica;
- contratos modulares e semânticos;
- `releaseState = validation`.

## Gate humano e aprovação

Não existe mais trabalho de desenvolvimento obrigatório pendente dentro do escopo técnico desta fase.

A inspeção autenticada das telas internas com uma sessão real de `ADMINISTRADOR` é agora o **gate humano de aceitação**, não um motivo para continuar alterando código. Não será criado bypass, sessão falsa ou redução de segurança para automatizá-lo.

A candidata está pronta para o responsável inspecionar no domínio e decidir se aprova.

A produção oficial permanece bloqueada até o comando exato:

`APROVADO PARA PRODUÇÃO`

Uma mudança material após este fechamento exige nova rodada de validação e torna qualquer aprovação anterior obsoleta.
